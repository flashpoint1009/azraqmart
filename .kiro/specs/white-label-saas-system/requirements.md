# Requirements Document

## Introduction

The White-Label SaaS System transforms the existing single-tenant **azraqmart** marketplace into a multi-tenant white-label platform. Multiple businesses (tenants) operate fully branded grocery/marketplace storefronts from a single shared codebase and shared Supabase database. Each tenant gets isolated data via Postgres Row-Level Security (RLS), a custom domain or platform subdomain, configurable branding, per-tenant feature module enablement, role-based access scoped per tenant, a Stripe-managed subscription, and optionally a per-tenant branded mobile app produced from a single Capacitor project at build time.

A super-admin console governs the platform: provisioning tenants, managing subscriptions, monitoring usage, and toggling feature flags. The migration from the current single-tenant codebase is staged so the application remains operational at every step.

These requirements are derived from the approved design document and use the EARS notation (WHERE, WHILE, WHEN, IF, THEN, THE, SHALL) so each acceptance criterion is independently testable. Requirement numbering is aligned with the cross-references already used by the correctness properties in `design.md`.

## Glossary

- **Tenant**: A business operating a branded storefront on the platform. Identified by a unique `tenant.id` (uuid) and `tenant.slug` (kebab-case).
- **Tenant_Resolver**: Middleware component that maps an incoming request to a tenant record and sets the `app.tenant_id` Postgres GUC.
- **Tenant_Context**: React context that exposes the current tenant, branding, features, and subscription to all routes and components.
- **Theming_Engine**: Component that produces deterministic CSS custom properties from a tenant's branding record.
- **Feature_Gate**: Component that decides whether a feature key is enabled for a tenant by combining plan features with tenant-level overrides.
- **Role_Guard**: Component that enforces tenant-scoped role-based access control over the role hierarchy `delivery < staff < admin < owner`, with `customer` parallel to that hierarchy.
- **Billing_Service**: Component that owns Stripe customer/subscription lifecycle and processes Stripe webhooks.
- **Domain_Manager**: Component that registers custom domains, issues TXT verification tokens, and provisions Cloudflare SSL-for-SaaS hostnames.
- **Super_Admin_Console**: Platform-wide administrative UI served at `admin.azraqmart.app`, gated by the `role=platform_admin` JWT claim.
- **Mobile_Build_Pipeline**: GitHub Actions workflow that produces a per-tenant signed APK or IPA from the shared Capacitor project.
- **Onboarding_API**: Server endpoints that orchestrate tenant provisioning (DB rows, Stripe customer/subscription, owner invite).
- **System**: The end-to-end White-Label SaaS System composed of all components above.
- **RLS**: Postgres Row-Level Security; the source of truth for tenant data isolation.
- **GUC**: A `current_setting` value used by RLS policies (specifically `app.tenant_id`).
- **FeatureKey**: One of `loyalty | push_notifications | multi_branch | custom_domain | mobile_app | chat_widget | advanced_analytics`.
- **Reserved_Slug**: A slug reserved by the platform; the initial set is `admin`, `api`, `www`, `app`.
- **Platform_Admin**: A user whose JWT carries `role=platform_admin`; bypasses tenant-scoped RLS via a dedicated policy.
- **Plan**: A subscription tier (`starter`, `pro`, `enterprise`, etc.) that controls baseline feature availability and pricing.

## Requirements

### Requirement 1: Tenant Isolation and Data Model

**User Story:** As a platform operator, I want every domain table partitioned by `tenant_id` and protected by RLS, so that data from one tenant is never visible to another tenant.

#### Acceptance Criteria

1. THE System SHALL store a non-null `tenant_id uuid` foreign key referencing `tenants(id)` on every domain table (including `products`, `orders`, `customers`, and any other table holding tenant-owned data).
2. WHEN a query is executed under a tenant context with `app.tenant_id` set to tenant A's id, THE System SHALL return only rows whose `tenant_id` equals tenant A's id.
3. IF a query attempts to read or write a row whose `tenant_id` differs from `current_setting('app.tenant_id')::uuid` and the caller is not a Platform_Admin, THEN THE System SHALL deny the operation via RLS.
4. WHERE the caller's JWT contains `role=platform_admin`, THE System SHALL allow access across tenants through the `platform_admin_bypass` RLS policy.
5. THE System SHALL create a composite index `(tenant_id, primary_sort_col)` on every domain table to keep RLS-filtered queries performant.
6. WHEN a new domain table is added, THE System SHALL require it to declare `tenant_id uuid not null` and apply the standard `tenant_isolation` and `platform_admin_bypass` RLS policies before being deployed.

