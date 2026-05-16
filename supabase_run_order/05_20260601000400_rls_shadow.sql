-- =============================================================================
-- White-Label SaaS — Shadow-mode RLS (Migration Phase 3 / task 3.1)
-- Fixed for Supabase SQL Editor compatibility
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_rls_shadow_violation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  guc_raw    text;
  guc_uuid   uuid;
  row_tenant uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_tenant := OLD.tenant_id;
  ELSE
    row_tenant := NEW.tenant_id;
  END IF;

  guc_raw := current_setting('app.tenant_id', true);

  BEGIN
    guc_uuid := NULLIF(guc_raw, '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      guc_uuid := NULL;
  END;

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
$fn$;

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

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS shadow_permissive_all ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY shadow_permissive_all ON public.%I FOR ALL USING (true) WITH CHECK (true)',
      tbl
    );

    EXECUTE format('DROP TRIGGER IF EXISTS shadow_log_rls ON public.%I', tbl);
    EXECUTE format(
      'CREATE TRIGGER shadow_log_rls AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_rls_shadow_violation()',
      tbl
    );
  END LOOP;
END
$body$;
