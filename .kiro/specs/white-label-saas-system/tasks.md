# Implementation Plan: White-Label SaaS System

> Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

## Overview

This plan converts the existing single-tenant **azraqmart** codebase (TanStack Start + React 19 + Supabase + Capacitor + Cloudflare Workers + Vite) into the multi-tenant white-label platform described in `design.md`. It follows the 9-phase staged migration table from the design (Baseline → Platform tables → tenant_id backfill → Shadow RLS → Resolver wiring → Data-call refactor → Strict RLS → Multi-tenant features → Mobile builds → Second-tenant validation), so the application keeps working at every checkpoint.

Property-based tests (fast-check) cover the eight correctness properties from `design.md`:

1. Tenant Isolation
2. Resolver Determinism
3. Feature Gate Soundness
4. Role Monotonicity
5. Branding Idempotence
6. Slug Uniqueness
7. Provisioning Atomicity
8. Webhook Idempotence

Each property test is placed close to its implementation so regressions are caught early. Unit tests cover example/edge-case behavior; Playwright covers end-to-end flows; an integration cross-tenant matrix validates RLS-enforced isolation against a live Supabase instance.

## Tasks

- [x] 1. Establish tenancy foundation
  - [x] 1.1 Create `src/lib/tenancy/types.ts` with authoritative tenancy types
    - Define `Tenant`, `TenantStatus`, `TenantBranding`, `TenantDomain`, `Plan`, `PlanFeature`, `TenantFeatureOverride`, `TenantBilling`, `UserTenantRole`, `UserRole`, `FeatureKey`, `TenantFeatures`, `Subscription`, `ResolveResult` exactly as in design §"Core Type Definitions"
    - Export `RESERVED_SLUGS = ['admin', 'api', 'www', 'app']`
    - Export `ROLE_HIERARCHY = ['delivery', 'staff', 'admin', 'owner']` and document `customer` as parallel
    - _Requirements: 1.1, 4.2, 5.1, 6.1, 6.3_

  - [x] 1.2 Install and configure test tooling
    - Add devDependencies: `vitest`, `@vitest/ui`, `fast-check`, `@playwright/test`, `stripe` (and `@stripe/stripe-js` as dependency)
    - Create `vitest.config.ts` with `tsconfig-paths` resolution and `coverage.include = ['src/lib/**']` (target 90%+)
    - Create `playwright.config.ts` pointing at the local Vite preview server
    - Add npm scripts: `"test": "vitest --run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`, `"test:property": "vitest --run tests/properties"` with `numRuns=200` env var
    - _Requirements: derived from design §"Testing Strategy"_

  - [x] 1.3 Create platform tables baseline migration
    - File: `supabase/migrations/20250101000000_tenancy_baseline.sql`
    - Tables: `plans`, `plan_features`, `tenants`, `tenant_branding`, `tenant_domains`, `tenant_features` (overrides), `tenant_billing`, `user_tenant_roles`, `platform_audit_log`, `webhook_events` (Stripe dedup), `rls_shadow_log`
    - CHECK constraints: `tenants.slug ~ '^[a-z0-9](-?[a-z0-9])*$'`, length 3..32, NOT IN RESERVED_SLUGS
    - UNIQUE: `tenants.slug`, `tenant_billing.stripe_customer_id`, `tenant_domains.domain`
    - Composite PKs: `(tenant_id, feature_key)` on `tenant_features`, `(user_id, tenant_id)` on `user_tenant_roles`
    - `tenant_branding.version int not null default 1`
    - _Requirements: 1.1, 4.1, 4.2, 7.4, 8.2, 11.1_

- [x] 2. Add tenant_id to existing domain tables (Migration Phase 2)
  - [x] 2.1 Insert default azraqmart tenant
    - File: `supabase/migrations/20250101000100_default_tenant.sql`
    - INSERT a row into `tenants` with `slug='azraqmart'`, default `plans` row, default `tenant_branding`, default owner `user_tenant_roles` for the current azraqmart admin user
    - _Requirements: 11.2_

  - [x] 2.2 Add nullable `tenant_id`, backfill, then SET NOT NULL on every domain table
    - File: `supabase/migrations/20250101000200_add_tenant_id.sql`
    - For each existing domain table (products, orders, customers, deliveries, notifications, loyalty, etc. — enumerate by reading current schema): `ALTER TABLE x ADD COLUMN tenant_id uuid REFERENCES tenants(id)`, `UPDATE x SET tenant_id = (default-tenant-id)`, `ALTER TABLE x ALTER COLUMN tenant_id SET NOT NULL`
    - _Requirements: 1.1, 11.3_

  - [x] 2.3 Add composite `(tenant_id, primary_sort_col)` indexes
    - File: `supabase/migrations/20250101000300_indexes.sql`
    - Create `idx_<table>_tenant` on every domain table; pick `primary_sort_col` per table (e.g., `created_at` or `name`)
    - _Requirements: 1.5_

