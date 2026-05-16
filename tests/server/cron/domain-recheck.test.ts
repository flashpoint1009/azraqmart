/**
 * Unit tests for the domain re-check cron worker.
 *
 * Validates that `recheckDomains` correctly processes pending domains
 * and marks stale ones as failed, as required by Requirement 8.9.
 *
 * Requirements: 8.9
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { recheckDomains } from "../../../src/server/cron/domain-recheck";
import * as domains from "../../../src/lib/tenancy/domains";
import { supabaseAdmin } from "../../../src/integrations/supabase/client.server";

// Mock the dependencies
vi.mock("../../../src/lib/tenancy/domains", () => ({
  verifyDomain: vi.fn(),
}));

vi.mock("../../../src/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe("Domain re-check cron worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be a function", () => {
    expect(typeof recheckDomains).toBe("function");
  });

  it("should return a Promise", () => {
    // Mock the database queries to return empty results
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockGt = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockLte = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockUpdate = vi.fn().mockReturnThis();

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      gt: mockGt,
      lte: mockLte,
      update: mockUpdate,
    } as any);

    const result = recheckDomains();
    expect(result).toBeInstanceOf(Promise);
  });

  it("should query for recent pending domains", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockGt = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockLte = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockUpdate = vi.fn().mockReturnThis();

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      gt: mockGt,
      lte: mockLte,
      update: mockUpdate,
    } as any);

    await recheckDomains();

    // Verify that we queried for tenant_domains
    expect(supabaseAdmin.from).toHaveBeenCalledWith("tenant_domains");
    expect(mockSelect).toHaveBeenCalledWith("id, domain, created_at");
    expect(mockEq).toHaveBeenCalledWith("verified", false);
    expect(mockEq).toHaveBeenCalledWith("failed", false);
  });

  it("should call verifyDomain for each recent pending domain", async () => {
    const mockDomains = [
      { id: "domain-1", domain: "test1.example.com", created_at: new Date().toISOString() },
      { id: "domain-2", domain: "test2.example.com", created_at: new Date().toISOString() },
    ];

    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockGt = vi.fn().mockResolvedValueOnce({ data: mockDomains, error: null });
    const mockLte = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockUpdate = vi.fn().mockReturnThis();

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      gt: mockGt,
      lte: mockLte,
      update: mockUpdate,
    } as any);

    vi.mocked(domains.verifyDomain).mockResolvedValue({ verified: false, reason: "txt_not_found" });

    await recheckDomains();

    expect(domains.verifyDomain).toHaveBeenCalledTimes(2);
    expect(domains.verifyDomain).toHaveBeenCalledWith("domain-1");
    expect(domains.verifyDomain).toHaveBeenCalledWith("domain-2");
  });

  it("should mark stale domains as failed", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockGt = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockLte = vi.fn().mockResolvedValue({ error: null });
    const mockUpdate = vi.fn().mockReturnThis();

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      gt: mockGt,
      lte: mockLte,
      update: mockUpdate,
    } as any);

    await recheckDomains();

    // Verify that we attempted to mark stale domains as failed
    expect(mockUpdate).toHaveBeenCalledWith({ failed: true });
    expect(mockEq).toHaveBeenCalledWith("verified", false);
    expect(mockEq).toHaveBeenCalledWith("failed", false);
  });

  it("should handle errors gracefully without throwing", async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockGt = vi.fn().mockResolvedValue({ data: null, error: new Error("DB error") });
    const mockLte = vi.fn().mockResolvedValue({ error: null });
    const mockUpdate = vi.fn().mockReturnThis();

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      gt: mockGt,
      lte: mockLte,
      update: mockUpdate,
    } as any);

    // Should not throw
    await expect(recheckDomains()).resolves.toBeUndefined();
  });

  it("should handle verifyDomain errors for individual domains without stopping", async () => {
    const mockDomains = [
      { id: "domain-1", domain: "test1.example.com", created_at: new Date().toISOString() },
      { id: "domain-2", domain: "test2.example.com", created_at: new Date().toISOString() },
    ];

    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockGt = vi.fn().mockResolvedValueOnce({ data: mockDomains, error: null });
    const mockLte = vi.fn().mockResolvedValue({ error: null });
    const mockUpdate = vi.fn().mockReturnThis();

    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      gt: mockGt,
      lte: mockLte,
      update: mockUpdate,
    } as any);

    // First domain fails, second succeeds
    vi.mocked(domains.verifyDomain)
      .mockRejectedValueOnce(new Error("DNS lookup failed"))
      .mockResolvedValueOnce({ verified: true });

    // Should not throw and should process both domains
    await expect(recheckDomains()).resolves.toBeUndefined();
    expect(domains.verifyDomain).toHaveBeenCalledTimes(2);
  });
});
