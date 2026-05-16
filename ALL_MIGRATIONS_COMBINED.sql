-- ALL MIGRATIONS COMBINED - White-Label SaaS System
-- Run in Supabase SQL Editor


-- ====== 20250101000000_tenancy_baseline.sql ======

-- =============================================================================
-- White-Label SaaS — Tenancy Baseline (Migration Phase 1)
--
-- Creates the platform-level tables that govern multi-tenancy:
--   plans, plan_features, tenants, tenant_branding, tenant_domains,
--   tenant_features (overrides), tenant_billing, user_tenant_roles,
--   platform_audit_log, webhook_events (Stripe dedup), rls_shadow_log.
--
-- Notes:
--   * Column shapes mirror the TypeScript interfaces in
--     `src/lib/tenancy/types.ts` (camelCase TS → snake_case SQL).
--   * RLS is intentionally NOT enabled here. Shadow-mode RLS is added in
--     task 3.1 (`20250101000400_rls_shadow.sql`).
--   * Existing domain tables (products, orders, …) are untouched here;
--     `tenant_id` columns are added in task 2.x.
--
-- Requirements: 1.1, 4.1, 4.2, 7.4, 8.2, 11.1
-- =============================================================================

-- gen_random_uuid() lives in pgcrypto on stock Postgres; on Supabase it is
-- usually pre-installed, but declare the dependency explicitly so a fresh
-- database can apply this migration on its own.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Shared trigger helper for updated_at columns
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- plans
--   Subscription tiers (e.g. starter, pro, enterprise).
--   `code` is unique and immutable after creation; price_cents >= 0.
-- -----------------------------------------------------------------------------
CREATE TABLE public.plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  name            text NOT NULL,
  price_cents     integer NOT NULL CHECK (price_cents >= 0),
  stripe_price_id text NOT NULL,
  is_public       boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE  public.plans IS 'Subscription plan tiers; code is unique and immutable.';
COMMENT ON COLUMN public.plans.code IS 'Stable plan identifier, e.g. ''starter'', ''pro'', ''enterprise''.';

-- -----------------------------------------------------------------------------
-- plan_features
--   Plan-level feature toggles. Composite PK (plan_id, feature_key).
--   feature_key is constrained to the FeatureKey union from types.ts.
-- -----------------------------------------------------------------------------
CREATE TABLE public.plan_features (
  plan_id     uuid    NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key text    NOT NULL CHECK (feature_key IN (
    'loyalty',
    'push_notifications',
    'multi_branch',
    'custom_domain',
    'mobile_app',
    'chat_widget',
    'advanced_analytics'
  )),
  enabled     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (plan_id, feature_key)
);

COMMENT ON TABLE public.plan_features IS 'Baseline feature availability per plan; merged with tenant_features overrides.';

