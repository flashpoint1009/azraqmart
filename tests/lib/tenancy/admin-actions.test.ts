/**
 * Unit tests for tenant admin actions (suspend/resume).
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Component: Super-Admin Console" — defines the contracts for
 *     `suspendTenant` and `resumeTenant`.
 *
 * Test coverage:
 *   - `suspendTenant`:
 *     - Valid suspension with reason
 *     - Reason validation (empty, too long)
 *     - Invalid transitions (e.g., from cancelled)
 *     - Idempotent self-suspension (suspended → suspended)
 *     - Audit log recording
 *   - `resumeTenant`:
 *     - Resume to active (when billing is healthy)
 *     - Resume to past_due (when billing is past_due/unpaid)
 *     - Invalid transitions (e.g., from cancelled)
 *     - Idempotent self-resume (active → active)
 *     - Audit log recording
 *
 * Requirements: 4.8, 4.9, 7.8
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { suspendTenant, resumeTenant } from "../../../src/lib/tenancy/admin-actions";
import { InvalidTransitionError } from "../../../src/lib/tenancy/status-transitions";
import type { TenantStatus } from "../../../src/lib/tenancy/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Hoist mocks to ensure they're available before module imports
const { mockFrom, mockSelect, mockEq, mockLimit, mockMaybeSingle, mockUpdate, mockInsert, mockRecordAudit } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockLimit: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
  mockRecordAudit: vi.fn(),
}));

// Mock the Supabase admin client
vi.mock("../../../src/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

// Mock the audit middleware
vi.mock("../../../src/server/middleware/audit", () => ({
  recordAudit: mockRecordAudit,
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Set up the mock chain for a successful tenant status fetch.
 */
function mockTenantStatusFetch(tenantId: string, status: TenantStatus) {
  mockFrom.mockReturnValueOnce({
    select: mockSelect.mockReturnValueOnce({
      eq: mockEq.mockReturnValueOnce({
        limit: mockLimit.mockReturnValueOnce({
          maybeSingle: mockMaybeSingle.mockResolvedValueOnce({
            data: { status },
            error: null,
          }),
        }),
      }),
    }),
  });
}

/**
 * Set up the mock chain for a successful tenant_billing status fetch.
 */
function mockBillingStatusFetch(tenantId: string, status: string | null) {
  mockFrom.mockReturnValueOnce({
    select: mockSelect.mockReturnValueOnce({
      eq: mockEq.mockReturnValueOnce({
        limit: mockLimit.mockReturnValueOnce({
          maybeSingle: mockMaybeSingle.mockResolvedValueOnce({
            data: status ? { status } : null,
            error: null,
          }),
        }),
      }),
    }),
  });
}

/**
 * Set up the mock chain for a successful status update (tenants table).
 */
function mockTenantStatusUpdate(tenantId: string) {
  mockFrom.mockReturnValueOnce({
    update: mockUpdate.mockReturnValueOnce({
      eq: mockEq.mockResolvedValueOnce({
        error: null,
      }),
    }),
  });
}

/**
 * Set up the mock chain for a successful status update (tenant_billing table).
 */
