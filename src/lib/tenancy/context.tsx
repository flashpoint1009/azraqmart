/**
 * Tenant React context for the white-label SaaS platform.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Tenant Context"
 *
 * Exposes the resolved tenant, branding, effective feature set, and
 * subscription to every component below `<TenantProvider>` without
 * prop-drilling. The provider value is produced server-side by the
 * tenant resolver (task 4.1) and re-hydrated on the client from the
 * SSR-injected JSON payload that `__root.tsx` (task 4.5) renders into
 * the document.
 *
 * `useTenant()` throws when called outside a provider; this is a
 * deliberate fail-fast that catches missing-resolver bugs (e.g. a
 * route rendered before `beforeLoad` has populated the context). For
 * the rare case where a route legitimately renders without a tenant
 * (e.g. the marketing landing page on the platform apex), use
 * `useOptionalTenant()` instead.
 *
 * Requirements: 2.5
 */

import { createContext, useContext } from "react";
import type {
  Subscription,
  Tenant,
  TenantBranding,
  TenantFeatures,
} from "./types";

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

/**
 * Runtime view of the current tenant available to all components below
 * `<TenantProvider>`.
 *
 * Mirrors the interface declared in design §"Component: Tenant Context".
 * The `features` field is the *effective* set after merging plan
 * baseline with non-expired tenant overrides (see `computeEnabledFeatures`,
 * task 9.1), not the raw `plan_features` rows.
 */
export interface TenantContextValue {
  tenant: Tenant;
  branding: TenantBranding;
  features: TenantFeatures;
  subscription: Subscription;
}

// ---------------------------------------------------------------------------
// Context object
// ---------------------------------------------------------------------------

/**
 * Internal context. The default value is `null` so that `useTenant()`
 * can distinguish "no provider in tree" from "provider supplied an
 * explicit value". Consumers must use `useTenant()` /
 * `useOptionalTenant()` rather than reading this directly.
 */
const TenantContext = createContext<TenantContextValue | null>(null);

TenantContext.displayName = "TenantContext";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link TenantProvider}.
 *
 * `value` is supplied verbatim — typically by `__root.tsx` after the
 * tenant resolver has produced it server-side and the client has
 * re-hydrated from the SSR-injected JSON payload.
 */
export interface TenantProviderProps {
  value: TenantContextValue;
  children: React.ReactNode;
}

/**
 * Provides the current tenant, branding, effective feature set, and
 * subscription to descendants.
 *
 * The resolver runs in the route's `beforeLoad`, so by the time this
 * provider mounts the value is fully formed; there is no loading
 * state to model here. On the client, the same value is reconstructed
 * from the SSR-injected JSON before React hydrates, so children can
 * safely call `useTenant()` during their initial render.
 */
export function TenantProvider({ value, children }: TenantProviderProps) {
  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hooks
// ---------------------------------------------------------------------------

/**
 * Read the current {@link TenantContextValue}.
 *
 * Throws if invoked outside a `<TenantProvider>`. Treat this as a
 * developer error: every storefront route is wrapped by the provider
 * in `__root.tsx`, so reaching the throw means either the resolver
 * never ran or a component is being rendered in the wrong tree (e.g.
 * the marketing landing page on the platform apex). For that rare,
 * legitimate case use {@link useOptionalTenant} instead.
 *
 * Requirements: 2.5
 */
export function useTenant(): TenantContextValue {
  const value = useContext(TenantContext);
  if (value === null) {
    throw new Error("useTenant must be used inside a <TenantProvider>");
  }
  return value;
}

/**
 * Read the current {@link TenantContextValue} or `null` when no
 * provider is mounted above the caller.
 *
 * Use this **only** in places that legitimately render without a
 * tenant — the marketing landing page on `azraqmart.app`, the
 * super-admin console on `admin.azraqmart.app`, and the suspended /
 * not-found error pages reached before the resolver decides on a
 * tenant. Storefront code paths must use {@link useTenant} so missing
 * tenant context fails fast.
 */
export function useOptionalTenant(): TenantContextValue | null {
  return useContext(TenantContext);
}
