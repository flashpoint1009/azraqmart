import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bell, Code2, Database, Image as ImageIcon, KeyRound, Palette, Save, Sparkles, Upload, Users2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { UsersManager } from "@/components/UsersManager";
import { LicenseManager } from "@/components/LicenseManager";
import { DBBrowser } from "@/components/DBBrowser";
import { DemoSeeder } from "@/components/DemoSeeder";
import { DeveloperTour } from "@/components/DeveloperTour";
import { PushNotificationsPanel } from "@/components/PushNotificationsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/hooks/useAppSettings";
import { getDefaultFeatures, SYSTEM_FEATURES, type SystemFeatureKey } from "@/lib/features";

export const Route = createFileRoute("/developer")({
  head: () => ({ meta: [{ title: "إعدادات المطور" }] }),
  component: () => (
    <RoleGuard allow={["developer"]}>
      <DeveloperPage />
    </RoleGuard>
  ),
});

const FONTS = ["Cairo", "Tajawal", "IBM Plex Sans Arabic", "Almarai", "Noto Kufi Arabic"];

const ROLE_LABELS: Record<string, string> = {
  developer: "مطور",
  admin: "مدير",
  accountant: "محاسب",
  warehouse: "مخزن",
  merchant: "تاجر",
};

const ROLE_TONES: Record<string, string> = {
  developer: "bg-primary/10 text-primary border-primary/30",
  admin: "bg-accent/15 text-accent-foreground border-accent/30",
  accountant: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  warehouse: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  merchant: "bg-muted text-muted-foreground border-border",
};

