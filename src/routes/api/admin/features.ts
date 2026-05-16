/**
 * @server-only
 *
 * Super-Admin Console endpoint for setting per-tenant feature overrides.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Super-Admin Console" (SuperAdminApi.setFeatureOverride)
 *   - §"Model: TenantFeatures (Overrides)" (validation rules)
 *
 * Behaviour:
 *   - `POST /admin/tenants/:id/features` — upsert a `tenant_features` row
 *     for the tenant identified by `:id`. The request body is validated
 *     against `FeatureOverrideInputSchema` (task 9.5) which enforces:
 *       - `featureKey` is one of the closed `FeatureKey` enum values.
 *       - `enabled` is a boolean (true = grant above plan, false = revoke
 *         below plan).
 *       - `expiresAt`, if provided, is an ISO 8601 timestamp strictly
 *         greater than the current time (Requirement 5.7).
 *   - On success, the endpoint upserts the `tenant_features` row (composite
 *     PK `(tenant_id, feature_key)` means an existing override is replaced)
 *     and invalidates the cached effective-feature set for the tenant so
 *     the next `computeEnabledFeatures` call sees fresh state.
 *   - Audit-logs the action with `action='feature.override.set'`, the
 *     actor id, the tenant id, and the override payload.
 *   - Requires `role=platform_admin` JWT claim (enforced by
 *     `checkPlatformAdmin` from `src/server/middleware/admin-auth.ts`).
 *   - Returns:
 *       - 200 OK `{ success: true }` on success.
 *       - 400 Bad Request `{ error: 'validation_error', details: [...] }`
 *         when the input fails schema validation.
 *       - 401 Unauthorized when the JWT is missing or invalid.
 *       - 403 Forbidden when the JWT is valid but lacks the
 *         `platform_admin` role.
 *       - 404 Not Found when the tenant id does not exist.
 *       - 500 Internal Server Error on unexpected failures.
 *
 * Requirements: 10.6 (setFeatureOverride endpoint), 5.7 (expires_at validation)
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { invalidateEffectiveFeatures } from "@/lib/tenancy/features";
import { FeatureOverrideInputSchema } from "@/lib/tenancy/features-schema";
import { checkPlatformAdmin } from "@/server/middleware/admin-auth";
import { ipFromRequest, recordAudit } from "@/server/middleware/audit";

// ---------------------------------------------------------------------------
// Supabase access helper
// ---------------------------------------------------------------------------

/**
 * Cast helper for the service-role admin client. `tenants` and
 * `tenant_features` are not yet present in the generated `Database` type
 * from `src/integrations/supabase/types.ts` — they were introduced by
 * `20250101000000_tenancy_baseline.sql` and the types regeneration is
 * part of a later task. Mirrors the same pattern used in `resolver.ts`
 * and `features.ts`. Once `npx supabase gen types` is re-run, this
 * indirection can be removed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/admin/features")({
  server: {
    handlers: {
      /**
       * POST /admin/tenants/:id/features
       *
       * Upsert a feature override for the tenant identified by the `:id`
       * path parameter. The request body is validated against
       * `FeatureOverrideInputSchema` (task 9.5).
       *
       * Path parameter:
       *   - `id` — UUID of the tenant whose feature override to set.
       *
       * Request body (JSON):
       *   - `featureKey` — one of the closed `FeatureKey` enum values.
       *   - `enabled` — boolean (true = grant above plan, false = revoke
       *     below plan).
       *   - `expiresAt` — optional ISO 8601 timestamp strictly greater
       *     than the current time; `null` or omitted means a permanent
       *     override.
       *
       * Example request:
       *   POST /admin/tenants/123e4567-e89b-12d3-a456-426614174000/features
       *   Authorization: Bearer <platform_admin JWT>
       *   Content-Type: application/json
       *
       *   {
       *     "featureKey": "mobile_app",
       *     "enabled": true,
       *     "expiresAt": "2025-12-31T23:59:59Z"
       *   }
       *
       * Example response (success):
       *   200 OK
       *   { "success": true }
       *
       * Example response (validation error):
       *   400 Bad Request
       *   {
       *     "error": "validation_error",
       *     "details": [
       *       {
       *         "path": ["expiresAt"],
       *         "message": "expiresAt must be strictly greater than the current time"
       *       }
       *     ]
       *   }
       */
      POST: async ({ request }) => {
        // ---- Step 1: authenticate the caller as a platform admin --------
        const authResult = await checkPlatformAdmin(request);
        if (!authResult.ok) {
          return new Response(
            JSON.stringify({ error: authResult.reason }),
            {
              status: authResult.status,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const actorId = authResult.userId;

        // ---- Step 2: extract and validate the tenant id from the URL ----
        const url = new URL(request.url);
        const pathMatch = /^\/api\/admin\/tenants\/([^/]+)\/features$/.exec(url.pathname);
        if (!pathMatch) {
          return new Response(
            JSON.stringify({ error: "invalid_path" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const tenantId = pathMatch[1];
        if (!tenantId) {
          return new Response(
            JSON.stringify({ error: "missing_tenant_id" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Validate that tenantId is a UUID
        const uuidSchema = z.string().uuid();
        const uuidResult = uuidSchema.safeParse(tenantId);
        if (!uuidResult.success) {
          return new Response(
            JSON.stringify({ error: "invalid_tenant_id" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // ---- Step 3: parse and validate the request body ----------------
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "invalid_json" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Merge the tenantId from the path into the body for validation
        const inputWithTenantId = {
          ...(typeof body === "object" && body !== null ? body : {}),
          tenantId,
        };

        const parseResult = FeatureOverrideInputSchema.safeParse(inputWithTenantId);
        if (!parseResult.success) {
          return new Response(
            JSON.stringify({
              error: "validation_error",
              details: parseResult.error.issues.map((issue) => ({
                path: issue.path,
                message: issue.message,
              })),
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const input = parseResult.data;

        // ---- Step 4: verify the tenant exists ---------------------------
        const { data: tenantRow, error: tenantErr } = await adminFrom("tenants")
          .select("id")
          .eq("id", tenantId)
          .limit(1)
          .maybeSingle();

        if (tenantErr) {
          console.error("[admin/features] failed to load tenant", tenantErr);
          return new Response(
            JSON.stringify({ error: "internal_error" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        if (tenantRow === null) {
          return new Response(
            JSON.stringify({ error: "tenant_not_found" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // ---- Step 5: upsert the tenant_features row ---------------------
        const { error: upsertErr } = await adminFrom("tenant_features").upsert(
          {
            tenant_id: input.tenantId,
            feature_key: input.featureKey,
            enabled: input.enabled,
            expires_at: input.expiresAt ?? null,
          },
          {
            onConflict: "tenant_id,feature_key",
          },
        );

        if (upsertErr) {
          console.error("[admin/features] failed to upsert tenant_features", upsertErr);
          return new Response(
            JSON.stringify({ error: "internal_error" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // ---- Step 6: invalidate the cached effective-feature set --------
        invalidateEffectiveFeatures(tenantId);

        // ---- Step 7: audit-log the action -------------------------------
        await recordAudit({
          actorId,
          tenantId,
          action: "feature.override.set",
          payload: {
            featureKey: input.featureKey,
            enabled: input.enabled,
            expiresAt: input.expiresAt ?? null,
          },
          ip: ipFromRequest(request),
        });

        // ---- Step 8: respond with success -------------------------------
        return new Response(
          JSON.stringify({ success: true }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    },
  },
});