- [x] 3. Enable RLS in shadow mode (Migration Phase 3)
  - [x] 3.1 Shadow-mode RLS migration
    - File: `supabase/migrations/20250101000400_rls_shadow.sql`
    - Enable RLS on all domain tables with permissive policies (`USING (true) WITH CHECK (true)`)
    - Add a trigger or wrapper function that logs every query whose `current_setting('app.tenant_id', true)` is null OR does not match `tenant_id` to `rls_shadow_log` (table created in 1.3)
    - _Requirements: 11.4_

  - [x] 3.2 RLS policy template DDL function
    - File: `supabase/migrations/20250101000500_rls_template.sql`
    - Define a SQL function `apply_tenant_rls_policy(tableName text)` matching the pseudocode in design §"RLS Policy Application Template" — adds `tenant_isolation` policy and `platform_admin_bypass` policy
    - _Requirements: 1.3, 1.4, 1.6_

- [x] 4. Implement Tenant Resolver and Tenant Context (Migration Phase 4)
  - [x] 4.1 Implement `resolveTenant` in `src/lib/tenancy/resolver.ts`
    - Implement the algorithm in design §"Tenant Resolution" (cache → custom domain → platform subdomain → `X-Tenant-Slug` header → `/_t/:slug/` dev path)
    - Return `{ ok: false, reason: 'invalid_host' }` for hosts failing RFC 1123 validation, before any DB call
    - Use a Worker-memory LRU + Cloudflare KV with 60s TTL; export `invalidateCache(tenantId)`, `invalidateByDomain(domain)`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11_

  - [ ]* 4.2 Write property test for resolver determinism
    - File: `tests/properties/resolver-determinism.property.test.ts`
    - **Property 2: Resolver Determinism** — for arbitrary `host` and `headers`, two consecutive `resolveTenant` calls within TTL with no DB writes return deeply-equal results
    - **Validates: Requirements 2.1, 2.2, 2.10**

  - [ ]* 4.3 Write unit tests for resolver decision matrix
    - File: `tests/lib/tenancy/resolver.test.ts`
    - Cover: custom-domain hit, subdomain hit, header hit, dev path hit, suspended (402), cancelled (402), not_found (404), invalid_host (no DB call), cache hit/miss, invalidation
    - _Requirements: 2.6, 2.7, 2.8, 2.11_

  - [x] 4.4 Implement `TenantProvider` and `useTenant` in `src/lib/tenancy/context.tsx`
    - Re-hydrate from SSR-injected JSON; throw if `useTenant` called outside provider
    - _Requirements: 2.5_

  - [x] 4.5 Wire resolver and TenantProvider into `src/routes/__root.tsx`
    - In `beforeLoad`: call `resolveTenant(host, headers)`; on `suspended` redirect to `/suspended`; on `not_found` redirect to `/marketing`
    - Wrap `<Outlet />` with `<TenantProvider value={...}>`
    - _Requirements: 2.5, 2.6, 2.7_

  - [x] 4.6 Implement `withTenantScope` in `src/lib/tenancy/scope.ts`
    - Wraps a Supabase client; sets `app.tenant_id` GUC via `supabase.rpc('set_tenant_guc', { id })` (define this RPC in 3.2 or here in a small migration alongside)
    - Restores/clears the GUC on resolve and reject
    - _Requirements: 1.2, 2.5_