function DeveloperPage() {
  const qc = useQueryClient();
  const { settings, refetch } = useAppSettings();
  const [tab, setTab] = useState("users");
  const [form, setForm] = useState({
    app_name: "",
    app_slogan: "",
    primary_color: "",
    accent_color: "",
    background_color: "",
    font_family: "Cairo",
    max_users: 10,
    max_customers: 1000,
    license_key: "",
    logo_url: "",
    features: getDefaultFeatures(),
  });

  useEffect(() => {
    if (settings) {
      setForm({
        app_name: settings.app_name ?? "",
        app_slogan: settings.app_slogan ?? "",
        primary_color: settings.primary_color ?? "",
        accent_color: settings.accent_color ?? "",
        background_color: settings.background_color ?? "",
        font_family: settings.font_family ?? "Cairo",
        max_users: settings.max_users ?? 10,
        max_customers: settings.max_customers ?? 1000,
        license_key: settings.license_key ?? "",
        logo_url: settings.logo_url ?? "",
        features: { ...getDefaultFeatures(), ...(settings.features ?? {}) },
      });
    }
  }, [settings]);

  const setFeature = (key: SystemFeatureKey, value: boolean) => {
    setForm((f) => ({ ...f, features: { ...f.features, [key]: value } }));
  };

  const usage = useQuery({
    queryKey: ["usage_counts"],
    queryFn: async () => {
      const [u, c] = await Promise.all([
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
      ]);
      return { users: u.count ?? 0, customers: c.count ?? 0 };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("لا توجد إعدادات");
      const { error } = await supabase.from("app_settings").update(form).eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات ✓");
      refetch();
      qc.invalidateQueries({ queryKey: ["app_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadLogo = async (file: File) => {
    const path = `logo-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("app-assets").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("app-assets").getPublicUrl(path);
    setForm((f) => ({ ...f, logo_url: data.publicUrl }));
    toast.success("تم رفع اللوجو — اضغط حفظ لتطبيقه");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <StaffNav />

      {/* Hero */}
      <div className="border-b border-border bg-gradient-to-l from-primary/10 via-background to-accent/5">
        <div className="mx-auto max-w-[1100px] px-4 py-6 lg:px-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5" /> لوحة المطور
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">المستخدمين والإعدادات</h1>
              <p className="text-sm text-muted-foreground mt-1">إدارة المستخدمين، الصلاحيات، وتخصيص هوية التطبيق.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DeveloperTour onSwitchTab={setTab} />
              <Button variant="hero" size="lg" className="gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="h-4 w-4" /> حفظ
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1100px] px-4 py-5 lg:px-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3 sm:grid-cols-7 h-auto p-1 mb-5 bg-surface-2 gap-1">
            <TabsTrigger value="users" className="gap-1.5 py-2.5 text-xs"><Users2 className="h-4 w-4" />المستخدمين</TabsTrigger>
            <TabsTrigger value="demo" className="gap-1.5 py-2.5 text-xs"><Sparkles className="h-4 w-4" />ديمو</TabsTrigger>
            <TabsTrigger value="licenses" className="gap-1.5 py-2.5 text-xs"><KeyRound className="h-4 w-4" />التراخيص</TabsTrigger>
            <TabsTrigger value="branding" className="gap-1.5 py-2.5 text-xs"><Palette className="h-4 w-4" />الهوية</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5 py-2.5 text-xs"><Bell className="h-4 w-4" />الإشعارات</TabsTrigger>
            <TabsTrigger value="db" className="gap-1.5 py-2.5 text-xs"><Database className="h-4 w-4" />القاعدة</TabsTrigger>
            <TabsTrigger value="system" className="gap-1.5 py-2.5 text-xs"><Activity className="h-4 w-4" />النظام</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-0 space-y-5">
            <UsersManager scope="developer" />
          </TabsContent>

          <TabsContent value="demo" className="mt-0 space-y-5">
            <DemoSeeder />
          </TabsContent>

          <TabsContent value="licenses" className="mt-0 space-y-5">
            <LicenseManager />
          </TabsContent>

          <TabsContent value="branding" className="mt-0 space-y-5">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <h3 className="font-display font-bold mb-4 inline-flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" />هوية التطبيق</h3>
              <div className="space-y-3">
                <div>
                  <Label>اسم التطبيق</Label>
                  <Input value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} />
                </div>
                <div>
                  <Label>الشعار النصي</Label>
                  <Input value={form.app_slogan} onChange={(e) => setForm({ ...form, app_slogan: e.target.value })} />
                </div>
                <div>
                  <Label>اللوجو</Label>
                  <div className="flex items-center gap-3">
                    {form.logo_url ? (
                      <img src={form.logo_url} alt="logo" className="h-16 w-16 rounded-xl border border-border object-contain bg-surface-2" />
                    ) : (
                      <div className="grid h-16 w-16 place-items-center rounded-xl border border-dashed border-border text-muted-foreground"><ImageIcon className="h-5 w-5" /></div>
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs font-bold hover:bg-primary-soft hover:text-primary transition">
                      <Upload className="h-3.5 w-3.5" /> رفع لوجو
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <h3 className="font-display font-bold mb-4 inline-flex items-center gap-2"><Palette className="h-4 w-4 text-primary" />الألوان والخط</h3>
              <div className="space-y-3">
                <ColorRow label="اللون الأساسي" value={form.primary_color} onChange={(v) => setForm({ ...form, primary_color: v })} />
                <ColorRow label="لون التمييز" value={form.accent_color} onChange={(v) => setForm({ ...form, accent_color: v })} />
                <ColorRow label="لون الخلفية" value={form.background_color} onChange={(v) => setForm({ ...form, background_color: v })} />
                <div>
                  <Label>الخط</Label>
                  <select
                    value={form.font_family}
                    onChange={(e) => setForm({ ...form, font_family: e.target.value })}
                    className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium"
                  >
                    {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <h3 className="font-display font-bold mb-4 inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />حدود الترخيص الافتراضية</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <UsageBar label="المستخدمون" used={usage.data?.users ?? 0} max={form.max_users} onMaxChange={(v) => setForm({ ...form, max_users: v })} />
                <UsageBar label="العملاء" used={usage.data?.customers ?? 0} max={form.max_customers} onMaxChange={(v) => setForm({ ...form, max_customers: v })} />
                <div>
                  <Label>مفتاح الترخيص</Label>
                  <Input value={form.license_key} onChange={(e) => setForm({ ...form, license_key: e.target.value })} placeholder="LIC-XXXX-XXXX" />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <h3 className="font-display font-bold mb-1 inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />مكونات النسخة الحالية</h3>
              <p className="mb-4 text-[11px] text-muted-foreground">أي اختيار يتشال هنا يختفي من القوائم وشاشات البيع للنسخة الحالية.</p>
              <div className="space-y-4">
                {[...new Set(SYSTEM_FEATURES.map((f) => f.group))].map((group) => (
                  <div key={group}>
                    <p className="mb-2 text-xs font-bold text-primary">{group}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {SYSTEM_FEATURES.filter((f) => f.group === group).map((feature) => {
                        const on = form.features[feature.key] !== false;
                        return (
                          <label
                            key={feature.key}
                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${on ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"}`}
                          >
                            <span>{feature.label}</span>
                            <input type="checkbox" className="h-4 w-4 accent-primary" checked={on} onChange={(e) => setFeature(feature.key, e.target.checked)} />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex justify-end">
              <Button variant="hero" size="lg" className="gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="h-4 w-4" /> حفظ الإعدادات
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-0">
            <PushNotificationsPanel />
          </TabsContent>

          <TabsContent value="db" className="mt-0">
            <DBBrowser />
          </TabsContent>

          <TabsContent value="system" className="mt-0">
            <SystemStats />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="h-11 w-11 shrink-0 rounded-lg border border-border" style={{ background: value || "transparent" }} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="oklch(0.55 0.22 260)" />
      </div>
    </div>
  );
}

function UsageBar({ label, used, max, onMaxChange }: { label: string; used: number; max: number; onMaxChange: (v: number) => void }) {
  const pct = Math.min(100, (used / Math.max(1, max)) * 100);
  const danger = pct > 85;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span className="text-xs font-bold tabular-nums" dir="ltr">{used} / {max}</span>
      </div>
      <Input type="number" value={max} onChange={(e) => onMaxChange(Number(e.target.value))} className="mt-1" />
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full transition-all ${danger ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SystemStats() {
  const { data } = useQuery({
    queryKey: ["sys_stats"],
    queryFn: async () => {
      const [orders, products, customers, lowStock, todaySales] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).lte("stock_qty", 10),
        supabase.from("orders").select("total").gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      ]);
      const today = (todaySales.data ?? []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      return {
        orders: orders.count ?? 0,
        products: products.count ?? 0,
        customers: customers.count ?? 0,
        lowStock: lowStock.count ?? 0,
        today,
      };
    },
  });

  const stats = [
    { label: "إجمالي الطلبات", value: data?.orders ?? 0, tone: "primary" },
    { label: "المنتجات", value: data?.products ?? 0, tone: "accent" },
    { label: "العملاء", value: data?.customers ?? 0, tone: "primary" },
    { label: "منتجات ناقصة", value: data?.lowStock ?? 0, danger: (data?.lowStock ?? 0) > 0, tone: "warn" },
    { label: "مبيعات اليوم", value: `${Math.round(data?.today ?? 0).toLocaleString("en")} ج.م`, tone: "accent" },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <h3 className="font-display font-bold mb-4 inline-flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />مراقبة النظام</h3>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-gradient-to-br from-surface-2 to-card p-3.5">
            <p className="text-[11px] font-bold text-muted-foreground">{s.label}</p>
            <p className={`font-display text-xl font-bold tabular-nums mt-1 ${s.danger ? "text-destructive" : "text-foreground"}`} dir="ltr">{s.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

