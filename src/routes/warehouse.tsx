import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  ClipboardList,
  History,
  PackageCheck,
  Pencil,
  Printer,
  Search,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { AssignDeliveryDialog } from "@/components/AssignDeliveryDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/hooks/useAppSettings";
import { isFeatureEnabled } from "@/lib/features";

export const Route = createFileRoute("/warehouse")({
  head: () => ({ meta: [{ title: "المخزن" }] }),
  component: () => (
    <RoleGuard allow={["warehouse", "accountant", "admin", "developer"]}>
      <WarehousePage />
    </RoleGuard>
  ),
});

const STATUS_FLOW: Record<string, { next: string | null; label: string; nextLabel: string }> = {
  pending: { next: "preparing", label: "بانتظار التحضير", nextLabel: "بدء التحضير" },
  preparing: { next: "ready", label: "قيد التحضير", nextLabel: "تم التجهيز" },
  ready: { next: null, label: "جاهز للتسليم", nextLabel: "" },
  shipping: { next: null, label: "في الطريق", nextLabel: "" },
  out_for_delivery: { next: null, label: "في الطريق", nextLabel: "" },
  delivered: { next: null, label: "تم التسليم", nextLabel: "" },
};

const MOVEMENT_LABELS: Record<string, string> = {
  in: "وارد",
  out: "منصرف",
  adjust: "تسوية",
  return: "مرتجع",
};

type Product = {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  stock_qty: number;
  low_stock_threshold: number | null;
  image_url: string | null;
  category_id: string | null;
};

