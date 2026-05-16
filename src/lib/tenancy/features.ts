/**
 * Feature flag evaluation for the white-label SaaS platform.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Effective Feature Set Computation"  (algorithmic pseudocode)
 *   - §"Function: evaluateFeature"           (formal specification)
 *   - §"Component: Feature Flag Gate"        (interface)
 *
 * Two operations are exported:
 *
 *   1. `evaluateFeature(features, key, override?)` — pure, synchronous.
 *      Decides whether a single feature key is on for a tenant given
 *      the precomputed effective set and an optional one-shot override.
 *      No I/O. No mutation. Safe to call from React render paths.
 *
 *   2. `computeEnabledFeatures(tenantId)` — server-only async.
 *      Reads `tenants.plan_id`, `plan_features` (baseline) and
 *      `tenant_features` (per-tenant overrides) using the service-role
 *      `supabaseAdmin` client and returns a `TenantFeatures` record
 *      whose `enabled` set is the plan baseline modified by every
 *      non-expired override (overrides may add or remove a key).
 *      Cached in-process for `EFFECTIVE_FEATURES_CACHE_TTL_MS` keyed
 *      by `tenantId`; flush a single tenant via
 *      `invalidateEffectiveFeatures(tenantId)`.
 *
 * The cache exists so that hot-path code (route loaders, RSC, the
 * `<Feature>` component) can ask for the effective set without
 * round-tripping to Postgres on every render. Mutating endpoints that
 * change a tenant's plan or override (notably the admin
 * `setFeatureOverride` endpoint, task 16.5) MUST call
 * `invalidateEffectiveFeatures(tenantId)` so the next read sees fresh
 * state.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { FeatureKey, FeatureOverride, TenantFeatures } from "./types";

// ---------------------------------------------------------------------------
// Supabase access helper
// ---------------------------------------------------------------------------

/**
 * Cast helper for the service-role admin client. `tenants`,
 * `plan_features`, and `tenant_features` are not yet present in the
 * generated `Database` type from `src/integrations/supabase/types.ts`
 * — they were introduced by `20250101000000_tenancy_baseline.sql` and
 * the types regeneration is part of a later task. Mirrors the same
 * pattern used in `resolver.ts`. Once `npx supabase gen types` is
 * re-run, this indirection can be removed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

// ---------------------------------------------------------------------------
// Pure: evaluateFeature
// ---------------------------------------------------------------------------

/**
 * Decide whether a feature is on for a tenant.
 *
 * When `override` is supplied it takes precedence over the precomputed
 * effective set:
 *
 *   - `override.enabled === true`  AND (`override.expiresAt` is undefined
 *     OR `Date.parse(override.expiresAt) > Date.now()`) ⇒ `true`
 *   - any other override shape ⇒ `false`
 *
 * When `override` is omitted, the result is `features.enabled.has(key)`.
 *
 * The function is pure: it performs no I/O, mutates no inputs, and
 * returns the same answer for the same `(features, key, override)`
 * input at any given clock value. Calling it twice in quick succession
 * with an `override.expiresAt` near `Date.now()` may produce different
 * answers — that is the only source of non-determinism, and it is
 * intentional (overrides expire in real time per Requirement 5.4).
 *
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6
 *
 * @param features Effective feature set for the tenant (typically the
 *                 result of `computeEnabledFeatures(tenantId)`).
 * @param key      The feature key to evaluate.
 * @param override Optional one-shot override, e.g. an admin "preview"
 *                 toggle or a feature flag injected by a test harness.
 * @returns        `true` iff the feature is on per the rules above.
 */
export function evaluateFeature(
  features: TenantFeatures,
  key: FeatureKey,
  override?: FeatureOverride,
): boolean {
  if (override !== undefined) {
    if (override.enabled !== true) {
      return false;
    }
    if (override.expiresAt === undefined) {
      return true;
    }
    const expiresAtMs = Date.parse(override.expiresAt);
    if (Number.isNaN(expiresAtMs)) {
      // Malformed timestamp ⇒ treat the override as inactive rather than
      // silently coercing to "permanent". The schema in
      // `features-schema.ts` (task 9.5) is responsible for rejecting
      // bad timestamps before they ever reach this function; this guard
      // is a runtime safety net.
      return false;
    }
    return expiresAtMs > Date.now();
  }

  return features.enabled.has(key);
}

