-- =============================================================================
-- White-Label SaaS — Strict deny-by-default RLS (Migration Phase 6 / task 7.1)
--
-- Purpose:
--   Flip every domain table from the permissive "shadow mode" RLS posture
--   established in task 3.1 (`20260601000400_rls_shadow.sql`) to the strict
--   deny-by-default contract defined by `apply_tenant_rls_policy(...)` in
--   task 3.2 (`20260601000500_rls_template.sql`).
--
--   For each domain table this migration:
--     1. Drops the permissive `shadow_permissive_all` policy (it would
--        otherwise OR-combine with `tenant_isolation` and let every row
--        through, defeating the entire purpose of the flip).
--     2. Drops the `shadow_log_rls` AFTER trigger that recorded silent
--        violations to `public.rls_shadow_log`. Once strict RLS is on, a
--        scope violation aborts the offending query with a Postgres error
--        (e.g. `new row violates row-level security policy ...`) and that
--        is the audit signal — the shadow log is no longer necessary for
--        these tables, and keeping the trigger would just add write
--        amplification on every successful row.
--     3. Calls `public.apply_tenant_rls_policy(<table>)` (defined in 3.2)
--        which idempotently:
--          - enables RLS,
--          - creates the `tenant_isolation` policy
--            (`tenant_id = current_setting('app.tenant_id', true)::uuid`),
--          - creates the `platform_admin_bypass` policy
--            (`auth.jwt()->>'role' = 'platform_admin'`), and
--          - adds the safety-net `(tenant_id)` index.
--
-- Order:
--   * Timestamp 20260601001000 places this migration AFTER:
--       - 20260601000100_default_tenant.sql        (task 2.1)
--       - 20260601000200_add_tenant_id.sql         (task 2.2)
--       - 20260601000300_indexes.sql               (task 2.3)
--       - 20260601000400_rls_shadow.sql            (task 3.1, shadow mode)
--       - 20260601000500_rls_template.sql          (task 3.2, function def)
--       - 20260601000550_set_tenant_guc.sql        (task 4.6, GUC RPC)
--       - 20260601000700_owner_constraint.sql      (task 10.5)
--       - 20260601000800_primary_domain.sql        (task 14.4)
--       - 20260601000900_status_transition_trigger (task 12.4)
--     so every dependency required by `apply_tenant_rls_policy` is in place
--     and so this migration lands AFTER all existing 2026-stamped legacy
--     migrations from the original azraqmart codebase.
--
-- Design references:
--   * §"Migration Path" Phase 6 — "Switch policies to deny-by-default. Run
--     smoke tests."
--   * §"RLS Policy Application Template" — pseudocode for the function
--     invoked here on every domain table.
--   * §"Tenancy Model" — the `app.tenant_id` GUC must be set by either
--     `withTenantScope` (5.1) or the resolver middleware (4.5/4.6) before
--     any query runs against these tables. Without it the
--     `tenant_isolation` USING clause evaluates `tenant_id = NULL`, which
--     is NULL → false in three-valued logic, and the row is denied.
--
-- ============================================================================
-- !! IMPORTANT — DO NOT APPLY UNTIL THE APPLICATION LAYER IS SCOPED !!
-- ============================================================================
-- This migration flips strict deny-by-default RLS. After it is applied, any
-- direct `supabase.from(...)` call that does NOT have `app.tenant_id` set
-- correctly will fail with an RLS violation — including reads, which under
-- shadow mode silently succeeded.
--
-- It MUST NOT be applied until either:
--
--   (a) Every direct `supabase.from(...)` call site has been routed through
--       `withTenantScope` / `useTenantScopedSupabase` (task 5.1), so the
--       GUC is always set before queries fire; OR
--
--   (b) The Tenant Resolver middleware (task 4.5) sets `app.tenant_id` on
--       every request before any query runs, e.g. via the `set_tenant_guc`
--       RPC defined in 20260601000550_set_tenant_guc.sql.
--
-- See `src/integrations/supabase/MIGRATION_NOTES.md` (task 5.1) for the
-- audit checklist and call-site inventory that gates applying this file in
-- a real environment. Operators applying this migration should also review
-- `public.rls_shadow_log` for any unaddressed denial patterns BEFORE
-- deploying — entries there indicate code paths that are still missing a
-- tenant scope and will start failing once strict mode is on.
-- ============================================================================
--
-- What this migration does NOT do:
--   * It does NOT touch the platform tenancy tables themselves (`tenants`,
--     `tenant_branding`, `tenant_domains`, `tenant_features`,
--     `tenant_billing`, `user_tenant_roles`, `plans`, `plan_features`,
--     `platform_audit_log`, `webhook_events`, `rls_shadow_log`). They have
--     their own access pattern (super-admin only, special policies, or
--     deliberately left without RLS for the resolver to read pre-context)
--     and are out of scope for the per-tenant strict-RLS rollout.
--   * It does NOT modify the `apply_tenant_rls_policy` function — that is
--     the single source of truth defined in 3.2 and only called from here.
--   * It does NOT delete `public.rls_shadow_log` itself; the log is left in
--     place for forensic review of the pre-strict period.
--
-- Per-table operations (inside one DO $$ block, idempotent):
--   1. EXECUTE format('DROP POLICY IF EXISTS shadow_permissive_all ON public.%I', tbl)
--   2. EXECUTE format('DROP TRIGGER IF EXISTS shadow_log_rls ON public.%I', tbl)
--   3. PERFORM public.apply_tenant_rls_policy(tbl)
--
-- Defensive skips mirror the pattern in 2.2/2.3/3.1: tables that don't
-- exist in the snapshot, or that lack a `tenant_id` column, are skipped
-- with a NOTICE so partial schemas (older branches, ephemeral CI databases)
-- don't break the migration.
--
-- Requirements: 1.3, 1.4, 11.5
-- =============================================================================

