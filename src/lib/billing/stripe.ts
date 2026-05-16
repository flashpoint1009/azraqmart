/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @server-only
 *
 * BillingService — Stripe subscription lifecycle for the white-label SaaS
 * platform. **NEVER import this module from client code.** It loads the
 * `stripe` Node SDK, which pulls in Node built-ins (`crypto`, `http`,
 * `https`, `events`, etc.) and reads `process.env.STRIPE_SECRET_KEY` at
 * call time. Importing it from any file that ends up in the browser or
 * Capacitor bundle will leak the server SDK into the client and very
 * likely break the build.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Subscription / Billing" (BillingService interface)
 *   - §"Model: TenantBilling" (column shapes)
 *   - §"Algorithmic Pseudocode → Tenant Provisioning (Atomic)" (Stripe
 *     customer + subscription creation pattern reused here)
 *
 * This module owns three operations that mutate Stripe and `tenant_billing`:
 *
 *   * `createSubscription(tenantId, planCode, trialDays=14)` — provision a
 *     Stripe customer (or reuse the existing one) and a Stripe subscription
 *     for the tenant; persist ids + status into `tenant_billing`.
 *   * `changePlan(tenantId, newPlanCode)` — swap the single subscription
 *     item's price with `proration_behavior: 'create_prorations'`; update
 *     `tenants.plan_id` and `tenant_billing.status`.
 *   * `cancelSubscription(tenantId, immediate?)` — either cancel
 *     immediately or set `cancel_at_period_end: true`.
 *
 * Webhook handling lives in `src/lib/billing/webhooks.ts` (task 13.2) —
 * NOT in this file. Status transitions in `tenants` are subject to the
 * directed graph enforced by `src/lib/tenancy/status-transitions.ts`
 * (task 12.4); this module limits itself to writing `tenant_billing.status`.
 *
 * Requirements: 7.1, 7.2
 */

import Stripe from "stripe";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { Subscription, TenantStatus } from "../tenancy/types";

// ---------------------------------------------------------------------------
// Stripe singleton
// ---------------------------------------------------------------------------

/**
 * Lazy Stripe singleton. Constructed on first use so importing this module
 * does not crash when `STRIPE_SECRET_KEY` is unset (e.g. during static
 * type-checks, route discovery, or tests that never exercise billing).
 *
 * The API version literal is intentionally cast through `as any`: the
 * `stripe` SDK's literal-string type for `apiVersion` lags the version
 * pinned by the platform, so without the cast the assignment would fail
 * type-checking even though the SDK accepts the string at runtime.
 *
 * TODO: Drop the `as any` cast once the installed `stripe` SDK's
 * `LatestApiVersion` literal type is updated to include
 * `'2024-11-20.acacia'`.
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
// Status mapping
// ---------------------------------------------------------------------------

/**
 * Map a Stripe subscription status onto the platform's {@link TenantStatus}
 * enum. Covers every status the SDK currently emits; any unrecognized
 * future value falls through to `past_due` (the safest "needs attention"
 * default — surfaces the tenant in dunning UI without locking access).
 *
 * Mapping (from design §"Component: Subscription / Billing"):
 *   - `trialing`                       → `trialing`
 *   - `active`                         → `active`
 *   - `past_due` / `unpaid`            → `past_due`
 *   - `canceled` / `incomplete_expired`→ `cancelled`
 *   - `incomplete` / `paused`          → `suspended`
 *   - default                          → `past_due`
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
// Internal helpers (DB access)
// ---------------------------------------------------------------------------

/**
 * Cast helper for the service-role admin client. The platform tables
 * (`tenants`, `plans`, `tenant_billing`) are not yet present in the
 * generated `Database` type; once `npx supabase gen types` is re-run
 * after migrations apply, this indirection can be removed in favour of
 * the typed client.
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

interface TenantBillingRow {
  tenant_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: TenantStatus;
  current_period_end: string | null;
}

async function fetchPlanByCode(code: string): Promise<PlanRow> {
  const { data, error } = await adminFrom("plans")
    .select("*")
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`BillingService: failed to look up plan '${code}': ${error.message}`);
  }
  if (!data) {
    throw new Error(`BillingService: plan with code '${code}' not found`);
  }
  return data as PlanRow;
}

async function fetchPlanById(id: string): Promise<PlanRow> {
  const { data, error } = await adminFrom("plans")
    .select("*")
    .eq("id", id)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`BillingService: failed to look up plan '${id}': ${error.message}`);
  }
  if (!data) {
    throw new Error(`BillingService: plan with id '${id}' not found`);
  }
  return data as PlanRow;
}

async function fetchTenant(tenantId: string): Promise<TenantRow> {
  const { data, error } = await adminFrom("tenants")
    .select("*")
    .eq("id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`BillingService: failed to look up tenant '${tenantId}': ${error.message}`);
  }
  if (!data) {
    throw new Error(`BillingService: tenant '${tenantId}' not found`);
  }
  return data as TenantRow;
}

async function fetchTenantBilling(tenantId: string): Promise<TenantBillingRow | null> {
  const { data, error } = await adminFrom("tenant_billing")
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `BillingService: failed to look up tenant_billing for '${tenantId}': ${error.message}`,
    );
  }
  return (data as TenantBillingRow | null) ?? null;
}

/**
 * Pull the `current_period_end` of the subscription, normalized to an
 * ISO-8601 string suitable for the `tenant_billing.current_period_end`
 * column (a Postgres `timestamptz`). On the Dahlia API version Stripe
 * moved `current_period_end` off the subscription onto each subscription
 * item; we read from the first item, falling back to the legacy
 * subscription-level field for older API versions.
 */