- [x] 5. Refactor existing data calls to use tenant scope (Migration Phase 5)
  - [x] 5.1 Replace direct `supabase.from(...)` calls with `withTenantScope(supabase, tenantId, scoped => ...)`
    - Audit every file under `src/integrations/`, `src/hooks/`, `src/components/` (e.g., `DBBrowser.tsx`, `DemoSeeder.tsx`, route loaders) and route them through `withTenantScope`
    - Inject `tenantId` from `useTenant()` (client) or context loader (server)
    - _Requirements: 1.2, 11.6_

  - [ ]* 5.2 Smoke test that azraqmart data is still readable end-to-end
    - File: `tests/integration/azraqmart-smoke.test.ts`
    - Boot a local Supabase, apply migrations 1.3 → 3.2, set `app.tenant_id` to the default azraqmart tenant, exercise product list / order list / customer list paths and assert non-empty results
    - _Requirements: 11.6_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Enforce strict RLS (Migration Phase 6)
  - [x] 7.1 Switch RLS policies to deny-by-default
    - File: `supabase/migrations/20250101000600_strict_rls.sql`
    - Drop permissive shadow policies; for every domain table call `apply_tenant_rls_policy(<table>)` (from 3.2) so it has both `tenant_isolation` and `platform_admin_bypass` policies
    - _Requirements: 1.3, 1.4, 11.5_

  - [ ]* 7.2 Write property test for tenant isolation
    - File: `tests/properties/tenant-isolation.property.test.ts`
    - **Property 1: Tenant Isolation** — `forAll(twoTenants, oneUser, oneQuery, ({A,B,u,q}) => runAs(u,A,q).every(r => r.tenant_id === A.id))`
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 7.3 Cross-tenant access matrix integration test
    - File: `tests/integration/cross-tenant-matrix.test.ts`
    - Seed two tenants A and B; for each domain table run SELECT/INSERT/UPDATE/DELETE in A's context against B's row id and assert RLS denial
    - _Requirements: 1.3, 11.7_

- [x] 8. Branding and Theming
  - [x] 8.1 Implement `applyBranding` in `src/lib/tenancy/branding.ts`
    - Emit `:root[data-tenant="<slug>"] { --primary: ...; --accent: ...; ... }` deterministically; preserve `themeTokens` insertion order; escape `</style>` and other CSS-injection patterns; memoize per `(tenant_id, version)`
    - Implement `resolveLogo(branding, variant)` returning the appropriate URL
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7_

  - [x] 8.2 Branding Zod schema and server-side validators
    - File: `src/lib/tenancy/branding-schema.ts`
    - Validate `primaryColor`/`accentColor` against `^#[0-9a-fA-F]{6}$`; require `logoUrl` host to be platform CDN or a verified `tenant_domains.domain`; strip HTML from `copyOverrides` values; auto-bump `version` on save
    - _Requirements: 3.5, 3.6, 3.7, 3.9_

  - [ ]* 8.3 Write property test for branding idempotence
    - File: `tests/properties/branding-idempotence.property.test.ts`
    - **Property 5: Branding Idempotence** — `forAll(branding, b => applyBranding(b) === applyBranding(b))`
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 8.4 Write unit tests for sanitization and token order
    - File: `tests/lib/tenancy/branding.test.ts`
    - Cover: `</style>` injection input, invalid hex rejection, `themeTokens` order preservation, snapshot of generated CSS
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 8.5 Inline branding CSS in SSR `__root.tsx`
    - Modify `src/routes/__root.tsx` to render `<style dangerouslySetInnerHTML={{ __html: applyBranding(branding) }} />` and apply `data-tenant="<slug>"` to the `<html>` element
    - _Requirements: 3.8_

  - [x] 8.6 Tenant branding editor route
    - File: `src/routes/onboarding/branding.tsx`
    - Form (react-hook-form + Zod from 8.2) for logo upload, primary/accent colors, font family, theme tokens, copy overrides; on submit increment `tenant_branding.version`
    - _Requirements: 3.5, 3.6, 3.7, 3.9_

