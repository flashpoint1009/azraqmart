/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @server-only
 *
 * Super-Admin tenant lifecycle actions.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Super-Admin Console" — defines the
 *     `suspendTenant(tenantId, reason)` / `resumeTenant(tenantId)`
 *     contracts that this module implements.
 *   - §"Component: Subscription / Billing" — Requirement 7.8 mandates
 *     that `tenant_billing.status` mirror `tenants.status` after every
 *     write, which is why both rows are updated together here.
 *
 * Behaviour summary:
 *
 *   `suspendTenant(tenantId, reason, actorId?)`
 *     1. Validate that `reason` is a non-empty string ≤ 500 characters.
 *     2. Fetch the current `tenants.status`.
 *     3. Assert the transition `current → 'suspended'` is legal under
 *        {@link assertTransition} (Requirement 4.7's directed graph).
 *     4. Update `tenants.status = 'suspended'` and
 *        `tenant_billing.status = 'suspended'` as two serial updates
 *        (the supabase-js client does not expose multi-statement
 *        transactions; both writes are idempotent so a partial failure
 *        on retry converges to the correct state — same pattern as
 *        `setTenantStatus` in `src/lib/billing/webhooks.ts`).
 *     5. Append a `platform_audit_log` row with
 *        `action='tenant.suspended'` and the supplied reason.
 *
 *   `resumeTenant(tenantId, actorId?)`
 *     1. Fetch the current `tenants.status` and `tenant_billing.status`.
 *     2. Pick the resume target:
 *          - `past_due`  if `tenant_billing.status` is `past_due` or
 *                        `unpaid` (Stripe's "unpaid" maps to our
 *                        `past_due`, but we accept the raw label
 *                        defensively for forward-compat with future
 *                        Stripe-driven writes).
 *          - `active`    otherwise.
 *     3. Assert the transition `current → target` is legal.
 *     4. Update `tenants.status = target` and
 *        `tenant_billing.status = target`.
 *     5. Append a `platform_audit_log` row with
 *        `action='tenant.resumed'` and `{ from, to }`.
 *
 * @important This module imports the service-role Supabase admin
 * client and MUST NOT be bundled into client code. The
 * `@server-only` JSDoc tag is enforced by the platform's bundler audit.
 *
 * Requirements: 4.8, 4.9, 7.8
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAudit } from "@/server/middleware/audit";

import { assertTransition } from "./status-transitions";
import type { TenantStatus } from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cast helper for the service-role admin client. Several platform
 * tables (`tenants`, `tenant_billing`) are not present in the generated
 * `Database` type yet; once `npx supabase gen types` is re-run after
 * migrations apply, this indirection can be removed in favour of the
 * typed client. Mirrors the pattern in `src/lib/billing/webhooks.ts`,
 * `src/lib/tenancy/resolver.ts`, etc.
 */
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

/**
 * Maximum length of the human-readable suspension reason. Bound matches
 * common audit-log column sizing and prevents abuse via huge payloads
 * landing in `platform_audit_log.payload`.
 */
const REASON_MAX_LENGTH = 500;

interface TenantStatusRow {
  status: TenantStatus;
}

interface TenantBillingStatusRow {
  // `string` rather than `TenantStatus` because Stripe-driven writes
  // could in principle land a literal we don't model (e.g. `unpaid`)
  // before mapping; we read defensively and only narrow to a target
  // status before calling `assertTransition`.
  status: string;
}

async function fetchTenantStatus(tenantId: string): Promise<TenantStatus> {
  const { data, error } = await adminFrom("tenants")
    .select("status")
    .eq("id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `admin-actions: failed to look up tenants.status for '${tenantId}': ${error.message}`,
    );
  }
  if (!data) {
    throw new Error(`admin-actions: tenant '${tenantId}' not found`);
  }
  return (data as TenantStatusRow).status;
}

async function fetchTenantBillingStatus(tenantId: string): Promise<string | null> {
  const { data, error } = await adminFrom("tenant_billing")
    .select("status")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `admin-actions: failed to look up tenant_billing.status for '${tenantId}': ${error.message}`,
    );
  }
  if (!data) {
    // A tenant may not yet have a `tenant_billing` row (e.g. legacy
    // azraqmart default tenant). Treat the absence as "no billing
    // signal" so `resumeTenant` falls through to the `active` target.
    return null;
  }
  return (data as TenantBillingStatusRow).status;
}

