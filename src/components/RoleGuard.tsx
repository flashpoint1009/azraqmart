/**
 * RoleGuard — declarative access control for staff/admin routes.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Role Guard"
 *
 * This component operates in **two modes**, selected by the props the
 * caller passes:
 *
 *   1. **Legacy / global mode (default).** When only the `allow` prop
 *      is supplied, the guard reads roles from the platform-global
 *      `public.user_roles` table via the existing `useUserRoles()`
 *      hook. This preserves byte-for-byte the behavior every existing
 *      route relies on (`<RoleGuard allow={["admin", "developer"]}>`
 *      etc.) and is the path taken until call sites are migrated.
 *
 *   2. **Tenant-scoped mode (opt-in).** When `tenantRoles` is supplied,
 *      the guard checks `public.user_tenant_roles` via
 *      `assertRole(currentUserId, tenantId, tenantRoles)` (see
 *      `src/lib/tenancy/roles.ts`). The tenant id defaults to the
 *      current `<TenantProvider>` value via `useOptionalTenant()`; it
 *      can be overridden with the `tenantId` prop. If `tenantRoles` is
 *      supplied but no tenant id can be resolved (e.g. the route is
 *      not yet wrapped in a tenant provider), the guard falls through
 *      to the legacy path so existing routes keep working — the
 *      tenant-scoped check is a *strict additional gate*, never a
 *      precondition we can fail open on without a tenant id.
 *
 * Because `assertRole` queries Supabase via the service-role client
 * (`@/integrations/supabase/client.server`), the tenant-scoped check
 * cannot run directly in the browser. It is invoked through the
 * `checkTenantRole` server function in
 * `@/lib/tenancy/roles.functions.ts`, which authenticates the caller
 * via `requireSupabaseAuth` and translates `ForbiddenError` into a
 * structured `{ allowed: false }` result.
 *
 * The UX (Arabic loading text, ShieldAlert icon, redirect button)
 * stays identical across both modes; only the decision source
 * changes.
 *
 * Requirements: 6.1, 6.4
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles, type AppRole, ROLE_HOME } from "@/hooks/useUserRoles";
import { useOptionalTenant } from "@/lib/tenancy/context";
import { checkTenantRole } from "@/lib/tenancy/roles.functions";
import type { UserRole } from "@/lib/tenancy/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for {@link RoleGuard}.
 *
 * `allow` remains required and types unchanged so every existing call
 * site (`<RoleGuard allow={[...]}>`) continues to compile and behave
 * identically. The new `tenantRoles` and `tenantId` props are purely
 * additive opt-ins.
 */
export interface RoleGuardProps {
  /**
   * Legacy/global roles that satisfy the guard. Read from
   * `public.user_roles` via `useUserRoles()`. Required for backwards
   * compatibility with the dozens of existing routes that pass it.
   */
  allow: AppRole[];

  /**
   * Optional tenant-scoped roles that satisfy the guard. When set,
   * the guard switches to the tenant-scoped path and checks the
   * caller's role on `tenantId` via
   * {@link import("@/lib/tenancy/roles").assertRole}.
   *
   * When undefined, the guard runs the legacy global check.
   */
  tenantRoles?: UserRole[];