- [x] 9. Feature flags and plan-feature evaluation
  - [x] 9.1 Implement `evaluateFeature` and `computeEnabledFeatures` in `src/lib/tenancy/features.ts`
    - Pure `evaluateFeature(features, key, override?)` per design §"evaluateFeature"
    - `computeEnabledFeatures(tenantId)` joining `plan_features` with non-expired `tenant_features` overrides
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 9.2 Write property test for feature gate soundness
    - File: `tests/properties/feature-soundness.property.test.ts`
    - **Property 3: Feature Gate Soundness** — `forAll(tenant, feature, ({t,f}) => !evaluateFeature(t.features, f) || planEnables(t.plan, f) || activeOverrideEnables(t, f))`
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 9.3 Write unit truth-table tests for feature evaluation
    - File: `tests/lib/tenancy/features.test.ts`
    - Cover plan ∈ {has, lacks} × override ∈ {none, enable, disable, expired} (8 cells)
    - _Requirements: 5.4, 5.6, 5.7_

  - [x] 9.4 Implement `<Feature flag="...">` component
    - File: `src/components/Feature.tsx` per design §"Feature Flag Gate" example
    - Render fallback (default: "Upgrade to enable" CTA) when gated off
    - _Requirements: 5.8_

  - [x] 9.5 Override insert validation
    - File: `src/lib/tenancy/features-schema.ts`
    - Zod schema rejecting `expires_at <= now()`; used by the admin override endpoint (16.5)
    - _Requirements: 5.7_

- [x] 10. Role guard and tenant-scoped RBAC
  - [x] 10.1 Implement `assertRole`, `hasRole`, `listUserTenants` in `src/lib/tenancy/roles.ts`
    - Hierarchy `delivery < staff < admin < owner`; `customer` parallel; throw `ForbiddenError` if no row for `(userId, tenantId)`
    - _Requirements: 6.1, 6.3, 6.4_

  - [ ]* 10.2 Write property test for role monotonicity
    - File: `tests/properties/role-monotonicity.property.test.ts`
    - **Property 4: Role Monotonicity** — if `assertRole(u,t,R)` succeeds for hierarchical role R, all lower roles also succeed
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 10.3 Write unit test for cross-tenant rejection
    - File: `tests/lib/tenancy/roles.test.ts`
    - User with `owner` in tenant A asserts `staff` in tenant B → `ForbiddenError`
    - _Requirements: 6.4_

  - [x] 10.4 Extend `src/components/RoleGuard.tsx` with tenant scope
    - Modify the existing component to accept a `tenantId` prop (default from `useTenant().tenant.id`) and call `assertRole(currentUserId, tenantId, required)`
    - _Requirements: 6.1, 6.4_

  - [x] 10.5 Single-owner DB constraint and ownership transfer
    - File: `supabase/migrations/20250101000700_owner_constraint.sql`
    - Partial unique index `unique (tenant_id) where role = 'owner'`
    - Add `transfer_ownership(tenant_id, from_user, to_user)` SQL function that demotes old owner to `admin` and promotes new owner inside one transaction so the invariant holds at every observable moment
    - _Requirements: 6.5, 6.7_

  - [x] 10.6 Implement `TenantSwitcher` component
    - File: `src/components/TenantSwitcher.tsx`
    - Calls `listUserTenants(currentUser.id)`; shown only when more than one membership exists; persists choice in cookie
    - _Requirements: 6.6_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Tenant provisioning lifecycle
  - [x] 12.1 Implement `provisionTenant` in `src/lib/tenancy/provisioning.ts`
    - Follow the algorithm in design §"Tenant Provisioning (Atomic)": validate slug + reserved + email + plan; insert `tenants`, `tenant_branding` (defaults), `user_tenant_roles` (owner), Stripe customer + subscription with 14d trial, `tenant_billing`; commit; on rollback delete the Stripe customer (compensating action); send magic-link invite; write `platform_audit_log` entry
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 12.2 Write property test for slug uniqueness
    - File: `tests/properties/slug-uniqueness.property.test.ts`
    - **Property 6: Slug Uniqueness** — `forAll(allTenants, T => new Set(T.map(t => t.slug)).size === T.length)`
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 12.3 Write property test for provisioning atomicity
    - File: `tests/properties/provisioning-atomicity.property.test.ts`
    - **Property 7: Provisioning Atomicity** — for arbitrary inputs that fail at a random step, snapshot tables before and after; assert deep-equal (no partial state, Stripe customer deleted)
    - **Validates: Requirements 4.3, 4.4**

  - [x] 12.4 Status transition state machine
    - File: `src/lib/tenancy/status-transitions.ts`
    - Encode the directed graph `trialing → active → past_due → suspended → cancelled`; export `assertTransition(from, to)` and a Postgres trigger function (in a migration alongside) that rejects non-edges
    - _Requirements: 4.7_

  - [x] 12.5 `suspendTenant` / `resumeTenant` admin actions
    - File: `src/lib/tenancy/admin-actions.ts`
    - Call `assertTransition`, update `tenants.status` and `tenant_billing.status` together, write audit log with reason
    - _Requirements: 4.8, 4.9, 7.8_

  - [x] 12.6 Suspended-tenant route gate
    - File: `src/routes/suspended.tsx`
    - In `__root.tsx` `beforeLoad` (extend 4.5), if `tenant.status` ∈ {suspended, cancelled} block all routes except `/suspended` and a Stripe billing-portal redirect
    - _Requirements: 4.10_

