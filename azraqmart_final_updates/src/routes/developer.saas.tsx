import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Languages, Layers, Save, Settings2, Type } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/developer/saas")({
  head: () => ({ meta: [{ title: "لوحة التحكم — المطوّر — أزرق ماركت" }] }),
  component: () => (
    <RoleGuard allow={["developer"]}>
      <Page />
    </RoleGuard>
  ),
});

function Page() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <StaffNav />
      <div className="border-b border-border bg-gradient-to-l from-accent/10 via-background to-primary/5">
        <div className="mx-auto max-w-[1100px] px-4 py-6 lg:px-6">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> لوحة المطوّر
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">إعدادات SaaS المتقدمة</h1>
          <p className="text-sm text-muted-foreground mt-1">سجل التدقيق، نصوص التطبيق، الخطوط، وخطط الاشتراك.</p>
        </div>
      </div>
      <main className="mx-auto max-w-[1100px] px-4 py-5 lg:px-6">
        <Tabs defaultValue="audit">
          <TabsList className="flex w-full overflow-x-auto justify-start">
            <TabsTrigger value="audit" className="gap-1.5"><Activity className="h-3.5 w-3.5" />سجل التدقيق</TabsTrigger>
            <TabsTrigger value="labels" className="gap-1.5"><Languages className="h-3.5 w-3.5" />نصوص التطبيق</TabsTrigger>
            <TabsTrigger value="typography" className="gap-1.5"><Type className="h-3.5 w-3.5" />الخطوط</TabsTrigger>
            <TabsTrigger value="plans" className="gap-1.5"><Layers className="h-3.5 w-3.5" />خطط الاشتراك</TabsTrigger>
          </TabsList>
          <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
          <TabsContent value="labels" className="mt-4"><LabelsTab /></TabsContent>
          <TabsContent value="typography" className="mt-4"><TypographyTab /></TabsContent>
          <TabsContent value="plans" className="mt-4"><PlansTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function AuditTab() {
  const log = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, entity_type, entity_id, created_at, actor_id, profiles!audit_log_actor_id_fkey(full_name)")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card className="p-4">
      <h2 className="font-bold mb-3">آخر 100 حركة</h2>
      {log.isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
      {log.data?.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">لا توجد سجلات بعد.</p>}
      <div className="space-y-1.5">
        {log.data?.map((e: any) => (
          <div key={e.id} className="flex items-center justify-between text-sm rounded-md border border-border px-3 py-2">
            <div>
              <Badge variant="outline" className="me-2">{e.action}</Badge>
              <span className="font-bold">{e.entity_type}</span>
              {e.entity_id && <span className="text-xs text-muted-foreground ms-1">#{String(e.entity_id).slice(0, 8)}</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {e.profiles?.full_name ?? "—"} · {new Date(e.created_at).toLocaleString("ar-EG")}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LabelsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});

  const labels = useQuery({
    queryKey: ["app-labels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_labels").select("*").order("category").order("key");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase.from("app_labels").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["app-labels"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (labels.data ?? []).filter((l: any) =>
      !q || l.key.toLowerCase().includes(q) || l.value.toLowerCase().includes(q));
  }, [labels.data, search]);

  return (
    <Card className="p-4">
      <Input className="mb-3" placeholder="ابحث عن مفتاح أو قيمة…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">لا توجد نصوص. أضف بعض الـ app_labels من قاعدة البيانات.</p>}
      <div className="space-y-2">
        {filtered.map((l: any) => (
          <div key={l.key} className="grid grid-cols-1 md:grid-cols-[1fr,2fr,auto] gap-2 items-center rounded-lg border border-border p-2">
            <div>
              <code className="text-xs font-mono text-muted-foreground">{l.key}</code>
              <p className="text-[10px] text-muted-foreground">{l.category}</p>
            </div>
            <Input value={edits[l.key] ?? l.value} onChange={(e) => setEdits({ ...edits, [l.key]: e.target.value })} />
            <Button size="sm" disabled={!edits[l.key] || edits[l.key] === l.value || save.isPending}
              onClick={() => save.mutate({ key: l.key, value: edits[l.key] })}>
              <Save className="h-3.5 w-3.5 me-1" />حفظ
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TypographyTab() {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});

  const items = useQuery({
    queryKey: ["app-typography"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_typography").select("*").order("category").order("key");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase.from("app_typography").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["app-typography"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    (items.data ?? []).forEach((t: any) => { (g[t.category] ??= []).push(t); });
    return g;
  }, [items.data]);

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([cat, list]) => (
        <Card key={cat} className="p-4">
          <h3 className="font-bold mb-3">{cat}</h3>
          <div className="space-y-2">
            {list.map((t: any) => (
              <div key={t.key} className="grid grid-cols-1 md:grid-cols-[1.5fr,1fr,auto] gap-2 items-center">
                <div>
                  <p className="text-sm font-bold">{t.label}</p>
                  <code className="text-[10px] text-muted-foreground">{t.css_variable ?? t.key}</code>
                </div>
                <Input value={edits[t.key] ?? t.value} onChange={(e) => setEdits({ ...edits, [t.key]: e.target.value })} />
                <Button size="sm" disabled={!edits[t.key] || edits[t.key] === t.value || save.isPending}
                  onClick={() => save.mutate({ key: t.key, value: edits[t.key] })}>
                  <Save className="h-3.5 w-3.5 me-1" />حفظ
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PlansTab() {
  const qc = useQueryClient();
  const plans = useQuery({
    queryKey: ["plan-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_config").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (p: any) => {
      const { error } = await supabase.from("plan_config").update({
        name_ar: p.name_ar, price_monthly: p.price_monthly, price_yearly: p.price_yearly,
        badge_text: p.badge_text, is_active: p.is_active, updated_at: new Date().toISOString(),
      }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["plan-config"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {plans.data?.map((p: any) => <PlanCard key={p.id} plan={p} onSave={(np) => save.mutate(np)} />)}
    </div>
  );
}

function PlanCard({ plan, onSave }: { plan: any; onSave: (p: any) => void }) {
  const [edit, setEdit] = useState(plan);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{edit.name_ar}</h3>
        <Badge variant={edit.is_active ? "default" : "outline"}>{edit.is_active ? "مفعّل" : "موقوف"}</Badge>
      </div>
      <div>
        <label className="text-xs font-bold block mb-1">الاسم (عربي)</label>
        <Input value={edit.name_ar} onChange={(e) => setEdit({ ...edit, name_ar: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-bold block mb-1">السعر الشهري</label>
          <Input type="number" value={edit.price_monthly ?? 0} onChange={(e) => setEdit({ ...edit, price_monthly: parseFloat(e.target.value) || 0 })} />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">السعر السنوي</label>
          <Input type="number" value={edit.price_yearly ?? 0} onChange={(e) => setEdit({ ...edit, price_yearly: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>
      <div>
        <label className="text-xs font-bold block mb-1">شارة الخطة</label>
        <Input value={edit.badge_text ?? ""} onChange={(e) => setEdit({ ...edit, badge_text: e.target.value })} />
      </div>
      <Button onClick={() => onSave(edit)} className="w-full"><Save className="h-4 w-4 me-1" />حفظ</Button>
    </Card>
  );
}
