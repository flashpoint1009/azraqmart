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