/**
 * Apply a status to both `tenants` and `tenant_billing` for a tenant.
 * Issued as two serial updates rather than a transaction because the
 * supabase-js client does not expose multi-statement transactions; the
 * webhook handler in `src/lib/billing/webhooks.ts` uses the exact same
 * pattern. Both writes are idempotent so a partial failure on retry
 * converges to the correct state.
 *
 * Requirement 7.8 demands `tenant_billing.status` mirrors
 * `tenants.status` after every admin write.
 */
async function applyStatus(tenantId: string, status: TenantStatus): Promise<void> {
  const { error: tenantErr } = await adminFrom("tenants")
    .update({ status })
    .eq("id", tenantId);
  if (tenantErr) {
    throw new Error(
      `admin-actions: failed to update tenants.status for '${tenantId}': ${tenantErr.message}`,
    );
  }

  const { error: billingErr } = await adminFrom("tenant_billing")
    .update({ status })
    .eq("tenant_id", tenantId);
  if (billingErr) {
    throw new Error(
      `admin-actions: failed to update tenant_billing.status for '${tenantId}': ${billingErr.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Suspend a tenant.
 *
 * Validates the reason, asserts the transition is legal, updates both
 * `tenants.status` and `tenant_billing.status` to `'suspended'`, and
 * writes an audit-log entry recording the actor and reason.
 *
 * @param tenantId - UUID of the tenant to suspend.
 * @param reason   - Human-readable reason; required, 1..500 characters.
 * @param actorId  - UUID of the platform admin performing the action;
 *                   may be `null` / `undefined` for system-initiated
 *                   suspensions (e.g. a future automated dunning job).
 *
 * @throws Error                     when `reason` is empty or longer than 500 chars.
 * @throws InvalidTransitionError    when the current status cannot move to `'suspended'`.
 *
 * Requirements: 4.8, 7.8
 */
export async function suspendTenant(
  tenantId: string,
  reason: string,
  actorId?: string | null,
): Promise<void> {
  if (
    typeof reason !== "string" ||
    reason.trim().length === 0 ||
    reason.length > REASON_MAX_LENGTH
  ) {
    throw new Error("reason must be 1..500 chars");
  }

  const currentStatus = await fetchTenantStatus(tenantId);

  // Throws InvalidTransitionError on disallowed transitions (e.g. from
  // `cancelled`, the terminal state). Idempotent self-suspension
  // (`suspended → suspended`) returns silently per status-transitions.ts.
  assertTransition(currentStatus, "suspended");

  await applyStatus(tenantId, "suspended");

  await recordAudit({
    actorId: actorId ?? null,
    tenantId,
    action: "tenant.suspended",
    payload: { reason },
  });
}

/**
 * Resume a tenant.
 *
 * Determines the resume target from the current `tenant_billing.status`:
 *   - if billing is `past_due` or `unpaid`, resume to `past_due` so the
 *     tenant lands back in dunning rather than being marked fully
 *     `active` while a payment is still outstanding (Requirement 4.9);
 *   - otherwise resume to `active`.
 *
 * Asserts the transition is legal, updates both `tenants.status` and
 * `tenant_billing.status` to the target, and writes an audit-log entry
 * recording the `{ from, to }` pair.
 *
 * @param tenantId - UUID of the tenant to resume.
 * @param actorId  - UUID of the platform admin performing the action;
 *                   may be `null` / `undefined` for system-initiated
 *                   resumes.
 *
 * @throws InvalidTransitionError when the current status cannot move to the target.
 *
 * Requirements: 4.9, 7.8
 */
export async function resumeTenant(
  tenantId: string,
  actorId?: string | null,
): Promise<void> {
  const currentStatus = await fetchTenantStatus(tenantId);
  const billingStatus = await fetchTenantBillingStatus(tenantId);

  const target: TenantStatus =
    billingStatus === "past_due" || billingStatus === "unpaid" ? "past_due" : "active";

  // Throws InvalidTransitionError on disallowed transitions (e.g. from
  // `cancelled`). Idempotent self-resume (`active → active` /
  // `past_due → past_due`) returns silently per status-transitions.ts.
  assertTransition(currentStatus, target);

  await applyStatus(tenantId, target);

  await recordAudit({
    actorId: actorId ?? null,
    tenantId,
    action: "tenant.resumed",
    payload: { from: currentStatus, to: target },
  });
}
