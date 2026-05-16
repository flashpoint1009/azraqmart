/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @server-only
 *
 * Stripe webhook handler — keeps `tenants.status` and `tenant_billing.status`
 * in lock-step with the Stripe billing state machine. **NEVER import this
 * module from client code.** It loads the `stripe` Node SDK and reads the
 * service-role Supabase admin client, both of which expose secrets and
 * Node-only built-ins that must not appear in the browser/Capacitor bundle.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Subscription / Billing" (BillingService.handleWebhook
 *     interface and webhook → status mapping)
 *   - §"Function: handleStripeWebhook" (formal pre/postconditions)
 *   - §"Property 8: Webhook Idempotence" (replays must produce identical
 *     DB state to a single application — implemented here via the
 *     `webhook_events` dedup table from migration
 *     `20250101000000_tenancy_baseline.sql`, task 1.3)
 *
 * Behaviour summary:
 *
 *   1. Verify the `Stripe-Signature` header against the *raw* request
 *      body using the shared webhook secret BEFORE any DB write. On
 *      failure throw {@link WebhookSignatureError} so the route handler
 *      (task 13.5) can respond HTTP 400.
 *   2. Insert `event.id` into `public.webhook_events` to dedup deliveries.
 *      A `23505` unique-violation means we have already processed this
 *      event — return immediately so side effects apply at most once.
 *   3. Dispatch on `event.type`:
 *        - `customer.subscription.deleted`     → cancelled
 *        - `invoice.payment_failed` (final)    → suspended
 *        - `invoice.payment_failed` (retrying) → past_due
 *        - `invoice.payment_succeeded`         → active
 *            (only from `past_due` / `suspended`; recovery transition)
 *      All other event types are ignored (no-op).
 *   4. Stamp `webhook_events.processed_at = now()` once side effects land.
 *
 * Requirements: 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

import Stripe from "stripe";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { TenantStatus } from "../tenancy/types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when `Stripe.webhooks.constructEvent` rejects the request because
 * the `Stripe-Signature` header does not match the raw body under the
 * configured webhook secret. The HTTP route maps this to a 400 response;
 * no DB row has been mutated by the time it is thrown (Requirement 7.3).
 */
export class WebhookSignatureError extends Error {
  override name = "WebhookSignatureError";
}

// ---------------------------------------------------------------------------
// Stripe singleton (lazy, mirrors `src/lib/billing/stripe.ts`)
// ---------------------------------------------------------------------------

/**
 * Lazy Stripe singleton constructed on first use. Mirrors the pattern in
 * `src/lib/billing/stripe.ts` so importing this module does not crash when
 * `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` are unset (e.g. during
 * static type-checks or non-billing tests).
 *
 * The API version literal is cast through `as any` for the same reason
 * as in `stripe.ts`: the SDK's `LatestApiVersion` literal type lags the
 * version pinned by the platform.
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

function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return secret;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/**
 * Cast helper for the service-role admin client. The platform tables
 * (`tenants`, `tenant_billing`, `webhook_events`) are not yet present
 * in the generated `Database` type; once `npx supabase gen types` is
 * re-run after migrations apply, this indirection can be removed in
 * favour of the typed client. Mirrors the pattern in `stripe.ts`.
 */
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

/** Postgres SQLSTATE for `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

interface TenantBillingLookup {
  tenant_id: string;
  status: TenantStatus;
}

interface TenantStatusLookup {
  id: string;
  status: TenantStatus;
}

/**
 * Look up the `tenant_billing` row that owns a given Stripe subscription.
 * Returns null when no tenant is associated (e.g. an event for a
 * subscription that pre-dates the platform table or was already cleaned
 * up). The handler treats null as a no-op so stray events cannot crash
 * the webhook endpoint.
 */