function pickCurrentPeriodEnd(sub: Stripe.Subscription): string | null {
  const legacy = (sub as unknown as { current_period_end?: number | null }).current_period_end;
  const itemLevel = sub.items?.data?.[0] as
    | { current_period_end?: number | null }
    | undefined;
  const epochSec = legacy ?? itemLevel?.current_period_end ?? null;
  if (epochSec == null) return null;
  return new Date(epochSec * 1000).toISOString();
}

function toSubscriptionShape(args: {
  tenantId: string;
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: TenantStatus;
  currentPeriodEnd: string | null;
}): Subscription {
  return {
    tenantId: args.tenantId,
    planId: args.planId,
    stripeCustomerId: args.stripeCustomerId,
    stripeSubscriptionId: args.stripeSubscriptionId,
    status: args.status,
    currentPeriodEnd: args.currentPeriodEnd,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create (or extend) the Stripe subscription for a tenant.
 *
 * Reuses an existing `stripe_customer_id` from `tenant_billing` when one
 * is present so that re-running provisioning does not orphan customers in
 * Stripe; otherwise creates a fresh customer with `metadata.tenant_id`
 * pointing back to the tenant row.
 *
 * @param tenantId  - UUID of the tenant.
 * @param planCode  - `plans.code` value identifying the target plan.
 * @param trialDays - Days of trial to grant on the new subscription.
 *                    Defaults to 14 to match design §"Component:
 *                    Subscription / Billing".
 *
 * @returns The persisted {@link Subscription} shape.
 *
 * Requirements: 7.1
 */
export async function createSubscription(
  tenantId: string,
  planCode: string,
  trialDays: number = 14,
): Promise<Subscription> {
  const plan = await fetchPlanByCode(planCode);
  const tenant = await fetchTenant(tenantId);
  const existingBilling = await fetchTenantBilling(tenantId);

  // Reuse or create the Stripe customer.
  let stripeCustomerId: string;
  if (existingBilling?.stripe_customer_id) {
    stripeCustomerId = existingBilling.stripe_customer_id;
  } else {
    const customer = await stripe().customers.create({
      name: tenant.name,
      metadata: { tenant_id: tenantId },
    });
    stripeCustomerId = customer.id;
  }

  // Create the Stripe subscription.
  const sub = await stripe().subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: plan.stripe_price_id }],
    trial_period_days: trialDays,
    metadata: { tenant_id: tenantId },
  });

  const status = mapSubscriptionStatus(sub.status);
  const currentPeriodEnd = pickCurrentPeriodEnd(sub);

  // Upsert tenant_billing with the freshly minted ids + status.
  const { error: upsertError } = await adminFrom("tenant_billing").upsert(
    {
      tenant_id: tenantId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: sub.id,
      status,
      current_period_end: currentPeriodEnd,
    },
    { onConflict: "tenant_id" },
  );
  if (upsertError) {
    throw new Error(
      `BillingService: failed to upsert tenant_billing for '${tenantId}': ${upsertError.message}`,
    );
  }

  return toSubscriptionShape({
    tenantId,
    planId: plan.id,
    stripeCustomerId,
    stripeSubscriptionId: sub.id,
    status,
    currentPeriodEnd,
  });
}

