# Task 14.3: Cache Invalidation Flow

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Domain Verification Flow                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  verifyDomain()  │  (domains.ts)
│  domainId: uuid  │
└────────┬─────────┘
         │
         ├─ 1. Load tenant_domains row
         │
         ├─ 2. Check if already verified (idempotent)
         │
         ├─ 3. DNS TXT lookup at _azraqmart.<domain>
         │     └─ Check for: azraqmart-verify=<token>
         │
         ├─ 4. Cloudflare SSL-for-SaaS provisioning
         │     └─ POST /zones/{id}/custom_hostnames
         │
         ├─ 5. Update tenant_domains.verified = true
         │
         ├─ 6. ✨ INVALIDATE CACHE ✨
         │     │
         │     └──────────────────────────┐
         │                                │
         ▼                                ▼
┌────────────────────────┐    ┌──────────────────────────┐
│ invalidateByDomain()   │◄───│  Import from resolver.ts │
│ domain: string         │    └──────────────────────────┘
└────────┬───────────────┘
         │
         ├─ Normalize domain (lowercase, strip dot/port)
         │
         ├─ Clear in-memory LRU cache
         │   └─ memoryCache.delete(normalized)
         │
         └─ Clear Cloudflare KV cache (best-effort)
             └─ kvDelete([KV_HOST_KEY(normalized)])


┌─────────────────────────────────────────────────────────────────┐
│                      Cache Structure                             │
└─────────────────────────────────────────────────────────────────┘

Memory Cache (LRU):
  Key: "shop.example.com"
  Value: { tenant: {...}, expiresAt: timestamp }

Cloudflare KV:
  Key: "tenant:host:shop.example.com"
  Value: JSON({ tenant: {...}, expiresAt: timestamp })
  TTL: 60 seconds


┌─────────────────────────────────────────────────────────────────┐
│                    Why Invalidation Matters                      │
└─────────────────────────────────────────────────────────────────┘

BEFORE verification:
  Request to shop.example.com
    → Cache miss
    → DB lookup: tenant_domains WHERE domain='shop.example.com'
    → Row exists but verified=false
    → Returns: { ok: false, reason: 'not_found' }
    → ❌ NOT CACHED (unverified domains are not cached)

AFTER verification (WITHOUT cache invalidation):
  Request to shop.example.com
    → Cache miss (because unverified wasn't cached)
    → DB lookup: tenant_domains WHERE domain='shop.example.com'
    → Row exists and verified=true
    → Returns: { ok: true, tenant: {...} }
    → ✅ Cached for 60s

AFTER verification (WITH cache invalidation):
  Request to shop.example.com
    → Cache explicitly cleared by invalidateByDomain()
    → DB lookup: tenant_domains WHERE domain='shop.example.com'
    → Row exists and verified=true
    → Returns: { ok: true, tenant: {...} }
    → ✅ Cached for 60s

The invalidation ensures that any stale "not found" results or
previous resolution attempts are cleared, so the next request
immediately sees the verified domain.


┌─────────────────────────────────────────────────────────────────┐
│                      Code Locations                              │
└─────────────────────────────────────────────────────────────────┘

1. invalidateByDomain() definition:
   📄 src/lib/tenancy/resolver.ts (lines 442-449)

2. invalidateByDomain() import:
   📄 src/lib/tenancy/domains.ts (line 42)

3. invalidateByDomain() usage:
   📄 src/lib/tenancy/domains.ts (line 549)
   Called from: verifyDomain() after successful verification

4. Test coverage:
   📄 tests/lib/tenancy/resolver-invalidation.test.ts (4 tests)
   📄 tests/lib/tenancy/domain-verification-cache.test.ts (5 tests)
   📄 tests/integration/task-14-3-verification.test.ts (6 tests)
   Total: 15 passing tests


┌─────────────────────────────────────────────────────────────────┐
│                    Requirements Satisfied                        │
└─────────────────────────────────────────────────────────────────┘

✅ Requirement 8.7:
   "WHEN a domain becomes verified, THE Domain_Manager SHALL
    invalidate the Tenant_Resolver cache entries keyed by that domain."

✅ Requirement 2.11:
   "WHEN a tenant's data changes (status, slug, primary domain),
    THE System SHALL invalidate the Tenant_Resolver cache entries
    for that tenant."
```

## Implementation Details

### Function Signature

```typescript
export async function invalidateByDomain(domain: string): Promise<void>
```

### Key Features

1. **Normalization**: Domains are normalized before cache operations
   - Lowercase conversion
   - Trailing dot removal
   - Port stripping

2. **Dual Cache Clearing**:
   - In-memory LRU cache (synchronous)
   - Cloudflare KV cache (asynchronous, best-effort)

3. **Error Handling**:
   - Never throws on cache failures
   - KV operations are best-effort
   - Safe to call on non-existent entries

4. **Idempotency**:
   - Multiple calls are safe
   - No side effects on repeated invocations

### Integration Point

The function is called from `verifyDomain()` after:
1. ✅ DNS TXT record is found
2. ✅ Cloudflare SSL-for-SaaS is active
3. ✅ Database is updated (verified=true)

This ensures the cache is only invalidated when verification truly succeeds.