async function findTenantBySubscriptionId(
  stripeSubscriptionId: string,
): Promise<TenantBillingLookup | null> {
  const { data, error } = await adminFrom("tenant_billing")
    .select("tenant_id, status")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `handleStripeWebhook: failed to look up tenant_billing for subscription '${stripeSubscriptionId}': ${error.message}`,
    );
  }
  return (data as TenantBillingLookup | null) ?? null;
}

/**
 * Read the current `tenants.status` for the recovery transition logic
 * in `invoice.payment_succeeded`. Throws if the tenant row has gone
 * missing — that would indicate a corrupt FK and we want loud failure
 * rather than silently dropping the event.
 */
async function fetchTenantStatus(tenantId: string): Promise<TenantStatusLookup> {
  const { data, error } = await adminFrom("tenants")
    .select("id, status")
    .eq("id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `handleStripeWebhook: failed to look up tenant '${tenantId}': ${error.message}`,
    );
  }
  if (!data) {
    throw new Error(`handleStripeWebhook: tenant '${tenantId}' not found`);
  }
  return data as TenantStatusLookup;
}

/**
 * Apply a status to both `tenants` and `tenant_billing` for a tenant.
 * Issued as two serial updates rather than a transaction because the
 * supabase-js client does not expose multi-statement transactions; a
 * dedicated RPC could be added later (task 12.5 covers the parallel
 * admin path). Both writes are idempotent so a partial failure on
 * retry converges to the correct state.
 *
 * Requirement 7.8 demands `tenant_billing.status` mirrors
 * `tenants.status` after every webhook write.
 */
async function setTenantStatus(tenantId: string, status: TenantStatus): Promise<void> {
  const { error: tenantErr } = await adminFrom("tenants")
    .update({ status })
    .eq("id", tenantId);
  if (tenantErr) {
    throw new Error(
      `handleStripeWebhook: failed to update tenants.status for '${tenantId}': ${tenantErr.message}`,
    );
  }

  const { error: billingErr } = await adminFrom("tenant_billing")
    .update({ status })
    .eq("tenant_id", tenantId);
  if (billingErr) {
    throw new Error(
      `handleStripeWebhook: failed to update tenant_billing.status for '${tenantId}': ${billingErr.message}`,
    );
  }
}

/**
 * Insert the event into the dedup table. Returns `false` when a unique
 * violation indicates the event has already been processed — callers
 * MUST short-circuit in that case so side effects apply at most once
 * (Property 8).
 */
async function recordEvent(event: Stripe.Event): Promise<boolean> {
  const { error } = await adminFrom("webhook_events").insert({
    id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
    received_at: new Date().toISOString(),
  });
  if (!error) return true;
  if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
    return false;
  }
  throw new Error(
    `handleStripeWebhook: failed to insert webhook_events row for '${event.id}': ${error.message}`,
  );
}