/**
 * Change a tenant's plan by swapping the Stripe subscription's single
 * line item to the new plan's `stripe_price_id`. Stripe handles
 * proration via `proration_behavior: 'create_prorations'`. After the
 * Stripe update succeeds, both `tenants.plan_id` and
 * `tenant_billing.status` are updated to mirror the new state.
 *
 * @param tenantId     - UUID of the tenant.
 * @param newPlanCode  - `plans.code` of the destination plan.
 *
 * @returns The updated {@link Subscription} shape.
 *
 * Requirements: 7.2
 */
export async function changePlan(
  tenantId: string,
  newPlanCode: string,
): Promise<Subscription> {
  const newPlan = await fetchPlanByCode(newPlanCode);
  const billing = await fetchTenantBilling(tenantId);
  if (!billing || !billing.stripe_subscription_id) {
    throw new Error(
      `BillingService: tenant '${tenantId}' has no active Stripe subscription to change`,
    );
  }

  const sub = await stripe().subscriptions.retrieve(billing.stripe_subscription_id);
  const itemId = sub.items?.data?.[0]?.id;
  if (!itemId) {
    throw new Error(
      `BillingService: Stripe subscription '${billing.stripe_subscription_id}' has no line items`,
    );
  }

  const updated = await stripe().subscriptions.update(billing.stripe_subscription_id, {
    items: [{ id: itemId, price: newPlan.stripe_price_id }],
    proration_behavior: "create_prorations",
    metadata: { tenant_id: tenantId },
  });

  const status = mapSubscriptionStatus(updated.status);
  const currentPeriodEnd = pickCurrentPeriodEnd(updated);

  // Reflect the new plan id on the tenant row.
  const { error: tenantUpdateError } = await adminFrom("tenants")
    .update({ plan_id: newPlan.id })
    .eq("id", tenantId);
  if (tenantUpdateError) {
    throw new Error(
      `BillingService: failed to update tenant '${tenantId}' plan_id: ${tenantUpdateError.message}`,
    );
  }

  // Reflect the new status + period end on tenant_billing.
  const { error: billingUpdateError } = await adminFrom("tenant_billing")
    .update({ status, current_period_end: currentPeriodEnd })
    .eq("tenant_id", tenantId);
  if (billingUpdateError) {
    throw new Error(
      `BillingService: failed to update tenant_billing for '${tenantId}': ${billingUpdateError.message}`,
    );
  }

  return toSubscriptionShape({
    tenantId,
    planId: newPlan.id,
    stripeCustomerId: billing.stripe_customer_id,
    stripeSubscriptionId: updated.id,
    status,
    currentPeriodEnd,
  });
}

/**
 * Cancel a tenant's Stripe subscription.
 *
 * When `immediate` is true (or any truthy value), the subscription is
 * cancelled right now via `stripe.subscriptions.cancel`. Otherwise the
 * subscription is updated with `cancel_at_period_end: true` so the
 * tenant retains access through the end of the paid period. In both
 * cases the resulting Stripe state is the source of truth — the webhook
 * handler (task 13.2) is responsible for mirroring `tenants.status`
 * and `tenant_billing.status` once Stripe emits the corresponding event.
 *
 * @param tenantId  - UUID of the tenant.
 * @param immediate - When true, cancel immediately; otherwise schedule
 *                    cancellation at period end. Defaults to false.
 */
export async function cancelSubscription(
  tenantId: string,
  immediate?: boolean,
): Promise<void> {
  const billing = await fetchTenantBilling(tenantId);
  if (!billing || !billing.stripe_subscription_id) {
    throw new Error(
      `BillingService: tenant '${tenantId}' has no active Stripe subscription to cancel`,
    );
  }

  if (immediate) {
    await stripe().subscriptions.cancel(billing.stripe_subscription_id);
  } else {
    await stripe().subscriptions.update(billing.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  }
}

// `fetchPlanById` is exported only for use by sibling billing modules
// (e.g. webhook handler in task 13.2) that need to map a stored plan_id
// back to its row without re-implementing the lookup. Not part of the
// public BillingService interface.
export { fetchPlanById as _fetchPlanByIdInternal };
