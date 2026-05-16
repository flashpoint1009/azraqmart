import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MapPin, Package, Phone, Truck, ChevronLeft, Clock, AlertCircle } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { RoleGuard } from "@/components/RoleGuard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/delivery")({
  head: () => ({ meta: [{ title: "طلباتي — المندوب" }] }),
  component: () => (
    <RoleGuard allow={["delivery", "admin", "developer"]}>
      <DeliveryPage />
    </RoleGuard>
  ),
});

type Order = {
  id: string;
  order_number: number;
  total: number;
  delivery_status: string | null;
  delivery_notes: string | null;
  status: string;
  created_at: string;
  assigned_at: string | null;
  customers: { shop_name: string; phone: string; address: string | null; city: string | null } | null;
  order_items: { qty: number }[];
};

const STATUS_META: Record<string, { label: string; tone: string; icon: typeof Truck }> = {
  assigned: { label: "تم الإسناد", tone: "bg-primary-soft text-primary border-primary/30", icon: Package },
  received: { label: "تم الاستلام", tone: "bg-accent/15 text-accent-foreground border-accent/30", icon: CheckCircle2 },
  on_the_way: { label: "في الطريق", tone: "bg-warning/15 text-warning-foreground border-warning/30", icon: Truck },
  delivered: { label: "تم التسليم", tone: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  failed: { label: "فشل التسليم", tone: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertCircle },
  returned: { label: "مرتجع", tone: "bg-muted text-muted-foreground border-border", icon: AlertCircle },
};

function DeliveryPage() {
  const pathname = useLocation({ select: (location) => location.pathname });

  if (pathname !== "/delivery") {
    return <Outlet />;
  }

  return <DeliveryListPage />;
}

function DeliveryListPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["delivery-my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, total, delivery_status, delivery_notes, status, created_at, assigned_at, customers(shop_name, phone, address, city), order_items(qty)",
        )
        .eq("assigned_delivery", user!.id)
        .order("assigned_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`delivery-orders-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `assigned_delivery=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["delivery-my-orders", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const active = orders.filter((o) => !["delivered", "failed", "returned"].includes(o.delivery_status ?? ""));
  const done = orders.filter((o) => ["delivered", "failed", "returned"].includes(o.delivery_status ?? ""));

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-[900px] px-3 py-4 sm:px-4 sm:py-6">
        <header className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-primary">مساحة المندوب</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">طلباتي</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {active.length} طلب نشط • {done.length} منتهي
            </p>
          </div>
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
            <Truck className="h-7 w-7" />
          </div>
        </header>

        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-12">جارٍ التحميل…</div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-bold">لا توجد طلبات مسندة إليك حالياً</p>
            <p className="mt-1 text-xs text-muted-foreground">سيتم إعلامك فور إسناد طلب جديد.</p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <section className="space-y-3 mb-6">
                <h2 className="text-sm font-bold text-muted-foreground px-1">نشطة</h2>
                {active.map((o) => <OrderCard key={o.id} o={o} />)}
              </section>
            )}
            {done.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-muted-foreground px-1">منتهية</h2>
                {done.map((o) => <OrderCard key={o.id} o={o} />)}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function OrderCard({ o }: { o: Order }) {
  const meta = STATUS_META[o.delivery_status ?? "assigned"] ?? STATUS_META.assigned;
  const Icon = meta.icon;
  const items = o.order_items.reduce((s, i) => s + (i.qty ?? 0), 0);
  const done = ["delivered", "failed", "returned"].includes(o.delivery_status ?? "");

  return (
    <Link
      to="/delivery/$orderId"
      params={{ orderId: o.id }}
      className={`block rounded-2xl border bg-card p-4 shadow-xs transition active:scale-[0.99] ${done ? "opacity-70 border-border" : "border-primary/20 hover:border-primary/40"}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold leading-tight truncate">{o.customers?.shop_name || "عميل"}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{[o.customers?.city, o.customers?.address].filter(Boolean).join(" — ") || "بدون عنوان"}</span>
          </p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.tone}`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 text-[11px] font-bold">
        <span className="font-mono text-primary" dir="ltr">#{o.order_number}</span>
        <span className="text-muted-foreground" dir="ltr">{items} منتج</span>
        <span className="tabular-nums text-foreground" dir="ltr">{Number(o.total).toLocaleString("en")} ج.م</span>
        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
      </div>

      {o.assigned_at && (
        <p className="mt-2 text-[10px] text-muted-foreground inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> أُسند {new Date(o.assigned_at).toLocaleString("ar-EG")}
        </p>
      )}
    </Link>
  );
}
