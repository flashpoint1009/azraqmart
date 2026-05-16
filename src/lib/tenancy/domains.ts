// @server-only
/**
 * Custom Domain Manager — adds and (in task 14.2) verifies tenant-owned
 * domains, and produces the user-facing TXT record instructions.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Custom Domain Manager"
 *   - §"Algorithmic Pseudocode → Custom Domain Verification" (used by 14.2)
 *
 * `addDomain(tenantId, domain)` is the entry point used by the tenant
 * onboarding UI and the Super-Admin Console. It:
 *
 *   1. Normalizes the input (lowercase, strips a trailing dot).
 *   2. Validates the domain against RFC 1123 (length 4..253, valid labels).
 *   3. Rejects the platform apex (`azraqmart.app`) and any reserved
 *      subdomain (`<slug>.azraqmart.app` for slug ∈ `RESERVED_SLUGS`).
 *   4. Generates a per-domain verification token using Web Crypto.
 *   5. Inserts a `tenant_domains` row with `verified=false` and
 *      `is_primary=false`.
 *   6. Throws a typed `DomainValidationError` on validation/uniqueness
 *      failures so callers can map errors to user-facing messages without
 *      string parsing.
 *
 * `txtRecordInstructions(domain)` returns the host/type/value triplet the
 * tenant must add to their DNS provider before calling `verifyDomain`.
 *
 * `verifyDomain(domainId)` (added by 14.2) implements the verification flow
 * from design §"Custom Domain Verification": it looks up the TXT record
 * `azraqmart-verify=<token>` at `_azraqmart.<domain>` via DNS-over-HTTPS
 * (Cloudflare 1.1.1.1), then provisions the Cloudflare SSL-for-SaaS
 * custom hostname. Only when both succeed does the row flip
 * `verified=true` and the resolver cache get invalidated for that host.
 *
 * NOTE: this file imports `supabaseAdmin` (service-role) and MUST NOT be
 * imported into the client bundle. The `@server-only` marker on the first
 * line is a convention used by the platform's bundler audit script.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { invalidateByDomain } from "./resolver";
import { RESERVED_SLUGS, type TenantDomain } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * RFC 1123 FQDN regex.
 *
 * Total length 4..253 (the lower bound covers the shortest meaningful FQDN
 * `a.bb`/`x.io` — anything shorter cannot be a real public domain). Each
 * label is 1..63 chars from `[a-z0-9]` with optional internal hyphens.
 *
 * Case-insensitive — callers must lowercase first (we do this in `addDomain`).
 */
const FQDN_REGEX =
  /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** The platform's apex domain. Tenants may not register this as a custom domain. */
const PLATFORM_APEX = "azraqmart.app";

/** Suffix used to detect platform subdomains (`<slug>.azraqmart.app`). */
const PLATFORM_SUFFIX = `.${PLATFORM_APEX}`;

/** Length of the per-domain verification token. */
const VERIFICATION_TOKEN_LENGTH = 32;

/** Alphabet used for verification tokens. 62 chars — power-of-two skew is negligible. */
const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Postgres unique-violation SQLSTATE — surfaced via `error.code` by PostgREST. */
const PG_UNIQUE_VIOLATION = "23505";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Reasons `addDomain` may reject a request. Mapped 1:1 to user-facing
 * error messages in the onboarding UI.
 */
export type DomainValidationReason =
  | "invalid_format"
  | "reserved"
  | "platform_apex"
  | "already_taken";

/**
 * Thrown by `addDomain` when validation fails or the domain is already
 * registered to another tenant. The `reason` field is a closed enum so
 * callers can `switch` on it exhaustively.
 */
export class DomainValidationError extends Error {
  readonly reason: DomainValidationReason;

