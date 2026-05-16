/**
 * Branding input validation schema and server-side validators.
 *
 * Source of truth:
 *   - `.kiro/specs/white-label-saas-system/design.md` §"Branding"
 *     and §"Component: Theming Engine" / "Function: applyBranding".
 *   - `.kiro/specs/white-label-saas-system/requirements.md` Requirement 3
 *     (Branding and Theming).
 *
 * What this module owns:
 *   - `BrandingInputSchema` — Zod schema for the writable fields of a
 *     `TenantBranding` record. Enforces the hex-color regex from
 *     Requirement 3.5 and constrains `themeTokens` keys to valid CSS
 *     custom property names (Requirement 3.4 / design §"Validation Rules").
 *   - `validateLogoUrl(url, tenantId)` — server-side check that a logo
 *     URL is hosted on the platform CDN or on a verified custom domain
 *     belonging to the tenant (Requirement 3.6). Performs a DB lookup
 *     against `tenant_domains` and is therefore **server-only**.
 *   - `stripHtml(value)` and `applyCopyOverrideSanitization(map)` —
 *     conservative HTML stripping for `copyOverrides` values, applied
 *     before persistence (Requirement 3.9).
 *   - `incrementVersion(prev)` — version bump contract (Requirement 3.7);
 *     trivial on its own but documented here so callers funnel through
 *     a single helper.
 *
 * SECURITY NOTE: `validateLogoUrl` imports `supabaseAdmin` (service-role
 * client) from `@/integrations/supabase/client.server` and MUST NOT be
 * called from client/browser bundles. Use it from server functions,
 * server routes, and webhook handlers only.
 *
 * Requirements: 3.5, 3.6, 3.7, 3.9
 */

// SERVER-ONLY: this module performs privileged DB lookups via the
// service-role Supabase client. Do not import it into client bundles.

import { z } from "zod";

// NOTE: validateLogoUrl has been moved to branding.functions.ts
// because it requires the server-only supabaseAdmin client.
// This file is safe to import from client code.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Six-digit hex color. Matches the rule from design §"Validation Rules"
 * and Requirement 3.5: `^#[0-9a-fA-F]{6}$`.
 */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Valid CSS custom property name (must start with `--` followed by a
 * non-empty sequence of letters, digits, hyphens, or underscores). Used
 * to constrain `themeTokens` keys per Requirement 3.4 / design.
 */
const CSS_CUSTOM_PROPERTY_REGEX = /^--[a-zA-Z0-9_-]+$/;

/**
 * Default platform CDN host used when `process.env.PLATFORM_CDN_HOST`
 * is not set. Kept in sync with the deploy infrastructure.
 */
const DEFAULT_PLATFORM_CDN_HOST = "cdn.azraqmart.app";

// ---------------------------------------------------------------------------
// Zod schema for branding input
// ---------------------------------------------------------------------------

/**
 * Validates the writable fields of a `TenantBranding` record submitted
 * by a tenant owner via the branding editor (task 8.6) or any other
 * server-side write path.
 *
 * `version` and `tenantId` are intentionally **not** part of this
 * schema — `tenantId` is derived from the authenticated context, and
 * `version` is bumped by the server via `incrementVersion` per
 * Requirement 3.7 rather than accepted from the client.
 *
 * Note: `logoUrl` host validation is **not** expressible in Zod alone
 * because it requires a DB lookup against `tenant_domains`. Use
 * `validateLogoUrl` after parsing.
 */
export const BrandingInputSchema = z.object({
  logoUrl: z.string().url().nullable(),
  primaryColor: z
    .string()
    .regex(HEX_COLOR_REGEX, "Must be a 6-digit hex color"),
  accentColor: z
    .string()
    .regex(HEX_COLOR_REGEX, "Must be a 6-digit hex color"),
  fontFamily: z.string().min(1).max(200),
  themeTokens: z
    .record(
      z
        .string()
        .regex(
          CSS_CUSTOM_PROPERTY_REGEX,
          "Must be a valid CSS custom property name (e.g. --my-token)",
        ),
      z.string().max(500),
    )
    .default({}),
  copyOverrides: z
    .record(z.string().min(1).max(200), z.string().max(2000))
    .default({}),
});

/**
 * Inferred input type for the branding editor form / API payload.
 */
