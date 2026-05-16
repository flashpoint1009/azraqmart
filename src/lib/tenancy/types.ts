/**
 * Authoritative tenancy types for the white-label SaaS platform.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Data Models"
 *   - §"Core Type Definitions (Authoritative)"
 *   - §"Component: Tenant Resolver" (ResolveResult)
 *
 * These types describe the shape of platform records (`tenants`,
 * `tenant_branding`, `tenant_domains`, `plans`, `plan_features`,
 * `tenant_features`, `tenant_billing`, `user_tenant_roles`) and the
 * derived runtime values consumed by the resolver, theming engine,
 * feature gate, role guard, and billing service.
 *
 * Validation logic (slug regex, hex color regex, reserved-slug guard,
 * status-transition graph, role hierarchy) lives next to each component
 * implementation; this file only declares the data shapes plus a
 * handful of related constants that are imported broadly.
 *
 * Requirements: 1.1, 4.2, 5.1, 6.1, 6.3
 */

// ---------------------------------------------------------------------------
// Tenant lifecycle status
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of a tenant. Transitions are constrained to the directed
 * graph `trialing → active → past_due → suspended → cancelled`; see
 * `src/lib/tenancy/status-transitions.ts` (created in task 12.4) for the
 * authoritative state machine.
 */
export type TenantStatus = "active" | "trialing" | "past_due" | "suspended" | "cancelled";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * Roles a user can hold inside a single tenant.
 *
 * Hierarchy (least to most privileged): `delivery < staff < admin < owner`.
 * `customer` is parallel to the hierarchy and never satisfies `staff`,
 * `admin`, or `owner` — see `ROLE_HIERARCHY` below and the role guard
 * implementation in `src/lib/tenancy/roles.ts` (task 10.1).
 */
export type UserRole = "owner" | "admin" | "staff" | "delivery" | "customer";

// ---------------------------------------------------------------------------
// Feature keys
// ---------------------------------------------------------------------------

/**
 * Closed enum of feature modules the platform can gate per tenant.
 *
 * The effective set for a tenant is `plan_features` ∪/∖ `tenant_features`
 * overrides (with expiry); see §"Feature Flag Gate" in design.md.
 */
export type FeatureKey =
  | "loyalty"
  | "push_notifications"
  | "multi_branch"
  | "custom_domain"
  | "mobile_app"
  | "chat_widget"
  | "advanced_analytics";

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

/**
 * A tenant — a business operating a branded storefront on the platform.
 *
 * `slug` matches `^[a-z0-9](-?[a-z0-9])*$` (length 3..32) and must not
 * collide with `RESERVED_SLUGS`. `planId` references `plans.id`.
 */
