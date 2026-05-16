/**
 * @server-only
 *
 * Custom Domain Re-check Cron Worker.
 *
 * Source of truth:
 *   - .kiro/specs/white-label-saas-system/requirements.md
 *       Requirement 8.9: "WHILE a custom domain remains unverified, THE
 *       System SHALL re-check DNS at most every 10 minutes for up to 24
 *       hours, after which IF still unverified THEN THE Domain_Manager
 *       SHALL mark the domain `failed`."
 *   - .kiro/specs/white-label-saas-system/design.md
 *       §"Component: Custom Domain Manager" — "Periodically re-check DNS
 *       until verified or expired."
 *
 * `recheckDomains()` is intended to be invoked by a Cloudflare Workers
 * scheduled (cron) trigger configured in `wrangler.jsonc` to run every 10
 * minutes. It:
 *
 *   1. Loads every `tenant_domains` row that is still pending verification
 *      (`verified=false AND failed=false`) and was created within the last
 *      24 hours, then re-runs `verifyDomain` on each so DNS / Cloudflare
 *      changes propagate without operator intervention. `verifyDomain`
 *      itself flips `verified=true` and invalidates the resolver cache when
 *      both the TXT record and the SSL-for-SaaS hostname check out, so
 *      this worker only needs to drive the retry loop.
 *   2. Loads every `tenant_domains` row that is still pending and is older
 *      than 24 hours and marks `failed=true` in a single bulk UPDATE.
 *      Once `failed=true`, the row stops being re-checked and the tenant
 *      onboarding UI surfaces the failure so the owner can either retry
 *      DNS configuration or remove the domain.
 *
 * Wiring note: Cloudflare Workers cron triggers are dispatched to a
 * `scheduled(event, env, ctx)` export on the worker entry point. Because
 * this project uses TanStack Start with the Cloudflare Workers preset,
 * the actual `scheduled` handler is wired up in the worker entry (a
 * downstream task / `wrangler.jsonc` edit registers
 * `triggers.crons = ["*\/10 * * * *"]` and forwards the invocation here).
 * Keeping `recheckDomains()` as a plain async function makes it trivial
 * to call from that handler, from a manual admin endpoint, or from a
 * test harness.
 *
 * Requirements: 8.9
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyDomain } from "@/lib/tenancy/domains";

/**
 * Window during which a pending custom domain is still re-checked. After
 * this many milliseconds since `created_at`, the row is moved to the
 * `failed` state and the cron worker stops touching it.
 *
 * Spec: Requirement 8.9 — "for up to 24 hours".
 */
const RECHECK_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Shape of the columns selected from `tenant_domains` for the recheck pass.
 * Declared locally because the generated `Database` type is regenerated
 * from the live Supabase project and does not yet include the platform
 * tables added by `20250101000000_tenancy_baseline.sql` /
 * `20260601001100_tenant_domains_failed.sql`.
 */
interface PendingDomainRow {
  id: string;
  domain: string;
  created_at: string;
}

/**
 * Cast helper for the service-role admin client. `tenant_domains` is not
 * yet present in the generated `Database` type; once
 * `npx supabase gen types` is re-run after migrations apply, this
 * indirection can be removed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminFrom = (table: string) => (supabaseAdmin as any).from(table);

/**
 * Re-check unverified custom domains.
 *
 * Runs once per cron tick. Errors loading or updating rows are logged but
 * not thrown — a transient failure on one tick should not crash the
 * worker, because the next tick (10 minutes later) will retry naturally.
 * Errors raised by `verifyDomain` for a single row are caught so one bad
 * row cannot block the rest of the batch.
 *
 * Postconditions:
 *   - For every pending domain younger than 24h, `verifyDomain` has been
 *     invoked exactly once during this call.
 *   - For every pending domain at least 24h old, the row's `failed`
 *     column is `true` (idempotent — `failed=true` rows are filtered out
 *     of subsequent passes).
 *
 * Requirements: 8.9
 */
export async function recheckDomains(): Promise<void> {
  const cutoff = new Date(Date.now() - RECHECK_WINDOW_MS).toISOString();

  // 1. Recent pending domains — re-run verifyDomain on each.
  const { data: recent, error: recentErr } = await adminFrom("tenant_domains")
    .select("id, domain, created_at")
    .eq("verified", false)
    .eq("failed", false)
    .gt("created_at", cutoff);

  if (recentErr) {
    // eslint-disable-next-line no-console
    console.error("[domain-recheck] failed to load recent domains", recentErr);
    return;
  }

  for (const row of (recent ?? []) as PendingDomainRow[]) {
    try {
      const result = await verifyDomain(row.id);
      if (result.verified) {
        // eslint-disable-next-line no-console
        console.log(`[domain-recheck] verified ${row.domain}`);
      }
      // Still pending (txt_not_found / ssl_pending): no-op; next tick retries.
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[domain-recheck] error verifying ${row.domain}`, err);
    }
  }

  // 2. Older pending domains — mark failed in one bulk update.
  const { error: failErr } = await adminFrom("tenant_domains")
    .update({ failed: true })
    .eq("verified", false)
    .eq("failed", false)
    .lte("created_at", cutoff);

  if (failErr) {
    // eslint-disable-next-line no-console
    console.error("[domain-recheck] failed to mark stale domains as failed", failErr);
  }
}