### Requirement 2: Tenant Resolution

**User Story:** As a visitor, I want the platform to identify which tenant I am visiting based on host or headers, so that I see the correct branded storefront.

#### Acceptance Criteria

1. WHEN a request arrives with a host that exactly matches a verified row in `tenant_domains`, THE Tenant_Resolver SHALL resolve the request to the owning tenant.
2. WHEN no verified custom domain matches and the host ends with `.azraqmart.app`, THE Tenant_Resolver SHALL resolve the request to the tenant whose `slug` equals the host's first label.
3. WHEN no host-based match succeeds and the request includes an `X-Tenant-Slug` header, THE Tenant_Resolver SHALL resolve the request to the tenant whose `slug` equals that header value.
4. WHERE the runtime is a development environment and the URL path begins with `/_t/:slug/`, THE Tenant_Resolver SHALL resolve the request to the tenant whose `slug` equals `:slug`.
5. WHEN a tenant is successfully resolved, THE Tenant_Resolver SHALL set the `app.tenant_id` Postgres GUC to that tenant's id for the remainder of the request.
6. IF no tenant matches any of the resolution paths, THEN THE Tenant_Resolver SHALL return `{ ok: false, reason: 'not_found' }` and THE System SHALL redirect the request to the marketing landing page.
7. IF a tenant is resolved but its `status` is `suspended` or `cancelled`, THEN THE Tenant_Resolver SHALL return `{ ok: false, reason: 'suspended' }` and THE System SHALL respond with HTTP 402 routed to the suspended landing page.
8. IF the host fails RFC 1123 hostname validation, THEN THE Tenant_Resolver SHALL return `{ ok: false, reason: 'invalid_host' }` without performing any database lookup.
9. WHILE a cached resolution result exists for a host and the cache entry has not expired, THE Tenant_Resolver SHALL return the cached value without contacting the database.
10. WHEN the same `(host, headers)` are resolved twice within the cache TTL with no intervening database writes, THE Tenant_Resolver SHALL return deeply equal results on both calls.
11. WHEN a tenant's data changes (status, slug, primary domain), THE System SHALL invalidate the Tenant_Resolver cache entries for that tenant.

### Requirement 3: Branding and Theming

**User Story:** As a tenant owner, I want to configure my storefront's logo, colors, fonts, and copy, so that customers experience my brand instead of the platform's brand.

#### Acceptance Criteria

1. THE Theming_Engine SHALL produce a deterministic CSS string of the form `:root[data-tenant="<slug>"] { --primary: ...; --accent: ...; ... }` from a `TenantBranding` record.
2. WHEN `applyBranding(b)` is called twice with the same input `b`, THE Theming_Engine SHALL return byte-equal output strings (idempotence).
3. WHEN tenant branding contains `themeTokens`, THE Theming_Engine SHALL emit those tokens in the same order they appear in the input map.
4. IF a `themeTokens` value contains a `</style>` substring or other CSS-injection pattern, THEN THE Theming_Engine SHALL escape or strip the unsafe content before emitting CSS.
5. IF `primaryColor` or `accentColor` does not match `^#[0-9a-fA-F]{6}$`, THEN THE System SHALL reject the branding save with a validation error and SHALL NOT persist the change.
6. IF `logoUrl` is not hosted on the platform CDN or on a domain that is verified as belonging to the tenant, THEN THE System SHALL reject the branding save with a validation error.
7. WHEN a tenant's branding is saved, THE System SHALL increment `tenant_branding.version` so cached CSS can be invalidated.
8. WHEN a request is rendered for a tenant, THE System SHALL inline that tenant's branding CSS in the SSR response and SHALL apply `data-tenant="<slug>"` to the root element.
9. WHEN copy overrides are saved, THE System SHALL strip HTML markup from the values before persisting.

### Requirement 4: Tenant Provisioning and Lifecycle

**User Story:** As a platform admin, I want to provision a new tenant atomically with branding defaults, an owner user, and a Stripe subscription, so that onboarding cannot leave the system in a partially created state.

#### Acceptance Criteria

