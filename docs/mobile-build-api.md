# Mobile Build Trigger API

## Overview

The mobile build trigger endpoint allows platform administrators to trigger per-tenant mobile app builds via the GitHub Actions workflow.

**Endpoint:** `POST /api/admin/tenants/:tenantId/mobile-build`

**Requirements:** 10.5, 9.4, 9.5

## Prerequisites

Before using this endpoint, ensure the following environment variables are configured:

```bash
GITHUB_TOKEN=your-github-personal-access-token
GITHUB_OWNER=azraqmart
GITHUB_REPO=azraqmart
GITHUB_REF=main
```

The `GITHUB_TOKEN` must have the `repo` scope to dispatch workflows.

## Request

### URL Parameters

- `tenantId` (string, required): The UUID of the tenant for which to trigger the build.

### Request Body

```json
{
  "target": "android" | "ios"
}
```

- `target` (string, required): The mobile platform to build for. Must be either `"android"` or `"ios"`.

### Example Request

```bash
curl -X POST https://admin.azraqmart.app/api/admin/tenants/123e4567-e89b-12d3-a456-426614174000/mobile-build \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"target": "android"}'
```

## Response

### Success (200 OK)

```json
{
  "runId": "1234567890"
}
```

- `runId` (string): The GitHub Actions run ID. Can be used to track the build progress at:
  `https://github.com/{owner}/{repo}/actions/runs/{runId}`

### Error Responses

#### 400 Bad Request - Invalid JSON

```json
{
  "error": "invalid_json"
}
```

#### 400 Bad Request - Invalid Target

```json
{
  "error": "invalid_target",
  "message": "target must be 'android' or 'ios'"
}
```

#### 402 Payment Required - Feature Not Enabled

```json
{
  "error": "feature_not_enabled",
  "message": "The mobile_app feature is not enabled for this tenant"
}
```

This error is returned when the tenant's plan does not include the `mobile_app` feature (Requirement 9.5).

#### 403 Forbidden - Unauthorized

Returned when the caller does not have the `platform_admin` role.

#### 404 Not Found - Tenant Not Found

```json
{
  "error": "tenant_not_found"
}
```

#### 500 Internal Server Error - Configuration Error

```json
{
  "error": "configuration_error",
  "message": "GitHub token is not configured"
}
```

#### 500 Internal Server Error - Workflow Dispatch Failed

```json
{
  "error": "workflow_dispatch_failed",
  "message": "GitHub API workflow dispatch failed: 404 Not Found - ..."
}
```

## Implementation Details

### Feature Gating

The endpoint verifies that the tenant has the `mobile_app` feature enabled before dispatching the workflow. This is done by:

1. Loading the tenant's effective feature set via `computeEnabledFeatures(tenantId)`
2. Checking if `features.enabled.has("mobile_app")` returns `true`
3. Returning 402 Payment Required if the feature is not enabled

### GitHub Actions Workflow

The endpoint dispatches the `build-tenant-app.yml` workflow with the following inputs:

- `tenant_slug`: The tenant's slug (kebab-case identifier)
- `target`: The mobile platform (`android` or `ios`)

The workflow:

1. Fetches the tenant's branding from Supabase
2. Generates icons and splash screens from the tenant's logo
3. Builds the web bundle with tenant-specific environment variables
4. Runs Capacitor sync
5. Builds and signs the mobile app (APK for Android, IPA for iOS)
6. Uploads the signed artifact to the platform CDN

### Run ID Retrieval

The GitHub API's workflow dispatch endpoint returns 204 No Content on success without providing the run ID. To work around this limitation, the implementation:

1. Dispatches the workflow
2. Waits 2 seconds for the workflow to start
3. Queries the workflow runs list endpoint to get the most recent run
4. Returns the run ID from the most recent run

This approach has a race condition if multiple builds are triggered simultaneously. A more robust implementation would use a different strategy (e.g., returning a synthetic ID and letting the caller poll for the actual run ID).

## Related Files

- **Endpoint Implementation:** `src/routes/api/admin/tenants.$tenantId.mobile-build.ts`
- **GitHub Workflow:** `.github/workflows/build-tenant-app.yml`
- **Feature Gate:** `src/lib/tenancy/features.ts`
- **Tests:** `tests/lib/admin/mobile-build.test.ts`

## Security Considerations

1. **Authentication:** The endpoint should be protected by the admin authentication middleware (task 16.1) to ensure only platform administrators can trigger builds.

2. **MFA Requirement:** The endpoint should require MFA verification (task 16.2) before executing the workflow dispatch.

3. **Audit Logging:** All build triggers should be logged to the `platform_audit_log` table (task 16.3) with the actor ID, tenant ID, and target platform.

4. **Rate Limiting:** Consider implementing rate limiting to prevent abuse (e.g., max 10 builds per tenant per hour).

5. **GitHub Token Security:** The `GITHUB_TOKEN` should be stored securely (e.g., in Cloudflare Workers secrets) and never exposed to the client.

## Future Improvements

1. **Webhook Notifications:** Add a webhook endpoint to receive build completion notifications from GitHub Actions.

2. **Build Status Tracking:** Store build status in the database and provide an endpoint to query build history.

3. **Build Artifacts Management:** Implement automatic cleanup of old build artifacts from the CDN.

4. **Build Queue:** Implement a queue system to handle multiple concurrent build requests gracefully.

5. **Build Customization:** Allow tenants to customize build parameters (e.g., app version, build number, signing configuration).
