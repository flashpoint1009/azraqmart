import { createFileRoute, Link, Outlet, useLocation, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Eye, Loader2, Package, Search, Truck, XCircle } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "طلباتي — أزرق ماركت" },
      { name: "description", content: "تابع حالة طلباتك من أزرق ماركت لحظة بلحظة من قيد المراجعة وحتى التسليم." },
      { property: "og:title", content: "طلباتي — أزرق ماركت" },
      { property: "og:description", content: "تابع حالة طلبات الجملة الخاصة بك على أزرق ماركت." },
      { property: "og:url", content: "https://azraqmart.com/orders" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://azraqmart.com/orders" },
    ],
  }),
  component: OrdersPage,
});

const statusMap: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending: {
    label: "قيد المراجعة",
    cls: "bg-warning/15 text-warning-foreground border-warning/30",
    icon: Clock,
  },
  preparing: {
    label: "قيد التحضير",
    cls: "bg-primary-soft text-primary border-primary/20",
    icon: Package,
  },
  ready: {
    label: "جاهز للشحن",
    cls: "bg-primary-soft text-primary border-primary/20",
    icon: Package,
  },
  shipping: {
    label: "في الطريق",
    cls: "bg-accent-soft text-accent-foreground border-accent/30",
    icon: Truck,
  },
  out_for_delivery: {
    label: "خرج للتوصيل",
    cls: "bg-accent-soft text-accent-foreground border-accent/30",
    icon: Truck,
  },
  delivered: {
    label: "تم التسليم",
    cls: "bg-success/10 text-success border-success/20",
    icon: CheckCircle2,
  },
  canceled: {
    label: "ملغي",
    cls: "bg-destructive/10 text-destructive border-destructive/20",
    icon: XCircle,
  },
};

function OrdersPage() {
  const pathname = useLocation({ select: (location) => location.pathname });

  if (pathname !== "/orders") {
    return <Outlet />;
  }

  return <OrdersListPage />;
}

function OrdersListPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const isNavigating = useRouterState({ select: (s) => s.status === "pending" });

  const { data: orders = [] } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: cust } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!cust) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, status, total, payment_status, created_at, notes")
        .eq("customer_id", cust.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = orders.filter((o) => {
    if (tab !== "all" && o.status !== tab) return false;
    if (q && !String(o.order_number).includes(q)) return false;
    return true;
  });

  const tabs = [
    { id: "all", label: "الكل", count: orders.length },
    {
      id: "pending",
      label: "قيد المراجعة",
      count: orders.filter((o) => o.status === "pending").length,
    },
    {
      id: "preparing",
      label: "قيد التحضير",
      count: orders.filter((o) => ["preparing", "ready"].includes(o.status)).length,
    },
    {
      id: "delivered",
      label: "تم التسليم",
      count: orders.filter((o) => o.status === "delivered").length,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-5">
          <p className="text-xs font-bold text-primary">سجل الطلبات</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">طلباتي</h1>
          <p className="text-xs text-muted-foreground mt-1">تابع حالة كل طلب لحد ما يوصلك</p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${tab === t.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
              >
                {t.label} <span className="opacity-70">({t.count})</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="رقم الطلب…"
              aria-label="ابحث برقم الطلب"
              className="h-10 w-44 rounded-xl border border-border bg-card pr-9 pl-3 text-xs font-bold outline-none focus:border-ring"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-bold">لا توجد طلبات بعد</p>
            <Button asChild className="mt-4">
              <Link to="/products">ابدأ التسوّق</Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
            {filtered.map((o, i) => {
              const s = statusMap[o.status] ?? statusMap.pending;
              return (
                <div
                  key={o.id}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 ${i !== filtered.length - 1 ? "border-b border-border" : ""}`}
                >
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary shrink-0">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-display text-sm font-bold" dir="ltr">
                        #{o.order_number}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${s.cls}`}
                      >
                        {s.label}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground mt-0.5" dir="ltr">
                      {new Date(o.created_at).toLocaleDateString("ar-EG")}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="text-end">
                      <p className="text-[10px] font-semibold text-muted-foreground">الإجمالي</p>
                      <p className="font-display text-lg font-bold" dir="ltr">
                        {Number(o.total).toLocaleString("en")}
                        <span className="text-xs font-medium text-muted-foreground"> ج.م</span>
                      </p>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="gap-1.5 min-w-[96px]"
                      disabled={pendingId === o.id}
                    >
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: o.id }}
                        preload="intent"
                        onClick={() => setPendingId(o.id)}
                      >
                        {pendingId === o.id && isNavigating ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            جاري الفتح…
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            تفاصيل
                          </>
                        )}
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
