/**
 * Zod schema for tenant feature override insert/upsert validation.
 *
 * Used by the Super-Admin Console feature override endpoint
 * (`src/routes/api/admin/features.ts`, task 16.5) before persisting a
 * row into `tenant_features`.
 *
 * Source of truth:
 *   - Requirement 5.7 (`.kiro/specs/white-label-saas-system/requirements.md`):
 *       "IF a `tenant_features` override is created with `expires_at` set
 *       to a value not strictly greater than the current time, THEN THE
 *       System SHALL reject the override with a validation error."
 *   - Design §"Tenant Features (Overrides)" (`.kiro/specs/white-label-saas-system/design.md`):
 *       Validation rule "`expiresAt` if set must be in the future at insert time".
 *
 * The `featureKey` enum below MUST stay in sync with `FeatureKey` in
 * `./types`. A compile-time check at the bottom of this file fails the
 * build if the two unions diverge — keep both in sync when adding or
 * removing a feature module.
 *
 * Requirements: 5.7
 */

import { z } from "zod";
import type { FeatureKey } from "./types";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Validates the payload accepted by `setFeatureOverride(tenantId, key,
 * enabled, expiresAt?)` (design §"Component: Super-Admin Console").
 *
 * Validation rules:
 *   - `tenantId` is a UUID.
 *   - `featureKey` is one of the closed `FeatureKey` enum values.
 *   - `enabled` is a boolean (true = grant above plan, false = revoke
 *     below plan).
 *   - `expiresAt`, if provided, is an ISO 8601 timestamp strictly
 *     greater than the current wall-clock time. `null` / omitted means
 *     a permanent override.
 *
 * NOTE: Keep `featureKey` in sync with `FeatureKey` in `./types.ts`.
 * The `_FeatureKeyEnumMatchesType` assertion below catches mismatches
 * at compile time.
 */
export const FeatureOverrideInputSchema = z
  .object({
    tenantId: z.string().uuid(),
    featureKey: z.enum([
      "loyalty",
      "push_notifications",
      "multi_branch",
      "custom_domain",
      "mobile_app",
      "chat_widget",
      "advanced_analytics",
    ]),
    enabled: z.boolean(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.expiresAt) {
      const t = Date.parse(v.expiresAt);
      if (Number.isNaN(t) || t <= Date.now()) {
        ctx.addIssue({
          path: ["expiresAt"],
          code: z.ZodIssueCode.custom,
          message: "expiresAt must be strictly greater than the current time",
        });
      }
    }
  });

/**
 * Inferred TypeScript type for the validated input.
 */
export type FeatureOverrideInput = z.infer<typeof FeatureOverrideInputSchema>;

// ---------------------------------------------------------------------------
// Compile-time guard: keep `featureKey` enum in sync with `FeatureKey`
// ---------------------------------------------------------------------------

/**
 * Forces the `featureKey` Zod enum and the `FeatureKey` type union to
 * be identical. The tuple wrappers `[X] extends [Y]` disable
 * distributive conditional types so a single missing member is enough
 * to collapse this alias to `never` and break the build.
 *
 * If you ever add or remove a `FeatureKey`, update both this file's
 * `z.enum([...])` list and `./types.ts`'s `FeatureKey` union together.
 */
type _FeatureKeyEnumMatchesType = [FeatureKey] extends [FeatureOverrideInput["featureKey"]]
  ? [FeatureOverrideInput["featureKey"]] extends [FeatureKey]
    ? true
    : never
  : never;

// Anchor the alias to a value so unused-type linters don't strip it.
const _featureKeyEnumMatchesType: _FeatureKeyEnumMatchesType = true;
void _featureKeyEnumMatchesType;