- [x] 13. Billing service and Stripe webhooks
  - [x] 13.1 Implement `BillingService` in `src/lib/billing/stripe.ts`
    - `createSubscription(tenantId, planCode, trialDays=14)`, `changePlan(tenantId, newPlanCode)`, `cancelSubscription(tenantId, immediate?)` — server-only; never imported into client bundles
    - _Requirements: 7.1, 7.2_

  - [x] 13.2 Implement `handleStripeWebhook` in `src/lib/billing/webhooks.ts`
    - Verify `Stripe-Signature` against raw body **before any DB write**; on failure throw `WebhookSignatureError` (HTTP 400)
    - Dedup by `event.id` against the `webhook_events` table created in 1.3 (idempotent application)
    - Map events: `customer.subscription.deleted` → tenants.status=`cancelled`; `invoice.payment_failed` final attempt → `suspended`; `invoice.payment_succeeded` from `past_due`/`suspended` → `active`; mirror to `tenant_billing.status`
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ]* 13.3 Write property test for webhook idempotence
    - File: `tests/properties/webhook-idempotence.property.test.ts`
    - **Property 8: Webhook Idempotence** — for arbitrary supported `stripeEvent`, applying twice yields identical DB snapshot to applying once
    - **Validates: Requirements 7.3, 7.4**

  - [ ]* 13.4 Write unit tests for webhook side-effects
    - File: `tests/lib/billing/webhooks.test.ts`
    - Cover signature mismatch (no DB write), final-dunning suspension, recovery to active, cancelled terminal state
    - _Requirements: 7.3, 7.5, 7.6, 7.7_

  - [x] 13.5 Stripe webhook HTTP route
    - File: `src/routes/api/webhooks/stripe.ts`
    - Pass raw body bytes (no JSON parse) into `handleStripeWebhook`; respond 200 on success, 400 on signature failure
    - _Requirements: 7.3_

