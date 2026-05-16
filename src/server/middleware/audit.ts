/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @server-only
 *
 * Audit-log middleware for the Super-Admin Console.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Components and Interfaces → Component: Super-Admin Console":
 *     "Audit-log every action to `platform_audit_log`."
 *   - §"Algorithmic Pseudocode → Tenant Provisioning (Atomic)" (the
 *     `audit.log('tenant.provisioned', ...)` call) — this module is the
 *     concrete implementation that backs that pseudocode and every other
 *     mutating admin action.
 *
 * Requirements:
 *   - 10.4 — On every mutating Super-Admin Console endpoint, append a
 *     `platform_audit_log` entry containing `actor_id`, `tenant_id`
 *     (when applicable), `action`, `payload`, and source `ip`.
 *   - 4.6  — Tenant provisioning specifically MUST emit an audit row
 *     with `action='tenant.provisioned'`, the actor id, and the new
 *     tenant id; this module provides the `recordAudit` primitive that
 *     `provisionTenant` (task 12.1) calls.
 *
 * Design choices:
 *   - The default behaviour is **never** to break the underlying request
 *     because of an audit-log failure: a DB error is logged via
 *     `console.error` and swallowed. This matches the audit-log doctrine
 *     that "best-effort logging beats failed user actions".
 *   - For tests / hardened environments, set `AUDIT_STRICT=1` to make
 *     this module re-throw instead, so cross-tenant-safety property
 *     tests can assert that audit rows are written.
 *   - `platform_audit_log` is **not** in the generated `Database` type
 *     (it is platform infrastructure, not a tenant-scoped table), so we
 *     reach it via the same `adminFrom` cast pattern used elsewhere
 *     (`src/lib/tenancy/resolver.ts`, `src/lib/billing/stripe.ts`, etc.).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * One audit row to be appended to `platform_audit_log`.
 *
 * Field mapping (camelCase here → snake_case columns in Postgres):
 *   - `actorId`  → `actor_id`  (the user who performed the action; may be
 *                                 `null` for system-initiated events).
 *   - `tenantId` → `tenant_id` (optional; `null` for platform-wide actions
 *                                 like `plan.created`).
 *   - `action`   → `action`    (free-form dotted slug, e.g.
 *                                 `tenant.provisioned`, `tenant.suspended`,
 *                                 `feature.override.set`).
 *   - `payload`  → `payload`   (jsonb; structured details about the action).
 *   - `ip`       → `ip`        (inet; the source IP, when available).
 */
export interface AuditEntry {
  actorId: string | null;
  tenantId?: string | null;
  action: string;
  payload?: Record<string, unknown>;
  ip?: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Untyped `from()` accessor for the platform-only `platform_audit_log`
 * table. The generated Supabase `Database` type intentionally only covers
 * tenant-scoped domain tables, so we cast through `any` exactly the way
 * the other server modules in this codebase do.
 */
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

/**
 * Normalise an audit entry into the row shape Postgres expects.
 *
 * `undefined` is collapsed to `null` so callers can omit optional fields
 * without having to be explicit, and we never send `undefined` over the
 * wire (where it would be silently dropped by `JSON.stringify`).
 */
function toRow(entry: AuditEntry): {
  actor_id: string | null;
  tenant_id: string | null;
  action: string;
  payload: Record<string, unknown> | null;
  ip: string | null;
} {
  return {
    actor_id: entry.actorId ?? null,
    tenant_id: entry.tenantId ?? null,
    action: entry.action,
    payload: entry.payload ?? null,
    ip: entry.ip ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append an audit row to `platform_audit_log`.
 *
 * Behaviour:
 *   - Returns immediately (no DB call) when `entry.action` is empty or
 *     contains only whitespace. This guards against accidental empty
 *     audit entries from misconfigured callers — an audit row with no
 *     action is meaningless and would only pollute the log.
 *   - On a successful insert, returns normally.
 *   - On a DB error, logs the error via `console.error` and returns
 *     normally so the surrounding admin request still succeeds. This
 *     matches Requirement 10.4's intent (audit MUST happen for the
 *     happy path) without holding the user request hostage to an
 *     audit-table outage.
 *   - When `process.env.AUDIT_STRICT === '1'`, re-throws DB errors
 *     instead of swallowing them. Property tests and hardened CI
 *     pipelines opt into the strict mode so they can fail loudly when
 *     the audit chain is broken.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  // Skip empty / whitespace-only actions outright — there is nothing
  // useful we could record, and it usually signals a bug at the call site.
  if (typeof entry.action !== "string" || entry.action.trim() === "") {
    return;
  }

  const row = toRow(entry);

  try {
    const { error } = await adminFrom("platform_audit_log").insert(row);
    if (error) {
      // The Supabase client returns errors as values rather than throwing;
      // bubble it through the same handler as a thrown exception.
      throw error;
    }
  } catch (err) {
    // Best-effort: never break the underlying admin request because the
    // audit table is unhappy. Surface in logs so on-call engineers can
    // tell that the audit chain broke.
    console.error("[audit] failed to record audit entry", {
      action: entry.action,
      tenantId: entry.tenantId ?? null,
      actorId: entry.actorId ?? null,
      err,
    });

    if (process.env.AUDIT_STRICT === "1") {
      throw err;
    }
  }
}

/**
 * Extract the source IP for an audit entry from a `Request`.
 *
 * Order of preference:
 *   1. `cf-connecting-ip` — Cloudflare's authoritative client-IP header,
 *      always set on traffic that reached our Worker through the edge.
 *   2. `x-forwarded-for` — the de facto standard for proxied requests;
 *      we take the **first** entry, which by convention is the original
 *      client. Trailing entries are intermediaries we do not trust.
 *
 * Returns `null` when neither header is present (e.g. local dev hitting
 * the Vite preview server directly). The `null` is then stored as a
 * SQL `NULL` in `platform_audit_log.ip`.
 */
export function ipFromRequest(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = (xff.split(",")[0] ?? "").trim();
  return first.length > 0 ? first : null;
}

/**
 * Should a request with this HTTP method be audited?
 *
 * Audit applies to mutating verbs only — `GET`, `HEAD`, and `OPTIONS`
 * never write to the database and therefore never produce audit rows
 * (Requirement 10.4 talks about *mutating* admin requests).
 */
export function shouldAudit(method: string): boolean {
  const m = method.toUpperCase();
  return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
}
