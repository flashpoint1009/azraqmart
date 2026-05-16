/**
 * @server-only
 *
 * Super-Admin tenant lifecycle HTTP endpoints.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Super-Admin Console" (SuperAdminApi interface)
 *   - Task 16.4: Admin tenant lifecycle endpoints
 *
 * Endpoints:
 *   - `POST /admin/tenants` → provision a new tenant
 *   - `POST /admin/tenants/:id/suspend` → suspend a tenant
 *   - `POST /admin/tenants/:id/resume` → resume a suspended tenant
 *   - `GET /admin/tenants` → list all tenants with optional filtering
 *
 * All endpoints require:
 *   - JWT with `role=platform_admin` (enforced by admin-auth middleware)
 *   - MFA verification for mutating operations (enforced by mfa middleware)
 *   - Audit logging (enforced by audit middleware)
 *
 * Requirements: 10.5, 4.3, 4.8, 4.9
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  provisionTenant,
  ProvisioningValidationError,
  type ProvisionInput,
} from "@/lib/tenancy/provisioning";
import { suspendTenant, resumeTenant } from "@/lib/tenancy/admin-actions";
import type { Tenant, TenantStatus } from "@/lib/tenancy/types";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/**
 * Schema for provisioning a new tenant.
 * Mirrors {@link ProvisionInput} with Zod validation.
 */
const provisionSchema = z.object({
  name: z.string().min(1, "name is required").max(100, "name too long"),
  slug: z
    .string()
    .min(3, "slug must be at least 3 characters")
    .max(32, "slug must be at most 32 characters")
    .regex(/^[a-z0-9](-?[a-z0-9])*$/, "slug must be kebab-case [a-z0-9-]"),
  ownerEmail: z.string().email("invalid email address"),
  planCode: z.string().min(1, "planCode is required"),
});

/**
 * Schema for suspending a tenant.
 */
const suspendSchema = z.object({
  reason: z
    .string()
    .min(1, "reason is required")
    .max(500, "reason must be at most 500 characters"),
});

/**
 * Query parameters for listing tenants.
 */
const listQuerySchema = z.object({
  status: z
    .enum(["active", "trialing", "past_due", "suspended", "cancelled"])
    .optional(),
  planId: z.string().uuid().optional(),
  search: z.string().optional(), // search by name or slug
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Extract the authenticated user's ID from the request.
 * The admin-auth middleware ensures this is present for all admin routes.
 */
function getActorId(request: Request): string | null {
  // In a real implementation, this would extract the user ID from the JWT.
  // For now, we'll use a header that the middleware would set.
  return request.headers.get("x-actor-id") ?? null;
}

/**
 * Cast helper for the service-role admin client.
 * The `tenants` table is not yet in the generated `Database` type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

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

/**
 * List tenants with optional filtering.
 */
async function listTenants(filter: {
  status?: TenantStatus;
  planId?: string;
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ tenants: Tenant[]; total: number }> {
  let query = adminFrom("tenants").select("*", { count: "exact" });

  // Apply filters
  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.planId) {
    query = query.eq("plan_id", filter.planId);
  }
  if (filter.search) {
    // Search in name or slug (case-insensitive)
    const searchPattern = `%${filter.search}%`;
    query = query.or(`name.ilike.${searchPattern},slug.ilike.${searchPattern}`);
  }

  // Apply pagination
  query = query.range(filter.offset, filter.offset + filter.limit - 1);

  // Order by created_at descending (newest first)
  query = query.order("created_at", { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list tenants: ${error.message}`);
  }

  const tenants = (data as TenantRow[] | null)?.map(rowToTenant) ?? [];
  const total = count ?? 0;

  return { tenants, total };
}

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/admin/tenants")({
  server: {
    handlers: {
      /**
       * GET /admin/tenants
       *
       * List all tenants with optional filtering by status, plan, or search term.
       * Supports pagination via limit/offset query parameters.
       *
       * Query parameters:
       *   - status: Filter by tenant status (active, trialing, past_due, suspended, cancelled)
       *   - planId: Filter by plan UUID
       *   - search: Search by tenant name or slug (case-insensitive)
       *   - limit: Number of results per page (1-100, default 50)
       *   - offset: Number of results to skip (default 0)
       *
       * Returns:
       *   200 OK: { tenants: Tenant[], total: number }
       *   400 Bad Request: { error: string } - invalid query parameters
       *   403 Forbidden: { error: string } - not a platform admin
       *   500 Internal Server Error: { error: string }
       */
      GET: async ({ request }) => {
        try {
          // Parse query parameters
          const url = new URL(request.url);
          const queryParams = Object.fromEntries(url.searchParams.entries());
          const filter = listQuerySchema.parse(queryParams);

          // List tenants
          const result = await listTenants(filter);

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          if (err instanceof z.ZodError) {
            return new Response(
              JSON.stringify({
                error: "invalid_query_parameters",
                details: err.errors,
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          console.error("[admin/tenants GET]", err);
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

      /**
       * POST /admin/tenants
       *
       * Provision a new tenant atomically. Creates tenant record, branding,
       * owner user, Stripe customer/subscription, and billing record.
       *
       * Request body:
       *   {
       *     name: string,
       *     slug: string,
       *     ownerEmail: string,
       *     planCode: string
       *   }
       *
       * Returns:
       *   201 Created: Tenant - the newly created tenant
       *   400 Bad Request: { error: string, reason?: string } - validation failure
       *   403 Forbidden: { error: string } - not a platform admin or MFA not verified
       *   500 Internal Server Error: { error: string }
       */
      POST: async ({ request }) => {
        try {
          // Parse and validate request body
          const body = await request.json();
          const input = provisionSchema.parse(body);

          // Get actor ID for audit logging
          const actorId = getActorId(request);

          // Provision the tenant
          const provisionInput: ProvisionInput = {
            ...input,
            actorId,
          };
          const tenant = await provisionTenant(provisionInput);

          return new Response(JSON.stringify(tenant), {
            status: 201,
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
          if (err instanceof ProvisioningValidationError) {
            return new Response(
              JSON.stringify({
                error: "provisioning_validation_error",
                reason: err.reason,
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          console.error("[admin/tenants POST]", err);
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