- [x] 14. Custom domain manager
  - [x] 14.1 Implement `addDomain` in `src/lib/tenancy/domains.ts`
    - Validate domain (RFC 1123, lowercase); reject platform apex and reserved subdomains; check uniqueness; insert `tenant_domains` row with generated `verification_token`; return TXT instructions
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 14.2 Implement `verifyDomain` in `src/lib/tenancy/domains.ts`
    - Follow design §"Custom Domain Verification" pseudocode: DNS TXT lookup at `_azraqmart.<domain>` for `azraqmart-verify=<token>`; on found call Cloudflare SSL-for-SaaS to add custom hostname; only set `verified=true` if both succeed
    - Return distinct reasons `txt_not_found` and `ssl_pending`
    - _Requirements: 8.4, 8.5, 8.6_

  - [x] 14.3 Resolver cache invalidation on verification
    - Modify `src/lib/tenancy/resolver.ts` to expose `invalidateByDomain(domain)`; call it from `verifyDomain` on success
    - _Requirements: 8.7, 2.11_

  - [x] 14.4 Single primary-domain DB constraint
    - File: `supabase/migrations/20250101000800_primary_domain.sql`
    - Partial unique index `unique (tenant_id) where is_primary = true` on `tenant_domains`
    - _Requirements: 8.8_

  - [x] 14.5 Re-check cron worker
    - File: `src/server/cron/domain-recheck.ts`
    - Cloudflare cron trigger every 10 minutes: re-run `verifyDomain` on unverified rows younger than 24h; mark `failed` after 24h
    - _Requirements: 8.9_

  - [ ]* 14.6 Write unit tests for domain verification
    - File: `tests/lib/tenancy/domains.test.ts`
    - Cover: valid TXT + active SSL, missing TXT, present TXT but SSL pending, uniqueness rejection, reserved/apex rejection
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 15. Mobile build pipeline (Migration Phase 8)
  - [x] 15.1 Parameterize `capacitor.config.ts`
    - Modify the existing root `capacitor.config.ts` to read `TENANT_SLUG` and `TENANT_APP_NAME` from `process.env`, generating per-tenant `appId` (`app.azraqmart.<slug-no-dashes>`), `appName`, deep-link scheme, and `server.url` (`https://<slug>.azraqmart.app`)
    - _Requirements: 9.1_

  - [x] 15.2 Inject `X-Tenant-Slug` header from mobile builds
    - File: `src/integrations/mobile-headers.ts` — a fetch wrapper that reads `import.meta.env.VITE_TENANT_SLUG` (set by the build pipeline) and adds `X-Tenant-Slug` to every outbound request to the platform
    - Wire it into the existing Supabase client and any other API client
    - _Requirements: 9.2, 9.6_

  - [x] 15.3 GitHub Actions workflow `build-tenant-app.yml`
    - File: `.github/workflows/build-tenant-app.yml`
    - `workflow_dispatch` inputs: `tenant_slug`, `target` (android | ios)
    - Steps: fetch tenant branding from Supabase, write `capacitor.config.ts` env, run `pwa-asset-generator` for icons/splash from logo, `cap sync`, `gradle assembleRelease` (Android) / `xcodebuild` (iOS), sign + zipalign, upload signed artifact to platform CDN
    - _Requirements: 9.1, 9.3, 9.4_

  - [ ]* 15.4 Write unit test for `capacitor.config.ts` templating
    - File: `tests/build/capacitor-config.test.ts`
    - For arbitrary slugs, assert generated `appId` is unique, scheme matches `<slug>://`, `server.url` matches `https://<slug>.azraqmart.app`
    - _Requirements: 9.1_

  - [x] 15.5 Gate "Trigger mobile build" on `mobile_app` feature
    - Modify `src/routes/admin/tenants.tsx` (created in 16.7) to wrap the trigger button in `<Feature flag="mobile_app">` (component from 9.4) so it is disabled when the tenant's plan does not include the feature
    - _Requirements: 9.5_

- [x] 16. Super-Admin Console (Migration Phase 7)
  - [x] 16.1 Admin subdomain routing and `platform_admin` JWT claim check
    - File: `src/server/middleware/admin-auth.ts`
    - On `admin.azraqmart.app`: bypass `TenantContext`; require JWT with `role=platform_admin`; respond 403 otherwise
    - _Requirements: 10.1, 10.2_

  - [x] 16.2 MFA gate middleware for mutating endpoints
    - File: `src/server/middleware/mfa.ts`
    - Reject any non-GET admin request whose session does not have a recently-verified MFA factor; respond 401 with `mfa_required`
    - _Requirements: 10.3_

  - [x] 16.3 Audit-log middleware
    - File: `src/server/middleware/audit.ts`
    - On every mutating admin request, append `(actor_id, tenant_id, action, payload, ip)` to `platform_audit_log`
    - _Requirements: 10.4, 4.6_

  - [x] 16.4 Admin tenant lifecycle endpoints
    - File: `src/routes/api/admin/tenants.ts`
    - `POST /admin/tenants` → `provisionTenant` (12.1); `POST /admin/tenants/:id/suspend` → `suspendTenant` (12.5); `POST /admin/tenants/:id/resume` → `resumeTenant` (12.5); `GET /admin/tenants` → `listTenants(filter)`
    - _Requirements: 10.5, 4.3, 4.8, 4.9_

  - [x] 16.5 Feature override admin endpoint
    - File: `src/routes/api/admin/features.ts`
    - `POST /admin/tenants/:id/features` validating with the schema from 9.5; upsert `tenant_features`; invalidate the cached effective-feature set for the tenant
    - _Requirements: 10.6, 5.7_

  - [x] 16.6 Mobile build trigger admin endpoint
    - File: `src/routes/api/admin/mobile-build.ts`
    - `POST /admin/tenants/:id/mobile-build` dispatches the GitHub Actions workflow (15.3) via the GitHub REST API; returns the run id; gated by `mobile_app` feature on the tenant
    - _Requirements: 10.5, 9.4, 9.5_

  - [x] 16.7 Super-Admin UI routes
    - Files: `src/routes/admin/tenants.tsx`, `src/routes/admin/plans.tsx`, `src/routes/admin/audit.tsx`
    - Tenant list/create/suspend/resume table; plan editor; audit log viewer reading `platform_audit_log`
    - _Requirements: 10.1, 10.4, 10.5_

