/**
 * Admin Branding Editor — per-tenant white-label customization.
 *
 * Allows developers/admins to select a tenant and edit its branding
 * (logo, colors, fonts, theme tokens, copy overrides) with a live preview.
 *
 * Does NOT use TenantProvider/useTenant — reads/writes directly to
 * `tenant_branding` table via the supabase client.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Plus, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { ImageUpload } from "@/components/ImageUpload";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/branding")({
  head: () => ({ meta: [{ title: "تخصيص العلامة التجارية — Admin" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer"]}>
      <BrandingPage />
    </RoleGuard>
  ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrandingFormValues {
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  themeTokens: { key: string; value: string }[];
  copyOverrides: { key: string; value: string }[];
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
}

interface BrandingRow {
  tenant_id: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  font_family: string;
  theme_tokens: Record<string, string>;
  copy_overrides: Record<string, string>;
  version: number;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function BrandingPage() {
  const queryClient = useQueryClient();
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  // Fetch all tenants for the dropdown
  const tenantsQuery = useQuery({
    queryKey: ["branding-tenants"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenants")
        .select("id, slug, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TenantRow[];
    },
  });

  // Fetch branding for selected tenant
  const brandingQuery = useQuery({
    queryKey: ["tenant-branding", selectedTenantId],
    queryFn: async () => {
      if (!selectedTenantId) return null;
      const { data, error } = await (supabase as any)
        .from("tenant_branding")
        .select("*")
        .eq("tenant_id", selectedTenantId)
        .maybeSingle();
      if (error) throw error;
      return data as BrandingRow | null;
    },
    enabled: !!selectedTenantId,
  });

  // Form setup
  const form = useForm<BrandingFormValues>({
    defaultValues: {
      logoUrl: "",
      primaryColor: "#000000",
      accentColor: "#666666",
      fontFamily: "sans-serif",
      themeTokens: [],
      copyOverrides: [],
    },
  });

  const themeTokensArray = useFieldArray({
    control: form.control,
    name: "themeTokens",
  });

  const copyOverridesArray = useFieldArray({
    control: form.control,
    name: "copyOverrides",
  });

  // Reset form when branding data loads
  useEffect(() => {
    if (brandingQuery.data) {
      const b = brandingQuery.data;
      const tokens = Object.entries(b.theme_tokens || {}).map(([key, value]) => ({
        key,
        value: value as string,
      }));
      const copies = Object.entries(b.copy_overrides || {}).map(([key, value]) => ({
        key,
        value: value as string,
      }));
      form.reset({
        logoUrl: b.logo_url || "",
        primaryColor: b.primary_color || "#000000",
        accentColor: b.accent_color || "#666666",
        fontFamily: b.font_family || "sans-serif",
        themeTokens: tokens,
        copyOverrides: copies,
      });
    } else if (brandingQuery.isFetched && !brandingQuery.data) {
      form.reset({
        logoUrl: "",
        primaryColor: "#000000",
        accentColor: "#666666",
        fontFamily: "sans-serif",
        themeTokens: [],
        copyOverrides: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandingQuery.data, brandingQuery.isFetched]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (values: BrandingFormValues) => {
      if (!selectedTenantId) throw new Error("لم يتم اختيار مستأجر");

      const themeTokens: Record<string, string> = {};
      for (const t of values.themeTokens) {
        if (t.key.trim()) themeTokens[t.key.trim()] = t.value;
      }

      const copyOverrides: Record<string, string> = {};
      for (const c of values.copyOverrides) {
        if (c.key.trim()) copyOverrides[c.key.trim()] = c.value;
      }

      const currentVersion = brandingQuery.data?.version ?? 0;

      const payload = {
        tenant_id: selectedTenantId,
        logo_url: values.logoUrl || null,
        primary_color: values.primaryColor,
        accent_color: values.accentColor,
        font_family: values.fontFamily,
        theme_tokens: themeTokens,
        copy_overrides: copyOverrides,
        version: currentVersion + 1,
      };

      const { error } = await (supabase as any)
        .from("tenant_branding")
        .upsert(payload, { onConflict: "tenant_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ العلامة التجارية بنجاح");
      queryClient.invalidateQueries({ queryKey: ["tenant-branding", selectedTenantId] });
    },
    onError: (e: Error) => {
      toast.error(`فشل الحفظ: ${e.message}`);
    },
  });

  const onSubmit = form.handleSubmit((values) => saveMutation.mutate(values));

  const watchedValues = form.watch();

  return (
    <div className="min-h-screen bg-background pb-24" dir="rtl">
      <AppHeader />
      <StaffNav />

      {/* Page header */}
      <div className="border-b border-border bg-gradient-to-l from-accent/10 via-background to-primary/5">
        <div className="mx-auto max-w-[1100px] px-4 py-6 lg:px-6">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" /> تخصيص العلامة
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">
            محرر العلامة التجارية
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تخصيص الشعار والألوان والخطوط لكل مستأجر.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-[1100px] px-4 py-5 lg:px-6">
        {/* Tenant selector */}
        <Card className="p-4 mb-5">
          <Label className="text-sm font-bold mb-2 block">اختر المستأجر</Label>
          <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder="اختر مستأجر..." />
            </SelectTrigger>
            <SelectContent>
              {tenantsQuery.data?.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        {selectedTenantId && brandingQuery.isLoading && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            جارٍ التحميل…
          </p>
        )}

        {selectedTenantId && !brandingQuery.isLoading && (
          <form onSubmit={onSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Editor panels */}
              <div className="lg:col-span-2 space-y-5">
                {/* Logo */}
                <Card className="p-4">
                  <h2 className="text-sm font-bold mb-3">الشعار</h2>
                  <Controller
                    control={form.control}
                    name="logoUrl"
                    render={({ field }) => (
                      <ImageUpload
                        value={field.value}
                        onChange={field.onChange}
                        folder="branding"
                        label="شعار المستأجر"
                      />
                    )}
                  />
                </Card>

                {/* Colors */}
                <Card className="p-4">
                  <h2 className="text-sm font-bold mb-3">الألوان</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Primary color */}
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground mb-1.5 block">
                        اللون الأساسي
                      </Label>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-9 w-9 rounded-md border border-border shrink-0"
                          style={{ backgroundColor: watchedValues.primaryColor }}
                        />
                        <Input
                          {...form.register("primaryColor")}
                          placeholder="#000000"
                          className="font-mono text-sm"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    {/* Accent color */}
                    <div>
                      <Label className="text-xs font-bold text-muted-foreground mb-1.5 block">
                        اللون الثانوي
                      </Label>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-9 w-9 rounded-md border border-border shrink-0"
                          style={{ backgroundColor: watchedValues.accentColor }}
                        />
                        <Input
                          {...form.register("accentColor")}
                          placeholder="#666666"
                          className="font-mono text-sm"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Font family */}
                <Card className="p-4">
                  <h2 className="text-sm font-bold mb-3">الخط</h2>
                  <Label className="text-xs font-bold text-muted-foreground mb-1.5 block">
                    عائلة الخط
                  </Label>
                  <Input
                    {...form.register("fontFamily")}
                    placeholder="sans-serif"
                    className="max-w-sm"
                    dir="ltr"
                  />
                </Card>

                {/* Theme tokens */}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold">متغيرات CSS مخصصة</h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => themeTokensArray.append({ key: "", value: "" })}
                    >
                      <Plus className="h-3.5 w-3.5 me-1" />
                      إضافة
                    </Button>
                  </div>
                  {themeTokensArray.fields.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      لا توجد متغيرات مخصصة. اضغط "إضافة" لإنشاء واحدة.
                    </p>
                  )}
                  <div className="space-y-2">
                    {themeTokensArray.fields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-2">
                        <Input
                          {...form.register(`themeTokens.${index}.key`)}
                          placeholder="--color-surface"
                          className="flex-1 font-mono text-xs"
                          dir="ltr"
                        />
                        <Input
                          {...form.register(`themeTokens.${index}.value`)}
                          placeholder="#ffffff"
                          className="flex-1 font-mono text-xs"
                          dir="ltr"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => themeTokensArray.remove(index)}
                          className="text-destructive shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Copy overrides */}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold">تخصيص النصوص</h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyOverridesArray.append({ key: "", value: "" })}
                    >
                      <Plus className="h-3.5 w-3.5 me-1" />
                      إضافة
                    </Button>
                  </div>
                  {copyOverridesArray.fields.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      لا توجد نصوص مخصصة. اضغط "إضافة" لإنشاء واحدة.
                    </p>
                  )}
                  <div className="space-y-2">
                    {copyOverridesArray.fields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-2">
                        <Input
                          {...form.register(`copyOverrides.${index}.key`)}
                          placeholder="app_name"
                          className="flex-1 font-mono text-xs"
                          dir="ltr"
                        />
                        <Input
                          {...form.register(`copyOverrides.${index}.value`)}
                          placeholder="اسم التطبيق"
                          className="flex-1 text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyOverridesArray.remove(index)}
                          className="text-destructive shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Save button */}
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "جارٍ الحفظ…" : "حفظ التغييرات"}
                  </Button>
                  {brandingQuery.data && (
                    <Badge variant="secondary">
                      الإصدار: {brandingQuery.data.version}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Live preview panel */}
              <div className="lg:col-span-1">
                <div className="sticky top-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-sm font-bold">معاينة مباشرة</h2>
                    </div>
                    <LivePreview
                      logoUrl={watchedValues.logoUrl}
                      primaryColor={watchedValues.primaryColor}
                      accentColor={watchedValues.accentColor}
                      fontFamily={watchedValues.fontFamily}
                      themeTokens={watchedValues.themeTokens}
                    />
                  </Card>
                </div>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Preview component
// ---------------------------------------------------------------------------

interface LivePreviewProps {
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  themeTokens: { key: string; value: string }[];
}

function LivePreview({
  logoUrl,
  primaryColor,
  accentColor,
  fontFamily,
  themeTokens,
}: LivePreviewProps) {
  const cssVars: Record<string, string> = {};
  for (const t of themeTokens) {
    if (t.key.trim()) cssVars[t.key.trim()] = t.value;
  }

  return (
    <div
      className="rounded-lg border border-border overflow-hidden"
      style={{ fontFamily, ...cssVars }}
    >
      {/* Mock header */}
      <div
        className="px-3 py-2.5 flex items-center gap-2"
        style={{ backgroundColor: primaryColor }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo"
            className="h-7 w-7 rounded object-cover"
          />
        ) : (
          <div className="h-7 w-7 rounded bg-white/20" />
        )}
        <span className="text-xs font-bold text-white truncate">
          اسم المتجر
        </span>
      </div>

      {/* Mock content */}
      <div className="p-3 space-y-2 bg-white">
        <div className="flex gap-2">
          <div
            className="h-8 w-8 rounded"
            style={{ backgroundColor: accentColor }}
          />
          <div className="flex-1 space-y-1">
            <div className="h-2.5 w-3/4 rounded bg-gray-200" />
            <div className="h-2 w-1/2 rounded bg-gray-100" />
          </div>
        </div>

        <div className="flex gap-2">
          <div
            className="h-8 w-8 rounded"
            style={{ backgroundColor: `${accentColor}80` }}
          />
          <div className="flex-1 space-y-1">
            <div className="h-2.5 w-2/3 rounded bg-gray-200" />
            <div className="h-2 w-1/3 rounded bg-gray-100" />
          </div>
        </div>

        {/* Mock button */}
        <button
          type="button"
          className="w-full rounded-md px-3 py-1.5 text-[10px] font-bold text-white mt-2"
          style={{ backgroundColor: primaryColor }}
        >
          زر تجريبي
        </button>

        {/* Accent badge */}
        <div className="flex justify-center pt-1">
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: accentColor }}
          >
            عرض خاص
          </span>
        </div>
      </div>

      {/* Font preview */}
      <div className="px-3 py-2 border-t border-border bg-gray-50">
        <p className="text-[10px] text-muted-foreground">
          الخط: <span className="font-bold" dir="ltr">{fontFamily}</span>
        </p>
      </div>
    </div>
  );
}
