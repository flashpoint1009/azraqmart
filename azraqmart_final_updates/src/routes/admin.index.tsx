import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, ClipboardList, DollarSign, MessageSquare, Package, Save, ShoppingBag, Tag, Truck, Users, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/hooks/useAppSettings";
import { isFeatureEnabled } from "@/lib/features";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "لوحة الإدارة — أزرق ماركت" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer"]}>
      <AdminPage />
    </RoleGuard>
  ),
});

function AdminPage() {
  const { settings } = useAppSettings();
  const enabled = (key: Parameters<typeof isFeatureEnabled>[1]) => isFeatureEnabled(settings?.features, key);
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const monthStart = new Date(new Date().setDate(1)).toISOString();
      const [todayOrders, monthOrders, newOrders, preparing, delivered, shipping, products, lowStock, topItems] = await Promise.all([
        supabase.from("orders").select("total").gte("created_at", todayStart),
        supabase.from("orders").select("total").gte("created_at", monthStart),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["preparing", "ready"]),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "delivered").gte("created_at", todayStart),
        supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["shipping", "out_for_delivery"]),
        supabase.from("products").select("stock_qty, unit_price, carton_price"),
        supabase.from("products").select("id, name, stock_qty, low_stock_threshold").lte("stock_qty", 10).order("stock_qty", { ascending: true }).limit(8),
        supabase.from("order_items").select("product_name, qty").limit(500),
      ]);

      const todayRevenue = (todayOrders.data ?? []).reduce((s, o) => s + Number(o.total || 0), 0);
      const monthRevenue = (monthOrders.data ?? []).reduce((s, o) => s + Number(o.total || 0), 0);
      const totalUnits = (products.data ?? []).reduce((s, p: any) => s + Number(p.stock_qty || 0), 0);
      const stockValueSale = (products.data ?? []).reduce((s, p: any) => s + Number(p.stock_qty || 0) * Number(p.unit_price || 0), 0);
      const stockValueCost = (products.data ?? []).reduce((s, p: any) => s + Number(p.stock_qty || 0) * Number(p.carton_price || 0), 0);

      const agg = new Map<string, number>();
      (topItems.data ?? []).forEach((it: any) => agg.set(it.product_name, (agg.get(it.product_name) ?? 0) + Number(it.qty)));
      const top = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

      return {
        todayRevenue, monthRevenue,
        newOrders: newOrders.count ?? 0,
        preparing: preparing.count ?? 0,
        delivered: delivered.count ?? 0,
        shipping: shipping.count ?? 0,
        totalUnits,
        stockValueSale, stockValueCost,
        lowStock: lowStock.data ?? [],
        top,
      };
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8 space-y-6">
        <header className="text-end">
          <p className="text-xs font-bold text-primary">أزرق ماركت</p>
          <h1 className="font-display text-3xl font-bold mt-1">لوحة المشرف</h1>
          <p className="text-xs font-semibold text-muted-foreground mt-1">نظرة سريعة على الطلبات والبيع وحركة الشغل.</p>
        </header>

        {/* Top KPI row 1 */}
        <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Kpi tone="primary" label="طلبات النهارده" value={String(stats?.newOrders ?? 0)} />
          <Kpi tone="primary" label="جديدة" value={String(stats?.newOrders ?? 0)} />
          <Kpi tone="warning" label="بنجهزها" value={String(stats?.preparing ?? 0)} />
          <Kpi tone="accent" label="خرجت للتوصيل" value={String(stats?.shipping ?? 0)} />
        </section>

        {/* Row 2 - sales */}
        <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Kpi tone="success" label="اتسلمت" value={String(stats?.delivered ?? 0)} />
          <Kpi tone="primary" label="بيع النهارده" value={`${Math.round(stats?.todayRevenue ?? 0).toLocaleString("en")} ج.م`} />
          <Kpi tone="primary" label="بيع الشهر" value={`${Math.round(stats?.monthRevenue ?? 0).toLocaleString("en")} ج.م`} />
          <Kpi tone="danger" label="مديونيات مفتوحة" value="0,000 ج.م" />
        </section>

        {/* Row 3 - stock */}
        <section className="grid gap-3 grid-cols-1 lg:grid-cols-3">
          <Kpi tone="primary" label="وحدات المخزون" value={String(stats?.totalUnits ?? 0)} />
          <Kpi tone="accent" label="قيمة المخزون بالتكلفة" value={`${Math.round(stats?.stockValueCost ?? 0).toLocaleString("en")} ج.م`} />
          <Kpi tone="success" label="قيمة المخزون بالبيع" value={`${Math.round(stats?.stockValueSale ?? 0).toLocaleString("en")} ج.م`} />
        </section>

        {/* Bottom row */}
        <section className="grid gap-4 lg:grid-cols-3">
          <AnnouncementForm />

          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <h3 className="font-display font-bold mb-3 text-end">المديونيات</h3>
            <div className="rounded-xl bg-surface-2 p-6 text-center text-muted-foreground text-xs">
              مفيش مديونيات مفتوحة.
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <h3 className="font-display font-bold mb-3 text-end">الأكثر طلبًا</h3>
            <ul className="space-y-2">
              {(stats?.top ?? []).map(([name, qty]) => (
                <li key={name} className="flex items-center justify-between gap-2 text-end">
                  <span className="text-[11px] font-bold text-primary tabular-nums" dir="ltr">{qty}</span>
                  <p className="text-xs font-bold truncate flex-1">🔥 {name}</p>
                </li>
              ))}
              {(!stats?.top || stats.top.length === 0) && (
                <li className="text-xs text-muted-foreground text-center py-4">مفيش بيانات لسه</li>
              )}
            </ul>
          </div>
        </section>

        {/* Low stock */}
        {stats && stats.lowStock.length > 0 && (
          <section className="rounded-2xl border border-destructive/30 bg-card p-5 shadow-xs">
            <h3 className="font-display font-bold mb-3 inline-flex items-center gap-2 text-end w-full justify-end">
              <span>غير متاح أو قارب يخلص</span>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {stats.lowStock.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-end">
                  <span className="text-[11px] font-bold text-destructive tabular-nums" dir="ltr">{p.stock_qty}</span>
                  <p className="text-xs font-bold truncate flex-1">{p.name}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick links */}
        <section className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {enabled("orders") && <QuickLink icon={ClipboardList} label="الطلبات" to="/admin/orders" />}
          {enabled("products") && <QuickLink icon={Boxes} label="المنتجات" to="/admin/products" />}
          {enabled("purchases") && <QuickLink icon={ShoppingBag} label="المشتريات" to="/admin/purchases" />}
          {enabled("offers") && <QuickLink icon={Tag} label="العروض" to="/admin/offers" />}
          {enabled("customers") && <QuickLink icon={Users} label="العملاء" to="/admin/customers" />}
          {enabled("warehouse") && <QuickLink icon={WarehouseIcon} label="المخزن" to="/warehouse" />}
          {enabled("messages") && <QuickLink icon={MessageSquare} label="رسائل العملاء" to="/admin/messages" />}
          {enabled("accounting") && <QuickLink icon={DollarSign} label="المحاسبة" to="/accounting" />}
        </section>
      </main>
    </div>
  );
}

