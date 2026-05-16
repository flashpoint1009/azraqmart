-- =============================================================================
-- White-Label SaaS — Composite tenant indexes (Migration Phase 2 / task 2.3)
-- Fixed for Supabase SQL Editor compatibility
-- =============================================================================

DO $body$
DECLARE
  tbl              text;
  v_has_created_at boolean;
  v_has_tenant_id  boolean;
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
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = tbl
    ) THEN
      RAISE NOTICE 'Skipping %: table does not exist', tbl;
      CONTINUE;
    END IF;

    v_has_tenant_id := EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = tbl
        AND column_name  = 'tenant_id'
    );

    IF NOT v_has_tenant_id THEN
      RAISE NOTICE 'Skipping %: tenant_id column not present (did task 2.2 run?)', tbl;
      CONTINUE;
    END IF;

    v_has_created_at := EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = tbl
        AND column_name  = 'created_at'
    );

    index_name := 'idx_' || tbl || '_tenant';

    IF v_has_created_at THEN
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
$body$;
