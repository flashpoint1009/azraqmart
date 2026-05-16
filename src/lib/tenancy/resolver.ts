/**
 * Tenant Resolver — maps an incoming request to a Tenant record.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Tenant Resolution" (resolution priority order, cache TTL)
 *   - §"Algorithmic Pseudocode → Tenant Resolution"
 *   - §"Key Functions with Formal Specifications → resolveTenant"
 *
 * Resolution order (first match wins):
 *   1. Worker-memory LRU + Cloudflare KV cache (host as key, 60s TTL).
 *   2. Verified custom domain — `tenant_domains.domain == host` and `verified=true`.
 *   3. Platform subdomain — `host` ends with `.azraqmart.app`; slug = first label.
 *   4. `X-Tenant-Slug` header — non-empty, trimmed, ≤ 32 chars.
 *   5. Dev path `/_t/<slug>/...` — only when `NODE_ENV !== 'production'`.
 *
 * Hosts that fail RFC 1123 validation short-circuit to
 * `{ ok: false, reason: 'invalid_host' }` BEFORE any database call.
 *
 * Slug-based paths (#3, #4, #5) reject reserved slugs (RESERVED_SLUGS) and
 * any value that fails the slug regex `^[a-z0-9](-?[a-z0-9])*$` length 3..32.
 *
 * After a tenant row is found, its `status` is checked: `suspended` or
 * `cancelled` returns `{ ok: false, reason: 'suspended' }` and is NOT cached.
 * `active`, `trialing`, and `past_due` are cached and returned as `{ ok: true, tenant }`.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RESERVED_SLUGS, type ResolveResult, type Tenant, type TenantStatus } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache TTL for resolved tenants in milliseconds (design §"Tenant Resolution"). */
const CACHE_TTL_MS = 60_000;

/** Worker-memory LRU cap. When exceeded, the least-recently-used entry is evicted. */
const CACHE_MAX_SIZE = 1000;

/** Platform apex suffix used for subdomain-based tenant resolution. */
const PLATFORM_SUFFIX = ".azraqmart.app";

/**
 * RFC 1123 hostname regex.
 *
 * Total length 1..253. Each label is 1..63 chars, [a-z0-9] with optional
 * internal `-`. Case-insensitive — callers must lowercase the host first.
 */
const HOSTNAME_REGEX =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * Slug regex (length 3..32 enforced separately by `isValidSlug`).
 * Mirrors the CHECK constraint on `tenants.slug`.
 */
const SLUG_REGEX = /^[a-z0-9](-?[a-z0-9])*$/;

/** Maximum length for an `X-Tenant-Slug` header value (matches `tenants.slug` length cap). */
const MAX_SLUG_LENGTH = 32;
const MIN_SLUG_LENGTH = 3;