-- -----------------------------------------------------------------------------
-- tenants
--   A business operating a branded storefront on the platform.
--   slug: kebab-case, 3..32 chars, [a-z0-9-], not a reserved platform slug.
--   status: lifecycle on the directed graph
--           trialing → active → past_due → suspended → cancelled.
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE
             CHECK (
               slug ~ '^[a-z0-9](-?[a-z0-9])*$'
               AND char_length(slug) BETWEEN 3 AND 32
               AND slug NOT IN ('admin', 'api', 'www', 'app')
             ),
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'trialing'
             CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  plan_id    uuid NOT NULL REFERENCES public.plans(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tenants      IS 'Top-level tenant record; one row per business on the platform.';
COMMENT ON COLUMN public.tenants.slug IS 'Kebab-case identifier used in *.azraqmart.app subdomains; rejects RESERVED_SLUGS (admin, api, www, app).';

CREATE TRIGGER tenants_set_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- tenant_branding
--   1:1 with tenants. Drives the theming engine and storefront logo/copy.
--   `version` is bumped on every save and used as the cache-busting key
--   for the precomputed CSS string (see applyBranding).
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenant_branding (
  tenant_id       uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  logo_url        text,
  primary_color   text NOT NULL DEFAULT '#000000'
                  CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color    text NOT NULL DEFAULT '#000000'
                  CHECK (accent_color  ~ '^#[0-9a-fA-F]{6}$'),
  font_family     text NOT NULL DEFAULT 'system-ui, -apple-system, sans-serif',
  theme_tokens    jsonb NOT NULL DEFAULT '{}'::jsonb,
  copy_overrides  jsonb NOT NULL DEFAULT '{}'::jsonb,
  version         integer NOT NULL DEFAULT 1
);

COMMENT ON TABLE  public.tenant_branding         IS 'Per-tenant branding (logo, colors, fonts, copy overrides).';
COMMENT ON COLUMN public.tenant_branding.version IS 'Bumped on every save; used by the theming engine for CSS cache invalidation.';

-- -----------------------------------------------------------------------------
-- tenant_domains
--   Custom domain a tenant has brought to the platform. Verified via
--   `_azraqmart.<domain>` TXT record matching `azraqmart-verify=<token>`.
--   At most one row per tenant should have is_primary = true (a partial
--   unique index is added later in `20250101000800_primary_domain.sql`,
--   task 14.4).
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenant_domains (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain              text NOT NULL UNIQUE,
  verification_token  text NOT NULL,
  verified            boolean NOT NULL DEFAULT false,
  is_primary          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_domains IS 'Custom domains owned by tenants; unique across all tenants.';

CREATE INDEX idx_tenant_domains_tenant ON public.tenant_domains (tenant_id);

-- -----------------------------------------------------------------------------
-- tenant_features (overrides)
--   Tenant-level overrides that may enable a feature above the plan
--   baseline or disable one below it. Composite PK (tenant_id, feature_key).
--   expires_at is checked at the application layer (must be > now() at
--   insert time — Zod schema in src/lib/tenancy/features-schema.ts).
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenant_features (
  tenant_id   uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key text    NOT NULL CHECK (feature_key IN (
    'loyalty',
    'push_notifications',
    'multi_branch',
    'custom_domain',
    'mobile_app',
    'chat_widget',
    'advanced_analytics'
  )),
  enabled     boolean NOT NULL,
  expires_at  timestamptz,
  PRIMARY KEY (tenant_id, feature_key)
);

COMMENT ON TABLE public.tenant_features IS 'Per-tenant overrides on top of plan_features; expires_at NULL = permanent.';

-- -----------------------------------------------------------------------------
-- tenant_billing
--   Mirrors the Stripe customer/subscription for a tenant. Kept in sync
--   with tenants.status by the webhook handler (Property 8).
--   stripe_customer_id is unique across tenants.
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenant_billing (
  tenant_id              uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id     text NOT NULL UNIQUE,
  stripe_subscription_id text,
  status                 text NOT NULL DEFAULT 'trialing'
                         CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  current_period_end     timestamptz
);

COMMENT ON TABLE public.tenant_billing IS 'Stripe billing state per tenant; status mirrors tenants.status via webhook handler.';

-- -----------------------------------------------------------------------------
-- user_tenant_roles
--   Membership of a user in a tenant with a specific role. A user may
--   belong to many tenants with different roles. Composite PK
--   (user_id, tenant_id). The "exactly one owner per tenant" invariant
--   is enforced by a partial unique index in
--   `20250101000700_owner_constraint.sql` (task 10.5).
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_tenant_roles (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role       text NOT NULL
             CHECK (role IN ('owner', 'admin', 'staff', 'delivery', 'customer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

COMMENT ON TABLE public.user_tenant_roles IS 'Tenant-scoped RBAC membership; hierarchy delivery < staff < admin < owner; customer is parallel.';

CREATE INDEX idx_user_tenant_roles_tenant ON public.user_tenant_roles (tenant_id);

-- -----------------------------------------------------------------------------
-- platform_audit_log
--   Append-only log of platform-admin actions and noteworthy events.
--   actor_id and tenant_id intentionally have no FK so audit rows survive
--   user/tenant deletion.
-- -----------------------------------------------------------------------------
CREATE TABLE public.platform_audit_log (
  id         bigserial PRIMARY KEY,
  actor_id   uuid,
  tenant_id  uuid,
  action     text NOT NULL,
  payload    jsonb,
  ip         inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_audit_log IS 'Append-only audit trail for super-admin actions and tenant lifecycle events.';

CREATE INDEX idx_platform_audit_log_tenant     ON public.platform_audit_log (tenant_id, created_at DESC);
CREATE INDEX idx_platform_audit_log_actor      ON public.platform_audit_log (actor_id, created_at DESC);
CREATE INDEX idx_platform_audit_log_created_at ON public.platform_audit_log (created_at DESC);

-- -----------------------------------------------------------------------------
-- webhook_events
--   Stripe webhook deduplication. The PK is the Stripe `event.id` value,
--   so a duplicate delivery short-circuits on conflict.
-- -----------------------------------------------------------------------------
CREATE TABLE public.webhook_events (
  id           text PRIMARY KEY,
  event_type   text,
  payload      jsonb,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

COMMENT ON TABLE  public.webhook_events    IS 'Stripe event dedup table; PK is the Stripe event.id.';
COMMENT ON COLUMN public.webhook_events.id IS 'Stripe event.id; duplicate deliveries collide here so handler can no-op.';

CREATE INDEX idx_webhook_events_received_at ON public.webhook_events (received_at DESC);

-- -----------------------------------------------------------------------------
-- rls_shadow_log
--   Captures queries that would have been denied by strict RLS while
--   shadow-mode RLS is in effect (Migration Phase 3 / task 3.1). Written
--   to by the shadow trigger; read by the migration team to find
--   un-scoped queries before flipping to strict RLS.
-- -----------------------------------------------------------------------------
CREATE TABLE public.rls_shadow_log (
  id                          bigserial PRIMARY KEY,
  logged_at                   timestamptz NOT NULL DEFAULT now(),
  table_name                  text,
  tenant_id                   uuid,
  current_setting_tenant_id   uuid,
  operation                   text,
  caller                      text,
  query                       text
);

COMMENT ON TABLE public.rls_shadow_log IS 'Shadow-mode RLS denial log; populated by the shadow trigger added in task 3.1.';

CREATE INDEX idx_rls_shadow_log_logged_at ON public.rls_shadow_log (logged_at DESC);
CREATE INDEX idx_rls_shadow_log_table     ON public.rls_shadow_log (table_name, logged_at DESC);



-- ====== 20260601000100_default_tenant.sql ======

-- =============================================================================
-- White-Label SaaS — Default `azraqmart` tenant seed (Migration Phase 2 / task 2.1)
--
-- Purpose:
--   Insert the bootstrap rows that turn the existing single-tenant azraqmart
--   database into the first record of the multi-tenant platform. Every domain
--   table that is about to receive a `tenant_id` column (task 2.2) will be
--   backfilled to this tenant's id, so this row MUST exist before that
--   migration runs.
--
-- Order:
--   * Runs after the tenancy baseline (`20250101000000_tenancy_baseline.sql`,
--     task 1.3) which creates `plans`, `tenants`, `tenant_branding`,
--     `tenant_features`, `tenant_billing`, `user_tenant_roles`, etc.
--   * Runs after the existing 2026-stamped azraqmart schema (latest
--     `20260515200000_loyalty_points_system.sql`) because it depends on the
--     legacy `public.user_roles` table + `public.app_role` enum to pick the
--     bootstrap owner. Hence the deliberate 20260601 timestamp.
--
-- What this migration does (all idempotent — every INSERT uses
-- `ON CONFLICT DO NOTHING` so re-runs are safe):
--   1. Insert a single 'default' plan into `plans` with `stripe_price_id =
--      'price_default'` (placeholder; real Stripe price ids land later).
--   2. Insert `plan_features` rows enabling all seven FeatureKey values for
--      that plan.
--   3. Insert the default tenant into `tenants` with the well-known UUID
--      `00000000-0000-0000-0000-000000000001` and `slug = 'azraqmart'`. The
--      fixed UUID lets later migrations and the application reference the
--      tenant deterministically.
--   4. Insert the default `tenant_branding` row (column defaults are
--      sufficient).
--   5. Insert a `user_tenant_roles` row with role='owner' for the OLDEST
--      existing azraqmart admin (oldest `auth.users` row whose
--      `public.user_roles.role = 'admin'`). If no admin exists yet the SELECT
--      simply produces zero rows and provisioning task 12.x will fix it.
--   6. Insert a placeholder `tenant_billing` row with status='active' and a
--      placeholder `stripe_customer_id`; the real Stripe customer is created
--      when the tenant is migrated to the provisioning flow.
--
-- Requirements: 11.2
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Default plan
-- -----------------------------------------------------------------------------
INSERT INTO public.plans (code, name, price_cents, stripe_price_id, is_public)
VALUES ('default', 'Default', 0, 'price_default', false)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Enable every FeatureKey on the default plan
--    (matches the union in src/lib/tenancy/types.ts and the CHECK constraint
--    on `plan_features.feature_key` in the tenancy baseline).
-- -----------------------------------------------------------------------------
INSERT INTO public.plan_features (plan_id, feature_key, enabled)
SELECT p.id, fk.feature_key, true
FROM public.plans p
CROSS JOIN (
  VALUES
    ('loyalty'),
    ('push_notifications'),
    ('multi_branch'),
    ('custom_domain'),
    ('mobile_app'),
    ('chat_widget'),
    ('advanced_analytics')
) AS fk(feature_key)
WHERE p.code = 'default'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Default tenant row with the well-known UUID
-- -----------------------------------------------------------------------------
INSERT INTO public.tenants (id, slug, name, status, plan_id)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'azraqmart',
  'Azraqmart',
  'active',
  p.id
FROM public.plans p
WHERE p.code = 'default'
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Default tenant_branding (column defaults cover everything else)
-- -----------------------------------------------------------------------------
INSERT INTO public.tenant_branding (tenant_id)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (tenant_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Bootstrap owner: oldest azraqmart admin from the legacy `user_roles`
--    table. If there is no admin yet, this insert is a no-op and the row is
--    created later by the provisioning flow (task 12.x).
-- -----------------------------------------------------------------------------
INSERT INTO public.user_tenant_roles (user_id, tenant_id, role)
SELECT
  u.id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'owner'
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.role = 'admin'
ORDER BY u.created_at ASC
LIMIT 1
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Placeholder billing row. The real Stripe customer/subscription is
--    created when this tenant goes through the provisioning flow.
-- -----------------------------------------------------------------------------
INSERT INTO public.tenant_billing (tenant_id, stripe_customer_id, status)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'cus_default_placeholder',
  'active'
)
ON CONFLICT (tenant_id) DO NOTHING;



-- ====== 20260601000200_add_tenant_id.sql ======

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



-- ====== 20260601000300_indexes.sql ======

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



-- ====== 20260601000400_rls_shadow.sql ======

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



-- ====== 20260601000500_rls_template.sql ======

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



-- ====== 20260601000550_set_tenant_guc.sql ======

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



-- ====== 20260601000700_owner_constraint.sql ======

-- =============================================================================
-- White-Label SaaS — Single-owner DB constraint and ownership transfer
--
-- Source of truth:
--   - .kiro/specs/white-label-saas-system/design.md §"User-Tenant Roles"
--     ("Exactly one role='owner' per tenant at any time."
--      "WHEN ownership is transferred, the System SHALL atomically
--       demote the previous owner to admin and promote the new owner so
--       that the 'exactly one owner' invariant holds at every observable
--       moment.")
--   - Requirements 6.5 (single-owner invariant) and 6.7 (atomic transfer)
--
-- This migration installs:
--   1. A partial unique index on `user_tenant_roles (tenant_id) WHERE role = 'owner'`
--      so the database itself enforces "at most one owner per tenant".
--      The composite PK (user_id, tenant_id) already prevents duplicate
--      role rows for the same user; combined with this partial index the
--      invariant is "exactly one owner per provisioned tenant" — owners
--      are seeded by the provisioning flow (task 12.1).
--   2. `transfer_ownership(p_tenant_id, p_from_user, p_to_user)` — a
--      SECURITY DEFINER function that flips both rows in a single UPDATE
--      statement. Postgres evaluates unique indexes once at the end of a
--      statement (not per-row), so the partial unique index is satisfied
--      throughout the transaction even though two rows transiently
--      exchange the 'owner' role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Partial unique index — at most one owner per tenant.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_tenant_roles_owner
  ON public.user_tenant_roles (tenant_id)
  WHERE role = 'owner';

COMMENT ON INDEX public.uniq_user_tenant_roles_owner IS
  'Partial unique index — exactly one owner per tenant at any committed moment.';

-- -----------------------------------------------------------------------------
-- 2. transfer_ownership(tenant_id, from_user, to_user)
--
-- Atomically demote the current owner to 'admin' and promote the new
-- user to 'owner'. Both updates happen in a single UPDATE statement so
-- the partial unique index is checked only once, after both rows have
-- swapped roles, and the "exactly one owner per tenant" invariant holds
-- at every observable (committed) moment.
--
-- Preconditions:
--   * `p_from_user` is the current owner of `p_tenant_id`.
--   * `p_to_user`   already has a `user_tenant_roles` row for that tenant
--     (i.e. is a member). Promotion never inserts; ownership transfer is
--     between existing members only.
--
-- Postconditions:
--   * `p_from_user` has role='admin' for `p_tenant_id`.
--   * `p_to_user`   has role='owner' for `p_tenant_id`.
--   * No other rows are touched.
--
-- Errors:
--   * P0001 if `p_from_user` is not the current owner.
--   * P0001 if `p_to_user` is not a member of the tenant.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_ownership(
  p_tenant_id uuid,
  p_from_user uuid,
  p_to_user   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Preconditions ------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_tenant_roles
     WHERE tenant_id = p_tenant_id
       AND user_id   = p_from_user
       AND role      = 'owner'
  ) THEN
    RAISE EXCEPTION 'transfer_ownership: % is not the current owner of %',
      p_from_user, p_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.user_tenant_roles
     WHERE tenant_id = p_tenant_id
       AND user_id   = p_to_user
  ) THEN
    RAISE EXCEPTION 'transfer_ownership: % is not a member of %',
      p_to_user, p_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Atomic swap --------------------------------------------------------------
  -- Single UPDATE: Postgres evaluates unique indexes once at statement
  -- end, so the partial unique index does not fire during the
  -- intermediate state where both rows could momentarily look like
  -- 'owner'. After the statement, exactly one row has role='owner'.
  UPDATE public.user_tenant_roles
     SET role = CASE
                  WHEN user_id = p_from_user THEN 'admin'
                  WHEN user_id = p_to_user   THEN 'owner'
                  ELSE role
                END
   WHERE tenant_id = p_tenant_id
     AND user_id IN (p_from_user, p_to_user);
END;
$$;

COMMENT ON FUNCTION public.transfer_ownership(uuid, uuid, uuid) IS
  'Atomically demote current owner to admin and promote new user to owner. Single UPDATE statement keeps the partial unique index satisfied.';



-- ====== 20260601000800_primary_domain.sql ======

-- Migration: enforce "at most one primary domain per tenant" on
-- `public.tenant_domains` via a partial unique index.
--
-- Source of truth:
--   - .kiro/specs/white-label-saas-system/requirements.md
--       Requirement 8.8: "THE System SHALL allow at most one
--       `tenant_domains` row per tenant with `is_primary=true`."
--   - .kiro/specs/white-label-saas-system/design.md
--       §"Model: TenantDomain" / "Validation Rules":
--       "Only one isPrimary=true per tenant."
--
-- The base `tenant_domains` table is created in
-- `20250101000000_tenancy_baseline.sql`, which intentionally defers this
-- constraint to a follow-up migration (task 14.4). A regular UNIQUE
-- constraint on `tenant_id` alone would forbid multiple non-primary
-- domains per tenant, which we want to allow. Postgres' partial unique
-- index lets us scope uniqueness to rows matching the predicate
-- `is_primary = true`, leaving non-primary rows unconstrained.
--
-- The index is named explicitly (`uniq_tenant_domains_primary`) so it can
-- be referenced by `COMMENT ON INDEX` and dropped in a reversible
-- migration if ever needed. `CREATE UNIQUE INDEX IF NOT EXISTS` keeps the
-- migration idempotent across re-runs.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_domains_primary
  ON public.tenant_domains (tenant_id)
  WHERE is_primary = true;

COMMENT ON INDEX public.uniq_tenant_domains_primary IS
  'Partial unique index — at most one primary domain per tenant.';



-- ====== 20260601000900_status_transition_trigger.sql ======

-- Migration: enforce the tenant status transition graph at the database
-- layer via a BEFORE UPDATE trigger on `public.tenants.status`.
--
-- Source of truth:
--   - .kiro/specs/white-label-saas-system/requirements.md
--       Requirement 4.7: "THE System SHALL constrain `tenants.status`
--       transitions to the directed graph
--       `trialing → active → past_due → suspended → cancelled` and
--       SHALL reject any transition that is not an edge in that graph."
--       Requirement 4.9: `resumeTenant` may move `suspended → active`
--       (or `suspended → past_due` when the subscription is unpaid).
--       Requirement 7.7: a successful payment may move `past_due → active`
--       and `suspended → active`.
--   - src/lib/tenancy/status-transitions.ts
--       The TypeScript `assertTransition` function encodes the same
--       edge set; this trigger keeps the constraint authoritative even
--       for direct SQL writes that bypass the application layer.
--
-- Encoded edges (all other transitions are rejected):
--
--     trialing  -> { active, past_due, suspended, cancelled }
--     active    -> { past_due, suspended, cancelled }
--     past_due  -> { active, suspended, cancelled }
--     suspended -> { active, past_due, cancelled }
--     cancelled -> {}                                  -- terminal
--
-- Self-transitions (OLD.status = NEW.status) are allowed as a no-op so
-- that webhook handlers re-applying the current status do not raise.
-- The function and trigger are both created idempotently so the
-- migration can be re-run safely.

CREATE OR REPLACE FUNCTION public.tenants_assert_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;  -- idempotent self-update
  END IF;

  IF (OLD.status, NEW.status) NOT IN (
    ('trialing',  'active'),     ('trialing',  'past_due'),  ('trialing',  'suspended'), ('trialing',  'cancelled'),
    ('active',    'past_due'),   ('active',    'suspended'), ('active',    'cancelled'),
    ('past_due',  'active'),     ('past_due',  'suspended'), ('past_due',  'cancelled'),
    ('suspended', 'active'),     ('suspended', 'past_due'),  ('suspended', 'cancelled')
    -- 'cancelled' is terminal: no outgoing edges
  ) THEN
    RAISE EXCEPTION 'tenants: invalid status transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tenants_assert_status_transition() IS
  'BEFORE UPDATE OF status trigger — rejects transitions that are not edges in the tenant status graph (Requirement 4.7).';

DROP TRIGGER IF EXISTS tenants_assert_status_transition ON public.tenants;
CREATE TRIGGER tenants_assert_status_transition
  BEFORE UPDATE OF status ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.tenants_assert_status_transition();



-- ====== 20260601001000_strict_rls.sql ======

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



-- ====== 20260601001100_tenant_domains_failed.sql ======

-- Migration: add a `failed` flag to `public.tenant_domains` so the domain
-- re-check cron worker can mark domains that did not verify within 24
-- hours and stop re-running DNS / Cloudflare checks against them.
--
-- Source of truth:
--   - .kiro/specs/white-label-saas-system/requirements.md
--       Requirement 8.9: "WHILE a custom domain remains unverified, THE
--       System SHALL re-check DNS at most every 10 minutes for up to 24
--       hours, after which IF still unverified THEN THE Domain_Manager
--       SHALL mark the domain `failed`."
--   - .kiro/specs/white-label-saas-system/design.md
--       §"Component: Custom Domain Manager".
--
-- The base `tenant_domains` table is created in
-- `20250101000000_tenancy_baseline.sql` with columns id, tenant_id,
-- domain, verification_token, verified, is_primary, created_at — but no
-- `failed` flag. Task 14.5 (`src/server/cron/domain-recheck.ts`) needs
-- a persistent terminal state for the verification state machine so the
-- cron worker can:
--   * filter pending rows efficiently with
--     `WHERE verified = false AND failed = false`;
--   * stop touching rows whose 24h window has elapsed.
--
-- We add it as `boolean NOT NULL DEFAULT false` so existing rows backfill
-- to "still pending / not failed" without any data migration step.
-- `IF NOT EXISTS` keeps the migration idempotent across re-runs.
--
-- The supporting partial index on `created_at` (filtered by the active
-- predicate) keeps the cron worker's two queries cheap even as the
-- `tenant_domains` table grows: both queries scan strictly the active
-- subset, and `created_at` is the column compared against the 24h cutoff.

ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS failed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenant_domains.failed IS
  'Terminal state for the verification state machine — set by the domain re-check cron worker after the 24h window expires (Requirement 8.9).';

CREATE INDEX IF NOT EXISTS idx_tenant_domains_unverified_active
  ON public.tenant_domains (created_at)
  WHERE verified = false AND failed = false;

COMMENT ON INDEX public.idx_tenant_domains_unverified_active IS
  'Partial index used by the domain re-check cron worker (Requirement 8.9) to scan only pending custom domains.';


