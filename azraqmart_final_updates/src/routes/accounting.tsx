import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, FileText, Package, Plus, Printer, Receipt, Trash2, Truck, Phone, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/accounting")({
  head: () => ({ meta: [{ title: "المحاسبة" }] }),
  component: () => (
    <RoleGuard allow={["accountant", "admin", "developer"]}>
      <AccountingPage />
    </RoleGuard>
  ),
});

type Tab = "products" | "purchases" | "cash" | "delivery" | "reports";

function AccountingPage() {
  const [tab, setTab] = useState<Tab>("products");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-6">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" /> المحاسبة</p>
          <h1 className="font-display text-3xl font-bold mt-1">شاشة المحاسب</h1>
        </header>

        <div className="mb-5 flex gap-2 overflow-x-auto">
          {[
            { id: "products", label: "المنتجات", icon: Package },
            { id: "purchases", label: "فواتير المشتريات", icon: FileText },
            { id: "cash", label: "الخزينة", icon: ArrowDownCircle },
            { id: "delivery", label: "المندوبين", icon: Truck },
            { id: "reports", label: "التقارير", icon: Printer },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-primary"}`}
            >
              <t.icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
        </div>

        {tab === "products" && <ProductsTab />}
        {tab === "purchases" && <PurchasesTab />}
        {tab === "cash" && <CashTab />}
        {tab === "delivery" && <DeliveryTab />}
        {tab === "reports" && <ReportsTab />}
      </main>
    </div>
  );
}

function ProductsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", brand: "", sku: "", unit_price: 0, carton_price: 0, stock_qty: 0 });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (edit) {
        const { error } = await supabase.from("products").update(form).eq("id", edit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); setEdit(null);
      setForm({ name: "", brand: "", sku: "", unit_price: 0, carton_price: 0, stock_qty: 0 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <div className="mb-4 flex justify-between">
        <h3 className="font-display font-bold">المنتجات ({products.length})</h3>
        <Button variant="hero" className="gap-2" onClick={() => { setEdit(null); setForm({ name: "", brand: "", sku: "", unit_price: 0, carton_price: 0, stock_qty: 0 }); setOpen(true); }}>
          <Plus className="h-4 w-4" /> منتج جديد
        </Button>
      </div>

      {open && (
        <div className="mb-4 grid gap-3 rounded-xl border border-primary/30 bg-primary-soft/50 p-4 sm:grid-cols-3">
          <div><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>الماركة</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
          <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          <div><Label>سعر القطعة</Label><Input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} /></div>
          <div><Label>سعر الكرتونة</Label><Input type="number" value={form.carton_price} onChange={(e) => setForm({ ...form, carton_price: Number(e.target.value) })} /></div>
          <div><Label>الكمية</Label><Input type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: Number(e.target.value) })} /></div>
          <div className="sm:col-span-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); setEdit(null); }}>إلغاء</Button>
            <Button onClick={() => save.mutate()}>حفظ</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs font-bold text-muted-foreground">
            <tr><th className="p-2 text-start">الاسم</th><th className="p-2 text-start">الماركة</th><th className="p-2">SKU</th><th className="p-2">قطعة</th><th className="p-2">كرتونة</th><th className="p-2">المخزون</th><th /></tr>
          </thead>
          <tbody>
            {products.map((p: any) => (
              <tr key={p.id} className="border-b border-border">
                <td className="p-2 font-bold">{p.name}</td>
                <td className="p-2 text-muted-foreground">{p.brand || "—"}</td>
                <td className="p-2 font-mono text-xs">{p.sku || "—"}</td>
                <td className="p-2 tabular-nums" dir="ltr">{p.unit_price}</td>
                <td className="p-2 tabular-nums" dir="ltr">{p.carton_price}</td>
                <td className="p-2 tabular-nums" dir="ltr">{p.stock_qty}</td>
                <td className="p-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEdit(p); setForm(p); setOpen(true); }}>تعديل</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm("حذف؟") && del.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">لا توجد منتجات</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PurchasesTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ supplier_name: "", invoice_number: "", total: 0, paid: 0, notes: "" });

  const { data: invoices = [] } = useQuery({
    queryKey: ["purchase_invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_invoices").select("*").order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("purchase_invoices").insert(form);
      if (error) throw error;
      // Cash out for the paid amount
      if (form.paid > 0) {
        await supabase.from("cash_transactions").insert({
          type: "out", amount: form.paid, reference_type: "purchase_invoice",
          description: `دفع لمورد ${form.supplier_name} - فاتورة ${form.invoice_number}`,
        });
      }
    },
    onSuccess: () => {
      toast.success("تم إنشاء الفاتورة");
      qc.invalidateQueries({ queryKey: ["purchase_invoices"] });
      setForm({ supplier_name: "", invoice_number: "", total: 0, paid: 0, notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h3 className="font-display font-bold mb-4">فاتورة مشتريات جديدة</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><Label>المورد</Label><Input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} /></div>
          <div><Label>رقم الفاتورة</Label><Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} /></div>
          <div><Label>الإجمالي</Label><Input type="number" value={form.total} onChange={(e) => setForm({ ...form, total: Number(e.target.value) })} /></div>
          <div><Label>المدفوع</Label><Input type="number" value={form.paid} onChange={(e) => setForm({ ...form, paid: Number(e.target.value) })} /></div>
          <div className="flex items-end"><Button onClick={() => create.mutate()} className="w-full">حفظ الفاتورة</Button></div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        <div className="mb-3 flex justify-between"><h3 className="font-display font-bold">سجل الفواتير</h3><Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 ms-1" /> طباعة</Button></div>
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs font-bold text-muted-foreground">
            <tr><th className="p-2 text-start">المورد</th><th className="p-2">رقم</th><th className="p-2">التاريخ</th><th className="p-2">إجمالي</th><th className="p-2">مدفوع</th><th className="p-2">متبقي</th></tr>
          </thead>
          <tbody>
            {invoices.map((i: any) => (
              <tr key={i.id} className="border-b border-border">
                <td className="p-2 font-bold">{i.supplier_name}</td>
                <td className="p-2 font-mono">{i.invoice_number}</td>
                <td className="p-2 text-xs">{i.invoice_date}</td>
                <td className="p-2 tabular-nums" dir="ltr">{i.total}</td>
                <td className="p-2 tabular-nums text-success" dir="ltr">{i.paid}</td>
                <td className="p-2 tabular-nums text-destructive" dir="ltr">{(i.total - i.paid).toFixed(2)}</td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد فواتير</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CashTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: "in" as "in" | "out", amount: 0, description: "" });

  const { data: txs = [] } = useQuery({
    queryKey: ["cash_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cash_transactions").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  const balance = txs.reduce((s: number, t: any) => s + (t.type === "in" ? Number(t.amount) : -Number(t.amount)), 0);

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cash_transactions").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت العملية");
      qc.invalidateQueries({ queryKey: ["cash_transactions"] });
      setForm({ type: "in", amount: 0, description: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-gradient-primary p-5 text-primary-foreground shadow-glow">
        <p className="text-xs font-bold opacity-80">رصيد الخزينة الحالي</p>
        <p className="font-display text-4xl font-bold tabular-nums mt-1" dir="ltr">{balance.toLocaleString("en")} <span className="text-base">ج.م</span></p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h3 className="font-display font-bold mb-4">معاملة جديدة</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label>النوع</Label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium">
              <option value="in">استلام نقدية</option>
              <option value="out">صرف نقدية</option>
            </select>
          </div>
          <div><Label>المبلغ</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div className="sm:col-span-2"><Label>الوصف</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="sm:col-span-4 flex justify-end"><Button onClick={() => add.mutate()}>تسجيل المعاملة</Button></div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h3 className="font-display font-bold mb-3">آخر المعاملات</h3>
        <ul className="divide-y divide-border">
          {txs.map((t: any) => (
            <li key={t.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                {t.type === "in" ? <ArrowDownCircle className="h-5 w-5 text-success" /> : <ArrowUpCircle className="h-5 w-5 text-destructive" />}
                <div>
                  <p className="text-sm font-bold">{t.description || (t.type === "in" ? "إيراد" : "مصروف")}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString("ar-EG")}</p>
                </div>
              </div>
              <p className={`font-display font-bold tabular-nums ${t.type === "in" ? "text-success" : "text-destructive"}`} dir="ltr">
                {t.type === "in" ? "+" : "-"}{t.amount}
              </p>
            </li>
          ))}
          {txs.length === 0 && <li className="py-6 text-center text-muted-foreground">لا توجد معاملات</li>}
        </ul>
      </div>
    </section>
  );
}

function DeliveryTab() {
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["delivery_settlements"],
    queryFn: async () => {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "delivery");
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", ids);
      const { data: orders } = await supabase
        .from("orders")
        .select("id, total, status, delivery_status, assigned_delivery")
        .in("assigned_delivery", ids);
      const { data: settles } = await supabase
        .from("cash_transactions")
        .select("amount, type, reference_type, reference_id")
        .eq("reference_type", "delivery_settlement")
        .in("reference_id", ids);

      return ids.map((uid) => {
        const p = (profiles ?? []).find((x) => x.user_id === uid);
        const my = (orders ?? []).filter((o: any) => o.assigned_delivery === uid);
        const delivered = my.filter((o: any) => o.delivery_status === "delivered" || o.status === "delivered");
        const inProgress = my.filter((o: any) => !["delivered", "failed", "returned"].includes(o.delivery_status ?? ""));
        const collected = delivered.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
        const settled = (settles ?? [])
          .filter((t: any) => t.reference_id === uid && t.type === "in")
          .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
        return {
          user_id: uid,
          name: p?.full_name || "مندوب",
          phone: p?.phone || "",
          orders_total: my.length,
          delivered_count: delivered.length,
          in_progress_count: inProgress.length,
          collected,
          settled,
          balance: collected - settled,
        };
      });
    },
  });

  const settle = useMutation({
    mutationFn: async ({ user_id, amount, name }: { user_id: string; amount: number; name: string }) => {
      const { error } = await supabase.from("cash_transactions").insert({
        type: "in",
        amount,
        reference_type: "delivery_settlement",
        reference_id: user_id,
        description: `تسوية مع المندوب ${name}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل التسوية في الخزينة");
      qc.invalidateQueries({ queryKey: ["delivery_settlements"] });
      qc.invalidateQueries({ queryKey: ["cash_transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalToCollect = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-gradient-primary p-5 text-primary-foreground shadow-glow">
        <p className="text-xs font-bold opacity-80 inline-flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> إجمالي مستحق على المندوبين</p>
        <p className="font-display text-4xl font-bold tabular-nums mt-1" dir="ltr">{totalToCollect.toLocaleString("en")} <span className="text-base">ج.م</span></p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h3 className="font-display font-bold mb-4 inline-flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> حسابات المندوبين</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">لا يوجد مندوبين بعد. أضفهم من شاشة المستخدمين.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.user_id} className="rounded-xl border border-border bg-surface-2/40 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <p className="font-bold inline-flex items-center gap-2"><Truck className="h-4 w-4 text-sky-500" />{r.name}</p>
                    {r.phone && (
                      <a href={`tel:${r.phone}`} className="text-xs text-muted-foreground font-mono inline-flex items-center gap-1 mt-0.5" dir="ltr">
                        <Phone className="h-3 w-3" /> {r.phone}
                      </a>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={r.balance <= 0 || settle.isPending}
                    onClick={() => {
                      const v = prompt(`المبلغ المراد تحصيله من ${r.name} (المستحق ${r.balance.toLocaleString("en")} ج.م):`, String(r.balance));
                      const amt = Number(v);
                      if (!isFinite(amt) || amt <= 0) return;
                      settle.mutate({ user_id: r.user_id, amount: amt, name: r.name });
                    }}
                  >
                    تسوية وتحصيل
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                  <MiniStat label="إجمالي الطلبات" value={r.orders_total} />
                  <MiniStat label="جارٍ التوصيل" value={r.in_progress_count} tone="warning" />
                  <MiniStat label="تم التسليم" value={r.delivered_count} tone="success" />
                  <MiniStat label="محصّل (ج.م)" value={r.collected} money tone="success" />
                  <MiniStat label="متبقي (ج.م)" value={r.balance} money tone={r.balance > 0 ? "danger" : "muted"} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MiniStat({ label, value, money, tone = "muted" }: { label: string; value: number; money?: boolean; tone?: "success" | "danger" | "warning" | "muted" }) {
  const cls = {
    success: "text-success",
    danger: "text-destructive",
    warning: "text-warning-foreground",
    muted: "text-foreground",
  }[tone];
  return (
    <div className="rounded-lg bg-card border border-border p-2">
      <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${cls}`} dir="ltr">
        {money ? Number(value).toLocaleString("en") : value}
      </p>
    </div>
  );
}

function ReportsTab() {
  const { data: stats } = useQuery({
    queryKey: ["acc_stats"],
    queryFn: async () => {
      const [orders, purchases, cash] = await Promise.all([
        supabase.from("orders").select("total, status"),
        supabase.from("purchase_invoices").select("total, paid"),
        supabase.from("cash_transactions").select("type, amount"),
      ]);
      const sales = (orders.data ?? []).filter((o: any) => o.status === "delivered").reduce((s: number, o: any) => s + Number(o.total), 0);
      const purchTotal = (purchases.data ?? []).reduce((s: number, p: any) => s + Number(p.total), 0);
      const cashIn = (cash.data ?? []).filter((t: any) => t.type === "in").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const cashOut = (cash.data ?? []).filter((t: any) => t.type === "out").reduce((s: number, t: any) => s + Number(t.amount), 0);
      return { sales, purchTotal, cashIn, cashOut, profit: sales - purchTotal };
    },
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-xs print:border-0 print:shadow-none">
      <div className="mb-4 flex justify-between print:mb-8">
        <div>
          <h3 className="font-display text-xl font-bold">تقرير شامل</h3>
          <p className="text-xs text-muted-foreground">{new Date().toLocaleString("ar-EG")}</p>
        </div>
        <Button onClick={() => window.print()} className="gap-2 print:hidden"><Printer className="h-4 w-4" />طباعة</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="إجمالي المبيعات (مسلّمة)" value={stats?.sales ?? 0} tone="success" />
        <Stat label="إجمالي المشتريات" value={stats?.purchTotal ?? 0} tone="warning" />
        <Stat label="نقدية واردة" value={stats?.cashIn ?? 0} tone="success" />
        <Stat label="نقدية صادرة" value={stats?.cashOut ?? 0} tone="danger" />
        <Stat label="صافي الربح التقديري" value={stats?.profit ?? 0} tone="primary" big />
      </div>
    </section>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: number; tone: "success" | "warning" | "danger" | "primary"; big?: boolean }) {
  const cls = { success: "text-success", warning: "text-warning-foreground", danger: "text-destructive", primary: "text-primary" }[tone];
  return (
    <div className={`rounded-xl border border-border bg-surface-2 p-4 ${big ? "sm:col-span-2 lg:col-span-4" : ""}`}>
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className={`font-display font-bold tabular-nums mt-1 ${big ? "text-4xl" : "text-2xl"} ${cls}`} dir="ltr">{value.toLocaleString("en")} ج.م</p>
    </div>
  );
}
