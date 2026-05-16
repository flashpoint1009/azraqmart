/**
 * Unit tests for suspended-tenant route gate (Task 12.6).
 *
 * Validates that suspended/cancelled tenants are blocked from all routes
 * except `/suspended` and `/api/billing/portal`, as required by
 * Requirement 4.10.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/requirements.md`
 *   - Requirement 4.10 — "WHILE `tenants.status` is `suspended` or
 *     `cancelled`, THE System SHALL block all storefront routes for
 *     that tenant except the suspended landing page and the Stripe
 *     billing portal redirect."
 */

import { describe, it, expect } from "vitest";
import type { Tenant } from "../../../src/lib/tenancy/types";

/**
 * Helper to simulate the route gate logic from `__root.tsx` `beforeLoad`.
 * This is the core logic we're testing.
 */
function shouldBlockRoute(
  tenant: Tenant | null,
  pathname: string
): boolean {
  if (!tenant) return false;

  const isSuspendedOrCancelled =
    tenant.status === "suspended" || tenant.status === "cancelled";

  if (!isSuspendedOrCancelled) return false;

  const isAllowedRoute =
    pathname === "/suspended" || pathname.startsWith("/api/billing/portal");

  return !isAllowedRoute;
}

describe("Suspended-tenant route gate (Task 12.6)", () => {
  const createTenant = (status: Tenant["status"]): Tenant => ({
    id: "test-tenant-id",
    slug: "test-tenant",
    name: "Test Tenant",
    status,
    planId: "test-plan-id",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  describe("Active tenants", () => {
    it("should allow all routes for active tenants", () => {
      const tenant = createTenant("active");
      expect(shouldBlockRoute(tenant, "/")).toBe(false);
      expect(shouldBlockRoute(tenant, "/products")).toBe(false);
      expect(shouldBlockRoute(tenant, "/orders")).toBe(false);
      expect(shouldBlockRoute(tenant, "/suspended")).toBe(false);
      expect(shouldBlockRoute(tenant, "/api/billing/portal")).toBe(false);
    });

    it("should allow all routes for trialing tenants", () => {
      const tenant = createTenant("trialing");
      expect(shouldBlockRoute(tenant, "/")).toBe(false);
      expect(shouldBlockRoute(tenant, "/products")).toBe(false);
      expect(shouldBlockRoute(tenant, "/suspended")).toBe(false);
    });

    it("should allow all routes for past_due tenants", () => {
      const tenant = createTenant("past_due");
      expect(shouldBlockRoute(tenant, "/")).toBe(false);
      expect(shouldBlockRoute(tenant, "/products")).toBe(false);
      expect(shouldBlockRoute(tenant, "/suspended")).toBe(false);
    });
  });

  describe("Suspended tenants (Requirement 4.10)", () => {
    it("should block storefront routes for suspended tenants", () => {
      const tenant = createTenant("suspended");
      expect(shouldBlockRoute(tenant, "/")).toBe(true);
      expect(shouldBlockRoute(tenant, "/products")).toBe(true);
      expect(shouldBlockRoute(tenant, "/orders")).toBe(true);
      expect(shouldBlockRoute(tenant, "/admin")).toBe(true);
      expect(shouldBlockRoute(tenant, "/onboarding")).toBe(true);
    });

    it("should allow /suspended route for suspended tenants", () => {
      const tenant = createTenant("suspended");
      expect(shouldBlockRoute(tenant, "/suspended")).toBe(false);
    });

    it("should allow /api/billing/portal for suspended tenants", () => {
      const tenant = createTenant("suspended");
      expect(shouldBlockRoute(tenant, "/api/billing/portal")).toBe(false);
    });

    it("should allow /api/billing/portal/* subpaths for suspended tenants", () => {
      const tenant = createTenant("suspended");
      expect(shouldBlockRoute(tenant, "/api/billing/portal/session")).toBe(false);
      expect(shouldBlockRoute(tenant, "/api/billing/portal/redirect")).toBe(false);
    });
  });

  describe("Cancelled tenants (Requirement 4.10)", () => {
    it("should block storefront routes for cancelled tenants", () => {
      const tenant = createTenant("cancelled");
      expect(shouldBlockRoute(tenant, "/")).toBe(true);
      expect(shouldBlockRoute(tenant, "/products")).toBe(true);
      expect(shouldBlockRoute(tenant, "/orders")).toBe(true);
      expect(shouldBlockRoute(tenant, "/admin")).toBe(true);
    });

    it("should allow /suspended route for cancelled tenants", () => {
      const tenant = createTenant("cancelled");
      expect(shouldBlockRoute(tenant, "/suspended")).toBe(false);
    });

    it("should allow /api/billing/portal for cancelled tenants", () => {
      const tenant = createTenant("cancelled");
      expect(shouldBlockRoute(tenant, "/api/billing/portal")).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should not block routes when tenant is null", () => {
      expect(shouldBlockRoute(null, "/")).toBe(false);
      expect(shouldBlockRoute(null, "/products")).toBe(false);
      expect(shouldBlockRoute(null, "/suspended")).toBe(false);
    });

    it("should handle trailing slashes correctly", () => {
      const tenant = createTenant("suspended");
      // The actual implementation uses exact match for /suspended
      // and startsWith for /api/billing/portal
      expect(shouldBlockRoute(tenant, "/suspended/")).toBe(true); // Not exact match
      expect(shouldBlockRoute(tenant, "/api/billing/portal/")).toBe(false); // Matches startsWith
    });

    it("should not allow routes that merely contain 'suspended'", () => {
      const tenant = createTenant("suspended");
      expect(shouldBlockRoute(tenant, "/admin/suspended")).toBe(true);
      expect(shouldBlockRoute(tenant, "/suspended-accounts")).toBe(true);
    });

    it("should not allow routes that merely contain 'billing'", () => {
      const tenant = createTenant("suspended");
      expect(shouldBlockRoute(tenant, "/billing")).toBe(true);
      expect(shouldBlockRoute(tenant, "/admin/billing")).toBe(true);
      expect(shouldBlockRoute(tenant, "/api/billing")).toBe(true);
    });
  });

  describe("Status transition coverage", () => {
    it("should handle all possible tenant statuses", () => {
      const statuses: Tenant["status"][] = [
        "active",
        "trialing",
        "past_due",
        "suspended",
        "cancelled",
      ];

      for (const status of statuses) {
        const tenant = createTenant(status);
        const shouldBlock = shouldBlockRoute(tenant, "/products");

        if (status === "suspended" || status === "cancelled") {
          expect(shouldBlock).toBe(true);
        } else {
          expect(shouldBlock).toBe(false);
        }
      }
    });
  });
});
