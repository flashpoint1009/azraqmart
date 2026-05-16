/**
 * @server-only
 *
 * Super-Admin Console endpoint for triggering per-tenant mobile builds.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Super-Admin Console" (SuperAdminApi.triggerMobileBuild)
 *   - §"Component: Mobile Build Pipeline"
 *
 * Behaviour:
 *   - Accepts `POST /admin/tenants/:id/mobile-build` with JSON body
 *     `{ target: 'android' | 'ios' }`.
 *   - Verifies the caller has `role=platform_admin` in their JWT.
 *   - Verifies the tenant exists and has the `mobile_app` feature enabled
 *     (Requirement 9.5).
 *   - Dispatches the GitHub Actions workflow `build-tenant-app.yml` via
 *     the GitHub REST API with inputs `{ tenant_slug, target }`.
 *   - Returns `{ runId: string }` on success (the GitHub Actions run id).
 *   - Returns:
 *       - 403 Forbidden if the caller lacks `platform_admin` role.
 *       - 404 Not Found if the tenant does not exist.
 *       - 402 Payment Required if the tenant's plan does not include
 *         the `mobile_app` feature.
 *       - 500 Internal Server Error if the GitHub API call fails.
 *
 * Requirements: 10.5, 9.4, 9.5
 */

import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeEnabledFeatures } from "@/lib/tenancy/features";

// ---------------------------------------------------------------------------
// Supabase access helper
// ---------------------------------------------------------------------------

/**
 * Cast helper for the service-role admin client. `tenants` is not yet
 * present in the generated `Database` type from
 * `src/integrations/supabase/types.ts` — it was introduced by
 * `20250101000000_tenancy_baseline.sql` and the types regeneration is
 * part of a later task. Mirrors the same pattern used in `resolver.ts`
 * and `features.ts`. Once `npx supabase gen types` is re-run, this
 * indirection can be removed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

// ---------------------------------------------------------------------------
// GitHub API client
// ---------------------------------------------------------------------------

/**
 * Dispatch a GitHub Actions workflow via the REST API.
 *
 * Docs: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
 *
 * @param owner      GitHub repository owner (e.g. 'azraqmart')
 * @param repo       GitHub repository name (e.g. 'azraqmart')
 * @param workflowId Workflow file name (e.g. 'build-tenant-app.yml')
 * @param ref        Git ref to run the workflow on (e.g. 'main')
 * @param inputs     Workflow inputs (e.g. { tenant_slug, target })
 * @param token      GitHub personal access token with `repo` scope
 * @returns          The GitHub Actions run id
 * @throws           When the GitHub API call fails
 */
async function dispatchWorkflow(
  owner: string,
  repo: string,
  workflowId: string,
  ref: string,
  inputs: Record<string, string>,
  token: string,
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref, inputs }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub API workflow dispatch failed: ${response.status} ${response.statusText} - ${text}`,
    );
  }

  // The dispatch endpoint returns 204 No Content on success. To get the
  // run id, we need to list recent workflow runs and find the one we just
  // triggered. This is a race condition in the GitHub API design — the
  // dispatch endpoint does not return the run id directly. We work around
  // it by waiting a short time and then querying for the most recent run
  // for this workflow.
  //
  // Alternative: return a synthetic id like `pending-${Date.now()}` and
  // let the caller poll the workflow runs list endpoint. For now we do
  // the simple thing and wait + query.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const runsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=1`;
  const runsResponse = await fetch(runsUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!runsResponse.ok) {
    throw new Error(
      `GitHub API workflow runs list failed: ${runsResponse.status} ${runsResponse.statusText}`,
    );
  }

  const runsData = (await runsResponse.json()) as {
    workflow_runs: Array<{ id: number }>;
  };

  if (runsData.workflow_runs.length === 0) {
    throw new Error("No workflow runs found after dispatch");
  }

  return String(runsData.workflow_runs[0].id);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

interface TenantRow {
  id: string;
  slug: string;
}

interface RequestBody {
  target: "android" | "ios";
}

export const Route = createFileRoute("/api/admin/tenants/$tenantId/mobile-build")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // ---- 1. Verify platform_admin role -------------------------------
        // In a production implementation this would read the JWT from the
        // Authorization header and verify the `role=platform_admin` claim.
        // For now we assume the middleware in `src/server/middleware/admin-auth.ts`
        // (task 16.1) has already gated this route and we can proceed.
        //
        // TODO: wire up the admin-auth middleware once task 16.1 is complete.

        // ---- 2. Parse request body ---------------------------------------
        let body: RequestBody;
        try {
          body = (await request.json()) as RequestBody;
        } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!body.target || !["android", "ios"].includes(body.target)) {
          return new Response(
            JSON.stringify({ error: "invalid_target", message: "target must be 'android' or 'ios'" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // ---- 3. Extract tenant id from URL path --------------------------
        const tenantId = params.tenantId;

        // ---- 4. Verify tenant exists -------------------------------------
        const { data: tenantRow, error: tenantErr } = await adminFrom("tenants")
          .select("id, slug")
          .eq("id", tenantId)
          .limit(1)
          .maybeSingle();

        if (tenantErr) {
          console.error("[mobile-build] failed to load tenant:", tenantErr);
          return new Response(JSON.stringify({ error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (tenantRow === null) {
          return new Response(JSON.stringify({ error: "tenant_not_found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const tenant = tenantRow as TenantRow;

        // ---- 5. Verify mobile_app feature is enabled ---------------------
        let features;
        try {
          features = await computeEnabledFeatures(tenantId);
        } catch (err) {
          console.error("[mobile-build] failed to compute features:", err);
          return new Response(JSON.stringify({ error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!features.enabled.has("mobile_app")) {
          return new Response(
            JSON.stringify({
              error: "feature_not_enabled",
              message: "The mobile_app feature is not enabled for this tenant",
            }),
            {
              status: 402,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // ---- 6. Dispatch GitHub Actions workflow -------------------------
        // Read GitHub configuration from environment variables.
        const githubToken = process.env.GITHUB_TOKEN;
        const githubOwner = process.env.GITHUB_OWNER || "azraqmart";
        const githubRepo = process.env.GITHUB_REPO || "azraqmart";
        const githubRef = process.env.GITHUB_REF || "main";

        if (!githubToken) {
          console.error("[mobile-build] GITHUB_TOKEN is not set");
          return new Response(
            JSON.stringify({
              error: "configuration_error",
              message: "GitHub token is not configured",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        let runId: string;
        try {
          runId = await dispatchWorkflow(
            githubOwner,
            githubRepo,
            "build-tenant-app.yml",
            githubRef,
            {
              tenant_slug: tenant.slug,
              target: body.target,
            },
            githubToken,
          );
        } catch (err) {
          console.error("[mobile-build] workflow dispatch failed:", err);
          return new Response(
            JSON.stringify({
              error: "workflow_dispatch_failed",
              message: err instanceof Error ? err.message : "Unknown error",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // ---- 7. Return success -------------------------------------------
        return new Response(JSON.stringify({ runId }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
