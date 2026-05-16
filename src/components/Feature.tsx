/**
 * Declarative feature-flag gate for the white-label SaaS platform.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Feature Flag Gate"
 *
 * Wraps any subtree in a per-tenant feature toggle so callers don't
 * need to thread the effective feature set through props or duplicate
 * the override-precedence logic at every call site:
 *
 *   <Feature flag="loyalty">
 *     <LoyaltyCard />
 *   </Feature>
 *
 * Resolution rules (delegated to `evaluateFeature`, task 9.1):
 *   - If `override` is supplied it takes precedence over the tenant's
 *     effective set (an admin "preview" toggle, a test harness, etc.).
 *   - Otherwise the tenant's effective set from `useTenant()` decides.
 *
 * When the flag is off the component renders `fallback` if provided,
 * else a small built-in "Upgrade to enable" CTA. Plain markup is used
 * for the default fallback so this component never depends on a UI kit
 * being available — keeps it safe to drop into any route, including
 * marketing/error shells.
 *
 * Requirements: 5.8
 */

import { useTenant } from "@/lib/tenancy/context";
import type { FeatureKey, FeatureOverride, TenantFeatures } from "@/lib/tenancy/types";

/**
 * Pure client-side feature evaluation. Inlined here to avoid importing
 * from features.ts which pulls in server-only supabaseAdmin.
 */
function evaluateFeature(
  features: TenantFeatures,
  key: FeatureKey,
  override?: FeatureOverride | null,
): boolean {
  if (override && override.enabled) {
    if (override.expiresAt === null) return true;
    if (new Date(override.expiresAt).getTime() > Date.now()) return true;
  }
  if (override && !override.enabled) {
    if (override.expiresAt === null) return false;
    if (new Date(override.expiresAt).getTime() > Date.now()) return false;
  }
  return features.enabled.has(key);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link Feature}.
 *
 * - `flag` is the feature key being gated (closed enum from
 *   `FeatureKey`).
 * - `children` is rendered when the flag is on.
 * - `fallback` is rendered when the flag is off; defaults to the
 *   built-in {@link DefaultUpgradeCta}.
 * - `override` mirrors `evaluateFeature(features, key, override?)` and
 *   is forwarded verbatim — a truthy active override wins over the
 *   tenant's effective set.
 */
export interface FeatureProps {
  flag: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  override?: FeatureOverride;
}

/**
 * Render `children` iff the given feature is enabled for the current
 * tenant; otherwise render `fallback` (or the default upgrade CTA).
 *
 * Must be rendered inside a `<TenantProvider>` because it reads the
 * effective feature set via {@link useTenant}; storefront routes are
 * always wrapped by the provider in `__root.tsx` (task 4.5) so this
 * is the common case.
 *
 * Requirements: 5.8
 */
export function Feature({ flag, children, fallback, override }: FeatureProps) {
  const { features } = useTenant();
  const enabled = evaluateFeature(features, flag, override);

  if (enabled) {
    return <>{children}</>;
  }
  return <>{fallback ?? <DefaultUpgradeCta />}</>;
}

// ---------------------------------------------------------------------------
// Internal: default fallback UI
// ---------------------------------------------------------------------------

/**
 * Inline default fallback shown when a feature is gated off and the
 * caller did not supply a custom `fallback`.
 *
 * Deliberately uses plain markup with utility classes that already
 * exist in the project's Tailwind config (the same `text-muted-foreground`
 * / `bg-muted` tokens used throughout the storefront UI) so this
 * component carries no dependency on the shadcn `Button`/`Card`
 * primitives — that keeps it safe to render before the rest of the UI
 * tree has loaded its design-system imports.
 */
function DefaultUpgradeCta() {
  return (
    <div
      role="note"
      className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
    >
      <strong>Upgrade to enable</strong> — this feature is not included in your
      current plan.
    </div>
  );
}