// ---------------------------------------------------------------------------
// Server-only: computeEnabledFeatures
// ---------------------------------------------------------------------------

/**
 * In-process TTL for the effective-feature-set cache, in milliseconds.
 *
 * Sixty seconds matches the resolver cache TTL (design §"Component:
 * Tenant Resolver") so a single page render that fans out into many
 * `<Feature>` checks pays at most one DB round-trip for the tenant's
 * features.
 */
export const EFFECTIVE_FEATURES_CACHE_TTL_MS = 60_000;

/**
 * Maximum number of tenants kept in the LRU cache. Each entry is a
 * tiny record (uuid + small Set + timestamp) so a few thousand fit
 * comfortably in Worker memory; capping at 1000 keeps pressure low
 * while comfortably covering the active set of any single Worker
 * isolate.
 */
const CACHE_MAX_ENTRIES = 1000;

interface CacheEntry {
  expiresAtMs: number;
  features: TenantFeatures;
}

/**
 * Module-scoped LRU + TTL cache. `Map` preserves insertion order, which
 * we exploit for the LRU eviction policy: on every read we delete and
 * re-insert the entry so the most-recently-used items live at the
 * back; on overflow we drop the oldest (front) entry.
 */
const effectiveFeaturesCache = new Map<string, CacheEntry>();

/**
 * Drop the cached effective set for `tenantId`.
 *
 * Mutating endpoints (admin `setFeatureOverride`, plan changes, billing
 * webhooks that imply a plan change) MUST call this so the next read
 * sees fresh state. Idempotent: calling on a missing key is a no-op.
 *
 * Requirements: 5.1, 5.2, 5.3, 10.6
 */
export function invalidateEffectiveFeatures(tenantId: string): void {
  effectiveFeaturesCache.delete(tenantId);
}

/**
 * Test-only escape hatch. Not exported from the package barrel; the
 * underscore prefix mirrors the convention used by `resolver.ts`
 * (`_clearResolverCache`). Production code uses
 * `invalidateEffectiveFeatures` for targeted invalidation.
 */
export function _clearEffectiveFeaturesCache(): void {
  effectiveFeaturesCache.clear();
}

/**
 * Row shape for the slim `tenants` lookup. We define it inline rather
 * than importing from the generated Supabase `Database` type because
 * the tenancy tables were introduced in
 * `20250101000000_tenancy_baseline.sql` and the generated types in
 * `src/integrations/supabase/types.ts` have not been regenerated yet.
 */
interface TenantPlanRow {
  plan_id: string;
}

interface PlanFeatureRow {
  feature_key: string;
  enabled: boolean;
}

interface TenantFeatureRow {
  feature_key: string;
  enabled: boolean;
  expires_at: string | null;
}

/**
 * The closed enum of valid `FeatureKey` values, kept locally to filter
 * out any rows whose `feature_key` somehow falls outside the union
 * (e.g. a value added at the SQL CHECK level but not yet reflected in
 * the type union). This is defensive — the SQL CHECK constraint in
 * `20250101000000_tenancy_baseline.sql` already restricts the column.
 */
const KNOWN_FEATURE_KEYS: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "loyalty",
  "push_notifications",
  "multi_branch",
  "custom_domain",
  "mobile_app",
  "chat_widget",
  "advanced_analytics",
]);

function isFeatureKey(value: string): value is FeatureKey {
  return KNOWN_FEATURE_KEYS.has(value as FeatureKey);
}

/**
 * Compute the effective feature set for a tenant.
 *
 * Algorithm (mirrors design §"Effective Feature Set Computation"):
 *
 *   1. Resolve `tenants.plan_id` for the tenant.
 *   2. Seed `enabled` with every `plan_features.feature_key` whose
 *      `enabled = true` for that plan.
 *   3. For each row in `tenant_features` for the tenant, in any order:
 *        - If `expires_at IS NOT NULL AND expires_at <= now()` skip.
 *        - Else if `enabled = true` add the key to the set.
 *        - Else if `enabled = false` remove the key from the set
 *          (overrides may disable a feature the plan enables —
 *          Requirement 5.3).
 *   4. Return `{ tenantId, enabled }` with `enabled` typed as
 *      `ReadonlySet<FeatureKey>`.
 *
 * Cached in-process for `EFFECTIVE_FEATURES_CACHE_TTL_MS` keyed by
 * `tenantId`. Cache lookups respect insertion order so the policy is
 * effectively LRU-with-TTL: every hit promotes the entry, the oldest
 * entry is evicted on overflow, and any expired entry is treated as a
 * miss.
 *
 * @server This function reads via `supabaseAdmin` (service role) and
 *         must NOT be imported into client bundles. The data it
 *         returns may be passed to the client (it is just a set of
 *         feature keys), but the call itself happens server-side —
 *         either in a route loader, a server function, or a
 *         middleware that builds the `TenantContext`.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 *
 * @param tenantId UUID of the tenant whose effective set to compute.
 * @returns        The tenant's `TenantFeatures` record.
 * @throws         When the underlying queries fail or no `tenants`
 *                 row matches `tenantId`.
 */