  constructor(reason: DomainValidationReason, message?: string) {
    super(message ?? `Domain validation failed: ${reason}`);
    this.name = "DomainValidationError";
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a 32-char verification token from the alphabet `[A-Za-z0-9]`.
 *
 * Prefers `crypto.getRandomValues` (available in Cloudflare Workers and
 * Node 18+). Falls back to `Math.random` only as a last resort — the
 * fallback is logged so deployments without Web Crypto can be detected
 * before any token leaks into a verification flow.
 */
function generateVerificationToken(): string {
  const buf = new Uint8Array(VERIFICATION_TOKEN_LENGTH);

  const cryptoObj: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;

  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(buf);
  } else {
    // Last-resort fallback — never expected in production runtimes.
    // eslint-disable-next-line no-console
    console.warn(
      "[domains] Web Crypto unavailable; falling back to Math.random for verification token.",
    );
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }

  let out = "";
  for (let i = 0; i < buf.length; i++) {
    out += TOKEN_ALPHABET[buf[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

/**
 * Normalize a user-supplied domain: lowercase, trim whitespace, and strip
 * a single trailing dot (FQDN canonicalization).
 */
function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  if (d.endsWith(".")) d = d.slice(0, -1);
  return d;
}

/**
 * Returns `true` when `domain` is `<slug>.azraqmart.app` for some slug in
 * `RESERVED_SLUGS`. We compare against the exact suffix to avoid
 * accidentally matching `admin.tenant.azraqmart.app` (which would have
 * been caught by the `platform_apex` check earlier anyway, but defensive
 * checks here keep this function self-contained).
 */
function isReservedPlatformSubdomain(domain: string): boolean {
  if (!domain.endsWith(PLATFORM_SUFFIX)) return false;
  const head = domain.slice(0, -PLATFORM_SUFFIX.length);
  // Only single-label heads are reserved subdomains; `foo.bar.azraqmart.app`
  // is not a reserved subdomain.
  if (head.includes(".")) return false;
  return (RESERVED_SLUGS as readonly string[]).includes(head);
}

// ---------------------------------------------------------------------------
// DB row mapping
// ---------------------------------------------------------------------------

/**
 * Shape of a `SELECT * FROM tenant_domains` row (snake_case). Declared
 * locally because the generated `Database` type is regenerated from the
 * live Supabase project and does not yet include the platform tables added
 * by `20250101000000_tenancy_baseline.sql`.
 */
interface TenantDomainRow {
  id: string;
  tenant_id: string;
  domain: string;
  verification_token: string;
  verified: boolean;
  is_primary: boolean;
  created_at: string;
}

function rowToTenantDomain(row: TenantDomainRow): TenantDomain {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    domain: row.domain,
    verificationToken: row.verification_token,
    verified: row.verified,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  };
}

/**
 * Cast helper for the service-role admin client. `tenant_domains` is not
 * yet present in the generated `Database` type; once
 * `npx supabase gen types` is re-run after migrations apply, this
 * indirection can be removed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a custom domain for a tenant.
 *
 * @param tenantId UUID of the owning tenant.
 * @param domain   User-supplied domain (any case, optional trailing dot).
 *
 * @returns The newly inserted `TenantDomain` with a freshly generated
 *          verification token.
 *
 * @throws  {@link DomainValidationError} with `reason`:
 *          - `'invalid_format'` — fails RFC 1123 validation.
 *          - `'platform_apex'` — equals `azraqmart.app`.
 *          - `'reserved'` — equals `<slug>.azraqmart.app` for a reserved slug.
 *          - `'already_taken'` — uniqueness violation on `tenant_domains.domain`.
 *
 * Side effects: inserts one row into `tenant_domains`. Does NOT contact
 * DNS or Cloudflare — that is `verifyDomain`'s job (task 14.2).
 */
export async function addDomain(tenantId: string, domain: string): Promise<TenantDomain> {
  const normalized = normalizeDomain(domain);

  if (!FQDN_REGEX.test(normalized)) {
    throw new DomainValidationError("invalid_format");
  }

  if (normalized === PLATFORM_APEX) {
    throw new DomainValidationError("platform_apex");
  }

  if (isReservedPlatformSubdomain(normalized)) {
    throw new DomainValidationError("reserved");
  }

  const verificationToken = generateVerificationToken();

  const { data, error } = await adminFrom("tenant_domains")
    .insert({
      tenant_id: tenantId,
      domain: normalized,
      verification_token: verificationToken,
      verified: false,
      is_primary: false,
    })
    .select("*")
    .single();

  if (error) {
    // PostgREST surfaces Postgres SQLSTATE on `error.code`. 23505 is the
    // unique-violation code which can fire on `tenant_domains.domain`'s
    // unique constraint when another tenant already registered this domain.
    if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      throw new DomainValidationError("already_taken");
    }
    throw new Error(`addDomain: failed to insert tenant_domains row: ${error.message}`);
  }

  if (!data) {
    // Defensive — should never happen because we used `.single()` and the
    // insert succeeded above, but the typed return is `T | null`.
    throw new Error("addDomain: insert returned no row");
  }

  return rowToTenantDomain(data as TenantDomainRow);
}

/**
 * Build the human-readable TXT record instructions a tenant must add to
 * their DNS provider before calling `verifyDomain`.
 *
 * The verification flow expects a TXT record at `_azraqmart.<domain>`
 * whose value is exactly `azraqmart-verify=<verificationToken>`.
 */
export function txtRecordInstructions(
  domain: TenantDomain,
): { host: string; type: "TXT"; value: string } {
  return {
    host: `_azraqmart.${domain.domain}`,
    type: "TXT",
    value: `azraqmart-verify=${domain.verificationToken}`,
  };
}

// ---------------------------------------------------------------------------
// verifyDomain
// ---------------------------------------------------------------------------

/**
 * Result of {@link verifyDomain}. Mirrors the design contract:
 * - `txt_not_found` — DNS TXT record at `_azraqmart.<domain>` did not contain
 *   `azraqmart-verify=<token>`.
 * - `ssl_pending` — TXT record was found, but Cloudflare SSL-for-SaaS has not
 *   yet activated the custom hostname (or Cloudflare credentials are not
 *   configured in this environment, in which case the call is skipped).
 * - `not_found` — `tenant_domains.id` does not exist.
 */
export type VerifyDomainResult =
  | { verified: true }
  | { verified: false; reason: "txt_not_found" | "ssl_pending" | "not_found" };

/** DNS-over-HTTPS request timeout (5s). */
const DNS_TIMEOUT_MS = 5_000;

/** Cloudflare SSL-for-SaaS API request timeout (30s). */
const CF_TIMEOUT_MS = 30_000;

/** Cloudflare DNS-over-HTTPS endpoint (RFC 8484, JSON profile). */
const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

/** Cloudflare API base for SSL-for-SaaS custom hostname provisioning. */
const CF_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * One answer entry returned by Cloudflare's DNS-over-HTTPS JSON API.
 * `data` for TXT records is the record value, double-quoted by the resolver.
 */
interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

/**
 * Cloudflare custom hostname response (subset). Only `result.status` is
 * inspected — `'active'` means SSL is provisioned end-to-end. Any other value
 * (`pending_validation`, `pending_ssl`, etc.) maps to `ssl_pending`.
 */
interface CfCustomHostnameResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: {
    id?: string;
    hostname?: string;
    status?: string;
  };
}

/**
 * `fetch` wrapper that aborts after `timeoutMs`. Returns `null` on timeout or
 * network error so callers can map either to a domain-specific reason without
 * needing try/catch around every call site.
 */
async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strip surrounding double quotes from a TXT record value. Cloudflare's
 * DNS-over-HTTPS JSON API returns TXT data as `"azraqmart-verify=abc"` — the
 * quotes are part of the wire format, not the record value.
 */
function unquoteTxt(data: string): string {
  if (data.length >= 2 && data.startsWith('"') && data.endsWith('"')) {
    return data.slice(1, -1);
  }
  return data;
}

/**
 * Look up TXT records at `_azraqmart.<domain>` and check for an exact match
 * against `expectedToken`. Returns `true` on match, `false` on no match or
 * any DNS error/timeout (treated as "not yet found" per design §8.5).
 */
async function dnsHasVerificationTxt(domain: string, expectedToken: string): Promise<boolean> {
  const name = `_azraqmart.${domain}`;
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=TXT`;
  const resp = await fetchWithTimeout(
    url,
    { headers: { Accept: "application/dns-json" } },
    DNS_TIMEOUT_MS,
  );
  if (!resp || !resp.ok) return false;

  let body: DohResponse;
  try {
    body = (await resp.json()) as DohResponse;
  } catch {
    return false;
  }

  const answers = body.Answer ?? [];
  for (const a of answers) {
    if (unquoteTxt(a.data) === expectedToken) {
      return true;
    }
  }
  return false;
}

/**
 * Provision a Cloudflare SSL-for-SaaS custom hostname for `domain`. Returns
 * `true` only when the response reports `result.status === 'active'`. Any
 * other status (pending validation, pending issuance, deleted) or any
 * network/timeout error returns `false` so the caller maps it to
 * `ssl_pending` without throwing.
 *
 * When `CF_ZONE_ID` or `CF_API_TOKEN` is missing (typical for dev/CI), the
 * call is skipped entirely and the function returns `false` with a warn log
 * so the gap is visible in deployment output.
 */
async function cloudflareActivateHostname(domain: string): Promise<boolean> {
  const zoneId = process.env.CF_ZONE_ID;
  const apiToken = process.env.CF_API_TOKEN;

  if (!zoneId || !apiToken) {
    // eslint-disable-next-line no-console
    console.warn(
      "[domains] Cloudflare credentials missing (CF_ZONE_ID / CF_API_TOKEN); skipping SSL-for-SaaS provisioning for",
      domain,
    );
    return false;
  }

  const resp = await fetchWithTimeout(
    `${CF_API_BASE}/zones/${zoneId}/custom_hostnames`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hostname: domain,
        ssl: { method: "http", type: "dv" },
      }),
    },
    CF_TIMEOUT_MS,
  );
  if (!resp) return false;

  let body: CfCustomHostnameResponse;
  try {
    body = (await resp.json()) as CfCustomHostnameResponse;
  } catch {
    return false;
  }

  return body.result?.status === "active";
}

/**
 * Verify ownership of a tenant-registered custom domain.
 *
 * Algorithm (design §"Custom Domain Verification"):
 *   1. Load the `tenant_domains` row by id. Missing → `not_found`.
 *   2. Already verified → return `{ verified: true }` (idempotent).
 *   3. DNS-over-HTTPS lookup at `_azraqmart.<domain>` for
 *      `azraqmart-verify=<verification_token>`. Not found → `txt_not_found`.
 *   4. Cloudflare SSL-for-SaaS `POST /zones/{id}/custom_hostnames`. Treat
 *      success as `result.status === 'active'`. Otherwise → `ssl_pending`.
 *   5. On both successes: `UPDATE tenant_domains SET verified=true` and
 *      invalidate the resolver cache for the host so subsequent requests
 *      pick up the verified state immediately (Requirement 8.7 / 2.11).
 *
 * Network failures and timeouts are mapped to the corresponding step's
 * `false` reason rather than thrown — verification is naturally retryable
 * (cron worker in 14.5 will re-invoke until success or 24h timeout).
 *
 * @param domainId UUID of the `tenant_domains` row to verify.
 *
 * Requirements: 8.4, 8.5, 8.6, 8.7, 2.11.
 */
export async function verifyDomain(domainId: string): Promise<VerifyDomainResult> {
  // 1. Load the row.
  const { data, error } = await adminFrom("tenant_domains")
    .select("*")
    .eq("id", domainId)
    .maybeSingle();

  if (error) {
    throw new Error(`verifyDomain: failed to load tenant_domains row: ${error.message}`);
  }
  if (!data) {
    return { verified: false, reason: "not_found" };
  }

  const row = data as TenantDomainRow;

  // 2. Already verified — idempotent success.
  if (row.verified) {
    return { verified: true };
  }

  // 3. DNS check.
  const expectedToken = `azraqmart-verify=${row.verification_token}`;
  const txtFound = await dnsHasVerificationTxt(row.domain, expectedToken);
  if (!txtFound) {
    return { verified: false, reason: "txt_not_found" };
  }

  // 4. Cloudflare SSL-for-SaaS.
  const sslActive = await cloudflareActivateHostname(row.domain);
  if (!sslActive) {
    return { verified: false, reason: "ssl_pending" };
  }

  // 5. Persist + invalidate cache.
  const { error: updateError } = await adminFrom("tenant_domains")
    .update({ verified: true })
    .eq("id", domainId);

  if (updateError) {
    throw new Error(
      `verifyDomain: failed to mark tenant_domains row verified: ${updateError.message}`,
    );
  }

  await invalidateByDomain(row.domain);

  return { verified: true };
}
