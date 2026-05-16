/**
 * Server functions for tenant branding operations.
 *
 * Source of truth:
 *   - `.kiro/specs/white-label-saas-system/design.md` §"Branding and Theming"
 *   - `.kiro/specs/white-label-saas-system/requirements.md` — Requirements 3.5, 3.6, 3.7, 3.9
 *
 * This module exposes server functions for branding operations that require
 * server-side validation and database access with proper tenant scoping.
 *
 * Requirements: 3.5, 3.6, 3.7, 3.9
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withScopedSupabase } from "@/integrations/supabase/scoped-client";
import {
  BrandingInputSchema,
  type BrandingInput,
  validateLogoUrl,
  applyCopyOverrideSanitization,
  incrementVersion,
} from "./branding-schema";

/**
 * Server function to save tenant branding.
 *
 * This function:
 *   1. Validates the branding input using Zod schema (Requirement 3.5)
 *   2. Performs server-side logo URL validation (Requirement 3.6)
 *   3. Sanitizes copy overrides (Requirement 3.9)
 *   4. Increments the branding version (Requirement 3.7)
 *   5. Persists the updated branding to the database
 *
 * The function requires authentication and operates within the authenticated
 * user's tenant scope.
 */
export const saveTenantBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BrandingInputSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { userId, supabase } = context;
    
    // Get the user's tenant from their tenant roles
    // In production, this would ideally come from the request context set by the resolver
    // For now, we get it from the user's tenant roles (assuming owner role for branding edits)
    // Cast through `any` because `user_tenant_roles` is not yet in the generated Database type.
    const { data: roleData, error: roleError } = await (supabase as any)
      .from("user_tenant_roles")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .in("role", ["owner", "admin"])
      .limit(1)
      .single();
    
    if (roleError || !roleData) {
      throw new Error("User has no tenant association with sufficient permissions");
    }
    
    const tenantId = (roleData as { tenant_id: string }).tenant_id;

    // Server-side logo URL validation (Requirement 3.6)
    const logoValidation = await validateLogoUrl(data.logoUrl, tenantId);
    if (!logoValidation.ok) {
      throw new Error(
        logoValidation.reason === "invalid_url"
          ? "Invalid logo URL format"
          : "Logo must be hosted on the platform CDN or a verified custom domain"
      );
    }

    // Sanitize copy overrides (Requirement 3.9)
    const sanitizedCopyOverrides = applyCopyOverrideSanitization(data.copyOverrides);

    // Get current version and increment it (Requirement 3.7)
    const currentBranding = await withScopedSupabase(tenantId, async (scoped) => {
      const { data: brandingData, error } = await (scoped as any)
        .from("tenant_branding")
        .select("version")
        .eq("tenant_id", tenantId)
        .single();
      
      if (error) throw error;
      return brandingData as { version: number };
    });

    const newVersion = incrementVersion(currentBranding.version);

    // Persist to database
    const result = await withScopedSupabase(tenantId, async (scoped) => {
      const { data: updatedData, error } = await (scoped as any)
        .from("tenant_branding")
        .update({
          logo_url: data.logoUrl,
          primary_color: data.primaryColor,
          accent_color: data.accentColor,
          font_family: data.fontFamily,
          theme_tokens: data.themeTokens,
          copy_overrides: sanitizedCopyOverrides,
          version: newVersion,
        })
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (error) throw error;
      return updatedData;
    });

    return result;
  });
