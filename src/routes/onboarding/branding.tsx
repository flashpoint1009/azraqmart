/**
 * Tenant branding editor route.
 *
 * Source of truth:
 *   - `.kiro/specs/white-label-saas-system/design.md` §"Branding and Theming"
 *   - `.kiro/specs/white-label-saas-system/requirements.md` — Requirements 3.5, 3.6, 3.7, 3.9
 *   - `.kiro/specs/white-label-saas-system/tasks.md` — Task 8.6
 *
 * This route provides a form for tenant owners to configure their storefront's
 * branding: logo, primary/accent colors, font family, theme tokens, and copy
 * overrides. On submit, the form:
 *   1. Validates inputs using the Zod schema from `branding-schema.ts` (task 8.2)
 *   2. Performs server-side logo URL validation (Requirement 3.6)
 *   3. Sanitizes copy overrides (Requirement 3.9)
 *   4. Increments `tenant_branding.version` (Requirement 3.7)
 *   5. Persists the updated branding record
 *
 * The form uses react-hook-form + Zod for client-side validation and the
 * existing `ImageUpload` component for logo uploads to the platform CDN.
 *
 * Requirements: 3.5, 3.6, 3.7, 3.9
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenancy/context";
import {
  BrandingInputSchema,
  type BrandingInput,
} from "@/lib/tenancy/branding-schema";
import { saveTenantBranding } from "@/lib/tenancy/branding.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ImageUpload } from "@/components/ImageUpload";
import { Loader2, Palette, Type, Image as ImageIcon } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/onboarding/branding")({
  component: BrandingEditorPage,
});

function BrandingEditorPage() {
  const { tenant, branding } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [themeTokenKey, setThemeTokenKey] = useState("");
  const [themeTokenValue, setThemeTokenValue] = useState("");
  const [copyOverrideKey, setCopyOverrideKey] = useState("");
  const [copyOverrideValue, setCopyOverrideValue] = useState("");

  // Initialize form with current branding values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm({
    resolver: zodResolver(BrandingInputSchema) as any,
    defaultValues: {
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
      fontFamily: branding.fontFamily,
      themeTokens: branding.themeTokens,
      copyOverrides: branding.copyOverrides,
    },
  });

  // Mutation to save branding
  const saveBrandingMutation = useMutation({
    mutationFn: async (input: BrandingInput) => {
      // Call the server function which handles all validation and persistence
      return saveTenantBranding({ data: input });
    },
    onSuccess: () => {
      toast.success("Branding updated successfully");
      // Invalidate tenant context to refresh branding
      queryClient.invalidateQueries({ queryKey: ["tenant", tenant.id] });
      // Navigate to dashboard or next onboarding step
      navigate({ to: "/" });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update branding");
    },
  });

  const onSubmit = (data: any) => {
    saveBrandingMutation.mutate(data as BrandingInput);
  };

  // Helper to add theme token
  const addThemeToken = () => {
    if (!themeTokenKey || !themeTokenValue) {
      toast.error("Please enter both key and value for theme token");
      return;
    }
    const currentTokens = form.getValues("themeTokens");
    form.setValue("themeTokens", {
      ...currentTokens,
      [themeTokenKey]: themeTokenValue,
    });
    setThemeTokenKey("");
    setThemeTokenValue("");
  };

  // Helper to remove theme token
  const removeThemeToken = (key: string) => {
    const currentTokens = form.getValues("themeTokens");
    const { [key]: _, ...rest } = currentTokens;
    form.setValue("themeTokens", rest);
  };

  // Helper to add copy override
  const addCopyOverride = () => {
    if (!copyOverrideKey || !copyOverrideValue) {
      toast.error("Please enter both key and value for copy override");
      return;
    }
    const currentOverrides = form.getValues("copyOverrides");
    form.setValue("copyOverrides", {
      ...currentOverrides,
      [copyOverrideKey]: copyOverrideValue,
    });
    setCopyOverrideKey("");
    setCopyOverrideValue("");
  };

  // Helper to remove copy override
  const removeCopyOverride = (key: string) => {
    const currentOverrides = form.getValues("copyOverrides");
    const { [key]: _, ...rest } = currentOverrides;
    form.setValue("copyOverrides", rest);
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Customize Your Branding</h1>
        <p className="text-muted-foreground">
          Configure your storefront's logo, colors, fonts, and copy to match your brand identity.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Logo Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Logo
              </CardTitle>
              <CardDescription>
                Upload your brand logo. It will be displayed in the header of your storefront.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="logoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <ImageUpload
                        value={field.value || ""}
                        onChange={field.onChange}
                        folder="tenant-logos"
                        label="Logo"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Colors
              </CardTitle>
              <CardDescription>
                Choose your brand's primary and accent colors. Use 6-digit hex format (e.g., #FF5733).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="primaryColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Color</FormLabel>
                    <FormControl>
                      <div className="flex gap-2 items-center">
                        <Input
                          {...field}
                          placeholder="#FF5733"
                          className="font-mono"
                        />
                        <div
                          className="h-10 w-10 rounded border border-border shrink-0"
                          style={{ backgroundColor: field.value }}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Main brand color used for buttons, links, and highlights
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accentColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Accent Color</FormLabel>
                    <FormControl>
                      <div className="flex gap-2 items-center">
                        <Input
                          {...field}
                          placeholder="#33C3FF"
                          className="font-mono"
                        />
                        <div
                          className="h-10 w-10 rounded border border-border shrink-0"
                          style={{ backgroundColor: field.value }}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Secondary color for accents and complementary elements
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Font Family */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Type className="h-5 w-5" />
                Typography
              </CardTitle>
              <CardDescription>
                Specify the font family for your storefront text.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="fontFamily"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Font Family</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Inter, system-ui, sans-serif"
                      />
                    </FormControl>
                    <FormDescription>
                      CSS font-family value (e.g., "Inter, sans-serif")
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Theme Tokens */}
          <Card>
            <CardHeader>
              <CardTitle>Advanced Theme Tokens</CardTitle>
              <CardDescription>
                Add custom CSS variables for advanced theming. Keys must start with "--".
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="--my-custom-color"
                  value={themeTokenKey}
                  onChange={(e) => setThemeTokenKey(e.target.value)}
                  className="font-mono"
                />
                <Input
                  placeholder="Value"
                  value={themeTokenValue}
                  onChange={(e) => setThemeTokenValue(e.target.value)}
                />
                <Button type="button" onClick={addThemeToken} variant="outline">
                  Add
                </Button>
              </div>

              {Object.entries(form.watch("themeTokens")).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(form.watch("themeTokens")).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-2 bg-muted rounded"
                    >
                      <code className="text-sm">
                        {key}: {value}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeThemeToken(key)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Copy Overrides */}
          <Card>
            <CardHeader>
              <CardTitle>Copy Overrides</CardTitle>
              <CardDescription>
                Override default text strings with your own copy. HTML will be stripped for security.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="i18n key (e.g., hero.title)"
                  value={copyOverrideKey}
                  onChange={(e) => setCopyOverrideKey(e.target.value)}
                />
                <Input
                  placeholder="Custom text"
                  value={copyOverrideValue}
                  onChange={(e) => setCopyOverrideValue(e.target.value)}
                />
                <Button type="button" onClick={addCopyOverride} variant="outline">
                  Add
                </Button>
              </div>

              {Object.entries(form.watch("copyOverrides")).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(form.watch("copyOverrides")).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-2 bg-muted rounded"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{key}</div>
                        <div className="text-sm text-muted-foreground truncate">{value}</div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCopyOverride(key)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/" })}
              disabled={saveBrandingMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveBrandingMutation.isPending}>
              {saveBrandingMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Branding
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