function mockBillingStatusUpdate(tenantId: string) {
  mockFrom.mockReturnValueOnce({
    update: mockUpdate.mockReturnValueOnce({
      eq: mockEq.mockResolvedValueOnce({
        error: null,
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("admin-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("suspendTenant", () => {
    const tenantId = "00000000-0000-0000-0000-000000000001";
    const actorId = "actor-123";
    const reason = "Payment failure after final dunning attempt";

    it("should suspend an active tenant with a valid reason", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "active");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await suspendTenant(tenantId, reason, actorId);

      // Assert
      expect(mockFrom).toHaveBeenCalledWith("tenants");
      expect(mockFrom).toHaveBeenCalledWith("tenant_billing");
      expect(mockUpdate).toHaveBeenCalledWith({ status: "suspended" });
      expect(mockRecordAudit).toHaveBeenCalledWith({
        actorId,
        tenantId,
        action: "tenant.suspended",
        payload: { reason },
      });
    });

    it("should suspend a past_due tenant", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "past_due");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await suspendTenant(tenantId, reason, actorId);

      // Assert
      expect(mockUpdate).toHaveBeenCalledWith({ status: "suspended" });
      expect(mockRecordAudit).toHaveBeenCalledWith({
        actorId,
        tenantId,
        action: "tenant.suspended",
        payload: { reason },
      });
    });

    it("should allow idempotent self-suspension (suspended → suspended)", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "suspended");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await suspendTenant(tenantId, reason, actorId);

      // Assert - should not throw, should still update and audit
      expect(mockUpdate).toHaveBeenCalledWith({ status: "suspended" });
      expect(mockRecordAudit).toHaveBeenCalled();
    });

    it("should reject empty reason", async () => {
      // Act & Assert
      await expect(suspendTenant(tenantId, "", actorId)).rejects.toThrow(
        "reason must be 1..500 chars"
      );
      await expect(suspendTenant(tenantId, "   ", actorId)).rejects.toThrow(
        "reason must be 1..500 chars"
      );
    });

    it("should reject reason longer than 500 characters", async () => {
      // Arrange
      const longReason = "x".repeat(501);

      // Act & Assert
      await expect(suspendTenant(tenantId, longReason, actorId)).rejects.toThrow(
        "reason must be 1..500 chars"
      );
    });

    it("should reject invalid transition from cancelled", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "cancelled");

      // Act & Assert
      await expect(suspendTenant(tenantId, reason, actorId)).rejects.toThrow(
        InvalidTransitionError
      );
    });

    it("should work without actorId (system-initiated suspension)", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "active");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await suspendTenant(tenantId, reason);

      // Assert
      expect(mockRecordAudit).toHaveBeenCalledWith({
        actorId: null,
        tenantId,
        action: "tenant.suspended",
        payload: { reason },
      });
    });

    it("should update both tenants and tenant_billing status", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "active");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await suspendTenant(tenantId, reason, actorId);

      // Assert - verify both tables were updated
      const fromCalls = mockFrom.mock.calls;
      expect(fromCalls).toContainEqual(["tenants"]);
      expect(fromCalls).toContainEqual(["tenant_billing"]);
      expect(mockUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe("resumeTenant", () => {
    const tenantId = "00000000-0000-0000-0000-000000000002";
    const actorId = "actor-456";

    it("should resume suspended tenant to active when billing is healthy", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "suspended");
      mockBillingStatusFetch(tenantId, "active");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await resumeTenant(tenantId, actorId);

      // Assert
      expect(mockUpdate).toHaveBeenCalledWith({ status: "active" });
      expect(mockRecordAudit).toHaveBeenCalledWith({
        actorId,
        tenantId,
        action: "tenant.resumed",
        payload: { from: "suspended", to: "active" },
      });
    });

    it("should resume suspended tenant to past_due when billing is past_due", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "suspended");
      mockBillingStatusFetch(tenantId, "past_due");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await resumeTenant(tenantId, actorId);

      // Assert
      expect(mockUpdate).toHaveBeenCalledWith({ status: "past_due" });
      expect(mockRecordAudit).toHaveBeenCalledWith({
        actorId,
        tenantId,
        action: "tenant.resumed",
        payload: { from: "suspended", to: "past_due" },
      });
    });

    it("should resume suspended tenant to past_due when billing is unpaid", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "suspended");
      mockBillingStatusFetch(tenantId, "unpaid");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await resumeTenant(tenantId, actorId);

      // Assert
      expect(mockUpdate).toHaveBeenCalledWith({ status: "past_due" });
      expect(mockRecordAudit).toHaveBeenCalledWith({
        actorId,
        tenantId,
        action: "tenant.resumed",
        payload: { from: "suspended", to: "past_due" },
      });
    });

    it("should resume to active when tenant_billing row is missing", async () => {
      // Arrange - no billing row (legacy tenant)
      mockTenantStatusFetch(tenantId, "suspended");
      mockBillingStatusFetch(tenantId, null);
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await resumeTenant(tenantId, actorId);

      // Assert
      expect(mockUpdate).toHaveBeenCalledWith({ status: "active" });
    });

    it("should allow idempotent self-resume (active → active)", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "active");
      mockBillingStatusFetch(tenantId, "active");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await resumeTenant(tenantId, actorId);

      // Assert - should not throw, should still update and audit
      expect(mockUpdate).toHaveBeenCalledWith({ status: "active" });
      expect(mockRecordAudit).toHaveBeenCalled();
    });

    it("should reject invalid transition from cancelled", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "cancelled");
      mockBillingStatusFetch(tenantId, "active");

      // Act & Assert
      await expect(resumeTenant(tenantId, actorId)).rejects.toThrow(
        InvalidTransitionError
      );
    });

    it("should work without actorId (system-initiated resume)", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "suspended");
      mockBillingStatusFetch(tenantId, "active");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await resumeTenant(tenantId);

      // Assert
      expect(mockRecordAudit).toHaveBeenCalledWith({
        actorId: null,
        tenantId,
        action: "tenant.resumed",
        payload: { from: "suspended", to: "active" },
      });
    });

    it("should update both tenants and tenant_billing status", async () => {
      // Arrange
      mockTenantStatusFetch(tenantId, "suspended");
      mockBillingStatusFetch(tenantId, "active");
      mockTenantStatusUpdate(tenantId);
      mockBillingStatusUpdate(tenantId);

      // Act
      await resumeTenant(tenantId, actorId);

      // Assert - verify both tables were updated
      const fromCalls = mockFrom.mock.calls;
      expect(fromCalls).toContainEqual(["tenants"]);
      expect(fromCalls).toContainEqual(["tenant_billing"]);
      expect(mockUpdate).toHaveBeenCalledTimes(2);
    });
  });
});
