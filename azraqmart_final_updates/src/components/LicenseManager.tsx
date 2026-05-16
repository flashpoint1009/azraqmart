import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Calendar, CheckCircle2, Copy, KeyRound, Plus, Save, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getDefaultFeatures, SYSTEM_FEATURES } from "@/lib/features";

const FEATURE_KEYS = SYSTEM_FEATURES;

const genKey = () => {
  const chunk = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LIC-${chunk()}-${chunk()}-${chunk()}`;
};

type License = {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  license_key: string;
  max_users: number;
  max_customers: number;
  features: Record<string, boolean>;
  notes: string | null;
  is_active: boolean;
  starts_at: string;
  expires_at: string | null;
};

export function LicenseManager() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<License | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: licenses = [] } = useQuery({
    queryKey: ["licenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("licenses" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as License[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (lic: Partial<License>) => {
      const payload: any = { ...lic };
      const { error } = lic.id
        ? await supabase.from("licenses" as any).update(payload).eq("id", lic.id)
        : await supabase.from("licenses" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحفظ ✓");
      qc.invalidateQueries({ queryKey: ["licenses"] });
      setEditing(null);
      setCreating(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("licenses" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["licenses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("تم النسخ");
  };

  return (
    <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border bg-surface-2/40 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-bold inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            تراخيص الشركات
            <Badge variant="secondary" className="ms-1">{licenses.length}</Badge>
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1">كل ترخيص = شركة عميلة بتشغّل البرنامج بحدود مخصصة.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> ترخيص جديد
        </Button>
      </div>

      <div className="divide-y divide-border">
        {licenses.map((lic) => {
          const expired = lic.expires_at && new Date(lic.expires_at) < new Date();
          return (
            <div key={lic.id} className={`p-4 sm:p-5 ${!lic.is_active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <p className="font-bold">{lic.company_name}</p>
                    {lic.is_active ? (
                      <Badge className="bg-success/10 text-success border-success/20">
                        <CheckCircle2 className="h-3 w-3 me-1" /> نشط
                      </Badge>
                    ) : (
                      <Badge variant="destructive"><XCircle className="h-3 w-3 me-1" /> معطّل</Badge>
                    )}
                    {expired && <Badge variant="destructive">منتهي</Badge>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono text-muted-foreground" dir="ltr">
                    {lic.license_key}
                    <button onClick={() => copyKey(lic.license_key)} className="text-primary hover:underline">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-muted-foreground">
                    <span>👥 {lic.max_users} مستخدم</span>
                    <span>🏪 {lic.max_customers} عميل</span>
                    {lic.expires_at && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        ينتهي: {new Date(lic.expires_at).toLocaleDateString("ar-EG")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => setEditing(lic)}>تعديل</Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 text-destructive hover:bg-destructive/10"
                    onClick={() => confirm(`حذف ترخيص ${lic.company_name}؟`) && remove.mutate(lic.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {licenses.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">مفيش تراخيص لسه. اضغط «ترخيص جديد».</div>
        )}
      </div>

      {(editing || creating) && (
        <LicenseDialog
          initial={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={(data) => upsert.mutate(data)}
          saving={upsert.isPending}
        />
      )}
    </section>
  );
}

function LicenseDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial: License | null;
  onClose: () => void;
  onSave: (l: Partial<License>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<License>>(
    initial ?? {
      company_name: "",
      contact_name: "",
      contact_phone: "",
      license_key: genKey(),
      max_users: 5,
      max_customers: 500,
      features: getDefaultFeatures(),
      is_active: true,
      starts_at: new Date().toISOString(),
      expires_at: null,
      notes: "",
    },
  );

  const submit = () => {
    if (!form.company_name?.trim()) return toast.error("اسم الشركة مطلوب");
    if (!form.license_key?.trim()) return toast.error("مفتاح الترخيص مطلوب");
    onSave(form);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "تعديل الترخيص" : "ترخيص جديد"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pe-1">
          <div>
            <Label>اسم الشركة</Label>
            <Input value={form.company_name ?? ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الشخص المسؤول</Label>
              <Input value={form.contact_name ?? ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div>
              <Label>هاتف</Label>
              <Input dir="ltr" value={form.contact_phone ?? ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>مفتاح الترخيص</Label>
            <div className="flex gap-2">
              <Input dir="ltr" value={form.license_key ?? ""} onChange={(e) => setForm({ ...form, license_key: e.target.value })} className="font-mono" />
              <Button type="button" variant="outline" onClick={() => setForm({ ...form, license_key: genKey() })}>توليد</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الحد الأقصى للمستخدمين</Label>
              <Input type="number" value={form.max_users ?? 0} onChange={(e) => setForm({ ...form, max_users: Number(e.target.value) })} />
            </div>
            <div>
              <Label>الحد الأقصى للعملاء</Label>
              <Input type="number" value={form.max_customers ?? 0} onChange={(e) => setForm({ ...form, max_customers: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>تاريخ الانتهاء (اختياري)</Label>
            <Input
              type="date"
              value={form.expires_at ? new Date(form.expires_at).toISOString().slice(0, 10) : ""}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
          <div>
            <Label>مكونات النسخة للعميل</Label>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FEATURE_KEYS.map((f) => {
                const on = (form.features ?? {})[f.key] !== false;
                return (
                  <label
                    key={f.key}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer transition ${
                      on ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    <span>{f.label}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={on}
                      onChange={(e) =>
                        setForm({ ...form, features: { ...(form.features ?? {}), [f.key]: e.target.checked } })
                      }
                    />
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <Label>ملاحظات</Label>
            <textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-lg border border-border bg-card p-2.5 text-sm"
            />
          </div>
          <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs font-bold cursor-pointer">
            ترخيص نشط
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="gap-2"><Save className="h-4 w-4" />حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
