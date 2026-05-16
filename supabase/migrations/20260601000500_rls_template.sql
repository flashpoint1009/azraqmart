-- =============================================================================
-- White-Label SaaS — RLS Policy Application Template (Migration Phase 3 / task 3.2)
--
-- Purpose:
--   Define a single SQL function `public.apply_tenant_rls_policy(table_name)`
--   that, when invoked, idempotently brings a domain table up to the platform's
--   strict-RLS contract:
--
--     1. RLS is enabled on the table.
--     2. A `tenant_isolation` policy restricts SELECT/INSERT/UPDATE/DELETE to
--        rows whose `tenant_id` matches `current_setting('app.tenant_id')` —
--        the GUC that the Tenant Resolver Middleware sets at the start of
--        every request (see design §"Tenancy Model" / `withTenantScope`).
--     3. A `platform_admin_bypass` policy exempts callers whose JWT carries
--        `role = 'platform_admin'`, so the Super-Admin Console
--        (`admin.azraqmart.app`, design §"Super-Admin Console") can operate
--        across tenants without per-table SECURITY DEFINER plumbing.
--     4. A safety-net `(tenant_id)` index exists.
--
--   This function is the single source of truth for RLS DDL applied to every
--   domain table. Task 7.1 (`20260601000600_strict_rls.sql`) calls this
--   function for each domain table when flipping the platform from
--   shadow-mode RLS (task 3.1) to strict deny-by-default RLS.
--
-- Order:
--   * Timestamp 20260601000500 places this migration AFTER:
--       - 20260601000100_default_tenant.sql   (task 2.1)
--       - 20260601000200_add_tenant_id.sql    (task 2.2)
--       - 20260601000300_indexes.sql          (task 2.3)
--       - 20260601000400_rls_shadow.sql       (task 3.1, shadow-mode RLS)
--     and BEFORE 20260601000600_strict_rls.sql (task 7.1) which actually
--     invokes `apply_tenant_rls_policy` on every domain table.
--
-- Design references:
--   * Pseudocode: design §"RLS Policy Application Template" (algorithm
--     `applyTenantRlsPolicy`).
--   * Formal contract: precondition `columnExists(tableName, 'tenant_id')`,
--     postcondition "RLS enabled; only rows whose tenant_id matches current
--     GUC are visible to non-admin callers; index exists".
--
-- Idempotence:
--   * `ENABLE ROW LEVEL SECURITY` is naturally idempotent.
--   * Each policy is dropped (`DROP POLICY IF EXISTS`) before being created,
--     so re-running the function on an already-protected table is safe and
--     leaves the table in the documented final state.
--   * The basic `(tenant_id)` index uses `CREATE INDEX IF NOT EXISTS` and a
--     `_tenant_basic` suffix to avoid colliding with the composite
--     `idx_<table>_tenant` indexes created in task 2.3
--     (`20260601000300_indexes.sql`).
--
-- IMPORTANT: This migration only DEFINES the function. It does NOT call it.
-- The strict-RLS migration in task 7.1 invokes
-- `apply_tenant_rls_policy(<table>)` for every domain table during the
-- shadow-to-strict flip.
--
-- Requirements: 1.3, 1.4, 1.6
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_tenant_rls_policy(table_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Precondition (design §"RLS Policy Application Template"):
  --   ASSERT columnExists(tableName, 'tenant_id')
  -- Without a `tenant_id` column the `tenant_isolation` policy below would
  -- reference a non-existent column and the resulting CREATE POLICY would
  -- fail with a confusing "column does not exist" error in the middle of a
  -- multi-table migration. Failing fast here, with a clear message, makes
  -- the strict-RLS migration (task 7.1) easier to debug.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND information_schema.columns.table_name = apply_tenant_rls_policy.table_name
      AND column_name = 'tenant_id'
  ) THEN
    RAISE EXCEPTION
      'apply_tenant_rls_policy: table public.% does not have a tenant_id column',
      apply_tenant_rls_policy.table_name;
  END IF;

  -- 1. Enable RLS. Idempotent: enabling on an already-RLS table is a no-op.
  EXECUTE format(
    'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
    apply_tenant_rls_policy.table_name
  );

  -- 2. Drop any prior policies of the same name so this function is safe to
  --    re-run. This is what makes flipping a previously-shadowed table into
  --    strict mode (task 7.1) a single function call instead of a sequence
  --    of conditional DDL statements.
  EXECUTE format(
    'DROP POLICY IF EXISTS tenant_isolation ON public.%I',
    apply_tenant_rls_policy.table_name
  );
  EXECUTE format(
    'DROP POLICY IF EXISTS platform_admin_bypass ON public.%I',
    apply_tenant_rls_policy.table_name
  );

  -- 3. Tenant isolation policy.
  --    `current_setting('app.tenant_id', true)` returns NULL when the GUC is
  --    not set (the `true` second argument is `missing_ok`), which makes the
  --    comparison `tenant_id = NULL` evaluate to NULL → the policy denies
  --    the row. That gives us deny-by-default behavior whenever a caller
  --    forgets to wrap a query in `withTenantScope` — a stronger guarantee
  --    than the shadow-mode RLS in task 3.1.
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON public.%I
       USING       (tenant_id = current_setting(''app.tenant_id'', true)::uuid)
       WITH CHECK  (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
    apply_tenant_rls_policy.table_name
  );

  -- 4. Platform-admin bypass policy.
  --    `auth.jwt()` is the Supabase helper that returns the current request's
  --    JWT claims as JSONB. The `role` claim is set to `'platform_admin'` for
  --    super-admin sessions (design §"Super-Admin Console" / task 16.1).
  --    Postgres OR-combines USING clauses across policies on the same table,
  --    so a row passes if EITHER the tenant-isolation predicate matches OR
  --    the caller is a platform admin.
  EXECUTE format(
    'CREATE POLICY platform_admin_bypass ON public.%I
       USING       (auth.jwt()->>''role'' = ''platform_admin'')
       WITH CHECK  (auth.jwt()->>''role'' = ''platform_admin'')',
    apply_tenant_rls_policy.table_name
  );

  -- 5. Safety-net `(tenant_id)` index.
  --    Task 2.3 already created composite `(tenant_id, <sort_col>)` indexes
  --    named `idx_<table>_tenant`. We use a different suffix
  --    (`_tenant_basic`) so this single-column index does not collide and
  --    can coexist with the composite one. `CREATE INDEX IF NOT EXISTS`
  --    keeps the call idempotent on re-runs.
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
    'idx_' || apply_tenant_rls_policy.table_name || '_tenant_basic',
    apply_tenant_rls_policy.table_name
  );
END;
$$;

COMMENT ON FUNCTION public.apply_tenant_rls_policy(text) IS
  'Idempotently enables RLS on public.<table_name> with tenant_isolation + '
  'platform_admin_bypass policies. Used by task 7.1 strict RLS migration. '
  'Requires that <table_name> has a tenant_id column.';