1. THE System SHALL enforce uniqueness of `tenants.slug` such that for any set of provisioned tenants, the count of distinct slugs equals the total count of tenants.
2. IF a slug does not match `^[a-z0-9](-?[a-z0-9])*$`, has length outside `[3, 32]`, or appears in the Reserved_Slug set, THEN THE System SHALL reject the provisioning request with a validation error before any side effect occurs.
3. WHEN `provisionTenant(input)` is invoked and all steps succeed, THE Onboarding_API SHALL create consistent rows in `tenants`, `tenant_branding`, `user_tenant_roles` (with `role='owner'`), and `tenant_billing`, AND SHALL create a Stripe customer and subscription whose metadata references the new tenant id.
4. IF any step of `provisionTenant(input)` fails, THEN THE Onboarding_API SHALL roll back the database transaction, SHALL delete any Stripe customer that was created during the call, and SHALL leave database state identical to the pre-call snapshot.
5. WHEN tenant provisioning succeeds, THE System SHALL send a magic-link invite email to the owner address with a redirect to `/onboarding`.
6. WHEN tenant provisioning succeeds, THE System SHALL write an entry to `platform_audit_log` with `action='tenant.provisioned'`, the actor's id, and the new tenant id.
7. THE System SHALL constrain `tenants.status` transitions to the directed graph `trialing → active → past_due → suspended → cancelled` and SHALL reject any transition that is not an edge in that graph.
8. WHEN a Platform_Admin invokes `suspendTenant(tenantId, reason)`, THE System SHALL set `tenants.status='suspended'` and SHALL write an audit-log entry recording the reason.
9. WHEN a Platform_Admin invokes `resumeTenant(tenantId)` on a tenant whose `status='suspended'`, THE System SHALL set `tenants.status='active'` (or `past_due` when the subscription is unpaid) per the constrained transition graph.
10. WHILE `tenants.status` is `suspended` or `cancelled`, THE System SHALL block all storefront routes for that tenant except the suspended landing page and the Stripe billing portal redirect.

### Requirement 5: Feature Flags and Plans

**User Story:** As a platform operator, I want each tenant's available features to be derived from its plan and admin overrides, so that I can monetize tiers and grant exceptions without code changes.

#### Acceptance Criteria

1. THE Feature_Gate SHALL compute a tenant's effective feature set as the union of `plan_features` rows where `enabled=true` for the tenant's plan, modified by any non-expired `tenant_features` overrides.
2. WHEN a `tenant_features` override has `enabled=true` and either `expires_at` is null or `expires_at > now()`, THE Feature_Gate SHALL include the override's `feature_key` in the effective feature set.
3. WHEN a `tenant_features` override has `enabled=false` and either `expires_at` is null or `expires_at > now()`, THE Feature_Gate SHALL exclude the override's `feature_key` from the effective feature set even when the plan enables it.
4. WHEN a `tenant_features` override has `expires_at <= now()`, THE Feature_Gate SHALL ignore that override.
5. THE Feature_Gate SHALL guarantee that `evaluateFeature(features, key)` returns `true` only if `key` is enabled in the tenant's plan and not disabled by an active override, OR an active override enables `key` for the tenant.
6. THE `evaluateFeature` function SHALL be a pure function with no I/O and no mutation of inputs.
7. IF a `tenant_features` override is created with `expires_at` set to a value not strictly greater than the current time, THEN THE System SHALL reject the override with a validation error.
8. WHEN a feature is gated off for a tenant, THE System SHALL render the configured fallback UI (an "Upgrade to enable" CTA where appropriate) instead of the gated component.

### Requirement 6: Roles and Access Control

**User Story:** As a tenant member, I want my permissions inside one tenant to be independent of any other tenant I belong to, so that cross-tenant privilege escalation is impossible.

#### Acceptance Criteria

