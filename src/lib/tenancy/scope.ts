/**
 * Tenant scope wrapper for Supabase clients.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Function: withTenantScope"
 *   - §"Migration Path from Single-Tenant azraqmart" (Phase 5)
 *
 * `withTenantScope` sets the `app.tenant_id` Postgres GUC for the duration of
 * a callback so that every Supabase query executed inside the callback is
 * automatically filtered by the active tenant's RLS policies.
 *
 * The GUC is set via the `public.set_tenant_guc(uuid)` RPC defined in
 * `supabase/migrations/20260601000550_set_tenant_guc.sql`. That RPC calls
 * `set_config('app.tenant_id', ..., true)` with `is_local = true`, which
 * scopes the value to the current transaction; PostgREST runs every request
 * inside its own transaction, so the value is naturally cleared on COMMIT or
 * ROLLBACK. The `finally` block below additionally issues a best-effort
 * "clear" RPC for environments where the same connection might persist
 * outside a transaction (e.g. SSR pooling edge cases).
 *
 * The Supabase client is taken as a parameter rather than imported from
 * `@/integrations/supabase/client` so that callers can choose between the
 * user-auth client (subject to RLS) and an admin/service-role client
 * (bypasses RLS) on a per-call basis.
 *
 * Requirements: 1.2, 2.5
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * RFC 4122 UUID v4 shape — accepts any 8-4-4-4-12 hex form. We do not
 * constrain the version/variant nibbles further because Postgres `uuid`
 * accepts any well-formed UUID and the platform's tenant ids are generated
 * server-side.
 */
const UUID_V4_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Sentinel UUID used to clear `app.tenant_id` after the scoped callback
 * completes. Using all-zeros (rather than `NULL`) keeps the RPC signature
 * simple — the GUC is transaction-local in practice, so this is purely
 * defensive.
 */
const CLEAR_TENANT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Run `fn` with the `app.tenant_id` Postgres GUC bound to `tenantId`.
 *
 * @param client   A Supabase client (user-auth or service-role). The same
 *                 client instance is passed back to `fn`; tenant scope is
 *                 applied via a side-effecting RPC, not by mutating the
 *                 client object.
 * @param tenantId UUID of the tenant whose data the callback may access.
 *                 Must match {@link UUID_V4_REGEX}; otherwise a `TypeError`
 *                 is thrown synchronously before any RPC is issued.
 * @param fn       Callback that performs Supabase queries. Receives the
 *                 same `client` already bound to the tenant scope.
 *
 * @returns The value returned by `fn`.
 * @throws  `TypeError` if `tenantId` is not a well-formed UUID.
 * @throws  Any error thrown by the `set_tenant_guc` RPC or by `fn`.
 *
 * @example
 *   const products = await withTenantScope(supabase, tenant.id, async (db) => {
 *     const { data } = await db.from("products").select("*");
 *     return data ?? [];
 *   });
 */
export async function withTenantScope<T>(
  client: SupabaseClient,
  tenantId: string,
  fn: (scoped: SupabaseClient) => Promise<T>,
): Promise<T> {
  if (typeof tenantId !== "string" || !UUID_V4_REGEX.test(tenantId)) {
    throw new TypeError(
      `withTenantScope: tenantId must be a UUID (received ${JSON.stringify(tenantId)})`,
    );
  }

  const { error: setError } = await client.rpc("set_tenant_guc", { id: tenantId });
  if (setError) {
    throw new Error(
      `withTenantScope: failed to set app.tenant_id GUC: ${setError.message}`,
    );
  }

  try {
    return await fn(client);
  } finally {
    // Best-effort clear. `set_config(..., is_local=true)` already scopes the
    // value to the current transaction, so this is mostly defensive — we
    // swallow any error so it cannot mask the original outcome of `fn`.
    try {
      await client.rpc("set_tenant_guc", { id: CLEAR_TENANT_ID });
    } catch {
      /* intentionally ignored */
    }
  }
}
