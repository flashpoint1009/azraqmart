-- Migration: define the `public.set_tenant_guc(uuid)` RPC used by the
-- TypeScript helper `withTenantScope` (src/lib/tenancy/scope.ts).
--
-- Source of truth:
--   - .kiro/specs/white-label-saas-system/design.md §"Function: withTenantScope"
--   - Requirements 1.2 (tenant isolation via RLS) and 2.5 (resolver sets GUC)
--
-- The function sets the `app.tenant_id` Postgres GUC for the current
-- transaction. RLS policies installed by 20250101000500_rls_template.sql
-- read this GUC via `current_setting('app.tenant_id', true)::uuid` to scope
-- every query to the active tenant.
--
-- The third argument to `set_config` is `is_local = true`, which makes the
-- value transaction-local: it is automatically cleared on COMMIT or
-- ROLLBACK. This gives `withTenantScope` its "restore on resolve and reject"
-- semantic without any explicit cleanup SQL.
--
-- SECURITY DEFINER is used so PostgREST callers (including the anon role)
-- can invoke the function even if they cannot otherwise execute
-- `set_config`. `search_path = public` pins symbol resolution to prevent
-- search-path injection from a less-privileged caller.

CREATE OR REPLACE FUNCTION public.set_tenant_guc(id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', id::text, true);
END;
$$;

COMMENT ON FUNCTION public.set_tenant_guc(uuid) IS
  'Sets app.tenant_id GUC for the current transaction. Called by withTenantScope.';
