/**
 * @server-only
 *
 * Super-Admin endpoint to suspend a tenant.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Super-Admin Console" (SuperAdminApi.suspendTenant)
 *   - Task 16.4: Admin tenant lifecycle endpoints
 *
 * Endpoint:
 *   POST /admin/tenants/:id/suspend
 *
 * Requires:
 *   - JWT with `role=platform_admin`
 *   - MFA verification
 *   - Audit logging
 *
 * Requirements: 4.8, 7.8
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { suspendTenant } from "@/lib/tenancy/admin-actions";
import { InvalidTransitionError } from "@/lib/tenancy/status-transitions";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const suspendSchema = z.object({
  reason: z
    .string()
    .min(1, "reason is required")
    .max(500, "reason must be at most 500 characters"),
});

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

export const Route = createFileRoute("/api/admin/tenants/$id/suspend")({
  server: {
    handlers: {
      /**
       * POST /admin/tenants/:id/suspend
       *
       * Suspend a tenant. Updates both tenants.status and tenant_billing.status
       * to 'suspended' and records the action in the audit log.
       *
       * Request body:
       *   {
       *     reason: string (1-500 characters)
       *   }
       *
       * Returns:
       *   200 OK: { success: true }
       *   400 Bad Request: { error: string } - validation failure or invalid transition
       *   403 Forbidden: { error: string } - not a platform admin or MFA not verified
       *   404 Not Found: { error: string } - tenant not found
       *   500 Internal Server Error: { error: string }
       */
      POST: async ({ request, params }) => {
        try {
          const tenantId = params.id;

          // Parse and validate request body
          const body = await request.json();
          const { reason } = suspendSchema.parse(body);

          // Get actor ID for audit logging
          const actorId = getActorId(request);

          // Suspend the tenant
          await suspendTenant(tenantId, reason, actorId);

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          if (err instanceof z.ZodError) {
            return new Response(
              JSON.stringify({
                error: "validation_error",
                details: err.errors,
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
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
          console.error("[admin/tenants/:id/suspend POST]", err);
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
