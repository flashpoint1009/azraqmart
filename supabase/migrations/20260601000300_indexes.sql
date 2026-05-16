-- =============================================================================
-- White-Label SaaS — Composite tenant indexes (Migration Phase 2 / task 2.3)
--
-- Purpose:
--   Create a composite `(tenant_id, primary_sort_col)` index on every domain
--   table that received a `tenant_id` column in task 2.2
--   (`20260601000200_add_tenant_id.sql`). These indexes back the RLS-filtered
--   query pattern that drives nearly every storefront and admin read:
--
--       WHERE tenant_id = current_setting('app.tenant_id')::uuid
--       ORDER BY <primary_sort_col> DESC
--
--   Without a leading-`tenant_id` index, Postgres has to seq-scan the table
--   then filter, which scales linearly with the platform's total row count
--   instead of with one tenant's slice — fatal once the platform grows past a
--   handful of tenants.
--
-- Order:
--   * Timestamp 20260601000300 places this AFTER:
--       - 20260601000100_default_tenant.sql   (task 2.1)
--       - 20260601000200_add_tenant_id.sql    (task 2.2)
--     so every referenced column already exists when this migration runs.
--
-- Strategy:
--   * Default `primary_sort_col` is `created_at`. The existing azraqmart
--     schema follows the convention `created_at TIMESTAMPTZ NOT NULL DEFAULT
--     now()` consistently, so this default works for the overwhelming
--     majority of domain tables.
--   * For the few tables that do NOT carry a `created_at` column (e.g.
--     `app_custom_css`, `app_labels`, `app_typography`, `plan_config`,
--     `push_config`, `user_permissions` — singleton/keyed config tables),
--     we fall back to a single-column index on `(tenant_id)`. The DO $$
--     block below introspects `information_schema.columns` so the fallback
--     is automatic instead of hard-coded per table; that keeps the
--     migration robust when older tables are reshaped.
--   * `CREATE INDEX IF NOT EXISTS` makes every statement idempotent, so the
--     migration is safe to re-run.
--
-- Tenancy platform tables (`tenants`, `tenant_branding`, `tenant_domains`,
-- `tenant_features`, `tenant_billing`, `user_tenant_roles`, `plans`,
-- `plan_features`, `platform_audit_log`, `webhook_events`, `rls_shadow_log`)
-- are intentionally NOT indexed here — they were created with the
-- appropriate indexes in `20250101000000_tenancy_baseline.sql` (task 1.3).
-- Likewise `profiles` and `user_roles` are out of scope: they are managed by
-- the legacy auth/role layer and are not tenant-scoped at this stage.
--
-- Requirements: 1.5
-- =============================================================================

DO $$
DECLARE
  tbl              text;
  has_created_at   boolean;
  has_tenant_id    boolean;
  index_name       text;
  index_sql        text;
  domain_tables    text[] := ARRAY[
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
    -- Skip tables that don't exist in this database snapshot. Some of the
    -- listed tables originate from later migrations or optional modules; a
    -- missing table should be a no-op rather than a hard failure.
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = tbl
    ) THEN
      RAISE NOTICE 'Skipping %: table does not exist', tbl;
      CONTINUE;
    END IF;

    -- Confirm task 2.2 ran for this table. Without `tenant_id` we cannot
    -- build the composite index, so skip with a notice rather than fail.
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

    -- Choose `created_at` as primary_sort_col when present, else single col.
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = tbl
        AND column_name  = 'created_at'
    ) INTO has_created_at;

    index_name := 'idx_' || tbl || '_tenant';

    IF has_created_at THEN
      index_sql := format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, created_at DESC)',
        index_name, tbl
      );
    ELSE
      index_sql := format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
        index_name, tbl
      );
    END IF;

    EXECUTE index_sql;
  END LOOP;
END
$$;
