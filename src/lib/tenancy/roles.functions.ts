/**
 * Server-function bridge for the tenant-scoped role guard.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Role Guard"
 *
 * `src/lib/tenancy/roles.ts` exports `assertRole`, which queries
 * `public.user_tenant_roles` via the **service-role** Supabase client
 * (`@/integrations/supabase/client.server`). That client must never be
 * bundled into the browser, so any UI that wants to consult the role
 * guard (notably `RoleGuard.tsx`, task 10.4) has to cross a server
 * boundary first.
 *
 * This file exposes a single `createServerFn`-wrapped entry point —
 * {@link checkTenantRole} — that:
 *   1. Authenticates the caller via the existing
 *      `requireSupabaseAuth` middleware (so the user id comes from the
 *      verified JWT, not from client-supplied input — closing the
 *      obvious "lie about your user id" hole).
 *   2. Validates the request body with a tight Zod schema.
 *   3. Delegates to `assertRole(userId, tenantId, required)`.
 *   4. Translates `ForbiddenError` into a structured
 *      `{ allowed: false }` response so callers can render the
 *      forbidden UI without taking the React error boundary.
 *
 * Any other error (DB outage, etc.) is re-thrown so the caller can
 * distinguish "denied" (`allowed: false`) from "broken" (rejection).
 *
 * Requirements: 6.1, 6.4
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRole, ForbiddenError } from "./roles";
import { ROLE_HIERARCHY, type UserRole } from "./types";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

/**
 * Closed enum of accepted roles. We intentionally include `customer`
 * (which is parallel to the hierarchy) so callers can gate
 * customer-only surfaces too.
 */
const ROLE_VALUES = [...ROLE_HIERARCHY, "customer"] as const satisfies readonly UserRole[];

const RoleEnum = z.enum(ROLE_VALUES);

/**
 * Wire-format input. `required` is normalized to a non-empty array so
 * the handler only deals with one shape.
 */
const CheckTenantRoleInput = z.object({
  tenantId: z.string().uuid(),
  required: z.array(RoleEnum).min(1),
});

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

/**
 * Result envelope returned to the client.
 *
 * `allowed: true` means the caller's `(userId, tenantId)` row exists
 * and satisfies at least one of the required roles per the hierarchy
 * rules in `roles.ts`. `allowed: false` is the safe default for any
 * `ForbiddenError` thrown by `assertRole` — including the
 * missing-membership case (Requirement 6.4).
 */
export interface CheckTenantRoleResult {
  allowed: boolean;
}

/**
 * Server-fn that the role guard component invokes.
 *
 * The user id comes from `context.userId` (set by
 * `requireSupabaseAuth` after verifying the bearer token), never from
 * the request body — this makes the function safe to expose to any
 * authenticated client.
 *
 * Requirements: 6.1, 6.4
 */
export const checkTenantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CheckTenantRoleInput.parse(d))
  .handler(async ({ data, context }): Promise<CheckTenantRoleResult> => {
    const { userId } = context;
    try {
      await assertRole(userId, data.tenantId, data.required);
      return { allowed: true };
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return { allowed: false };
      }
      // Transient/unexpected error — propagate so the caller can tell
      // "denied" from "broken".
      throw err;
    }
  });