function AnnouncementForm() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("أزرق ماركت");
  const [body, setBody] = useState("طلباتك أوامر");
  const [active, setActive] = useState(true);

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("اكتب عنوان للإعلان");
      const { error } = await supabase.from("welcome_messages").insert({
        title, body, is_active: active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الإعلان ✓");
      qc.invalidateQueries({ queryKey: ["welcome_messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
      <div className="text-end">
        <h3 className="font-display font-bold">إعلان العملاء</h3>
        <p className="text-[11px] text-muted-foreground">رسالة تظهر للعميل أول ما يفتح التطبيق.</p>
      </div>
      <Input dir="rtl" placeholder="عنوان الإعلان" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea dir="rtl" placeholder="نص الرسالة" value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-card p-3 text-sm font-medium outline-none focus:border-ring" />
      <label className="flex items-center justify-end gap-2 text-xs font-bold cursor-pointer">
        نشط ويظهر للعملاء
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-primary" />
      </label>
      <Button variant="hero" className="w-full gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
        <Save className="h-4 w-4" /> حفظ الإعلان
      </Button>
      <p className="text-[10px] text-muted-foreground text-end">يمكنك إدارة كل الرسائل من <Link to="/admin/messages" className="text-primary font-bold hover:underline">صفحة الرسائل</Link></p>
    </div>
  );
}

const tones = {
  primary: "bg-primary-soft text-primary border-primary/15",
  accent: "bg-accent-soft text-accent-foreground border-accent/15",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/15 text-warning-foreground border-warning/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
} as const;

function Kpi({ tone, label, value }: { tone: keyof typeof tones; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs text-end">
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-2xl sm:text-3xl font-bold tabular-nums ${tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "text-primary"}`} dir="ltr">{value}</p>
    </div>
  );
}

function QuickLink({ icon: Icon, label, to }: { icon: typeof Boxes; label: string; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs hover:border-primary hover:shadow-soft transition">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="h-5 w-5" /></div>
      <span className="text-sm font-bold">{label}</span>
    </Link>
  );
}