function WarehousePage() {
  const qc = useQueryClient();
  const [stockSearch, setStockSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [reportDays, setReportDays] = useState(7);
  const [assignOrder, setAssignOrder] = useState<{ id: string; number: number; assigned: string | null } | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ["wh_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, assigned_delivery, delivery_status, customers(shop_name, phone, city), order_items(qty, product_name, unit_price)")
        .neq("status", "delivered")
        .neq("status", "cancelled")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const advance = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: string }) => {
      const updates: { status: string; delivered_at?: string } = { status: next };
      if (next === "delivered") updates.delivered_at = new Date().toISOString();
      const { error } = await supabase.from("orders").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث حالة الطلب");
      qc.invalidateQueries({ queryKey: ["wh_orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = orders.reduce(
    (acc: Record<string, number>, o: { status: string }) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    },
    {},
  );

  const { data: stock = [] } = useQuery({
    queryKey: ["wh_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brand, sku, stock_qty, low_stock_threshold, image_url, category_id")
        .eq("is_active", true)
        .order("stock_qty", { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
  });

  const lowStock = stock.filter((p) => p.stock_qty <= (p.low_stock_threshold ?? 10));
  const outOfStock = stock.filter((p) => p.stock_qty <= 0);

  const filteredStock = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return stock;
    return stock.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q),
    );
  }, [stock, stockSearch]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return orders;
    return (orders as any[]).filter(
      (o) =>
        String(o.order_number).includes(q) ||
        (o.customers?.shop_name ?? "").toLowerCase().includes(q) ||
        (o.customers?.phone ?? "").includes(q),
    );
  }, [orders, orderSearch]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-6">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
            <WarehouseIcon className="h-3.5 w-3.5" /> المخزن
          </p>
          <h1 className="font-display text-3xl font-bold mt-1">لوحة المخازن</h1>
          <p className="text-xs font-semibold text-muted-foreground mt-1">
            تجهيز الطلبات، متابعة المخزون، وحركة الوارد والمنصرف.
          </p>
        </header>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Stat icon={ClipboardList} label="بانتظار" value={counts.pending || 0} />
          <Stat icon={PackageCheck} label="قيد التحضير" value={counts.preparing || 0} tone="warning" />
          <Stat icon={CheckCircle2} label="جاهز" value={counts.ready || 0} tone="success" />
          <Stat icon={Truck} label="في الطريق" value={counts.out_for_delivery || 0} tone="primary" />
          <Stat icon={AlertTriangle} label="مخزون منخفض" value={lowStock.length} tone="warning" />
          <Stat icon={AlertTriangle} label="نفد" value={outOfStock.length} tone="danger" />
        </div>

        {lowStock.length > 0 && (
          <div className="mb-4 rounded-2xl border border-warning/30 bg-warning/5 p-3 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <span className="font-bold text-foreground">
              تنبيه: في {lowStock.length} منتج مخزونهم وصل للحد الأدنى أو نفد. راجع تبويب "المخزون".
            </span>
          </div>
        )}

        <Tabs defaultValue="queue">
          <TabsList>
            <TabsTrigger value="queue">
              للتجهيز ({orders.filter((o: { status: string }) => ["pending", "preparing", "ready"].includes(o.status)).length})
            </TabsTrigger>
            <TabsTrigger value="all">كل الطلبات النشطة ({orders.length})</TabsTrigger>
            <TabsTrigger value="stock">المخزون ({stock.length})</TabsTrigger>
            <TabsTrigger value="movements">حركة المخزون</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-4 space-y-3">
            <OrderSearchBar value={orderSearch} onChange={setOrderSearch} />
            <OrdersList
              orders={filteredOrders.filter((o: { status: string }) =>
                ["pending", "preparing", "ready"].includes(o.status),
              )}
              advance={advance}
              onAssign={(o) => setAssignOrder({ id: o.id, number: o.order_number, assigned: o.assigned_delivery ?? null })}
            />
          </TabsContent>

          <TabsContent value="all" className="mt-4 space-y-3">
            <OrderSearchBar value={orderSearch} onChange={setOrderSearch} />
            <OrdersList
              orders={filteredOrders}
              advance={advance}
              onAssign={(o) => setAssignOrder({ id: o.id, number: o.order_number, assigned: o.assigned_delivery ?? null })}
            />
          </TabsContent>

          <TabsContent value="stock" className="mt-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ابحث باسم المنتج، الكود، أو الماركة"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            <StockList items={filteredStock} onEdit={setEditing} />
          </TabsContent>

          <TabsContent value="movements" className="mt-4">
            <MovementsReport days={reportDays} onDaysChange={setReportDays} />
          </TabsContent>
        </Tabs>
      </main>

      <StockEditDialog
        product={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["wh_stock"] });
          qc.invalidateQueries({ queryKey: ["wh_movements"] });
        }}
      />

      {assignOrder && (
        <AssignDeliveryDialog
          open={!!assignOrder}
          onOpenChange={(v) => {
            if (!v) {
              setAssignOrder(null);
              qc.invalidateQueries({ queryKey: ["wh_orders"] });
            }
          }}
          orderId={assignOrder.id}
          orderNumber={assignOrder.number}
          currentAssigned={assignOrder.assigned}
        />
      )}
    </div>
  );
}

function OrderSearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="ابحث برقم الطلب، اسم المحل، أو رقم الموبايل"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
    </div>
  );
}

