/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @server-only
 *
 * Tenant provisioning — atomic creation of a new tenant on the platform.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Tenant Onboarding" (sequence diagram)
 *   - §"Algorithmic Pseudocode → Tenant Provisioning (Atomic)"
 *   - §"Key Functions with Formal Specifications → provisionTenant"
 *
 * Algorithm (mirrors design pseudocode):
 *   1. Validate `slug` (regex, length 3..32, not in `RESERVED_SLUGS`).
 *   2. Validate `ownerEmail` against a permissive RFC-5322-shaped regex.
 *   3. Look up `plans.code = planCode`; throw `plan_not_found` if missing.
 *   4. Within a try/catch:
 *      4a. Insert `tenants` row (`status='trialing'`, plan_id, name, slug).
 *      4b. Insert `tenant_branding` row (column defaults populate the
 *          rest — primary/accent colors, fontFamily, version=1, etc.).
 *      4c. Find-or-invite the owner via `auth.admin.inviteUserByEmail`.
 *      4d. Insert `user_tenant_roles` row with `role='owner'`.
 *      4e. Create Stripe customer + subscription with 14-day trial.
 *      4f. Insert `tenant_billing` row mapping Stripe ids + status.
 *      4g. Append a `platform_audit_log` row via `recordAudit`.
 *   5. Return the `Tenant` shape.
 *
 *   On failure at any step inside the try/catch, run compensating
 *   actions:
 *     - Delete the Stripe customer if it was created (so we don't
 *       orphan billing state on Stripe's side).
 *     - Delete the partial DB rows by `slug` (ON DELETE CASCADE on the
 *       child tables removes branding / billing / role rows).
 *
 * @important Atomicity caveat (Requirement 4.4): supabase-js does NOT
 * expose multi-statement transactions to the client. The right
 * long-term shape is a Postgres function executed via RPC
 * (`provision_tenant_db(...)`) so all DB inserts share a single
 * transaction. This module implements the practical interim:
 * sequential inserts + best-effort compensating cleanup. Stripe-side
 * compensation (deleting the customer on failure) is preserved.
 *
 * @todo Move steps 4a–4d + 4f into a single Postgres RPC
 * `provision_tenant_db(slug, name, plan_id, owner_user_id,
 * stripe_customer_id, stripe_subscription_id, billing_status)` so the
 * DB writes commit atomically; the Stripe calls remain outside the
 * transaction with the same compensating-delete pattern.
 *
 * @important This module imports the service-role Supabase admin
 * client and the Stripe Node SDK. NEVER bundle into client code.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import Stripe from "stripe";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAudit } from "@/server/middleware/audit";

import { RESERVED_SLUGS, type Tenant, type TenantStatus } from "./types";

// ---------------------------------------------------------------------------
// Stripe singleton
// ---------------------------------------------------------------------------

/**
 * Lazy Stripe singleton. Constructed on first use so importing this
 * module does not crash when `STRIPE_SECRET_KEY` is unset (e.g. during
 * static type-checks, route discovery, or tests that never exercise
 * billing). Mirrors the singleton pattern used by
 * `src/lib/billing/stripe.ts`.
 *
 * The API version literal is intentionally cast through `as any`: the
 * `stripe` SDK's literal-string type for `apiVersion` lags the version
 * pinned by the platform.
 */
let _stripe: Stripe | undefined;

function stripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2024-11-20.acacia" as any });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Status mapping (kept local — see note in src/lib/billing/stripe.ts about
// `mapSubscriptionStatus` being internal there; we inline an equivalent
// copy here to avoid changing the existing module's public surface).
// ---------------------------------------------------------------------------

/**
 * Map a Stripe subscription status onto the platform's {@link TenantStatus}.
 * Identical to the private mapping in `src/lib/billing/stripe.ts`; both
 * implementations must stay in sync. Any unrecognized future Stripe
 * status falls through to `past_due`, which surfaces the tenant in
 * dunning UI without locking access — the safest default for an
 * unknown signal.
 */
function mapSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): TenantStatus {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    case "incomplete":
    case "paused":
      return "suspended";
    default:
      return "past_due";
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Slug regex; mirrors the CHECK constraint on `tenants.slug` and the
 * `SLUG_REGEX` used by the resolver.
 */
const SLUG_REGEX = /^[a-z0-9](-?[a-z0-9])*$/;
const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 32;

/**
 * Permissive email regex matching the design pseudocode's
 * `isValidEmail`. We deliberately don't pull in a full RFC 5322
 * validator — Supabase Auth applies its own strict validation when the
 * invite is sent, and a lightweight regex here lets us short-circuit
 * obviously bad input before any DB or Stripe call.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Set of reasons {@link ProvisioningValidationError} carries. Each
 * value names a single recoverable input problem the caller can map to
 * an HTTP 4xx / form error in the super-admin UI.
 */
export type ProvisioningValidationReason =
  | "invalid_slug"
  | "reserved_slug"
  | "invalid_email"
  | "plan_not_found";

/**
 * Thrown when `provisionTenant` rejects its input before any side
 * effect occurs. Carries a machine-readable `reason` (one of
 * {@link ProvisioningValidationReason}) for UI mapping.
 *
 * Per Requirement 4.2: input validation MUST run before any DB write
 * or Stripe call so a rejected request leaves no observable state.
 */
export class ProvisioningValidationError extends Error {
  override name = "ProvisioningValidationError";

  readonly reason: ProvisioningValidationReason;

  constructor(reason: ProvisioningValidationReason) {
    super(`tenant provisioning validation failed: ${reason}`);
    this.reason = reason;
    // Restore prototype chain when targeting older transpilation modes.
    Object.setPrototypeOf(this, ProvisioningValidationError.prototype);
  }
}

function isValidSlug(slug: string): boolean {
  return (
    typeof slug === "string" &&
    slug.length >= MIN_SLUG_LENGTH &&
    slug.length <= MAX_SLUG_LENGTH &&
    SLUG_REGEX.test(slug)
  );
}

function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug);
}

function isValidEmail(email: string): boolean {
  return typeof email === "string" && EMAIL_REGEX.test(email);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Input to {@link provisionTenant}.
 *
 * `actorId` identifies the platform admin who initiated the call and
 * is recorded on the audit-log row written on success. Pass `null`
 * (or omit) for system-initiated provisioning, e.g. a sign-up flow
 * driven by automation rather than a human admin.
 */
export interface ProvisionInput {
  name: string;
  slug: string;
  ownerEmail: string;
  planCode: string;
  /** Audit actor; `null` / undefined => system-initiated. */
  actorId?: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers (DB access)
// ---------------------------------------------------------------------------

/**
 * Cast helper for the service-role admin client. The platform tables
 * (`tenants`, `tenant_branding`, `user_tenant_roles`, `tenant_billing`,
 * `plans`) are not yet present in the generated `Database` type;
 * mirrors the cast pattern used by `src/lib/billing/stripe.ts` and
 * `src/lib/tenancy/resolver.ts`.
 */
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

interface PlanRow {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  stripe_price_id: string;
  is_public: boolean;
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  plan_id: string;
  created_at: string;
  updated_at: string;
}

function rowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    planId: row.plan_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchPlanByCode(code: string): Promise<PlanRow | null> {
  const { data, error } = await adminFrom("plans")
    .select("*")
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`provisionTenant: failed to look up plan '${code}': ${error.message}`);
  }
  return (data as PlanRow | null) ?? null;
}

/**
 * Best-effort cleanup of any partial tenant rows tracked by `slug`.
 * `tenants` is the parent of `tenant_branding`, `user_tenant_roles`,
 * and `tenant_billing` via `ON DELETE CASCADE`, so deleting the
 * `tenants` row by slug also removes the children that may have been
 * inserted in steps 4b/4d/4f. Errors here are swallowed — the failure
 * already aborted provisioning and we are returning to the caller's
 * error handler in any case.
 */
async function compensateDeleteTenantBySlug(slug: string): Promise<void> {
  try {
    await adminFrom("tenants").delete().eq("slug", slug);
  } catch {
    /* swallow — best-effort cleanup */
  }
}

/**
 * Best-effort deletion of a Stripe customer that was created earlier
 * in the provisioning call. If the call has not reached step 4e yet
 * (`createdStripeCustomerId` is undefined) this is a no-op. Errors are
 * swallowed: we cannot do anything useful about them and the caller's
 * original error is the one we want to surface.
 */