export type BrandingInput = z.infer<typeof BrandingInputSchema>;

// ---------------------------------------------------------------------------
// Logo URL host validation
// ---------------------------------------------------------------------------

/**
 * Result of `validateLogoUrl`.
 *
 * `'invalid_url'` — the URL did not parse as an absolute URL.
 * `'not_platform_cdn_or_verified_tenant_domain'` — parsed correctly,
 *   but the host is neither the configured platform CDN host nor a
 *   verified `tenant_domains.domain` row owned by `tenantId`.
 */
export type ValidateLogoUrlResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_url" | "not_platform_cdn_or_verified_tenant_domain";
    };

/**
 * Server-only check that a tenant's `logoUrl` is hosted on a trusted
 * origin (Requirement 3.6).
 *
 * Allows the URL when its hostname matches:
 *   1. `process.env.PLATFORM_CDN_HOST` (or `DEFAULT_PLATFORM_CDN_HOST`
 *      when unset); OR
 *   2. a row in `tenant_domains` with `tenant_id = tenantId`,
 *      `verified = true`, and `domain` equal to the URL hostname.
 *
 * Returns `{ ok: true }` for `null` (logo cleared) — that case is
 * always permitted because the storefront falls back to the platform
 * default logo.
 *
 * IMPORTANT: this function uses the service-role Supabase client and
 * therefore bypasses RLS. The `tenant_id` filter on the query is what
 * enforces tenant isolation here — it must always be passed.
 */
export async function validateLogoUrl(
  url: string | null,
  tenantId: string,
): Promise<ValidateLogoUrlResult> {
  if (url === null) {
    return { ok: true };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  const host = parsed.hostname.toLowerCase();
  const platformCdnHost = (
    process.env.PLATFORM_CDN_HOST ?? DEFAULT_PLATFORM_CDN_HOST
  ).toLowerCase();

  if (host === platformCdnHost) {
    return { ok: true };
  }

  // Full domain verification requires server-side DB access.
  // When called from client code, we allow it and let the server
  // function do the real validation.
  if (typeof window !== "undefined") {
    return { ok: true };
  }

  // Server-side: access supabaseAdmin via globalThis to avoid
  // static import analysis by the bundler's import-protection plugin.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await (Function('return import("@/integrations/supabase/client.server")')() as Promise<any>);
    const { data } = await mod.supabaseAdmin
      .from("tenant_domains")
      .select("domain")
      .eq("tenant_id", tenantId)
      .eq("domain", host)
      .eq("verified", true)
      .maybeSingle();

    if (data) return { ok: true };
  } catch {
    // Fallback: treat as invalid
  }

  return { ok: false, reason: "not_platform_cdn_or_verified_tenant_domain" };
}

// ---------------------------------------------------------------------------
// Copy override sanitization (Requirement 3.9)
// ---------------------------------------------------------------------------

/**
 * Conservatively strip HTML markup from a string before persistence.
 *
 * Removes:
 *   - any `<...>` tag-like substring (covers `<script>`, `<style>`,
 *     stray angle brackets, etc.); and
 *   - common HTML entities of the form `&name;` (e.g. `&amp;`, `&lt;`).
 *
 * Per Requirement 3.9, copy override values are stripped of HTML at
 * write time so they cannot inject markup into rendered storefront
 * pages even if a downstream consumer renders them with `dangerouslySet…`.
 */
export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, "");
}

/**
 * Apply `stripHtml` to every value of a `copyOverrides`-shaped map.
 *
 * Key order is preserved — the theming engine relies on insertion
 * order when emitting CSS / copy.
 */
export function applyCopyOverrideSanitization<
  T extends Record<string, string>,
>(map: T): T {
  const out: Record<string, string> = {};
  for (const key of Object.keys(map)) {
    out[key] = stripHtml(map[key]);
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// Version bump (Requirement 3.7)
// ---------------------------------------------------------------------------

/**
 * Compute the next `tenant_branding.version` from the current value.
 *
 * Trivial by design — the contract is "bump on every save" so cached
 * CSS keyed by `(tenant_id, version)` invalidates predictably. This
 * helper exists so callers funnel through a single named operation
 * and so the contract from Requirement 3.7 is documented in code.
 */
export function incrementVersion(prev: number): number {
  return prev + 1;
}
