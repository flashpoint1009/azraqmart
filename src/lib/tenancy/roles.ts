/**
 * Role Guard — tenant-scoped role-based access control.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Role Guard"
 *   - §"Key Functions with Formal Specifications → assertRole"
 *
 * The platform models membership of a user inside a tenant as a single
 * row in `public.user_tenant_roles` keyed by `(user_id, tenant_id)`. A
 * user may belong to many tenants with different roles; their privileges
 * inside one tenant are independent of any other tenant they belong to,
 * so cross-tenant privilege escalation is impossible.
 *
 * Hierarchy (least → most privileged):
 *
 *   delivery < staff < admin < owner
 *
 * `customer` is **parallel** to that hierarchy:
 *   - holding `customer` does NOT satisfy `staff`, `admin`, or `owner`,
 *   - and conversely a `staff`/`admin`/`owner` row does NOT satisfy a
 *     check for `customer`.
 *
 * If no `user_tenant_roles` row exists for the requested `(userId, tenantId)`
 * pair, `assertRole` throws `ForbiddenError` with a deliberately opaque
 * message — we never leak whether the tenant exists or whether the user
 * belongs to a different tenant (Requirement 6.4).
 *
 * Requirements: 6.1, 6.3, 6.4
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ROLE_HIERARCHY,
  type HierarchicalRole,
  type UserRole,
  type UserTenantRole,
} from "./types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when an `assertRole` check fails — either because the
 * `(userId, tenantId)` membership does not exist, or because the
 * actual role does not satisfy the required role per the hierarchy.
 *
 * The message is intentionally opaque (`'forbidden'`) so callers
 * cannot use it as a side-channel to probe tenant existence or
 * cross-tenant membership (Requirement 6.4).
 */
export class ForbiddenError extends Error {
  override name = "ForbiddenError";

  constructor(message = "forbidden") {
    super(message);
    // Restore prototype chain when targeting older transpilation modes.
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Hierarchy helpers
// ---------------------------------------------------------------------------

/**
 * Return the index of `role` in `ROLE_HIERARCHY`.
 *
 * `customer` is intentionally absent from the hierarchy and yields `-1`,
 * which the comparison logic in {@link assertRole} treats as "parallel"
 * (never satisfies a hierarchical role and is never satisfied by one).
 */
function rankOf(role: UserRole): number {
  const i = (ROLE_HIERARCHY as readonly UserRole[]).indexOf(role);
  return i; // -1 means parallel (customer)
}

/**
 * `true` iff `actual` satisfies the single `required` role.
 *
 * Semantics:
 *   - If `required === 'customer'`: succeed iff `actual === 'customer'`.
 *   - Otherwise (`required` is hierarchical):
 *       * fail if `actual === 'customer'` (parallel role never satisfies),
 *       * succeed iff `rankOf(actual) >= rankOf(required)`.
 */
function satisfies(actual: UserRole, required: UserRole): boolean {
  if (required === "customer") {
    return actual === "customer";
  }
  if (actual === "customer") {
    return false;
  }
  const a = rankOf(actual);
  const r = rankOf(required);
  // Both should be hierarchical at this point; defend against unknown values.
  if (a < 0 || r < 0) return false;
  return a >= r;
}

// ---------------------------------------------------------------------------
// DB row shape
// ---------------------------------------------------------------------------

interface UserTenantRoleRow {
  user_id: string;
  tenant_id: string;
  role: UserRole;
  created_at: string;
}

function rowToUserTenantRole(row: UserTenantRoleRow): UserTenantRole {
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

/**
 * Cast helper for the service-role admin client. `user_tenant_roles` is
 * not yet present in the generated `Database` type; once
 * `npx supabase gen types` is re-run after migrations apply, this
 * indirection can be removed. Mirrors the same pattern used in
 * `src/lib/tenancy/resolver.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assert that `userId` holds a role on `tenantId` that satisfies
 * `required`. Returns normally on success; throws {@link ForbiddenError}
 * on failure.
 *
 * `required` may be a single role or a non-empty array of roles. With an
 * array, the assertion succeeds iff ANY of the required roles is
 * satisfied by the user's actual role.
 *
 * @throws {@link ForbiddenError} when:
 *   - no `user_tenant_roles` row exists for `(userId, tenantId)`,
 *   - the user's actual role does not satisfy any of the required roles
 *     per the hierarchy semantics described at the top of this file,
 *   - `required` is an empty array (treated as an unsatisfiable check).
 *
 * @throws Any other error (e.g. transient DB error) is re-thrown
 *   verbatim so callers can distinguish "denied" from "broken".
 *
 * Requirements: 6.1, 6.3, 6.4
 */
export async function assertRole(
  userId: string,
  tenantId: string,
  required: UserRole | UserRole[],
): Promise<void> {
  const requiredList = Array.isArray(required) ? required : [required];
  if (requiredList.length === 0) {
    throw new ForbiddenError();
  }

  const { data, error } = await adminFrom("user_tenant_roles")
    .select("user_id, tenant_id, role, created_at")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (error) {
    // Transient/unexpected DB error — propagate so callers can distinguish
    // "denied" (ForbiddenError) from "broken" (generic Error).
    throw new Error(`assertRole: failed to query user_tenant_roles: ${error.message}`);
  }
  if (!data) {
    // Requirement 6.4: never leak whether the tenant exists or whether the
    // user belongs elsewhere — opaque "forbidden" for the missing-row case.
    throw new ForbiddenError();
  }

  const actual = (data as UserTenantRoleRow).role;
  const ok = requiredList.some((r) => satisfies(actual, r));
  if (!ok) {
    throw new ForbiddenError();
  }
}

/**
 * Predicate form of {@link assertRole}.
 *
 * Returns `true` iff `assertRole(userId, tenantId, required)` would
 * resolve normally; returns `false` iff it would throw
 * {@link ForbiddenError}. Any other error (DB outage, etc.) is
 * re-thrown so callers cannot mistake infrastructure failures for
 * authorization decisions.
 *
 * Requirements: 6.1, 6.3, 6.4
 */
export async function hasRole(
  userId: string,
  tenantId: string,
  required: UserRole,
): Promise<boolean> {
  try {
    await assertRole(userId, tenantId, required);
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return false;
    }
    throw err;
  }
}

/**
 * List every tenant the user is a member of, with the user's role on
 * each. The result is mapped from the database snake_case column names
 * to the camelCase {@link UserTenantRole} shape declared in `./types`.
 *
 * Returns an empty array (not an error) when the user has no
 * memberships. Used by the {@link TenantSwitcher} component (task 10.6)
 * to decide whether a switcher is shown.
 *
 * Requirements: 6.6 (consumer), 6.1 (data shape)
 */
export async function listUserTenants(
  userId: string,
): Promise<UserTenantRole[]> {
  const { data, error } = await adminFrom("user_tenant_roles")
    .select("user_id, tenant_id, role, created_at")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`listUserTenants: failed to query user_tenant_roles: ${error.message}`);
  }
  if (!data) return [];

  return (data as UserTenantRoleRow[]).map(rowToUserTenantRole);
}

// ---------------------------------------------------------------------------
// Re-exports for ergonomic consumption
// ---------------------------------------------------------------------------

export type { HierarchicalRole, UserRole, UserTenantRole };