DO $$
DECLARE
  tbl           text;
  has_tenant_id boolean;
  domain_tables text[] := ARRAY[
    'about_section',
    'app_custom_css',
    'app_labels',
    'app_settings',
    'app_snapshots',
    'app_typography',
    'audit_log',
    'bin_locations',
    'cash_transactions',
    'categories',
    'chat_conversations',
    'chat_messages',
    'chatbot_faqs',
    'coupons',
    'customer_returns',
    'customer_return_items',
    'customers',
    'driver_locations',
    'driver_location_history',
    'home_banners',
    'internal_messages',
    'licenses',
    'login_banner_settings',
    'notifications',
    'order_items',
    'orders',
    'plan_config',
    'points_history',
    'product_locations',
    'products',
    'purchase_invoice_items',
    'purchase_invoices',
    'purchase_return_items',
    'purchase_returns',
    'push_config',
    'stock_alerts',
    'stock_movements',
    'stocktake_items',
    'stocktakes',
    'user_permissions',
    'user_push_tokens',
    'welcome_dismissals'
  ];
BEGIN
  FOREACH tbl IN ARRAY domain_tables
  LOOP
    -- Defensive skip: missing tables. Keeps the migration runnable on
    -- partial schemas (CI shards, older branches) without aborting the
    -- entire flip for one absent table.
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = tbl
    ) THEN
      RAISE NOTICE 'Skipping %: table does not exist', tbl;
      CONTINUE;
    END IF;

    -- Defensive skip: tables without `tenant_id`. `apply_tenant_rls_policy`
    -- itself raises in this case (see 3.2), so we pre-empt with a NOTICE
    -- and a CONTINUE rather than aborting mid-loop. Should never happen if
    -- task 2.2 ran first.
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = tbl
        AND column_name  = 'tenant_id'
    ) INTO has_tenant_id;

    IF NOT has_tenant_id THEN
      RAISE NOTICE 'Skipping %: tenant_id column not present (did task 2.2 run?)', tbl;
      CONTINUE;
    END IF;

    -- 1. Drop the permissive shadow-mode policy from task 3.1. If it is
    --    left in place alongside `tenant_isolation`, Postgres OR-combines
    --    USING clauses across policies and `(true) OR (...)` is always
    --    true — strict mode would be silently bypassed.
    EXECUTE format(
      'DROP POLICY IF EXISTS shadow_permissive_all ON public.%I',
      tbl
    );

    -- 2. Drop the shadow-log trigger. Strict RLS surfaces denials as
    --    Postgres errors at the offending statement, which is a stronger
    --    signal than a silent log entry. Keeping the trigger would also
    --    add an unnecessary write to `rls_shadow_log` on every successful
    --    row that passes the new strict policy.
    EXECUTE format(
      'DROP TRIGGER IF EXISTS shadow_log_rls ON public.%I',
      tbl
    );

    -- 3. Apply the strict per-table contract. `apply_tenant_rls_policy` is
    --    idempotent: it (re)enables RLS, drops/creates `tenant_isolation`
    --    and `platform_admin_bypass`, and creates the `(tenant_id)` safety
    --    index. Re-running this whole migration is therefore safe.
    PERFORM public.apply_tenant_rls_policy(tbl);
  END LOOP;

  -- Operator reminder. This is the last chance to surface the audit
  -- expectation in the migration log itself before strict mode takes
  -- effect — `psql` and Supabase CLI will print this NOTICE.
  RAISE NOTICE
    'Strict RLS applied to domain tables. Review public.rls_shadow_log for '
    'any unaddressed denial patterns from the shadow period BEFORE deploying '
    'this migration to production. Entries there indicate call sites that '
    'were missing a tenant scope and will now fail with RLS errors.';
END
$$;
