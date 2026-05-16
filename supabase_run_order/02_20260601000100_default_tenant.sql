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