  /**
   * Tenant whose role should be checked. Defaults to the current
   * `<TenantProvider>` value. Only consulted when `tenantRoles` is
   * supplied. Pass an explicit value when guarding admin surfaces
   * that target a different tenant than the one mounted in context
   * (e.g. the super-admin console).
   */
  tenantId?: string;

  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Three-valued state machine for the tenant-scoped check. Mirrors the
 * sync states the legacy path already has — loading / allowed /
 * denied — so the rendering branches stay consistent across modes.
 */
type TenantCheckState = "loading" | "allowed" | "denied";

export function RoleGuard({
  allow,
  tenantRoles,
  tenantId,
  children,
}: RoleGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const legacy = useUserRoles();

  // Resolve the tenant id for the tenant-scoped path. We use
  // `useOptionalTenant()` rather than `useTenant()` so this component
  // does not throw on legacy routes that have not been wrapped in
  // a `<TenantProvider>` yet.
  const tenantContext = useOptionalTenant();
  const resolvedTenantId = tenantId ?? tenantContext?.tenant.id ?? null;

  // Whether we should run the tenant-scoped check at all. We require
  // both an opt-in (`tenantRoles`) and a tenant id we can scope to;
  // if either is missing we fall through to the legacy check.
  const useTenantPath =
    tenantRoles !== undefined &&
    tenantRoles.length > 0 &&
    resolvedTenantId !== null;

  // ---------------------------------------------------------------------
  // Tenant-scoped check (effect-driven; only runs in tenant mode)
  // ---------------------------------------------------------------------

  const checkTenantRoleFn = useServerFn(checkTenantRole);
  const [tenantState, setTenantState] = useState<TenantCheckState>("loading");

  useEffect(() => {
    // Reset to loading when inputs change so we never render a stale
    // allow/deny decision for a different tenant or role set.
    if (!useTenantPath || !user) {
      setTenantState("loading");
      return;
    }

    let cancelled = false;
    setTenantState("loading");

    void (async () => {
      try {
        const result = await checkTenantRoleFn({
          // `useTenantPath` guarantees both are non-null here.
          data: {
            tenantId: resolvedTenantId as string,
            required: tenantRoles as UserRole[],
          },
        });
        if (cancelled) return;
        setTenantState(result.allowed ? "allowed" : "denied");
      } catch (err) {
        // Treat infrastructure failures as denied so we fail closed
        // rather than leaking a protected surface. The error is
        // surfaced in the console for debugging.
        if (cancelled) return;
        console.error("[RoleGuard] tenant-scoped check failed", err);
        setTenantState("denied");
      }
    })();

    return () => {
      cancelled = true;
    };
    // `tenantRoles` is an array; serialize to a stable key so a new
    // array reference with the same contents does not re-trigger the
    // effect on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    useTenantPath,
    user?.id,
    resolvedTenantId,
    JSON.stringify(tenantRoles ?? []),
  ]);

  // ---------------------------------------------------------------------
  // Render branches
  // ---------------------------------------------------------------------

  // 1. Auth still resolving, or legacy roles still loading for a signed-in user.
  if (authLoading || (user && legacy.isLoading)) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-sm font-bold text-muted-foreground">جارِ التحميل…</div>
      </div>
    );
  }

  // 2. Not signed in.
  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-sm text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-warning" />
          <h2 className="mt-3 font-display text-xl font-bold">يلزم تسجيل الدخول</h2>
          <Button asChild className="mt-4"><Link to="/login">تسجيل الدخول</Link></Button>
        </div>
      </div>
    );
  }

  // 3. Tenant-scoped mode: defer to the effect-driven state machine.
  if (useTenantPath) {
    if (tenantState === "loading") {
      return (
        <div className="grid min-h-screen place-items-center bg-background">
          <div className="text-sm font-bold text-muted-foreground">جارِ التحميل…</div>
        </div>
      );
    }
    if (tenantState === "denied") {
      return (
        <div className="grid min-h-screen place-items-center bg-background px-4">
          <div className="max-w-sm text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-3 font-display text-xl font-bold">لا تملك صلاحية الوصول</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              هذه الصفحة مخصصة لـ: {(tenantRoles as UserRole[]).join("، ")}
            </p>
            <Button asChild className="mt-4">
              <Link to={legacy.primary ? ROLE_HOME[legacy.primary] : "/"}>
                العودة للرئيسية
              </Link>
            </Button>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  // 4. Legacy/global mode: same logic the component has always used.
  if (!legacy.hasAny(...allow)) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-sm text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-3 font-display text-xl font-bold">لا تملك صلاحية الوصول</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            هذه الصفحة مخصصة لـ: {allow.join("، ")}
          </p>
          <Button asChild className="mt-4">
            <Link to={legacy.primary ? ROLE_HOME[legacy.primary] : "/"}>العودة للرئيسية</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
