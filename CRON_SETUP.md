# Cloudflare Workers Cron Setup

## Domain Re-check Cron Worker

The domain re-check cron worker has been implemented and wired up to the Cloudflare Workers scheduled handler in `src/server.ts`. However, the cron trigger needs to be configured in `wrangler.jsonc`.

### Required Configuration

Add the following to your `wrangler.jsonc` file:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "azraqmart",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server.ts",
  "observability": {
    "enabled": true
  },
  "triggers": {
    "crons": ["*/10 * * * *"]
  }
}
```

The `"*/10 * * * *"` cron expression means the worker will run every 10 minutes, as specified in Requirement 8.9.

### What the Cron Worker Does

The domain re-check worker (`recheckDomains()` in `src/server/cron/domain-recheck.ts`):

1. **Re-checks recent pending domains**: For every `tenant_domains` row that is:
   - Not yet verified (`verified=false`)
   - Not marked as failed (`failed=false`)
   - Created within the last 24 hours
   
   The worker calls `verifyDomain()` to check if the DNS TXT record and Cloudflare SSL-for-SaaS hostname are now active.

2. **Marks stale domains as failed**: For every `tenant_domains` row that is:
   - Not yet verified (`verified=false`)
   - Not marked as failed (`failed=false`)
   - Created more than 24 hours ago
   
   The worker marks `failed=true` so the tenant onboarding UI can surface the failure.

### Testing

Unit tests are available in `tests/server/cron/domain-recheck.test.ts`. Run them with:

```bash
npm test -- tests/server/cron/domain-recheck.test.ts
```

### Manual Invocation

For testing or manual domain verification, you can invoke the cron worker directly:

```typescript
import { recheckDomains } from "./src/server/cron/domain-recheck";

await recheckDomains();
```

### Requirements

This implementation satisfies:
- **Requirement 8.9**: "WHILE a custom domain remains unverified, THE System SHALL re-check DNS at most every 10 minutes for up to 24 hours, after which IF still unverified THEN THE Domain_Manager SHALL mark the domain `failed`."

### Deployment

When deploying to Cloudflare Workers:

1. Ensure `wrangler.jsonc` has the `triggers.crons` configuration
2. Deploy with `npm run deploy` or `wrangler deploy`
3. The cron trigger will be automatically registered with Cloudflare
4. Check the Cloudflare dashboard under Workers > Triggers > Cron Triggers to verify it's active

### Monitoring

The cron worker logs its activity:
- `[cron] domain-recheck triggered at <timestamp>` - when the cron starts
- `[cron] domain-recheck completed successfully` - when it finishes without errors
- `[cron] domain-recheck failed <error>` - if an error occurs
- `[domain-recheck] verified <domain>` - when a domain is successfully verified
- `[domain-recheck] error verifying <domain>` - if verification fails for a specific domain

Check your Cloudflare Workers logs to monitor cron execution.