- [x] 17. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Migration finalization and second-tenant validation (Migration Phase 9)
  - [x] 18.1 Migration runner script
    - File: `scripts/run-migration.ts`
    - Idempotent driver that applies migrations 1.3 → 14.4 in the documented order, prints which phase boundary the DB is at, and aborts on integrity errors so the platform stays operational at every step
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6_

  - [ ]* 18.2 Per-phase smoke-test suite
    - File: `tests/integration/migration-phases.test.ts`
    - For each phase boundary (post 1.3, post 2.x, post 3.x, post 4.x/5.x, post 7.x), run the azraqmart smoke suite (5.2) and assert success — verifying the application keeps working at every step
    - _Requirements: 11.6_

  - [ ]* 18.3 Cross-tenant security test suite (provisions a real second tenant)
    - File: `tests/integration/second-tenant-security.test.ts`
    - End-to-end provision tenant B via `provisionTenant`; for every code path (REST, route loader, Realtime channel, Storage bucket, Stripe webhook) attempt to access tenant A's data while authenticated as tenant B's owner; assert all attempts fail; this suite is the gate to mark migration complete
    - _Requirements: 11.7_

  - [ ]* 18.4 Playwright end-to-end flows
    - File: `e2e/tenant-flows.spec.ts`
    - Scenarios: branded UI loads with correct logo/colors over custom domain; URL tampering between tenants is rejected; suspended tenant blocks all routes except `/suspended` and billing portal; tenant switcher works for multi-tenant users; mobile WebView simulation sends `X-Tenant-Slug` and resolves correctly
    - _Requirements: 3.8, 4.10, 6.4, 6.6, 9.6_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Core implementation tasks are never optional.
- Each task references the specific requirement clauses it satisfies; together the tasks cover all 11 requirement sections.
- Property tests sit beside their implementations so the eight correctness properties from `design.md` are exercised early.
- The 9-phase migration table from `design.md` maps directly to tasks: Phase 1 → 1, Phase 2 → 2, Phase 3 → 3, Phase 4 → 4, Phase 5 → 5, Phase 6 → 7, Phase 7 → 8/9/10/12/13/16, Phase 8 → 15, Phase 9 → 18. Checkpoints (6, 11, 17, 19) preserve a working azraqmart at each boundary.
- All server-only modules (Stripe, webhook handler, admin middleware, GitHub workflow dispatch) live under `src/lib/billing`, `src/server/`, or `src/routes/api/` and are excluded from the client bundle.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["3.1", "3.2"] },
    { "id": 4, "tasks": ["4.1", "4.4", "4.6", "8.1", "8.2", "9.1", "9.5", "10.1", "13.1", "14.1", "15.1", "15.3", "16.1", "16.2", "16.3"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.5", "5.1", "8.3", "8.4", "9.2", "9.3", "9.4", "10.2", "10.3", "10.4", "10.5", "10.6", "12.4", "13.2", "13.4", "14.2", "14.4", "14.6", "15.2", "15.4"] },
    { "id": 6, "tasks": ["5.2", "7.1", "12.1", "12.5", "12.6", "13.3", "13.5", "14.3", "14.5", "16.4", "16.5", "16.6", "16.7"] },
    { "id": 7, "tasks": ["7.2", "7.3", "8.5", "8.6", "12.2", "12.3", "15.5", "18.1"] },
    { "id": 8, "tasks": ["18.2", "18.3", "18.4"] }
  ]
}
```

## Workflow Completion

The Design-First workflow is now complete. The artifacts in `.kiro/specs/white-label-saas-system/` are:

- `requirements.md` — 11 requirement sections in EARS notation
- `design.md` — HLD + LLD with 8 correctness properties
- `tasks.md` — this implementation plan with property-based test tasks and a wave-based dependency graph

To begin executing tasks, open `tasks.md` and click "Start task" next to any task item. Tasks within the same wave can be picked up in parallel; tasks in later waves should wait for their wave's predecessors to complete. Implementation is **not** part of this workflow.
