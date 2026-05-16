-- =============================================================================
-- White-Label SaaS — Add `tenant_id` to existing domain tables
--                    (Migration Phase 2 / task 2.2)
--
-- Purpose:
--   Turn every existing single-tenant azraqmart domain table into a
--   tenant-owned table by adding a `tenant_id uuid NOT NULL REFERENCES
--   public.tenants(id) ON DELETE CASCADE` column. This is the data-shape
--   prerequisite for shadow-mode RLS (task 3.1) and strict RLS (task 7.1).
--
-- Order:
--   * Runs AFTER the tenancy baseline `20250101000000_tenancy_baseline.sql`
--     (task 1.3) which creates `public.tenants`.
--   * Runs AFTER `20260601000100_default_tenant.sql` (task 2.1) which
--     inserts the default azraqmart tenant with the well-known UUID
--     `00000000-0000-0000-0000-000000000001`. Backfill below targets that
--     UUID, so 2.1 must be applied first.
--   * Runs AFTER the existing 2026-stamped azraqmart schema (latest
--     `20260515200000_loyalty_points_system.sql`); the deliberate
--     `20260601000200` timestamp guarantees that lexicographic ordering.
--
-- Per-table operations (executed in a single DO block to keep the file
-- compact and re-runnable):
--   1. ALTER TABLE public.<t>
--        ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
--      Skipped when the column already exists (idempotent).
--   2. UPDATE public.<t> SET tenant_id = '<default-tenant-id>'
--        WHERE tenant_id IS NULL;
--      Always safe — a no-op once every row is backfilled.
--   3. ALTER TABLE public.<t> ALTER COLUMN tenant_id SET NOT NULL;
--      Skipped when the column is already NOT NULL (idempotent).
--
-- What this migration deliberately does NOT do:
--   * It does NOT enable RLS or write any policies. That is task 3.1
--     (shadow mode) and task 7.1 (strict).
--   * It does NOT add `idx_<table>_tenant` composite indexes. Those land in
--     task 2.3 (`20260601000300_indexes.sql`).
--   * It does NOT alter `public.profiles` or `public.user_roles`:
--       - `profiles` is a per-user row (joined to `auth.users`); tenant
--         membership lives in `public.user_tenant_roles` instead.
--       - `user_roles` is the legacy global role table (admin / merchant /
--         delivery / warehouse). It is preserved untouched for audit-log
--         continuity; `user_tenant_roles` supersedes it semantically.
--
-- Requirements: 1.1, 11.3
-- =============================================================================

DO $$
DECLARE
  default_tenant_id constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  domain_tables     constant text[] := ARRAY[
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
    'customer_return_items',
    'customer_returns',
    'customers',
    'driver_location_history',
    'driver_locations',
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
  t_name text;
BEGIN
  -- Sanity check: the default tenant row from task 2.1 must exist.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = default_tenant_id
  ) THEN
    RAISE EXCEPTION
      'Default tenant % is missing; apply 20260601000100_default_tenant.sql first',
      default_tenant_id;
  END IF;

  FOREACH t_name IN ARRAY domain_tables LOOP
    -- Skip tables that don't exist in this database (e.g. older snapshots).
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = t_name
    ) THEN
      RAISE NOTICE 'Skipping %: table not found in public schema', t_name;
      CONTINUE;
    END IF;

    -- 1. Add nullable tenant_id with FK + ON DELETE CASCADE (idempotent).
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = t_name
        AND column_name  = 'tenant_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I '
        'ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE',
        t_name
      );
    END IF;

    -- 2. Backfill any rows whose tenant_id is still NULL to the default
    --    azraqmart tenant. Safe to re-run.
    EXECUTE format(
      'UPDATE public.%I SET tenant_id = $1 WHERE tenant_id IS NULL',
      t_name
    )
    USING default_tenant_id;

    -- 3. Promote to NOT NULL — only if currently nullable.
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = t_name
        AND column_name  = 'tenant_id'
        AND is_nullable  = 'YES'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL',
        t_name
      );
    END IF;
  END LOOP;
END;
$$;
