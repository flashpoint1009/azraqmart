/**
 * `/suspended` — landing page for tenants whose `status` is `suspended`
 * or `cancelled`.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - Requirement 4.10 — "WHILE `tenants.status` is `suspended` or
 *     `cancelled`, THE System SHALL block all storefront routes for
 *     that tenant except the suspended landing page and the Stripe
 *     billing portal redirect."
 *   - Requirement 2.7 — Tenant_Resolver returns `{ ok: false, reason:
 *     'suspended' }` for those statuses; the route gate in
 *     `__root.tsx` `beforeLoad` (task 4.5) redirects here with HTTP 402.
 *
 * The `__root.tsx` `beforeLoad` is the actual route gate — it
 * short-circuits the entire app to this page whenever a suspended /
 * cancelled tenant is resolved. This file just renders the
 * destination. The Stripe billing portal redirect (`/api/billing/portal`)
 * is provisioned by the billing tasks (13.x); until that endpoint is
 * deployed the link will 404, which is acceptable because the user
 * still sees the explanation copy on this page.
 *
 * Requirements: 4.10
 */

import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOptionalTenant } from "@/lib/tenancy/context";

export const Route = createFileRoute("/suspended")({
  component: SuspendedComponent,
});

function SuspendedComponent() {
  // The tenant provider may legitimately be absent here: when the
  // resolver decides on `suspended`/`cancelled`, `__root.tsx` redirects
  // before mounting `<TenantProvider>` (the provider is only mounted
  // for healthy tenants). `useOptionalTenant()` avoids the throw.
  const ctx = useOptionalTenant();
  const tenantName = ctx?.tenant.name ?? "this storefront";
  const status = ctx?.tenant.status ?? "suspended";
  const isCancelled = status === "cancelled";

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-md text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-3 font-display text-2xl font-bold">
          Storefront unavailable
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tenantName} is currently {isCancelled ? "closed" : "suspended"}.
          {!isCancelled && " Please update your billing to restore access."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {!isCancelled && (
            <Button asChild>
              <a href="/api/billing/portal">Open billing portal</a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
