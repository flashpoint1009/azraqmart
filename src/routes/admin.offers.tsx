import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/offers")({
  head: () => ({ meta: [{ title: "العروض والكوبونات — Zone Mart" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer", "accountant"]}>
      <OffersPage />
    </RoleGuard>
  ),
});

function OffersPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [minOrder, setMinOrder] = useState("0");
  const [maxUses, setMaxUses] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: list = [] } = useQuery({
    queryKey: ["coupons"],
    queryFn: async () => {
      const { data } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!code.trim()) throw new Error("اكتب كود الكوبون");
      const { error } = await supabase.from("coupons").insert({
        code: code.trim().toUpperCase(),
        discount_type: discountType,
        discount_value: Number(discountValue || 0),
        min_order_total: Number(minOrder || 0),
        max_uses: maxUses ? Number(maxUses) : null,
        starts_at: startsAt || null,
        expires_at: expiresAt || null,
        is_active: isActive,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الكوبون ✓");
      setCode(""); setDiscountValue("10"); setMinOrder("0"); setMaxUses(""); setStartsAt(""); setExpiresAt("");
      qc.invalidateQueries({ queryKey: ["coupons"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["coupons"] }); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const { error } = await supabase.from("coupons").update({ is_active: on }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coupons"] }),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1200px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-6 text-end">
          <p className="text-xs font-bold text-primary">Zone Mart</p>
          <h1 className="font-display text-3xl font-bold mt-1">العروض والكوبونات</h1>
          <p className="text-sm text-muted-foreground mt-1">أنشئ كوبونات خصم يكتبها العميل في السلة.</p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          {/* Form */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
            <h3 className="font-display text-lg font-bold text-end">كوبون جديد</h3>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground">كود الكوبون</label>
              <Input dir="ltr" placeholder="EID2026" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">نوع الخصم</label>
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium">
                  <option value="percent">نسبة %</option>
                  <option value="amount">مبلغ ثابت ج.م</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">القيمة</label>
                <Input type="number" dir="ltr" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">حد أدنى للطلب</label>
                <Input type="number" dir="ltr" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">عدد مرات الاستخدام</label>
                <Input type="number" dir="ltr" placeholder="غير محدود" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">من تاريخ</label>
                <Input type="date" dir="ltr" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">إلى تاريخ</label>
                <Input type="date" dir="ltr" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center justify-end gap-2 text-xs font-bold">
              الكوبون نشط
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-primary" />
            </label>
            <Button variant="hero" className="w-full gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              احفظ الكوبون
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2">
            {list.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                لا توجد كوبونات بعد
              </div>
            )}
            {list.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
                <button onClick={() => { if (confirm(`حذف الكوبون ${c.code}؟`)) remove.mutate(c.id); }} className="grid h-9 w-9 place-items-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20"><Trash2 className="h-4 w-4" /></button>
                <label className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer">
                  <input type="checkbox" checked={c.is_active} onChange={(e) => toggleActive.mutate({ id: c.id, on: e.target.checked })} className="h-3.5 w-3.5 accent-primary" />
                  {c.is_active ? "نشط" : "موقوف"}
                </label>
                <div className="flex-1 min-w-0 text-end">
                  <p className="font-display text-lg font-bold" dir="ltr">{c.code}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    خصم {c.discount_type === "percent" ? `${c.discount_value}%` : `${c.discount_value} ج.م`}
                    {c.min_order_total > 0 && ` · حد أدنى ${c.min_order_total} ج.م`}
                    {c.max_uses && ` · ${c.used_count}/${c.max_uses} استخدامات`}
                  </p>
                  {(c.starts_at || c.expires_at) && (
                    <p className="text-[10px] text-muted-foreground mt-0.5" dir="ltr">
                      {c.starts_at ? new Date(c.starts_at).toLocaleDateString("ar-EG") : "—"} → {c.expires_at ? new Date(c.expires_at).toLocaleDateString("ar-EG") : "—"}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