function StockList({ items, onEdit }: { items: Product[]; onEdit: (p: Product) => void }) {
  if (items.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
        لا توجد منتجات
      </div>
    );
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-[11px] font-bold uppercase text-muted-foreground">
          <tr>
            <th className="p-3 text-end">المنتج</th>
            <th className="p-3 text-end">الكود</th>
            <th className="p-3 text-end">المخزون</th>
            <th className="p-3 text-end">الحد الأدنى</th>
            <th className="p-3 text-end">الحالة</th>
            <th className="p-3 text-end">إجراء</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const out = p.stock_qty <= 0;
            const low = !out && p.stock_qty <= (p.low_stock_threshold ?? 10);
            const cls = out
              ? "bg-destructive/10 text-destructive"
              : low
                ? "bg-warning/15 text-warning-foreground"
                : "bg-success/10 text-success";
            const lbl = out ? "نفد" : low ? "منخفض" : "متاح";
            return (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                <td className="p-3 text-end">
                  <div className="flex items-center justify-end gap-2">
                    <div>
                      <p className="font-bold">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">{p.brand ?? ""}</p>
                    </div>
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg object-cover bg-surface-2" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-surface-2" />
                    )}
                  </div>
                </td>
                <td className="p-3 text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                  {p.sku ?? "—"}
                </td>
                <td className="p-3 font-display font-bold tabular-nums" dir="ltr">
                  {p.stock_qty}
                </td>
                <td className="p-3 text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                  {p.low_stock_threshold ?? 10}
                </td>
                <td className="p-3">
                  <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${cls}`}>{lbl}</span>
                </td>
                <td className="p-3">
                  <Button size="sm" variant="outline" onClick={() => onEdit(p)} className="gap-1">
                    <Pencil className="h-3.5 w-3.5" /> تعديل
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StockEditDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"in" | "out" | "adjust" | "return">("in");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!product) return;
    const n = Number(qty);
    if (!n || isNaN(n) || n <= 0) {
      toast.error("ادخل كمية صحيحة");
      return;
    }
    setSaving(true);
    try {
      const delta = type === "in" || type === "return" ? n : -n;
      const { error } = await supabase.rpc("adjust_stock", {
        _product_id: product.id,
        _delta: delta,
        _movement_type: type,
        _reason: reason.trim() || undefined,
      });
      if (error) throw error;
      toast.success("تم تسجيل الحركة");
      setQty("");
      setReason("");
      setType("in");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تسجيل الحركة");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل مخزون: {product?.name}</DialogTitle>
        </DialogHeader>
        {product && (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الكمية الحالية</span>
                <span className="font-bold tabular-nums" dir="ltr">
                  {product.stock_qty}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">نوع الحركة</label>
              <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-surface-2 p-1">
                {(["in", "out", "adjust", "return"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`h-8 rounded-lg text-xs font-bold transition ${
                      type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {MOVEMENT_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">الكمية</label>
              <Input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="مثال: 20" dir="ltr" />
              <p className="text-[10px] text-muted-foreground">
                {type === "in" || type === "return" ? "هتُضاف للمخزون" : "هتُخصم من المخزون"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold">السبب (اختياري)</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: وارد فاتورة 1234" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementsReport({ days, onDaysChange }: { days: number; onDaysChange: (d: number) => void }) {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["wh_movements", days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, product_id, movement_type, qty, qty_before, qty_after, reason, created_at, products(name, sku)")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  type Row = {
    id: string;
    product_id: string;
    movement_type: string;
    qty: number;
    qty_before: number | null;
    qty_after: number | null;
    reason: string | null;
    created_at: string;
    products: { name: string; sku: string | null } | null;
  };
  const rows = movements as Row[];

  const summary = useMemo(() => {
    const byProduct = new Map<string, { name: string; in: number; out: number }>();
    for (const m of rows) {
      const key = m.product_id;
      const cur = byProduct.get(key) ?? { name: m.products?.name ?? "—", in: 0, out: 0 };
      if (m.movement_type === "in" || m.movement_type === "return") cur.in += Math.abs(m.qty);
      else cur.out += Math.abs(m.qty);
      byProduct.set(key, cur);
    }
    return [...byProduct.values()].sort((a, b) => b.in + b.out - (a.in + a.out));
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-1">
          {[1, 7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`h-8 px-3 rounded-lg text-xs font-bold transition ${
                days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d === 1 ? "النهارده" : `آخر ${d} يوم`}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1">
          <Printer className="h-3.5 w-3.5" /> طباعة
        </Button>
      </div>

      {summary.length > 0 && (
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2">
            <h3 className="font-bold text-sm">ملخص لكل منتج</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[11px] font-bold uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-end">المنتج</th>
                <th className="p-3 text-end">وارد</th>
                <th className="p-3 text-end">منصرف</th>
                <th className="p-3 text-end">صافي</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-3 font-bold text-end">{s.name}</td>
                  <td className="p-3 text-end font-bold text-success tabular-nums" dir="ltr">
                    +{s.in}
                  </td>
                  <td className="p-3 text-end font-bold text-destructive tabular-nums" dir="ltr">
                    -{s.out}
                  </td>
                  <td className="p-3 text-end font-bold tabular-nums" dir="ltr">
                    {s.in - s.out >= 0 ? "+" : ""}
                    {s.in - s.out}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-bold text-sm">سجل الحركات</h3>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">لا توجد حركات في الفترة المحددة</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((m) => {
              const isIn = m.movement_type === "in" || m.movement_type === "return";
              return (
                <li key={m.id} className="p-3 flex items-center gap-3">
                  <div
                    className={`grid h-9 w-9 place-items-center rounded-xl shrink-0 ${
                      isIn ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {isIn ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{m.products?.name ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {MOVEMENT_LABELS[m.movement_type]}
                      {m.reason ? ` • ${m.reason}` : ""}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="font-display font-bold tabular-nums" dir="ltr">
                      {m.qty > 0 ? "+" : ""}
                      {m.qty}
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                      {m.qty_before} → {m.qty_after}
                    </p>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0 w-24 text-end">
                    {new Date(m.created_at).toLocaleString("ar-EG", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrdersList({
  orders,
  advance,
  onAssign,
}: {
  orders: { id: string; order_number: number; status: string; total: number; assigned_delivery?: string | null; delivery_status?: string | null; customers?: { shop_name?: string; phone?: string; city?: string }; order_items?: { product_name: string; qty: number }[] }[];
  advance: { mutate: (v: { id: string; next: string }) => void };
  onAssign: (o: { id: string; order_number: number; assigned_delivery?: string | null }) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
        لا توجد طلبات
      </div>
    );
  }
  const { settings } = useAppSettings();
  const deliveryEnabled = isFeatureEnabled(settings?.features, "delivery");
  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const flow = STATUS_FLOW[o.status];
        const showAssign = deliveryEnabled && (o.status === "ready" || (o.status === "shipping" && !o.assigned_delivery));
        return (
          <article key={o.id} className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-bold">طلب #{o.order_number}</h3>
                  <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                    {flow?.label}
                  </span>
                  {o.assigned_delivery && (
                    <span className="rounded-md bg-accent/15 text-accent-foreground border border-accent/30 px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1">
                      <Truck className="h-3 w-3" /> مُسند لمندوب
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {o.customers?.shop_name || "—"} • {o.customers?.city || ""} • {o.customers?.phone || ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="font-display font-bold tabular-nums" dir="ltr">
                  {Number(o.total).toLocaleString("en")} ج.م
                </span>
                {flow?.next && (
                  <Button size="sm" onClick={() => advance.mutate({ id: o.id, next: flow.next! })}>
                    {flow.nextLabel}
                  </Button>
                )}
                {showAssign && (
                  <Button
                    size="sm"
                    variant={o.assigned_delivery ? "outline" : "default"}
                    className="gap-1.5"
                    onClick={() => onAssign(o)}
                  >
                    <Truck className="h-3.5 w-3.5" />
                    {o.assigned_delivery ? "إعادة إسناد" : "إسناد لمندوب"}
                  </Button>
                )}
              </div>
            </div>
            {o.order_items && o.order_items.length > 0 && (
              <ul className="mt-3 grid gap-1 border-t border-border pt-3 text-xs sm:grid-cols-2">
                {o.order_items.map((it, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{it.product_name}</span>
                    <span className="tabular-nums" dir="ltr">
                      ×{it.qty}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "muted",
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number;
  tone?: "muted" | "warning" | "success" | "primary" | "danger";
}) {
  const map = {
    muted: "bg-surface-2 text-muted-foreground",
    warning: "bg-warning/15 text-warning-foreground",
    success: "bg-success/10 text-success",
    primary: "bg-primary-soft text-primary",
    danger: "bg-destructive/10 text-destructive",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-xs flex items-center gap-3">
      <div className={`grid h-10 w-10 place-items-center rounded-xl ${map[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
