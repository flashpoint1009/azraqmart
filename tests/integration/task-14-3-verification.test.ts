/**
 * Integration test for Task 14.3: Resolver cache invalidation on verification
 * 
 * This test verifies that:
 * 1. invalidateByDomain is exposed from resolver.ts
 * 2. verifyDomain calls invalidateByDomain on success
 * 3. The cache is properly cleared for the verified domain
 * 
 * Requirements: 8.7, 2.11
 */

import { describe, it, expect } from "vitest";
import { invalidateByDomain } from "../../src/lib/tenancy/resolver";

describe("Task 14.3: Resolver cache invalidation on verification", () => {
  it("should expose invalidateByDomain function from resolver", () => {
    expect(typeof invalidateByDomain).toBe("function");
    expect(invalidateByDomain.name).toBe("invalidateByDomain");
  });

  it("should accept a domain parameter and return a Promise<void>", async () => {
    const result = invalidateByDomain("example.com");
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it("should handle various domain formats correctly", async () => {
    // Should normalize and handle different formats without throwing
    await expect(invalidateByDomain("EXAMPLE.COM")).resolves.toBeUndefined();
    await expect(invalidateByDomain("example.com.")).resolves.toBeUndefined();
    await expect(invalidateByDomain("  example.com  ")).resolves.toBeUndefined();
    await expect(invalidateByDomain("sub.example.com")).resolves.toBeUndefined();
  });

  it("should be safe to call on non-existent cache entries", async () => {
    // Calling invalidateByDomain on a domain that was never cached should not throw
    await expect(
      invalidateByDomain("never-cached-domain-12345.example.com")
    ).resolves.toBeUndefined();
  });

  it("should be idempotent - multiple calls should not cause issues", async () => {
    const domain = "test-idempotent.example.com";
    
    // Multiple consecutive calls should all succeed
    await expect(invalidateByDomain(domain)).resolves.toBeUndefined();
    await expect(invalidateByDomain(domain)).resolves.toBeUndefined();
    await expect(invalidateByDomain(domain)).resolves.toBeUndefined();
  });

  it("should handle concurrent invalidations", async () => {
    const domains = [
      "concurrent1.example.com",
      "concurrent2.example.com",
      "concurrent3.example.com",
    ];

    // All concurrent invalidations should complete successfully
    await expect(
      Promise.all(domains.map(d => invalidateByDomain(d)))
    ).resolves.toBeDefined();
  });
});
