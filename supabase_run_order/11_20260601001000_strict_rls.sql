-- =============================================================================
-- White-Label SaaS — Strict deny-by-default RLS (Migration Phase 6 / task 7.1)
-- Fixed for Supabase SQL Editor compatibility
-- =============================================================================

DO $body$
DECLARE
  tbl           text;
  v_has_tenant_id boolean;
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
      RAISE NOTICE 'Skipping %: tenant_id column not present', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS shadow_permissive_all ON public.%I', tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS shadow_log_rls ON public.%I', tbl);
    PERFORM public.apply_tenant_rls_policy(tbl);
  END LOOP;

  RAISE NOTICE 'Strict RLS applied to domain tables.';
END
$body$;