export async function computeEnabledFeatures(
  tenantId: string,
): Promise<TenantFeatures> {
  const now = Date.now();

  // ---- Cache lookup ------------------------------------------------------
  const cached = effectiveFeaturesCache.get(tenantId);
  if (cached !== undefined) {
    if (cached.expiresAtMs > now) {
      // LRU bump: re-insert to move the entry to the back of the Map.
      effectiveFeaturesCache.delete(tenantId);
      effectiveFeaturesCache.set(tenantId, cached);
      return cached.features;
    }
    // Expired ⇒ drop and fall through to refetch.
    effectiveFeaturesCache.delete(tenantId);
  }

  // ---- Step 1: resolve the tenant's plan --------------------------------
  const { data: tenantRow, error: tenantErr } = await adminFrom("tenants")
    .select("plan_id")
    .eq("id", tenantId)
    .limit(1)
    .maybeSingle();

  if (tenantErr) {
    throw new Error(
      `computeEnabledFeatures: failed to load tenant ${tenantId}: ${tenantErr.message}`,
    );
  }
  if (tenantRow === null) {
    throw new Error(`computeEnabledFeatures: tenant ${tenantId} not found`);
  }

  const planId = (tenantRow as TenantPlanRow).plan_id;

  // ---- Step 2: seed from plan_features (enabled=true only) --------------
  const { data: planRows, error: planErr } = await adminFrom("plan_features")
    .select("feature_key, enabled")
    .eq("plan_id", planId)
    .eq("enabled", true);

  if (planErr) {
    throw new Error(
      `computeEnabledFeatures: failed to load plan_features for plan ${planId}: ${planErr.message}`,
    );
  }

  const enabled = new Set<FeatureKey>();
  for (const row of (planRows ?? []) as PlanFeatureRow[]) {
    if (isFeatureKey(row.feature_key)) {
      enabled.add(row.feature_key);
    }
  }

  // ---- Step 3: apply tenant_features overrides --------------------------
  const { data: overrideRows, error: overrideErr } = await adminFrom("tenant_features")
    .select("feature_key, enabled, expires_at")
    .eq("tenant_id", tenantId);

  if (overrideErr) {
    throw new Error(
      `computeEnabledFeatures: failed to load tenant_features for ${tenantId}: ${overrideErr.message}`,
    );
  }

  for (const row of (overrideRows ?? []) as TenantFeatureRow[]) {
    if (!isFeatureKey(row.feature_key)) {
      continue;
    }
    if (row.expires_at !== null) {
      const expiresAtMs = Date.parse(row.expires_at);
      // Treat expires_at <= now() as expired (Requirement 5.4).
      // Malformed timestamps are also ignored as a defensive measure;
      // the application schema rejects them at insert time.
      if (Number.isNaN(expiresAtMs) || expiresAtMs <= now) {
        continue;
      }
    }
    if (row.enabled === true) {
      enabled.add(row.feature_key);
    } else {
      enabled.delete(row.feature_key);
    }
  }

  // ---- Step 4: build the result and cache it ---------------------------
  const features: TenantFeatures = {
    tenantId,
    enabled: enabled as ReadonlySet<FeatureKey>,
  };

  // Evict the oldest entry if we are at capacity. Using `Map`'s
  // insertion-order iteration keeps this O(1) amortized.
  if (effectiveFeaturesCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = effectiveFeaturesCache.keys().next().value;
    if (oldestKey !== undefined) {
      effectiveFeaturesCache.delete(oldestKey);
    }
  }

  effectiveFeaturesCache.set(tenantId, {
    expiresAtMs: now + EFFECTIVE_FEATURES_CACHE_TTL_MS,
    features,
  });

  return features;
}