async function markEventProcessed(eventId: string): Promise<void> {
  const { error } = await adminFrom("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) {
    throw new Error(
      `handleStripeWebhook: failed to mark event '${eventId}' processed: ${error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Stripe shape helpers
// ---------------------------------------------------------------------------

/**
 * Pull the parent subscription id off an invoice. The Stripe API moved
 * `subscription` off the invoice top level onto `parent.subscription_details`;
 * read both shapes so the handler tolerates older webhook payloads
 * stored in flight during the API upgrade. Returns null when the invoice
 * is not subscription-owned (e.g. ad-hoc one-off invoices).
 */
function pickInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // Newer API: invoice.parent.subscription_details.subscription
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null }).parent;
  const fromParent = parent?.subscription_details?.subscription;
  if (typeof fromParent === "string") return fromParent;
  if (fromParent && typeof fromParent === "object" && typeof fromParent.id === "string") {
    return fromParent.id;
  }

  // Legacy API: invoice.subscription
  const legacy = (invoice as unknown as { subscription?: string | { id?: string } | null }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object" && typeof legacy.id === "string") {
    return legacy.id;
  }

  return null;
}

/**
 * Decide whether an `invoice.payment_failed` event is the final dunning
 * attempt. Stripe sets `next_payment_attempt = null` once it has
 * scheduled no further retries; combined with `attempt_count > 0` (so
 * we don't misinterpret a fresh, never-attempted invoice) this is the
 * "final attempt" signal Requirement 7.6 calls for.
 */
function isFinalPaymentFailure(invoice: Stripe.Invoice): boolean {
  const next = (invoice as unknown as { next_payment_attempt?: number | null })
    .next_payment_attempt;
  const attempts = (invoice as unknown as { attempt_count?: number | null })
    .attempt_count;
  return next == null && typeof attempts === "number" && attempts > 0;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * `customer.subscription.deleted` → terminal `cancelled` state.
 * Requirement 7.5.
 */
async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const billing = await findTenantBySubscriptionId(sub.id);
  if (!billing) return; // Stray event for a subscription we do not track.
  await setTenantStatus(billing.tenant_id, "cancelled");
}

/**
 * `invoice.payment_failed`:
 *   - final dunning attempt → `suspended`        (Requirement 7.6)
 *   - intermediate retry    → `past_due`         (precision improvement;
 *     stays on the constrained transition graph and gives the dunning
 *     UI something to show before the final attempt fires).
 */
async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = pickInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return; // Non-subscription invoice; nothing to do.
  const billing = await findTenantBySubscriptionId(subscriptionId);
  if (!billing) return;

  const targetStatus: TenantStatus = isFinalPaymentFailure(invoice)
    ? "suspended"
    : "past_due";
  await setTenantStatus(billing.tenant_id, targetStatus);
}

/**
 * `invoice.payment_succeeded` — recovery transition. Only flips a tenant
 * to `active` when the current status is `past_due` or `suspended`,
 * matching Requirement 7.7's "recovery transition" wording and the
 * directed graph in `src/lib/tenancy/status-transitions.ts` (task 12.4).
 *
 * Notably we do NOT flip `trialing` → `active` here: that transition is
 * driven by the trial-end Stripe event and would otherwise be triggered
 * by routine first-of-period charges during a trial.
 */
async function handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = pickInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  const billing = await findTenantBySubscriptionId(subscriptionId);
  if (!billing) return;

  const tenant = await fetchTenantStatus(billing.tenant_id);
  if (tenant.status !== "past_due" && tenant.status !== "suspended") {
    return; // Not a recovery scenario; leave existing state alone.
  }
  await setTenantStatus(billing.tenant_id, "active");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Verify and apply a Stripe webhook delivery. See file-header for the
 * full algorithm and design references.
 *
 * Preconditions:
 *   - `signature` is the raw value of the `Stripe-Signature` request header.
 *   - `rawBody` is the unparsed request body bytes (no JSON.parse).
 *
 * Postconditions:
 *   - Throws `WebhookSignatureError` iff the signature does not validate;
 *     no DB row is mutated in that case.
 *   - For supported event types, side effects are applied AT MOST ONCE
 *     across replays (idempotence — Property 8) and `tenant_billing.status`
 *     mirrors `tenants.status` after every write (Requirement 7.8).
 *   - Unsupported event types are no-ops; they are still recorded in
 *     `webhook_events` for observability.
 *
 * Requirements: 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string,
): Promise<void> {
  // 1. Signature verification — MUST happen before any DB write.
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, webhookSecret());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new WebhookSignatureError(`Stripe webhook signature verification failed: ${message}`);
  }

  // 2. Dedup by event.id. If we've seen this event before, exit early
  //    so side effects apply at most once across replays.
  const fresh = await recordEvent(event);
  if (!fresh) return;

  // 3. Dispatch on event type.
  switch (event.type) {
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event);
      break;
    default:
      // Ignored event type; the webhook_events row is still useful as
      // an audit/observability trail.
      break;
  }

  // 4. Mark processing complete. Done after the side-effect dispatch so
  //    a thrown handler leaves processed_at NULL for retry tooling.
  await markEventProcessed(event.id);
}
