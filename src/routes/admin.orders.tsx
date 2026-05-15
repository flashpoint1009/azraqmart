import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search, Truck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { AssignDeliveryDialog } from "@/components/AssignDeliveryDialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAppSettings } from "@/hooks/useAppSettings";
import { isFeatureEnabled } from "@/lib/features";

export const Route = createFileRoute("/admin/orders")({
  head: () => ({ meta: [{ title: "الطلبات — Zone Mart" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer", "accountant", "warehouse"]}>
      <AdminOrdersPage />
    </RoleGuard>
  ),
});

const STATUSES = [
  { v: "all", t: "الكل", c: "bg-foreground text-background" },
  { v: "pending", t: "طلب جديد", c: "bg-primary-soft text-primary" },
  { v: "preparing", t: "جاري التجهيز", c: "bg-primary-soft text-primary" },
  { v: "ready", t: "جاهز للتسليم", c: "bg-accent-soft text-accent-foreground" },
  { v: "shipping", t: "في الطريق", c: "bg-warning/15 text-warning-foreground" },
  { v: "delivered", t: "تم التوصيل", c: "bg-success/10 text-success" },
  { v: "cancelled", t: "ملغي", c: "bg-muted text-muted-foreground" },
  { v: "rejected", t: "مرفوض", c: "bg-destructive/10 text-destructive" },
];

const RANGES = [
  { v: "all", t: "الكل" },
  { v: "today", t: "النهارده" },
  { v: "7", t: "آخر 7 أيام" },
  { v: "30", t: "الشهر ده" },
];

function AdminOrdersPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");
  const [assignOrder, setAssignOrder] = useState<{ id: string; number: number; assigned: string | null } | null>(null);
  const { hasAny } = useUserRoles();
  const { settings } = useAppSettings();
  const deliveryEnabled = isFeatureEnabled(settings?.features, "delivery");
  const canAssign = hasAny("admin", "developer", "accountant") && deliveryEnabled;

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders", status, range],
    queryFn: async () => {
      let qb = supabase.from("orders").select("id, order_number, total, status, created_at, customer_id, assigned_delivery, delivery_status, customers(shop_name, phone), order_items(qty)").order("created_at", { ascending: false }).limit(500);
      if (status !== "all") qb = qb.eq("status", status);
      if (range === "today") {
        qb = qb.gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
      } else if (range === "7") {
        qb = qb.gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
      } else if (range === "30") {
        qb = qb.gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
      }
      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = orders.filter((o: any) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      String(o.order_number).includes(needle) ||
      o.customers?.shop_name?.toLowerCase().includes(needle) ||
      o.customers?.phone?.includes(needle)
    );
  });

  const exportCsv = () => {
    const rows = [["رقم الطلب", "العميل", "الموبايل", "عدد المنتجات", "القيمة", "الحالة", "التاريخ"]];
    filtered.forEach((o: any) => {
      rows.push([
        `#${o.order_number}`,
        o.customers?.shop_name ?? "—",
        o.customers?.phone ?? "—",
        String(o.order_items?.length ?? 0),
        String(o.total),
        o.status,
        new Date(o.created_at).toLocaleString("ar-EG"),
      ]);
    });
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `orders-${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> تصدير CSV
          </Button>
          <div className="text-end">
            <p className="text-xs font-bold text-primary">Zone Mart</p>
            <h1 className="font-display text-3xl font-bold mt-1">الطلبات</h1>
            <p className="text-sm text-muted-foreground mt-1">{filtered.length} طلب من {orders.length}</p>
          </div>
        </header>

        <div className="mb-4 relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم العميل أو الموبايل أو رقم الطلب…" className="h-12 w-full rounded-xl border border-border bg-card pr-10 pl-3 text-sm font-medium outline-none focus:border-ring" />
        </div>

        <div className="mb-3 flex flex-wrap gap-2 justify-end">
          {RANGES.map((r) => (
            <button key={r.v} onClick={() => setRange(r.v)} className={`h-9 px-4 rounded-full text-xs font-bold transition ${range === r.v ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>{r.t}</button>
          ))}
        </div>

        <div className="mb-5 flex flex-wrap gap-2 justify-end">
          {STATUSES.map((s) => (
            <button key={s.v} onClick={() => setStatus(s.v)} className={`h-9 px-4 rounded-full text-xs font-bold transition ${status === s.v ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>{s.t}</button>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] font-bold uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-end">رقم الطلب</th>
                <th className="p-3 text-end">اسم العميل</th>
                <th className="p-3 text-end">المنتجات</th>
                <th className="p-3 text-end">القيمة</th>
                <th className="p-3 text-end">الحالة</th>
                <th className="p-3 text-end">التاريخ</th>
                {canAssign && <th className="p-3 text-end">المندوب</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o: any) => {
                const st = STATUSES.find((s) => s.v === o.status) ?? STATUSES[1];
                return (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="p-3 font-display font-bold" dir="ltr">#{o.order_number}</td>
                    <td className="p-3 text-end">
                      <p className="font-bold">{o.customers?.shop_name ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground" dir="ltr">{o.customers?.phone ?? ""}</p>
                    </td>
                    <td className="p-3 font-bold tabular-nums" dir="ltr">{o.order_items?.length ?? 0} منتج</td>
                    <td className="p-3 font-bold tabular-nums text-primary" dir="ltr">{Number(o.total).toLocaleString("en")} ج.م</td>
                    <td className="p-3"><span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold ${st.c}`}>{st.t}</span></td>
                    <td className="p-3 text-[11px] text-muted-foreground tabular-nums" dir="ltr">{new Date(o.created_at).toLocaleString("ar-EG")}</td>
                    {canAssign && (
                      <td className="p-3">
                        <Button
                          variant={o.assigned_delivery ? "outline" : "default"}
                          size="sm"
                          className="gap-1.5 text-[11px]"
                          onClick={() => setAssignOrder({ id: o.id, number: o.order_number, assigned: o.assigned_delivery })}
                        >
                          <Truck className="h-3.5 w-3.5" />
                          {o.assigned_delivery ? "إعادة إسناد" : "إسناد لمندوب"}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={canAssign ? 7 : 6} className="p-10 text-center text-muted-foreground">لا توجد طلبات تطابق الفلتر</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {assignOrder && (
        <AssignDeliveryDialog
          open={!!assignOrder}
          onOpenChange={(v) => !v && setAssignOrder(null)}
          orderId={assignOrder.id}
          orderNumber={assignOrder.number}
          currentAssigned={assignOrder.assigned}
        />
      )}
    </div>
  );
}