1. THE Role_Guard SHALL evaluate `assertRole(userId, tenantId, required)` against `user_tenant_roles` rows scoped to the given `tenantId`, using the hierarchy `delivery < staff < admin < owner`.
2. WHEN `assertRole(u, t, R)` succeeds for a role `R` in the hierarchy, THE Role_Guard SHALL also succeed for every role lower than `R` in the hierarchy on the same `(u, t)` pair (role monotonicity).
3. THE Role_Guard SHALL treat `customer` as parallel to the hierarchy such that holding `customer` SHALL NOT satisfy `staff`, `admin`, or `owner`.
4. IF a user has no `user_tenant_roles` row for the requested `tenantId`, THEN THE Role_Guard SHALL throw `ForbiddenError` regardless of that user's roles in other tenants.
5. THE System SHALL enforce that exactly one `user_tenant_roles` row with `role='owner'` exists per tenant at any time.
6. THE System SHALL allow a single user to hold different roles in different tenants and SHALL surface a tenant switcher when more than one membership exists.
7. WHEN ownership is transferred, THE System SHALL atomically demote the previous owner to `admin` and promote the new owner so that the "exactly one owner" invariant holds at every observable moment.

### Requirement 7: Subscription and Billing

**User Story:** As a tenant owner, I want my subscription state in the platform to track Stripe in real time, so that billing failures suspend access and successful payments restore it without manual intervention.

#### Acceptance Criteria

1. WHEN a tenant is provisioned, THE Billing_Service SHALL create a Stripe customer and a subscription on the tenant's plan with a 14-day trial and SHALL persist `stripe_customer_id` and `stripe_subscription_id` to `tenant_billing`.
2. WHEN a tenant owner requests a plan change, THE Billing_Service SHALL update the Stripe subscription to the new price and SHALL update `tenants.plan_id` and `tenant_billing.status` to reflect Stripe's response.
3. WHEN a Stripe webhook is received, THE Billing_Service SHALL verify the `Stripe-Signature` header against the raw request body before any database write, AND IF verification fails THEN THE Billing_Service SHALL respond with HTTP 400 and SHALL NOT mutate any database row.
4. WHEN the same Stripe webhook event (identified by `event.id`) is delivered more than once, THE Billing_Service SHALL apply its side effects at most once such that the resulting database state is identical to a single application (idempotence).
5. WHEN a `customer.subscription.deleted` event is processed, THE Billing_Service SHALL set `tenants.status='cancelled'` and `tenant_billing.status='cancelled'`.
6. WHEN an `invoice.payment_failed` event is processed and represents the final dunning attempt, THE Billing_Service SHALL set `tenants.status='suspended'`.
7. WHEN an `invoice.payment_succeeded` event is processed for a tenant currently in `past_due` or `suspended`, THE Billing_Service SHALL transition `tenants.status` to `active` per the constrained transition graph.
8. THE System SHALL keep `tenant_billing.status` in sync with `tenants.status` after every webhook write.

### Requirement 8: Custom Domains

**User Story:** As a tenant owner, I want to bring my own domain and have it served over HTTPS, so that customers see my domain instead of a platform subdomain.

#### Acceptance Criteria

1. WHEN a tenant owner adds a custom domain, THE Domain_Manager SHALL persist a `tenant_domains` row with `verified=false`, a per-domain `verification_token`, and SHALL display the required `_azraqmart.<domain>` TXT record value to the user.
2. THE System SHALL enforce that `tenant_domains.domain` is unique across all tenants and SHALL reject any add request that would violate uniqueness.
3. THE System SHALL reject custom domains that equal the platform apex (`azraqmart.app`) or any reserved subdomain.
4. WHEN `verifyDomain(domainId)` is invoked, THE Domain_Manager SHALL look up the TXT records at `_azraqmart.<domain>` and SHALL only mark the row `verified=true` if a record matching `azraqmart-verify=<verification_token>` is present AND the Cloudflare SSL-for-SaaS hostname status is `active`.
5. IF the expected TXT record is not present, THEN THE Domain_Manager SHALL return `{ verified: false, reason: 'txt_not_found' }` and SHALL NOT mark the row as verified.
6. IF the TXT record is present but the Cloudflare hostname status is not `active`, THEN THE Domain_Manager SHALL return `{ verified: false, reason: 'ssl_pending' }` and SHALL NOT mark the row as verified.
7. WHEN a domain becomes verified, THE Domain_Manager SHALL invalidate the Tenant_Resolver cache entries keyed by that domain.
8. THE System SHALL allow at most one `tenant_domains` row per tenant with `is_primary=true`.
9. WHILE a custom domain remains unverified, THE System SHALL re-check DNS at most every 10 minutes for up to 24 hours, after which IF still unverified THEN THE Domain_Manager SHALL mark the domain `failed`.

### Requirement 9: Mobile App White-Labeling

