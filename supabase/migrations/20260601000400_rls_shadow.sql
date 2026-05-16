-- =============================================================================
-- White-Label SaaS — Shadow-mode RLS (Migration Phase 3 / task 3.1)
--
-- Purpose:
--   Turn Row-Level Security ON for every domain table that received a
--   `tenant_id` column in task 2.2, but with policies that intentionally
--   accept everything (`USING (true) WITH CHECK (true)`). At the same time
--   attach an AFTER-row trigger to each table that records, into
--   `public.rls_shadow_log` (created in task 1.3), every write whose
--   `current_setting('app.tenant_id', true)` GUC is either unset OR does
--   not match the affected row's `tenant_id`.
--
--   This is the "shadow mode" that lets the migration team surface every
--   un-scoped query in production traffic before flipping to strict
--   deny-by-default RLS in task 7.1 (`20260601000600_strict_rls.sql`).
--   Until that flip, no user-visible behaviour changes: queries keep
--   succeeding because the policies are permissive, but the log table
--   accumulates "would-have-been-denied" evidence the team can audit.
--
-- Order:
--   * Timestamp 20260601000400 places this AFTER:
--       - 20260601000100_default_tenant.sql  (task 2.1)
--       - 20260601000200_add_tenant_id.sql   (task 2.2)
--       - 20260601000300_indexes.sql         (task 2.3)
--     so every referenced `tenant_id` column already exists.
--   * Strict RLS (task 7.1) will run later at 20260601000600 and drop the
--     `shadow_permissive_all` policy added here in favour of
--     `tenant_isolation` + `platform_admin_bypass`.
--
-- What this migration does NOT do:
--   * It does NOT touch the platform tenancy tables themselves (`tenants`,
--     `tenant_branding`, `tenant_domains`, `tenant_features`,
--     `tenant_billing`, `user_tenant_roles`, `plans`, `plan_features`,
--     `platform_audit_log`, `webhook_events`, `rls_shadow_log`). Their
--     RLS posture is controlled separately, primarily by task 7.1's
--     strict-mode rollout for cross-tenant safety.
--   * It does NOT log SELECTs. Postgres does not support per-row SELECT
--     triggers; the only way to observe read-side scoping is at the
--     application layer. Read observability lands in task 4.6, where
--     `withTenantScope` records every Supabase query that runs without
--     a GUC set. The trigger here covers INSERT / UPDATE / DELETE only.
--   * It does NOT enforce isolation. Permissive policies mean every row
--     remains visible — by design, so that the existing single-tenant
--     azraqmart application keeps working at the phase-3 boundary.
--
-- Per-table operations (inside one DO $$ block, idempotent):
--   1. ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY
--   2. DROP POLICY IF EXISTS shadow_permissive_all ON public.<t>
--      CREATE POLICY shadow_permissive_all ON public.<t>
--          FOR ALL USING (true) WITH CHECK (true)
--   3. DROP TRIGGER IF EXISTS shadow_log_rls ON public.<t>
--      CREATE TRIGGER shadow_log_rls
--          AFTER INSERT OR UPDATE OR DELETE ON public.<t>
--          FOR EACH ROW EXECUTE FUNCTION public.log_rls_shadow_violation()
--
-- Requirements: 11.4
-- =============================================================================

-- -----------------------------------------------------------------------------
-- log_rls_shadow_violation()
--
-- Trigger function attached to every domain table below. Reads the
-- `app.tenant_id` GUC with `current_setting('app.tenant_id', true)` — the
-- second `true` argument makes the call return NULL when the GUC is unset
-- instead of raising. Inserts a row into `public.rls_shadow_log` whenever
-- the GUC is NULL OR does not equal the affected row's `tenant_id`.
--
-- An inner sub-block catches `invalid_text_representation` so a malformed
-- GUC value (e.g. an empty or non-UUID string) is logged as a violation
-- with `current_setting_tenant_id = NULL` rather than aborting the user's
-- write — shadow mode must never break real traffic.
--
-- This function deliberately uses SECURITY DEFINER so the INSERT into
-- `rls_shadow_log` succeeds even when strict RLS later locks down that
-- table; `search_path` is pinned to `public` to prevent search-path
-- hijacking. Triggers attached to `rls_shadow_log` itself would recurse
-- forever, but no such trigger is ever created — the log table is left
-- untouched by this migration on purpose.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_rls_shadow_violation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  guc_raw    text;
  guc_uuid   uuid;
  row_tenant uuid;
BEGIN
  -- Pick the row's tenant_id from NEW for INSERT/UPDATE, OLD for DELETE.
  IF TG_OP = 'DELETE' THEN
    row_tenant := OLD.tenant_id;
  ELSE
    row_tenant := NEW.tenant_id;
  END IF;

  -- Pull the GUC. `true` second arg → return NULL when unset (no error).
  guc_raw := current_setting('app.tenant_id', true);

  -- Cast text → uuid defensively; treat blank or malformed values as NULL.
  BEGIN
    guc_uuid := NULLIF(guc_raw, '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      guc_uuid := NULL;
  END;

  -- Log if the GUC is missing or disagrees with the row's tenant_id.
  IF guc_uuid IS NULL OR guc_uuid IS DISTINCT FROM row_tenant THEN
    INSERT INTO public.rls_shadow_log
      (table_name, tenant_id, current_setting_tenant_id, operation, caller, query)
    VALUES
      (TG_TABLE_NAME, row_tenant, guc_uuid, TG_OP, current_user, current_query());
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.log_rls_shadow_violation() IS
  'Shadow-mode RLS observer: writes to public.rls_shadow_log when '
  'current_setting(''app.tenant_id'', true) is NULL or does not match the '
  'affected row''s tenant_id. Attached to every domain table by '
  '20260601000400_rls_shadow.sql; covers INSERT/UPDATE/DELETE. SELECT-side '
  'observability is provided at the application layer by withTenantScope.';

-- -----------------------------------------------------------------------------
-- Domain table rollout
-- -----------------------------------------------------------------------------
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
    -- Skip tables that don't exist in this database snapshot. Mirrors the
    -- defensive pattern used by tasks 2.2 and 2.3 so partial schemas (older
    -- branches, ephemeral CI databases) don't break the migration.
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = tbl
    ) THEN
      RAISE NOTICE 'Skipping %: table does not exist', tbl;
      CONTINUE;
    END IF;

    -- Without `tenant_id` the trigger has nothing to compare; skip with a
    -- notice rather than fail. Should never happen if task 2.2 ran first.
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

    -- 1. Enable RLS. Idempotent — Postgres tolerates re-enabling.
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      tbl
    );

    -- 2. Permissive shadow policy. Drop-then-create makes it idempotent
    --    and lets task 7.1 swap in the strict policies cleanly later.
    EXECUTE format(
      'DROP POLICY IF EXISTS shadow_permissive_all ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY shadow_permissive_all ON public.%I '
      'FOR ALL USING (true) WITH CHECK (true)',
      tbl
    );

    -- 3. Shadow-log trigger. Drop-then-create keeps it idempotent and lets
    --    later migrations rebind the function transparently.
    EXECUTE format(
      'DROP TRIGGER IF EXISTS shadow_log_rls ON public.%I',
      tbl
    );
    EXECUTE format(
      'CREATE TRIGGER shadow_log_rls '
      'AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.log_rls_shadow_violation()',
      tbl
    );
  END LOOP;
END
$$;