export interface Tenant {
  id: string; // uuid v4
  slug: string; // unique, kebab-case, 3..32 chars, [a-z0-9-]
  name: string;
  status: TenantStatus;
  planId: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Per-tenant branding record. Drives the theming engine
 * (`applyBranding`) and the storefront's logo/copy.
 *
 * `version` is bumped on every save and used as the cache-busting key
 * for the precomputed CSS string.
 */
export interface TenantBranding {
  tenantId: string;
  logoUrl: string | null;
  primaryColor: string; // hex #RRGGBB
  accentColor: string; // hex #RRGGBB
  fontFamily: string; // CSS font-family value
  themeTokens: Record<string, string>; // additional CSS custom properties
  copyOverrides: Record<string, string>; // i18n key → string
  version: number; // bumped on every save; used for cache busting
}

/**
 * A custom domain owned by a tenant. Verified via a TXT record at
 * `_azraqmart.<domain>` matching `azraqmart-verify=<verificationToken>`.
 *
 * At most one row per tenant has `isPrimary === true`. `domain` is
 * unique across all tenants.
 */
export interface TenantDomain {
  id: string;
  tenantId: string;
  domain: string; // FQDN, lowercase, RFC 1123
  verificationToken: string; // TXT record value
  verified: boolean;
  isPrimary: boolean;
  createdAt: string;
}

/**
 * A subscription plan tier (e.g. `starter`, `pro`, `enterprise`).
 * `code` is unique and immutable. `priceCents >= 0`.
 */
export interface Plan {
  id: string;
  code: string; // e.g. 'starter', 'pro', 'enterprise'
  name: string;
  priceCents: number;
  stripePriceId: string;
  isPublic: boolean;
}

/**
 * Plan-level feature toggle. Composite primary key `(planId, featureKey)`.
 */
export interface PlanFeature {
  planId: string;
  featureKey: FeatureKey;
  enabled: boolean;
}

/**
 * Tenant-level feature override that may enable a feature above the
 * plan baseline or disable one below it.
 *
 * Composite primary key `(tenantId, featureKey)`. `expiresAt` (if set)
 * must be in the future at insert time; expired overrides are ignored
 * by the feature gate.
 */
export interface TenantFeatureOverride {
  tenantId: string;
  featureKey: FeatureKey;
  enabled: boolean; // can enable above plan or disable below plan
  expiresAt: string | null; // null = permanent override
}

/**
 * Per-tenant billing record mirroring the Stripe customer/subscription.
 * `stripeCustomerId` is unique across tenants. `status` is kept in sync
 * with `tenants.status` by the webhook handler.
 */
export interface TenantBilling {
  tenantId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: TenantStatus;
  currentPeriodEnd: string | null;
}

/**
 * Membership of a user in a tenant with a specific role.
 *
 * Composite primary key `(userId, tenantId)`. Exactly one row with
 * `role === 'owner'` exists per tenant at any time (enforced by a
 * partial unique index — see migration `20250101000700_owner_constraint.sql`).
 * A user can belong to many tenants with different roles.
 */
export interface UserTenantRole {
  userId: string;
  tenantId: string;
  role: UserRole;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Derived runtime values (Core Type Definitions §"Authoritative")
// ---------------------------------------------------------------------------

/**
 * The effective feature set for a tenant after merging plan baseline with
 * non-expired overrides. Computed by `computeEnabledFeatures(tenantId)`
 * (task 9.1) and injected into `TenantContext`.
 */
export interface TenantFeatures {
  tenantId: string;
  enabled: ReadonlySet<FeatureKey>; // effective set after merging plan + overrides
}

/**
 * The runtime view of a tenant's subscription, derived from `tenant_billing`
 * joined with the tenant's plan. Surfaces in `TenantContext`.
 */
export interface Subscription {
  tenantId: string;
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: TenantStatus;
  currentPeriodEnd: string | null;
}

/**
 * Optional override passed to `evaluateFeature(features, key, override?)`.
 * When provided, takes precedence over the effective set.
 *
 * `expiresAt` is an ISO 8601 timestamp; if absent the override is permanent.
 */
export interface FeatureOverride {
  enabled: boolean;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Resolver result
// ---------------------------------------------------------------------------

/**
 * Result of `resolveTenant(host, headers)`.
 *
 * `'invalid_host'` is returned without any DB lookup when `host` fails
 * RFC 1123 validation. `'suspended'` covers both `suspended` and
 * `cancelled` tenants (HTTP 402). `'not_found'` redirects to the
 * marketing landing page.
 */
export type ResolveResult =
  | { ok: true; tenant: Tenant }
  | { ok: false; reason: "not_found" | "suspended" | "invalid_host" };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Slugs reserved by the platform; provisioning a tenant with any of
 * these slugs is rejected before any side effect occurs.
 */
export const RESERVED_SLUGS = ["admin", "api", "www", "app"] as const;

export type ReservedSlug = (typeof RESERVED_SLUGS)[number];

/**
 * Role hierarchy from least to most privileged.
 *
 * `assertRole(u, t, R)` succeeds iff the user's role on the tenant has
 * an index in this array greater than or equal to that of `R`.
 *
 * NOTE: `customer` is intentionally **not** part of this hierarchy.
 * It is a parallel role: holding `customer` does not satisfy `staff`,
 * `admin`, or `owner`, and conversely the staff hierarchy does not
 * grant customer-only access surfaces. See §"Role Guard" in design.md.
 */
export const ROLE_HIERARCHY = ["delivery", "staff", "admin", "owner"] as const;

/**
 * The roles that participate in the staff hierarchy (i.e. excluding
 * `customer`). Equivalent to `ROLE_HIERARCHY[number]`.
 */
export type HierarchicalRole = (typeof ROLE_HIERARCHY)[number];
