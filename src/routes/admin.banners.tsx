import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageUpload } from "@/components/ImageUpload";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { usePermissions } from "@/hooks/usePermissions";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/banners")({
  head: () => ({
    meta: [{ title: "إدارة البانرز — أزرق ماركت" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: BannersPage,
});

const HOME_KEYS = [
  { key: "hero", label: "بانر الترحيب", note: "العنوان يدعم {name} لاسم العميل تلقائياً" },
  { key: "offers", label: "بانر العروض", note: "" },
  { key: "bestsellers", label: "بانر الأعلى مبيعاً", note: "" },
] as const;

function BannersPage() {
  const { hasAny, isLoading: rolesLoading } = useUserRoles();
  const { can, isLoading: permsLoading } = usePermissions();
  if (rolesLoading || permsLoading) return null;
  const allowed = hasAny("developer", "admin") || can("banners" as any);
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Button asChild variant="ghost" size="sm" className="mb-3 -ms-2 gap-1.5">
          <Link to="/admin"><ArrowRight className="h-4 w-4" /> رجوع</Link>
        </Button>
        <h1 className="font-display text-2xl font-bold mb-1">إدارة البانرز</h1>
        <p className="text-sm text-muted-foreground mb-5">عدّل النصوص، الزرار، والصور لكل بانر، أو أخفي بانر بالكامل.</p>

        <Tabs defaultValue="hero" dir="rtl">
          <TabsList className="grid grid-cols-4 w-full mb-4">
            <TabsTrigger value="hero">الترحيب</TabsTrigger>
            <TabsTrigger value="offers">العروض</TabsTrigger>
            <TabsTrigger value="bestsellers">الأعلى مبيعاً</TabsTrigger>
            <TabsTrigger value="login">تسجيل الدخول</TabsTrigger>
          </TabsList>

          {HOME_KEYS.map((b) => (
            <TabsContent key={b.key} value={b.key}>
              <HomeBannerEditor bannerKey={b.key} label={b.label} note={b.note} />
            </TabsContent>
          ))}

          <TabsContent value="login">
            <LoginBannerEditor />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function HomeBannerEditor({ bannerKey, label, note }: { bannerKey: string; label: string; note?: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["home_banner_edit", bannerKey],
    queryFn: async () => {
      const { data } = await supabase.from("home_banners" as any).select("*").eq("key", bannerKey).maybeSingle();
      return data as any;
    },
  });

  const [form, setForm] = useState({
    title: "", subtitle: "", eyebrow: "", cta_label: "", cta_link: "", image_url: "", is_visible: true,
  });

  useEffect(() => {
    if (data) setForm({
      title: data.title ?? "",
      subtitle: data.subtitle ?? "",
      eyebrow: data.eyebrow ?? "",
      cta_label: data.cta_label ?? "",
      cta_link: data.cta_link ?? "",
      image_url: data.image_url ?? "",
      is_visible: data.is_visible ?? true,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("home_banners" as any).upsert({
        key: bannerKey,
        ...form,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ البانر");
      qc.invalidateQueries({ queryKey: ["home_banner_edit", bannerKey] });
      qc.invalidateQueries({ queryKey: ["home_banners"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <h2 className="font-bold">{label}</h2>
          {note && <p className="text-[11px] text-muted-foreground mt-0.5">{note}</p>}
        </div>
        <div className="flex items-center gap-2">
          {form.is_visible ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs font-bold">{form.is_visible ? "ظاهر" : "مخفي"}</span>
          <Switch checked={form.is_visible} onCheckedChange={(v) => setForm((f) => ({ ...f, is_visible: v }))} />
        </div>
      </div>

      <ImageUpload value={form.image_url} onChange={(url) => setForm((f) => ({ ...f, image_url: url }))} folder={`banners/${bannerKey}`} label="صورة الخلفية" />

      <div className="grid gap-3">
        <Field label="العنوان الفرعي (eyebrow)" value={form.eyebrow} onChange={(v) => setForm((f) => ({ ...f, eyebrow: v }))} placeholder="مثلاً: عروض الأسبوع" />
        <Field label="العنوان الرئيسي" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="مثلاً: خصومات تصل لـ 25%" />
        <div>
          <Label className="text-xs font-bold">الوصف</Label>
          <Textarea value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} className="mt-1" rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="نص الزر" value={form.cta_label} onChange={(v) => setForm((f) => ({ ...f, cta_label: v }))} placeholder="مثلاً: شوف العروض" />
          <Field label="رابط الزر" value={form.cta_link} onChange={(v) => setForm((f) => ({ ...f, cta_link: v }))} placeholder="/products" dir="ltr" />
        </div>
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full gap-1.5">
        <Save className="h-4 w-4" /> {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
      </Button>
    </div>
  );
}

function LoginBannerEditor() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["login_banner_edit"],
    queryFn: async () => {
      const { data } = await supabase.from("login_banner_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState({
    is_visible: true,
    badge_label: "", badge_title: "",
    hero_title: "", hero_highlight: "", hero_subtitle: "",
  });

  useEffect(() => {
    if (data) setForm({
      is_visible: data.is_visible ?? true,
      badge_label: data.badge_label ?? "",
      badge_title: data.badge_title ?? "",
      hero_title: data.hero_title ?? "",
      hero_highlight: data.hero_highlight ?? "",
      hero_subtitle: data.hero_subtitle ?? "",
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error("لا توجد بيانات بانر");
      const { error } = await supabase.from("login_banner_settings").update({
        ...form,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ بانر تسجيل الدخول");
      qc.invalidateQueries({ queryKey: ["login_banner_edit"] });
      qc.invalidateQueries({ queryKey: ["login_banner"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
        <h2 className="font-bold">بانر تسجيل الدخول</h2>
        <div className="flex items-center gap-2">
          {form.is_visible ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs font-bold">{form.is_visible ? "ظاهر" : "مخفي"}</span>
          <Switch checked={form.is_visible} onCheckedChange={(v) => setForm((f) => ({ ...f, is_visible: v }))} />
        </div>
      </div>

      <div className="grid gap-3">
        <Field label="نص الشارة العلوية" value={form.badge_label} onChange={(v) => setForm((f) => ({ ...f, badge_label: v }))} placeholder="مثلاً: منصة موردين معتمدين" />
        <Field label="اسم الشارة" value={form.badge_title} onChange={(v) => setForm((f) => ({ ...f, badge_title: v }))} placeholder="مثلاً: أزرق ماركت" />
        <Field label="العنوان الرئيسي" value={form.hero_title} onChange={(v) => setForm((f) => ({ ...f, hero_title: v }))} placeholder="مثلاً: شريكك في تجارة" />
        <Field label="الكلمة المميزة" value={form.hero_highlight} onChange={(v) => setForm((f) => ({ ...f, hero_highlight: v }))} placeholder="مثلاً: الجملة" />
        <div>
          <Label className="text-xs font-bold">الوصف</Label>
          <Textarea value={form.hero_subtitle} onChange={(e) => setForm((f) => ({ ...f, hero_subtitle: e.target.value }))} className="mt-1" rows={2} />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">ملاحظة: تعديل المميزات والإحصاءات الأخرى متاح من قبل (تبويب آخر).</p>

      <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full gap-1.5">
        <Save className="h-4 w-4" /> {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
      </Button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, dir }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; dir?: "ltr" | "rtl" }) {
  return (
    <div>
      <Label className="text-xs font-bold">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir={dir} className="mt-1" />
    </div>
  );
}
