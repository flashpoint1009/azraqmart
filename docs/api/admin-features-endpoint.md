# Feature Override Admin Endpoint

## Overview

The feature override admin endpoint allows platform administrators to grant or revoke specific features for individual tenants, overriding the default features provided by their subscription plan.

## Endpoint

```
POST /api/admin/tenants/:id/features
```

## Authentication

Requires a valid JWT with the `role=platform_admin` claim in the `Authorization` header:

```
Authorization: Bearer <platform_admin_jwt>
```

## Path Parameters

- `id` (required): UUID of the tenant whose feature override to set

## Request Body

```json
{
  "featureKey": "mobile_app",
  "enabled": true,
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

### Fields

- `featureKey` (required): One of the following feature keys:
  - `loyalty`
  - `push_notifications`
  - `multi_branch`
  - `custom_domain`
  - `mobile_app`
  - `chat_widget`
  - `advanced_analytics`

- `enabled` (required): Boolean value
  - `true`: Grant the feature to the tenant (even if their plan doesn't include it)
  - `false`: Revoke the feature from the tenant (even if their plan includes it)

- `expiresAt` (optional): ISO 8601 timestamp
  - Must be strictly greater than the current time
  - If omitted or `null`, the override is permanent
  - When the expiration time is reached, the override is automatically ignored

## Response

### Success (200 OK)

```json
{
  "success": true
}
```

### Validation Error (400 Bad Request)

```json
{
  "error": "validation_error",
  "details": [
    {
      "path": ["expiresAt"],
      "message": "expiresAt must be strictly greater than the current time"
    }
  ]
}
```

### Authentication Errors

#### Missing or Invalid JWT (401 Unauthorized)

```json
{
  "error": "no_auth"
}
```

or

```json
{
  "error": "invalid_token"
}
```

#### Valid JWT but Not Platform Admin (403 Forbidden)

```json
{
  "error": "not_platform_admin"
}
```

### Tenant Not Found (404 Not Found)

```json
{
  "error": "tenant_not_found"
}
```

### Internal Server Error (500)

```json
{
  "error": "internal_error"
}
```

## Behavior

1. **Validation**: The request body is validated against the `FeatureOverrideInputSchema` which enforces:
   - `featureKey` must be one of the allowed feature keys
   - `enabled` must be a boolean
   - `expiresAt`, if provided, must be a valid ISO 8601 timestamp in the future

2. **Upsert**: The endpoint upserts a row in the `tenant_features` table with a composite primary key of `(tenant_id, feature_key)`. This means:
   - If no override exists for this tenant and feature, a new one is created
   - If an override already exists, it is replaced with the new values

3. **Cache Invalidation**: After a successful upsert, the cached effective-feature set for the tenant is invalidated, ensuring that the next call to `computeEnabledFeatures` sees the fresh state.

4. **Audit Logging**: The action is logged to the `platform_audit_log` table with:
   - `action`: `"feature.override.set"`
   - `actor_id`: The platform admin's user ID
   - `tenant_id`: The tenant ID
   - `payload`: The override details (featureKey, enabled, expiresAt)
   - `ip`: The source IP address

## Examples

### Grant Mobile App Feature Temporarily

```bash
curl -X POST \
  https://admin.azraqmart.app/api/admin/tenants/123e4567-e89b-12d3-a456-426614174000/features \
  -H "Authorization: Bearer <platform_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "featureKey": "mobile_app",
    "enabled": true,
    "expiresAt": "2025-12-31T23:59:59Z"
  }'
```

### Grant Custom Domain Feature Permanently

```bash
curl -X POST \
  https://admin.azraqmart.app/api/admin/tenants/123e4567-e89b-12d3-a456-426614174000/features \
  -H "Authorization: Bearer <platform_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "featureKey": "custom_domain",
    "enabled": true
  }'
```

### Revoke Loyalty Feature

```bash
curl -X POST \
  https://admin.azraqmart.app/api/admin/tenants/123e4567-e89b-12d3-a456-426614174000/features \
  -H "Authorization: Bearer <platform_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "featureKey": "loyalty",
    "enabled": false
  }'
```

## Requirements

This endpoint satisfies:
- **Requirement 10.6**: Super-Admin Console SHALL expose a `setFeatureOverride` endpoint
- **Requirement 5.7**: System SHALL reject overrides with `expires_at` not strictly greater than current time

## Related Files

- Implementation: `src/routes/api/admin/features.ts`
- Schema: `src/lib/tenancy/features-schema.ts`
- Feature evaluation: `src/lib/tenancy/features.ts`
- Admin auth: `src/server/middleware/admin-auth.ts`
- Audit logging: `src/server/middleware/audit.ts`
