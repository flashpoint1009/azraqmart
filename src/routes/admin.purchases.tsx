import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileText, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/purchases")({
  head: () => ({ meta: [{ title: "المشتريات — Zone Mart" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer", "accountant"]}>
      <PurchasesPage />
    </RoleGuard>
  ),
});

type Line = { product_id?: string; product_name: string; qty: number; unit_cost: number };

function PurchasesPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1200px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-6 flex items-start justify-between gap-3">
          <Button asChild variant="outline" size="sm" className="gap-1.5"><Link to="/admin"><ArrowRight className="h-3.5 w-3.5" />رجوع</Link></Button>
          <div className="text-end">
            <p className="text-xs font-bold text-primary">Zone Mart</p>
            <h1 className="font-display text-3xl font-bold mt-1">المشتريات</h1>
            <p className="text-sm text-muted-foreground mt-1">سجّل فواتير الشراء والمرتجعات مع تحديث المخزون.</p>
          </div>
        </header>

        <Tabs defaultValue="invoices" className="w-full">
          <TabsList className="w-full grid grid-cols-2 h-12 mb-6">
            <TabsTrigger value="invoices" className="text-sm font-bold">فواتير الشراء</TabsTrigger>
            <TabsTrigger value="returns" className="text-sm font-bold">مرتجعات الشراء</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <InvoiceForm kind="invoice" />
            <List kind="invoice" />
          </TabsContent>
          <TabsContent value="returns" className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <InvoiceForm kind="return" />
            <List kind="return" />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function InvoiceForm({ kind }: { kind: "invoice" | "return" }) {
  const qc = useQueryClient();
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_name: "", qty: 1, unit_cost: 0 }]);

  const { data: products = [] } = useQuery({
    queryKey: ["products-light"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, unit_price, stock_qty");
      return data ?? [];
    },
  });

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!supplier.trim()) throw new Error("اكتب اسم المورد");
      const filtered = lines.filter((l) => l.product_name && l.qty > 0);
      if (filtered.length === 0) throw new Error("ضيف منتج على الأقل");

      if (kind === "invoice") {
        const { data: inv, error } = await supabase.from("purchase_invoices").insert({
          invoice_number: `INV-${Date.now().toString().slice(-8)}`,
          supplier_name: supplier, total, notes: notes || null,
        }).select("id").single();
        if (error) throw error;
        const items = filtered.map((l) => ({
          invoice_id: inv.id, product_id: l.product_id, product_name: l.product_name,
          qty: l.qty, unit_cost: l.unit_cost, line_total: l.qty * l.unit_cost,
        }));
        const { error: e2 } = await supabase.from("purchase_invoice_items").insert(items);
        if (e2) throw e2;
        // increase stock
        for (const l of filtered) {
          if (l.product_id) {
            const p = products.find((x: any) => x.id === l.product_id);
            if (p) await supabase.from("products").update({ stock_qty: (p.stock_qty ?? 0) + Number(l.qty) }).eq("id", l.product_id);
          }
        }
      } else {
        const { data: ret, error } = await supabase.from("purchase_returns").insert({
          return_number: `RET-${Date.now().toString().slice(-8)}`,
          supplier_name: supplier, total, notes: notes || null,
        }).select("id").single();
        if (error) throw error;
        const items = filtered.map((l) => ({
          return_id: ret.id, product_id: l.product_id, product_name: l.product_name,
          qty: l.qty, unit_cost: l.unit_cost, line_total: l.qty * l.unit_cost,
        }));
        const { error: e2 } = await supabase.from("purchase_return_items").insert(items);
        if (e2) throw e2;
        for (const l of filtered) {
          if (l.product_id) {
            const p = products.find((x: any) => x.id === l.product_id);
            if (p) await supabase.from("products").update({ stock_qty: Math.max(0, (p.stock_qty ?? 0) - Number(l.qty)) }).eq("id", l.product_id);
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("تم الحفظ ✓");
      setSupplier(""); setNotes(""); setLines([{ product_name: "", qty: 1, unit_cost: 0 }]);
      qc.invalidateQueries({ queryKey: [kind === "invoice" ? "purchase-invoices" : "purchase-returns"] });
      qc.invalidateQueries({ queryKey: ["products-light"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
      <h3 className="font-display text-lg font-bold text-end">{kind === "invoice" ? "فاتورة شراء جديدة" : "مرتجع شراء جديد"}</h3>
      <Input dir="rtl" placeholder="اسم المورد" value={supplier} onChange={(e) => setSupplier(e.target.value)} />

      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[auto_80px_80px_1fr] gap-2 items-center">
            <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="grid h-9 w-9 place-items-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20"><Trash2 className="h-3.5 w-3.5" /></button>
            <Input type="number" dir="ltr" placeholder="السعر" value={l.unit_cost || ""} onChange={(e) => update(i, { unit_cost: Number(e.target.value) })} />
            <Input type="number" dir="ltr" placeholder="الكمية" value={l.qty || ""} onChange={(e) => update(i, { qty: Number(e.target.value) })} />
            <select
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium"
              value={l.product_id ?? ""}
              onChange={(e) => {
                const p = products.find((x: any) => x.id === e.target.value);
                update(i, { product_id: e.target.value || undefined, product_name: p?.name ?? "", unit_cost: l.unit_cost || Number(p?.unit_price ?? 0) });
              }}
            >
              <option value="">اختر المنتج</option>
              {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ))}
        <button onClick={() => setLines([...lines, { product_name: "", qty: 1, unit_cost: 0 }])} className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline"><Plus className="h-3.5 w-3.5" />زود سطر</button>
      </div>

      <Input dir="rtl" placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="rounded-xl bg-primary-soft p-4 text-end">
        <p className="text-sm font-bold text-primary">الإجمالي: <span dir="ltr" className="tabular-nums">{total.toLocaleString("en")} ج.م</span></p>
      </div>

      <Button variant="hero" className="w-full gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        احفظ {kind === "invoice" ? "الفاتورة" : "المرتجع"}
      </Button>
    </div>
  );
}

function List({ kind }: { kind: "invoice" | "return" }) {
  const { data = [], isLoading } = useQuery({
    queryKey: [kind === "invoice" ? "purchase-invoices" : "purchase-returns"],
    queryFn: async () => {
      const table = kind === "invoice" ? "purchase_invoices" : "purchase_returns";
      const { data } = await supabase.from(table).select("*").order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <h3 className="font-display font-bold mb-3 text-end">آخر {kind === "invoice" ? "الفواتير" : "المرتجعات"}</h3>
      {isLoading && <Loader2 className="h-5 w-5 animate-spin mx-auto" />}
      {!isLoading && data.length === 0 && (
        <div className="rounded-xl bg-surface-2 p-6 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs font-bold">لا توجد {kind === "invoice" ? "فواتير" : "مرتجعات"}</p>
          <p className="text-[11px] mt-1">أول عملية ستظهر هنا بعد الحفظ.</p>
        </div>
      )}
      <ul className="space-y-2">
        {data.map((r: any) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-2.5 text-end">
            <span className="text-xs font-bold tabular-nums text-primary" dir="ltr">{Number(r.total).toLocaleString("en")} ج.م</span>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{r.supplier_name}</p>
              <p className="text-[10px] text-muted-foreground" dir="ltr">{r.invoice_number || r.return_number} · {new Date(r.created_at).toLocaleDateString("ar-EG")}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