async function compensateDeleteStripeCustomer(
  customerId: string | undefined,
): Promise<void> {
  if (!customerId) return;
  try {
    await stripe().customers.del(customerId);
  } catch {
    /* swallow — best-effort cleanup */
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Provision a new tenant.
 *
 * Validates the inputs, then sequentially inserts the platform rows,
 * creates the Stripe customer + subscription, sends the magic-link
 * invite, and writes a `platform_audit_log` row. On any failure inside
 * the side-effect block, runs compensating actions:
 *   - delete the Stripe customer if it was created;
 *   - delete the partial tenant rows by slug (cascades to child rows).
 *
 * @returns The newly created {@link Tenant} on success.
 *
 * @throws {ProvisioningValidationError}
 *   - reason `'invalid_slug'`    — slug fails regex / length bounds.
 *   - reason `'reserved_slug'`   — slug is in `RESERVED_SLUGS`.
 *   - reason `'invalid_email'`   — `ownerEmail` fails regex check.
 *   - reason `'plan_not_found'`  — no `plans.code = planCode` row.
 *
 * Other errors (DB driver, Stripe API, Supabase Auth) bubble up
 * unchanged after compensating cleanup.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
export async function provisionTenant(input: ProvisionInput): Promise<Tenant> {
  const { name, slug, ownerEmail, planCode, actorId } = input;

  // 1. Slug validation (shape + length + reserved guard).
  //    Order matters here: a reserved slug is also a "valid" string,
  //    so we check the regex/length first to surface the more
  //    specific 'invalid_slug' reason for malformed input, then fall
  //    through to the reserved check.
  if (!isValidSlug(slug)) {
    throw new ProvisioningValidationError("invalid_slug");
  }
  if (isReservedSlug(slug)) {
    throw new ProvisioningValidationError("reserved_slug");
  }

  // 2. Email validation.
  if (!isValidEmail(ownerEmail)) {
    throw new ProvisioningValidationError("invalid_email");
  }

  // 3. Plan lookup.
  const plan = await fetchPlanByCode(planCode);
  if (!plan) {
    throw new ProvisioningValidationError("plan_not_found");
  }

  // 4. Side-effect block. Track the Stripe customer id so we can
  //    compensate (delete it) if anything below fails.
  let createdStripeCustomerId: string | undefined;

  try {
    // 4a. Insert the tenant row.
    const { data: tenantRow, error: tErr } = await adminFrom("tenants")
      .insert({
        slug,
        name,
        plan_id: plan.id,
        status: "trialing" satisfies TenantStatus,
      })
      .select("*")
      .single();
    if (tErr) {
      throw new Error(`provisionTenant: failed to insert tenants row: ${tErr.message}`);
    }
    const tenant = rowToTenant(tenantRow as TenantRow);

    // 4b. Insert the branding row. The `tenant_branding` table has
    //     defaults for every non-key column (primary/accent colors,
    //     fontFamily, themeTokens, copyOverrides, version=1) so we
    //     only need to provide the foreign key here.
    const { error: bErr } = await adminFrom("tenant_branding").insert({
      tenant_id: tenant.id,
    });
    if (bErr) {
      throw new Error(
        `provisionTenant: failed to insert tenant_branding row: ${bErr.message}`,
      );
    }

    // 4c. Find or invite the owner. `inviteUserByEmail` both creates
    //     the auth user (if absent) and dispatches the magic-link
    //     email — so this single call covers both the "invite" step
    //     and Requirement 4.5's "send magic-link invite". Redirect
    //     into `/onboarding` so the new owner lands on the branding
    //     wizard after accepting the invite.
    const { data: invited, error: iErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(ownerEmail, {
        redirectTo: "/onboarding",
      });
    if (iErr) {
      throw new Error(
        `provisionTenant: failed to invite owner '${ownerEmail}': ${iErr.message}`,
      );
    }
    const ownerUserId = invited?.user?.id;
    if (!ownerUserId) {
      throw new Error(
        `provisionTenant: invite returned no user id for '${ownerEmail}'`,
      );
    }

    // 4d. Insert the owner row in user_tenant_roles.
    const { error: rErr } = await adminFrom("user_tenant_roles").insert({
      user_id: ownerUserId,
      tenant_id: tenant.id,
      role: "owner",
    });
    if (rErr) {
      throw new Error(
        `provisionTenant: failed to insert user_tenant_roles row: ${rErr.message}`,
      );
    }

    // 4e. Create the Stripe customer + subscription. `metadata.tenant_id`
    //     pins the Stripe-side records to our tenant id so webhook
    //     handlers can route events without an extra lookup.
    const customer = await stripe().customers.create({
      email: ownerEmail,
      name,
      metadata: { tenant_id: tenant.id },
    });
    createdStripeCustomerId = customer.id;

    const sub = await stripe().subscriptions.create({
      customer: customer.id,
      items: [{ price: plan.stripe_price_id }],
      trial_period_days: 14,
      metadata: { tenant_id: tenant.id },
    });

    // 4f. Insert the tenant_billing row mirroring the Stripe state.
    const { error: tbErr } = await adminFrom("tenant_billing").insert({
      tenant_id: tenant.id,
      stripe_customer_id: customer.id,
      stripe_subscription_id: sub.id,
      status: mapSubscriptionStatus(sub.status),
    });
    if (tbErr) {
      throw new Error(
        `provisionTenant: failed to insert tenant_billing row: ${tbErr.message}`,
      );
    }

    // 4g. Audit. Best-effort: `recordAudit` logs+swallows DB errors
    //     unless `AUDIT_STRICT=1` so a flaky audit table does not
    //     fail an otherwise-successful provisioning call.
    await recordAudit({
      actorId: actorId ?? null,
      tenantId: tenant.id,
      action: "tenant.provisioned",
      payload: { slug, plan_code: planCode },
    });

    return tenant;
  } catch (err) {
    // Compensating actions, in reverse order of creation. Stripe
    // first because it's the external system most expensive to leak
    // state into; DB cleanup second (cascades remove children).
    await compensateDeleteStripeCustomer(createdStripeCustomerId);
    await compensateDeleteTenantBySlug(slug);
    throw err;
  }
}