**User Story:** As a tenant owner, I want a branded mobile app for my storefront produced from the platform's shared codebase, so that I get an iOS/Android presence without maintaining a separate project.

#### Acceptance Criteria

1. WHEN a Platform_Admin triggers the Mobile_Build_Pipeline for a tenant slug, THE Mobile_Build_Pipeline SHALL fetch that tenant's branding from Supabase and SHALL generate a `capacitor.config.ts` with a tenant-specific `appId`, `appName`, and deep-link scheme.
2. THE Mobile_Build_Pipeline SHALL inject `TENANT_SLUG` into the build environment such that the resulting binary sends `X-Tenant-Slug: <slug>` on every request to the platform.
3. THE Mobile_Build_Pipeline SHALL generate icons and splash screens from the tenant's logo using `pwa-asset-generator`.
4. WHEN the build succeeds, THE Mobile_Build_Pipeline SHALL produce a signed APK or IPA, SHALL upload it to the platform CDN, and SHALL return a download URL to the Super_Admin_Console.
5. IF a tenant's plan does not include the `mobile_app` feature, THEN THE Super_Admin_Console SHALL disable the "Trigger mobile build" action for that tenant.
6. WHEN a request is received with an `X-Tenant-Slug` header but no host-based match, THE Tenant_Resolver SHALL resolve the tenant by slug per Requirement 2.3 so that the mobile app reaches the correct tenant.

### Requirement 10: Super-Admin Console

**User Story:** As a platform admin, I want a dedicated console to provision tenants, manage plans, monitor usage, and override features, so that I can operate the platform without database access.

#### Acceptance Criteria

1. THE Super_Admin_Console SHALL be served on `admin.azraqmart.app` and SHALL be reachable only after authentication with a JWT carrying `role=platform_admin`.
2. IF a request to a Super_Admin_Console route lacks the `role=platform_admin` claim, THEN THE System SHALL respond with HTTP 403 and SHALL NOT execute the requested action.
3. THE Super_Admin_Console SHALL require a verified MFA factor on the actor's session before executing any mutating endpoint.
4. WHEN a Platform_Admin invokes any mutating Super_Admin_Console endpoint, THE System SHALL append a `platform_audit_log` entry containing the `actor_id`, `tenant_id` (when applicable), `action`, `payload`, and source `ip`.
5. THE Super_Admin_Console SHALL expose endpoints for `provisionTenant`, `suspendTenant`, `resumeTenant`, `listTenants`, `setFeatureOverride`, and `triggerMobileBuild` that conform to the contracts defined in Requirements 4, 5, and 9.
6. WHEN a Platform_Admin invokes `setFeatureOverride(tenantId, key, enabled, expiresAt)`, THE System SHALL upsert the corresponding `tenant_features` row and SHALL invalidate any cached effective-feature set for that tenant.

### Requirement 11: Migration from Single-Tenant azraqmart

**User Story:** As an engineer, I want the migration from the existing single-tenant codebase to the multi-tenant platform to be staged and reversible, so that the application keeps working at every step and existing azraqmart data is preserved.

#### Acceptance Criteria

1. THE System SHALL create the platform tables `tenants`, `tenant_branding`, `tenant_features`, `plans`, `tenant_billing`, and `user_tenant_roles` before any domain table is altered to add a `tenant_id` column.
2. WHEN the platform tables are created, THE System SHALL insert a single default tenant with `slug='azraqmart'` and SHALL associate all existing domain rows with that tenant during backfill.
3. WHEN `tenant_id` is added to an existing domain table, THE System SHALL add the column as nullable, backfill all existing rows to the default tenant, and only then alter the column to `NOT NULL`.
4. WHILE RLS is in shadow mode, THE System SHALL keep policies permissive and SHALL log every query that would have been denied to a `rls_shadow_log` table, including the missing `tenant_id` scope.
5. WHEN strict RLS is enabled, THE System SHALL switch policies to deny-by-default and SHALL ensure every domain table is covered by both `tenant_isolation` and `platform_admin_bypass` policies.
6. THE System SHALL ensure that at every migration phase boundary the application remains operational for the existing azraqmart data set, verified by a smoke-test suite executed in CI.
7. WHEN a second tenant is provisioned end-to-end, THE System SHALL execute a cross-tenant security test suite that verifies tenant A cannot read or modify tenant B's rows through any code path, and SHALL block the migration from being marked complete if any cross-tenant access succeeds.
