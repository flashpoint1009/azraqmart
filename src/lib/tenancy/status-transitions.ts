/**
 * Tenant status transition state machine.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/requirements.md`
 *   - Requirement 4.7: "THE System SHALL constrain `tenants.status`
 *     transitions to the directed graph
 *     `trialing → active → past_due → suspended → cancelled` and SHALL
 *     reject any transition that is not an edge in that graph."
 *   - Requirement 4.9: `resumeTenant` must be able to move
 *     `suspended → active` (or `suspended → past_due` when the
 *     subscription is unpaid).
 *
 * The bare-bones linear path described in 4.7 is the *spine* of the
 * graph. The graph itself is not strictly linear: per Requirement 4.9
 * the platform must be able to resume a suspended tenant back to
 * `active` (or `past_due`), and per Requirement 7.7 a successful
 * payment must be able to move `past_due → active` and
 * `suspended → active`. Encoding only the strict linear path here
 * would make those legitimate operations impossible.
 *
 * Invariants encoded below:
 *   - `cancelled` is **terminal**: no outgoing edges. Once a tenant is
 *     cancelled it stays cancelled (per 4.7 — no path back from
 *     cancelled to active).
 *   - Self-transitions (`from === to`) are always allowed and are a
 *     no-op (idempotent self-update). The Postgres trigger applies the
 *     same rule so a webhook handler that re-applies the current
 *     status does not raise.
 *   - Every other transition is checked against
 *     {@link ALLOWED_TRANSITIONS}; non-edges throw
 *     {@link InvalidTransitionError}.
 *
 * The same edge set is enforced at the database layer by the trigger
 * function in `supabase/migrations/20260601000900_status_transition_trigger.sql`,
 * which keeps the constraint authoritative even for direct SQL writes
 * that bypass this module.
 *
 * Requirements: 4.7
 */

import type { TenantStatus } from "./types";

// ---------------------------------------------------------------------------
// Transition graph
// ---------------------------------------------------------------------------

/**
 * Directed transition graph keyed by `from` status. Each value is the
 * set of `to` statuses that are reachable in a single step from the
 * key.
 *
 * Self-transitions are NOT listed here — they are handled separately
 * by {@link assertTransition} as idempotent no-ops, mirroring the
 * Postgres trigger which returns NEW unchanged when
 * `OLD.status = NEW.status`.
 *
 * `cancelled` maps to an empty set: it is the terminal state.
 */
export const ALLOWED_TRANSITIONS: Record<TenantStatus, ReadonlySet<TenantStatus>> = {
  trialing: new Set<TenantStatus>(["active", "past_due", "suspended", "cancelled"]),
  active: new Set<TenantStatus>(["past_due", "suspended", "cancelled"]),
  past_due: new Set<TenantStatus>(["active", "suspended", "cancelled"]),
  suspended: new Set<TenantStatus>(["active", "past_due", "cancelled"]),
  cancelled: new Set<TenantStatus>(), // terminal — no outgoing edges
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown by {@link assertTransition} when the requested
 * `from → to` pair is not an edge in {@link ALLOWED_TRANSITIONS}.
 *
 * Carries the `from` and `to` values so callers (e.g. the webhook
 * handler, the super-admin console) can render an actionable message
 * and audit the rejected attempt.
 */
export class InvalidTransitionError extends Error {
  override name = "InvalidTransitionError";

  readonly from: TenantStatus;
  readonly to: TenantStatus;

  constructor(from: TenantStatus, to: TenantStatus) {
    super(`invalid tenant status transition: ${from} -> ${to}`);
    this.from = from;
    this.to = to;
    // Restore prototype chain when targeting older transpilation modes.
    Object.setPrototypeOf(this, InvalidTransitionError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assert that `from → to` is a valid transition under
 * {@link ALLOWED_TRANSITIONS}.
 *
 * Behavior:
 *   - If `from === to`: returns silently (idempotent self-update).
 *   - If `to` is in `ALLOWED_TRANSITIONS[from]`: returns silently.
 *   - Otherwise: throws {@link InvalidTransitionError}.
 *
 * Mirrors the Postgres trigger function
 * `public.tenants_assert_status_transition()` so the same edge set is
 * enforced regardless of whether the change originates from
 * application code or direct SQL.
 *
 * Requirements: 4.7
 */
export function assertTransition(from: TenantStatus, to: TenantStatus): void {
  if (from === to) {
    return; // idempotent self-update
  }
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.has(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/**
 * Predicate form of {@link assertTransition}.
 *
 * Returns `true` iff `assertTransition(from, to)` would resolve
 * normally; returns `false` iff it would throw
 * {@link InvalidTransitionError}.
 *
 * Useful for UI affordances (e.g. enabling/disabling a "Suspend"
 * button) where the caller wants to inspect the legality of a
 * transition without raising.
 *
 * Requirements: 4.7
 */
export function canTransition(from: TenantStatus, to: TenantStatus): boolean {
  if (from === to) {
    return true;
  }
  return ALLOWED_TRANSITIONS[from].has(to);
}
