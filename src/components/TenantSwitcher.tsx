/**
 * TenantSwitcher — surfaces multi-tenant membership for the current user.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Role Guard"
 *   - §"Tenant Resolution"
 *
 * Semantics (Requirement 6.6):
 *   "THE System SHALL allow a single user to hold different roles in
 *    different tenants and SHALL surface a tenant switcher when more
 *    than one membership exists."
 *
 * Behavior:
 *   - Reads the current user via `supabase.auth.getUser()`. Until the
 *     user and their memberships have been fetched, the component
 *     renders nothing — there is no spinner because the switcher is a
 *     header affordance, not a primary surface.
 *   - Fetches the user's memberships from `user_tenant_roles`,
 *     joined to `tenants(slug, name)`. The user-auth Supabase client
 *     respects RLS, so a logged-in user only ever sees rows where
 *     `user_id = auth.uid()`. We deliberately do NOT call the
 *     server-only `listUserTenants` from `@/lib/tenancy/roles.ts`
 *     here — that function uses `supabaseAdmin` and must not be
 *     bundled into the client.
 *   - Hides itself when the user has zero or one membership; the
 *     switcher is only meaningful when there is somewhere to switch
 *     to (Requirement 6.6).
 *   - Selecting a tenant persists the chosen slug in a
 *     `current_tenant_slug` cookie (Path=/, 1y, SameSite=Lax) and
 *     navigates to the tenant's platform subdomain so the resolver
 *     (Requirement 2.2) picks it up on the next request.
 *
 * Requirements: 6.6
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { UserRole } from "@/lib/tenancy/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Cookie name the resolver consults when the request lacks a
 * tenant-bearing host. Kept in lockstep with any server middleware
 * that reads the same cookie (kept here as a single source of truth
 * for the client side).
 */
const TENANT_COOKIE_NAME = "current_tenant_slug";

/** 1 year in seconds. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Platform suffix for tenant subdomains. Matches the resolver. */
const PLATFORM_SUFFIX = "azraqmart.app";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of one membership row, denormalized with the joined tenant
 * fields the switcher renders. The DB join produces snake_case columns;
 * we map them to camelCase at the boundary so the rest of the
 * component stays in TS conventions.
 */
interface MembershipView {
  tenantId: string;
  role: UserRole;
  tenant: {
    slug: string;
    name: string;
  } | null;
}

/**
 * Raw row shape returned by the supabase join. `tenants` may be a
 * single object or `null` (the FK is non-null, but we defend against
 * the type system not knowing that).
 */
interface RawMembershipRow {
  tenant_id: string;
  role: UserRole;
  tenants: { slug: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Read the current tenant slug from the document cookie, if set.
 * Returns `null` on the server (no `document`) or when the cookie is
 * absent.
 */
function readCurrentTenantSlugFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .map((c) => c.split("="))
    .find(([name]) => name === TENANT_COOKIE_NAME);
  if (!match) return null;
  const value = match[1];
  return value ? decodeURIComponent(value) : null;
}

/**
 * Persist the chosen tenant slug in a long-lived cookie. `SameSite=Lax`
 * is the right default for a navigational switcher (it ships on
 * top-level navigations to the new subdomain). We do not set
 * `Secure` here because in development we serve over plain http; in
 * production the resolver / origin sets `Secure` on its own cookies.
 */
function setTenantCookie(slug: string): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(slug);
  document.cookie =
    `${TENANT_COOKIE_NAME}=${value}; ` +
    `Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Build the absolute URL for a tenant's storefront on the platform
 * subdomain. The resolver matches the leftmost label of the host
 * against `tenants.slug` (Requirement 2.2), so this is the canonical
 * way to "switch" to another tenant from the client.
 */
function buildSubdomainUrl(slug: string): string {
  return `https://${slug}.${PLATFORM_SUFFIX}`;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch the current user's memberships joined to their tenant rows.
 *
 * Notes:
 *   - The `user_tenant_roles` table is not yet present in the generated
 *     `Database` types (see `src/integrations/supabase/types.ts`),
 *     so we cast the client to `any` for this call. This matches the
 *     pattern used in `src/lib/tenancy/roles.ts` and elsewhere; it
 *     will be removed when types are regenerated.
 *   - RLS guarantees the user only sees their own rows, so we do not
 *     need to filter by `user_id` here. We still pass `userId` for
 *     defensive scoping in case RLS is ever weakened.
 */
async function fetchMemberships(userId: string): Promise<MembershipView[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("user_tenant_roles")
    .select("tenant_id, role, tenants(slug, name)")
    .eq("user_id", userId);

  if (error) {
    // Surface the failure in the console for debugging but do not
    // throw — the switcher is non-essential UI and should fail soft.
    console.error("[TenantSwitcher] failed to load memberships", error);
    return [];
  }
  if (!data) return [];

  return (data as RawMembershipRow[]).map((row) => ({
    tenantId: row.tenant_id,
    role: row.role,
    tenant: row.tenants
      ? { slug: row.tenants.slug, name: row.tenants.name }
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a tenant switcher when the signed-in user is a member of
 * more than one tenant. Returns `null` while loading and when the
 * user has zero or one membership.
 *
 * Requirements: 6.6
 */
export function TenantSwitcher() {
  const [memberships, setMemberships] = React.useState<MembershipView[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !data.user) {
        // Not signed in (or auth failure) — nothing to switch.
        setMemberships([]);
        return;
      }
      const rows = await fetchMemberships(data.user.id);
      if (cancelled) return;
      // Drop rows whose join failed to resolve a tenant — without a
      // slug we cannot build a switch target, and rendering them
      // would surface broken options to the user.
      setMemberships(rows.filter((m) => m.tenant !== null));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Loading: render nothing rather than reserving space.
  if (memberships === null) return null;

  // Switcher only makes sense with somewhere to switch TO.
  if (memberships.length < 2) return null;

  const currentSlug = readCurrentTenantSlugFromCookie() ?? "";

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSlug = event.target.value;
    if (!nextSlug) return;
    setTenantCookie(nextSlug);
    // Full navigation (not router) so the resolver runs against the
    // new host and the page is rendered in the new tenant context.
    if (typeof window !== "undefined") {
      window.location.assign(buildSubdomainUrl(nextSlug));
    }
  };

  return (
    <select
      value={currentSlug}
      onChange={handleChange}
      aria-label="Switch tenant"
      className="rounded-md border border-border bg-background px-2 py-1 text-sm font-bold"
    >
      {/* Placeholder when no cookie has been set yet. */}
      {!currentSlug && (
        <option value="" disabled>
          Select tenant
        </option>
      )}
      {memberships.map((m) => (
        // `m.tenant` is non-null after the filter above; the assertion
        // is safe and avoids a redundant runtime guard.
        <option key={m.tenantId} value={m.tenant!.slug}>
          {m.tenant!.name} ({m.role})
        </option>
      ))}
    </select>
  );
}