/** KV key namespaces. */
const KV_HOST_KEY = (host: string) => `tenant:host:${host}`;
const KV_SLUG_KEY = (slug: string) => `tenant:slug:${slug}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry {
  tenant: Tenant;
  expiresAt: number;
}

/**
 * Minimal Headers-compatible shape accepted by `resolveTenant`. Compatible
 * with the standard `Headers` class as well as plain objects in tests.
 */
export interface HeadersLike {
  get(name: string): string | null;
}

/**
 * Cloudflare KV-compatible shape. The resolver tolerates absence of KV
 * (e.g. when running in Node tests) and falls back to memory-only.
 */
interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Worker-memory LRU
// ---------------------------------------------------------------------------

/**
 * In-process LRU cache. `Map` preserves insertion order, so we delete-and-
 * reinsert on every read to maintain LRU semantics.
 */
const memoryCache = new Map<string, CacheEntry>();

function cacheGet(host: string): Tenant | null {
  const entry = memoryCache.get(host);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(host);
    return null;
  }
  // Refresh recency: delete and reinsert so this entry is the newest.
  memoryCache.delete(host);
  memoryCache.set(host, entry);
  return entry.tenant;
}

function cacheSet(host: string, tenant: Tenant): void {
  if (memoryCache.has(host)) {
    memoryCache.delete(host);
  } else if (memoryCache.size >= CACHE_MAX_SIZE) {
    // Evict the oldest entry (first key in insertion order).
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(host, { tenant, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Cloudflare KV (stubbed)
// ---------------------------------------------------------------------------

/**
 * Lookup the Cloudflare KV namespace bound for tenant resolution. Returns
 * `undefined` when KV is not configured (e.g. local Node, unit tests, or
 * environments where the binding has not been wired). Callers MUST treat
 * KV as best-effort and never depend on it for correctness.
 */
function getKv(): KvNamespace | undefined {
  // KV binding wiring is left as a stub and will be plugged in when the
  // worker entrypoint is updated to forward the binding. For now, look for
  // a pre-bound global (set by the Worker bootstrap) and fall back to
  // memory-only when absent.
  const g = globalThis as unknown as { TENANT_KV?: KvNamespace };
  return g.TENANT_KV;
}

async function kvGet(host: string): Promise<Tenant | null> {
  const kv = getKv();
  if (!kv) return null;
  try {
    const raw = await kv.get(KV_HOST_KEY(host));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tenant: Tenant; expiresAt: number };
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed.tenant;
  } catch {
    return null;
  }
}

async function kvSet(host: string, tenant: Tenant): Promise<void> {
  const kv = getKv();
  if (!kv) return;
  try {
    const expiresAt = Date.now() + CACHE_TTL_MS;
    const ttlSec = Math.ceil(CACHE_TTL_MS / 1000);
    const value = JSON.stringify({ tenant, expiresAt });
    // Write under both host and slug keys so invalidate-by-tenant can target the slug key.
    await Promise.all([
      kv.put(KV_HOST_KEY(host), value, { expirationTtl: ttlSec }),
      kv.put(KV_SLUG_KEY(tenant.slug), value, { expirationTtl: ttlSec }),
    ]);
  } catch {
    /* best-effort cache write */
  }
}

async function kvDelete(keys: string[]): Promise<void> {
  const kv = getKv();
  if (!kv) return;
  try {
    await Promise.all(keys.map((k) => kv.delete(k)));
  } catch {
    /* best-effort cache delete */
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a host: lowercase, strip surrounding whitespace, strip a
 * trailing dot, and strip a port suffix (`:8080`). IPv6 hosts (which
 * appear bracketed) and IP literals are not part of tenant resolution and
 * will fail RFC 1123 validation downstream.
 */
function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase();
  // Strip port (last colon — IPv6 hosts are bracketed and not supported here).
  if (!h.startsWith("[")) {
    const colonIdx = h.indexOf(":");
    if (colonIdx >= 0) h = h.slice(0, colonIdx);
  }
  // Strip trailing dot (FQDN canonicalization).
  if (h.endsWith(".")) h = h.slice(0, -1);
  return h;
}

function isValidHostname(host: string): boolean {
  return host.length > 0 && HOSTNAME_REGEX.test(host);
}

/**
 * Validate a slug for resolution paths #3, #4, #5. Rejects reserved slugs,
 * out-of-range lengths, and anything that fails the slug regex. Returns
 * `null` when invalid so callers can fall through to the next resolution
 * step instead of throwing.
 */
function normalizeSlug(input: string | null | undefined): string | null {
  if (input == null) return null;
  const slug = input.trim();
  if (slug.length < MIN_SLUG_LENGTH || slug.length > MAX_SLUG_LENGTH) return null;
  if (!SLUG_REGEX.test(slug)) return null;
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) return null;
  return slug;
}

/**
 * Active statuses that produce `{ ok: true, tenant }`. Suspended/cancelled
 * tenants short-circuit to `{ ok: false, reason: 'suspended' }` and are
 * NOT cached (so resuming a tenant takes effect immediately on next request).
 */
const ACTIVE_STATUSES: ReadonlySet<TenantStatus> = new Set<TenantStatus>([
  "active",
  "trialing",
  "past_due",
]);

// ---------------------------------------------------------------------------
// DB row → Tenant mapping
// ---------------------------------------------------------------------------

/**
 * Shape of a row returned from `SELECT * FROM tenants` (snake_case).
 * Declared locally because the generated `Database` type is regenerated
 * from the live Supabase project and does not yet include the platform
 * tables added by `20250101000000_tenancy_baseline.sql`.
 */
interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  plan_id: string;
  created_at: string;
  updated_at: string;
}

function rowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    planId: row.plan_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// DB lookups
// ---------------------------------------------------------------------------

/**
 * Cast helper for the service-role admin client. `tenants` and
 * `tenant_domains` are not yet present in the generated `Database` type;
 * once `npx supabase gen types` is re-run after migrations apply, this
 * indirection can be removed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

async function lookupTenantByCustomDomain(host: string): Promise<Tenant | null> {
  const { data, error } = await adminFrom("tenant_domains")
    .select("verified, tenants:tenant_id(*)")
    .eq("domain", host)
    .eq("verified", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = (data as { tenants: TenantRow | null }).tenants;
  return row ? rowToTenant(row) : null;
}

async function lookupTenantBySlug(slug: string): Promise<Tenant | null> {
  const { data, error } = await adminFrom("tenants")
    .select("*")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return rowToTenant(data as TenantRow);
}

// ---------------------------------------------------------------------------
// Path parsing (dev-only `/_t/<slug>/...`)
// ---------------------------------------------------------------------------

/**
 * Extract a `<slug>` from a `/_t/<slug>/...` path. Returns `null` when the
 * path does not match the dev pattern. Path-based resolution is gated by
 * `NODE_ENV !== 'production'` at the call site.
 */
function extractDevPathSlug(path: string | undefined): string | null {
  if (!path) return null;
  // Match `/_t/<slug>` optionally followed by `/` or end-of-string.
  const match = /^\/_t\/([^/]+)(?:\/|$)/.exec(path);
  if (!match) return null;
  return match[1] ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve an incoming request to a tenant.
 *
 * @param host    - Request host (with or without port). Will be normalized
 *                  to lowercase + stripped of trailing dot and port.
 * @param headers - Headers-compatible object exposing `get(name)`.
 * @param path    - (Optional) Request path; only consulted in development
 *                  for the `/_t/<slug>/...` fallback.
 *
 * @returns A {@link ResolveResult}. The function does NOT mutate any of
 *          its inputs and never throws — DB and KV failures fall through
 *          to the next resolution step or to `{ ok: false, reason: 'not_found' }`.
 *
 * Resolution order: cache → custom domain → platform subdomain →
 * `X-Tenant-Slug` header → dev path. RFC 1123 hostname validation runs
 * before any DB call.
 */
export async function resolveTenant(
  host: string,
  headers: HeadersLike,
  path?: string,
): Promise<ResolveResult> {
  // 0. Normalize + validate host BEFORE any side effect.
  const normalizedHost = normalizeHost(host);
  if (!isValidHostname(normalizedHost)) {
    return { ok: false, reason: "invalid_host" };
  }

  // 1. Cache lookup (memory first, then KV).
  const cached = cacheGet(normalizedHost);
  if (cached) {
    return { ok: true, tenant: cached };
  }

  const kvCached = await kvGet(normalizedHost);
  if (kvCached) {
    cacheSet(normalizedHost, kvCached);
    return { ok: true, tenant: kvCached };
  }

  let tenant: Tenant | null = null;

  // 2. Custom domain.
  tenant = await lookupTenantByCustomDomain(normalizedHost);

  // 3. Platform subdomain (`<slug>.azraqmart.app`).
  if (!tenant && normalizedHost.endsWith(PLATFORM_SUFFIX)) {
    const candidate = normalizedHost.slice(0, -PLATFORM_SUFFIX.length);
    const slug = normalizeSlug(candidate);
    if (slug) {
      tenant = await lookupTenantBySlug(slug);
    }
  }

  // 4. `X-Tenant-Slug` header (mobile app builds, internal tooling).
  if (!tenant) {
    const headerSlug = normalizeSlug(headers.get("X-Tenant-Slug"));
    if (headerSlug) {
      tenant = await lookupTenantBySlug(headerSlug);
    }
  }

  // 5. Dev path `/_t/<slug>/...` (development only).
  if (!tenant && process.env.NODE_ENV !== "production") {
    const pathSlug = normalizeSlug(extractDevPathSlug(path));
    if (pathSlug) {
      tenant = await lookupTenantBySlug(pathSlug);
    }
  }

  // 6. Decide.
  if (!tenant) {
    return { ok: false, reason: "not_found" };
  }

  if (!ACTIVE_STATUSES.has(tenant.status)) {
    // suspended / cancelled — DO NOT cache.
    return { ok: false, reason: "suspended" };
  }

  // Cache and return.
  cacheSet(normalizedHost, tenant);
  void kvSet(normalizedHost, tenant);

  return { ok: true, tenant };
}

/**
 * Invalidate every cached entry whose tenant matches the given id. Walks
 * the in-memory LRU and also issues a best-effort KV delete on the slug
 * key (KV host keys expire on TTL; the slug key is the tenant-stable
 * identifier we can target without knowing every host).
 *
 * Call this whenever tenant data changes (status, slug, primary domain) —
 * see Requirement 2.11.
 */
export async function invalidateCache(tenantId: string): Promise<void> {
  let slugToDelete: string | null = null;
  for (const [host, entry] of memoryCache) {
    if (entry.tenant.id === tenantId) {
      slugToDelete = entry.tenant.slug;
      memoryCache.delete(host);
    }
  }
  if (slugToDelete) {
    await kvDelete([KV_SLUG_KEY(slugToDelete)]);
  }
}

/**
 * Invalidate the cache entry for a single host. Used by the domain
 * verification flow (`verifyDomain`) so the next request after a domain
 * is verified does not return the previously cached "not_found" lookup.
 *
 * Per Requirement 2.11 / 8.7. The host is lowercased before lookup.
 */
export async function invalidateByDomain(domain: string): Promise<void> {
  const normalized = normalizeHost(domain);
  memoryCache.delete(normalized);
  await kvDelete([KV_HOST_KEY(normalized)]);
}

/**
 * Test-only escape hatch: clears the in-memory LRU so unit tests can
 * exercise resolution paths without cross-test contamination. Not part
 * of the production API surface; do not call from application code.
 *
 * @internal
 */
export function _clearCacheForTests(): void {
  memoryCache.clear();
}
