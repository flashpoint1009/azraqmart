/**
 * @server-only
 *
 * Super-Admin endpoint to resume a suspended tenant.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Super-Admin Console" (SuperAdminApi.resumeTenant)
 *   - Task 16.4: Admin tenant lifecycle endpoints
 *
 * Endpoint:
 *   POST /admin/tenants/:id/resume
 *
 * Requires:
 *   - JWT with `role=platform_admin`
 *   - MFA verification
 *   - Audit logging
 *
 * Requirements: 4.9, 7.8
 */

import { createFileRoute } from "@tanstack/react-router";

import { resumeTenant } from "@/lib/tenancy/admin-actions";
import { InvalidTransitionError } from "@/lib/tenancy/status-transitions";

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Extract the authenticated user's ID from the request.
 */
function getActorId(request: Request): string | null {
  return request.headers.get("x-actor-id") ?? null;
}

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/admin/tenants/$id/resume")({
  server: {
    handlers: {
      /**
       * POST /admin/tenants/:id/resume
       *
       * Resume a suspended tenant. Determines the target status based on
       * tenant_billing.status:
       *   - If billing is past_due or unpaid, resumes to 'past_due'
       *   - Otherwise resumes to 'active'
       *
       * Updates both tenants.status and tenant_billing.status and records
       * the action in the audit log.
       *
       * Returns:
       *   200 OK: { success: true }
       *   400 Bad Request: { error: string } - invalid transition
       *   403 Forbidden: { error: string } - not a platform admin or MFA not verified
       *   404 Not Found: { error: string } - tenant not found
       *   500 Internal Server Error: { error: string }
       */
      POST: async ({ request, params }) => {
        try {
          const tenantId = params.id;

          // Get actor ID for audit logging
          const actorId = getActorId(request);

          // Resume the tenant
          await resumeTenant(tenantId, actorId);

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          if (err instanceof InvalidTransitionError) {
            return new Response(
              JSON.stringify({
                error: "invalid_transition",
                message: err.message,
                from: err.from,
                to: err.to,
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          if (err instanceof Error && err.message.includes("not found")) {
            return new Response(
              JSON.stringify({
                error: "tenant_not_found",
                message: err.message,
              }),
              {
                status: 404,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          console.error("[admin/tenants/:id/resume POST]", err);
          return new Response(
            JSON.stringify({
              error: "internal_error",
              message: err instanceof Error ? err.message : "Unknown error",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
