/**
 * Tenant-scoped Supabase client shim.
 *
 * Source of truth:
 *   - `.kiro/specs/white-label-saas-system/design.md` §"Migration Path
 *     from Single-Tenant azraqmart" — Phase 5 ("Refactor data calls")
 *   - `.kiro/specs/white-label-saas-system/requirements.md` — Requirement
 *     1.2 (RLS-scoped reads return only rows for the active tenant) and
 *     Requirement 11.6 (the application keeps working at every migration
 *     phase boundary)
 *
 * This file is the **staging point** for Phase 5 of the white-label SaaS
 * migration. The literal task description ("Replace direct
 * `supabase.from(...)` calls with `withTenantScope(supabase, tenantId,
 * scoped => ...)`") covers ~140 call sites across `src/components`,
 * `src/hooks`, and `src/routes`. Performing that refactor in a single
 * step would be unsafe:
 *
 *  1. Phase 3 (`supabase/migrations/20250101000400_rls_shadow.sql`) only
 *     enables shadow-mode RLS — denied queries are *logged*, not blocked.
 *     Strict deny-by-default RLS does not arrive until Phase 6
 *     (task 7.1, `supabase/migrations/20250101000600_strict_rls.sql`).
 *     So existing direct `supabase.from(...)` calls *keep working* while
 *     the migration is in progress, and the safe order is:
 *         (a) introduce this shim,
 *         (b) migrate call sites in reviewable batches,
 *         (c) review `rls_shadow_log` to confirm coverage,
 *         (d) flip on strict RLS in task 7.1.
 *  2. A big-bang refactor would touch dozens of files in one PR with no
 *     incremental verification, which is exactly the failure mode the
 *     staged migration table in `design.md` is designed to avoid.
 *
 * Therefore this module exposes:
 *
 *  - {@link useTenantScopedSupabase} — a React hook that returns a
 *    function bound to the *current* tenant via `useTenant()`. Client
 *    components (under `src/components/`, `src/hooks/`, and any
 *    storefront route loaded inside `<TenantProvider>`) call this hook
 *    and run all of their Supabase work through the returned function.
 *  - {@link withScopedSupabase} — a server-friendly helper that takes an
 *    explicit `tenantId`. Use this from route loaders / server functions
 *    where `useTenant()` is unavailable but the resolver (task 4.1) has
 *    already populated a tenant id in the request context.
 *
 * Both helpers delegate to {@link withTenantScope} from
 * `src/lib/tenancy/scope.ts`, which sets the `app.tenant_id` Postgres
 * GUC for the duration of the callback (see design §"Function:
 * withTenantScope"). Once a call site is migrated to
 * `useTenantScopedSupabase`, every query inside it automatically becomes
 * RLS-scoped to the active tenant — no per-query changes required.
 *
 * **Do not flip strict RLS (task 7.1) on until either:**
 *   (a) every active call site catalogued in `MIGRATION_NOTES.md` has
 *       been routed through one of these helpers, **or**
 *   (b) the Tenant Resolver middleware (task 4.5) sets `app.tenant_id`
 *       on every request before any query runs.
 * Otherwise direct `supabase.from(...)` calls will start failing with
 * empty result sets under deny-by-default RLS and the application will
 * regress in the middle of the migration — exactly the scenario
 * Requirement 11.6 forbids.
 *
 * Validates: Requirements 1.2, 11.6
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback } from "react";
import { useTenant } from "@/lib/tenancy/context";
import { withTenantScope } from "@/lib/tenancy/scope";
import { supabase } from "./client";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * The exported `supabase` symbol is a `Proxy` over a generated
 * `SupabaseClient<Database>` (see `client.ts`). `withTenantScope` is
 * typed against the plain `SupabaseClient` from `@supabase/supabase-js`
 * because the scope wrapper is intentionally schema-agnostic — it sets
 * a Postgres GUC and hands the same client back, regardless of the
 * generated `Database` types. We cast through `unknown` here so callers
 * keep the platform's typed client at the call site (`scoped.from("products")`
 * remains fully typed) while `withTenantScope` sees the structural shape
 * it needs.
 */
function asGenericClient(client: typeof supabase): SupabaseClient {
  return client as unknown as SupabaseClient;
}

/**
 * Shape of the function returned by {@link useTenantScopedSupabase}.
 *
 * `scoped` is the same Supabase client instance the rest of the app
 * imports — the tenant binding is applied via a server-side GUC, not by
 * mutating or wrapping the client object — so all of the existing
 * generated query types continue to work inside `fn`.
 */
export type RunWithTenantScope = <T>(
  fn: (scoped: typeof supabase) => Promise<T>,
) => Promise<T>;

// ---------------------------------------------------------------------------
// Client-side hook
// ---------------------------------------------------------------------------

/**
 * Hook returning a function that runs a Supabase callback inside the
 * current tenant's scope.
 *
 * The returned function reads the tenant id from {@link useTenant} (so
 * it must be called from a component rendered below `<TenantProvider>`)
 * and applies {@link withTenantScope} for the duration of the callback.
 * Inside the callback, every query against the `supabase` client is
 * automatically RLS-filtered to the active tenant.
 *
 * Example — migrating a one-shot read:
 *
 * ```ts
 * // before:
 * const { data } = await supabase.from("products").select("*").limit(50);
 *
 * // after:
 * const runScoped = useTenantScopedSupabase();
 * const data = await runScoped(async (scoped) => {
 *   const { data, error } = await scoped.from("products").select("*").limit(50);
 *   if (error) throw error;
 *   return data ?? [];
 * });
 * ```
 *
 * The function reference is stable as long as the tenant id is stable,
 * so it is safe to pass into `useQuery`/`useMutation` dependency arrays
 * without spurious re-renders.
 */
export function useTenantScopedSupabase(): RunWithTenantScope {
  const { tenant } = useTenant();
  const tenantId = tenant.id;

  return useCallback<RunWithTenantScope>(
    (fn) =>
      withTenantScope(asGenericClient(supabase), tenantId, async () =>
        fn(supabase),
      ),
    [tenantId],
  );
}

// ---------------------------------------------------------------------------
// Server-side helper
// ---------------------------------------------------------------------------

/**
 * Server-side counterpart to {@link useTenantScopedSupabase}.
 *
 * Takes an explicit `tenantId` because route loaders, server functions,
 * and webhook handlers run *outside* the React tree and cannot call
 * `useTenant()`. The tenant id is expected to come from the request's
 * resolver context (task 4.1 / 4.5).
 *
 * @example
 *   // src/routes/storefront/products.tsx (loader)
 *   export const Route = createFileRoute("/storefront/products")({
 *     loader: async ({ context }) => {
 *       return withScopedSupabase(context.tenant.id, async (scoped) => {
 *         const { data, error } = await scoped
 *           .from("products")
 *           .select("*")
 *           .limit(50);
 *         if (error) throw error;
 *         return data ?? [];
 *       });
 *     },
 *   });
 */
export async function withScopedSupabase<T>(
  tenantId: string,
  fn: (scoped: typeof supabase) => Promise<T>,
): Promise<T> {
  return withTenantScope(asGenericClient(supabase), tenantId, async () =>
    fn(supabase),
  );
}
