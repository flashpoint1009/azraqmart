import { useEffect, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageUpload } from "@/components/ImageUpload";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { usePermissions } from "@/hooks/usePermissions";

export const Route = createFileRoute("/admin/about")({
  head: () => ({
    meta: [{ title: "إدارة قسم عننا — أزرق ماركت" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AboutAdminPage,
});

const ICON_OPTIONS = ["Truck", "ShieldCheck", "Tag", "Heart", "Award", "Sparkles", "Star", "Phone", "MapPin", "Clock", "Package", "ShoppingBag"];

type Stat = { label: string; value: string };
type Feature = { icon: string; title: string; desc: string };

function AboutAdminPage() {
  const { hasAny, isLoading: rolesLoading } = useUserRoles();
  const { can, isLoading: permsLoading } = usePermissions();
  if (rolesLoading || permsLoading) return null;
  const allowed = hasAny("developer", "admin") || can("about" as any);
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Button asChild variant="ghost" size="sm" className="mb-3 -ms-2 gap-1.5">
          <Link to="/admin"><ArrowRight className="h-4 w-4" /> رجوع</Link>
        </Button>
        <h1 className="font-display text-2xl font-bold mb-1">إدارة قسم "عننا"</h1>
        <p className="text-sm text-muted-foreground mb-5">عدّل النصوص والإحصائيات والمميزات اللي بتظهر في قسم عننا بالصفحة الرئيسية.</p>
        <Editor />
      </main>
    </div>
  );
}

function Editor() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["about_section_edit"],
    queryFn: async () => {
      const { data } = await supabase.from("about_section" as any).select("*").eq("key", "main").maybeSingle();
      return data as any;
    },
  });

  const [form, setForm] = useState({
    is_visible: true,
    eyebrow: "", title: "", subtitle: "", description: "",
    image_url: "", cta_label: "", cta_link: "",
    stats: [] as Stat[],
    features: [] as Feature[],
  });

  useEffect(() => {
    if (data) setForm({
      is_visible: data.is_visible ?? true,
      eyebrow: data.eyebrow ?? "",
      title: data.title ?? "",
      subtitle: data.subtitle ?? "",
      description: data.description ?? "",
      image_url: data.image_url ?? "",
      cta_label: data.cta_label ?? "",
      cta_link: data.cta_link ?? "",
      stats: Array.isArray(data.stats) ? data.stats : [],
      features: Array.isArray(data.features) ? data.features : [],
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("about_section" as any).upsert({
        key: "main",
        ...form,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ قسم عننا");
      qc.invalidateQueries({ queryKey: ["about_section_edit"] });
      qc.invalidateQueries({ queryKey: ["about_section"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
        <h2 className="font-bold">المحتوى الأساسي</h2>
        <div className="flex items-center gap-2">
          {form.is_visible ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs font-bold">{form.is_visible ? "ظاهر" : "مخفي"}</span>
          <Switch checked={form.is_visible} onCheckedChange={(v) => setForm((f) => ({ ...f, is_visible: v }))} />
        </div>
      </div>

      <div className="grid gap-3">
        <Field label="نص علوي (eyebrow)" value={form.eyebrow} onChange={(v) => setForm((f) => ({ ...f, eyebrow: v }))} placeholder="مثلاً: عننا" />
        <Field label="العنوان الرئيسي" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
        <Field label="عنوان فرعي (اختياري)" value={form.subtitle} onChange={(v) => setForm((f) => ({ ...f, subtitle: v }))} />
        <div>
          <Label className="text-xs font-bold">الوصف</Label>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="mt-1" rows={4} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="نص الزر" value={form.cta_label} onChange={(v) => setForm((f) => ({ ...f, cta_label: v }))} placeholder="تسوّق الآن" />
          <Field label="رابط الزر" value={form.cta_link} onChange={(v) => setForm((f) => ({ ...f, cta_link: v }))} placeholder="/products" dir="ltr" />
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">الإحصائيات</h3>
          <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, stats: [...f.stats, { label: "", value: "" }] }))} className="gap-1">
            <Plus className="h-4 w-4" /> إضافة
          </Button>
        </div>
        {form.stats.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <Field label="القيمة" value={s.value} onChange={(v) => setForm((f) => ({ ...f, stats: f.stats.map((x, k) => k === i ? { ...x, value: v } : x) }))} placeholder="12K+" />
            <Field label="الوصف" value={s.label} onChange={(v) => setForm((f) => ({ ...f, stats: f.stats.map((x, k) => k === i ? { ...x, label: v } : x) }))} placeholder="منتج" />
            <Button size="icon" variant="ghost" onClick={() => setForm((f) => ({ ...f, stats: f.stats.filter((_, k) => k !== i) }))}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">المميزات</h3>
          <Button size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, features: [...f.features, { icon: "Sparkles", title: "", desc: "" }] }))} className="gap-1">
            <Plus className="h-4 w-4" /> إضافة
          </Button>
        </div>
        {form.features.map((ft, i) => (
          <div key={i} className="rounded-xl border border-border p-3 space-y-2">
            <div className="grid grid-cols-[120px_1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-xs font-bold">الأيقونة</Label>
                <select
                  value={ft.icon}
                  onChange={(e) => setForm((f) => ({ ...f, features: f.features.map((x, k) => k === i ? { ...x, icon: e.target.value } : x) }))}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {ICON_OPTIONS.map((io) => <option key={io} value={io}>{io}</option>)}
                </select>
              </div>
              <Field label="العنوان" value={ft.title} onChange={(v) => setForm((f) => ({ ...f, features: f.features.map((x, k) => k === i ? { ...x, title: v } : x) }))} />
              <Button size="icon" variant="ghost" onClick={() => setForm((f) => ({ ...f, features: f.features.filter((_, k) => k !== i) }))}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div>
              <Label className="text-xs font-bold">الوصف</Label>
              <Textarea value={ft.desc} onChange={(e) => setForm((f) => ({ ...f, features: f.features.map((x, k) => k === i ? { ...x, desc: e.target.value } : x) }))} rows={2} className="mt-1" />
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-border">
        <ImageUpload value={form.image_url} onChange={(url) => setForm((f) => ({ ...f, image_url: url }))} folder="about" label="صورة (اختياري)" />
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full gap-1.5">
        <Save className="h-4 w-4" /> {save.isPending ? "جارٍ الحفظ…" : "حفظ التغييرات"}
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
