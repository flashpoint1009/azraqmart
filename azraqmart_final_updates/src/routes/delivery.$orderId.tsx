import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, MapPin, Phone, Navigation, Package, Truck, CheckCircle2, AlertCircle, RotateCcw, Clock, FileText, Loader2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/delivery/$orderId")({
  head: () => ({ meta: [{ title: "تفاصيل الطلب — المندوب" }] }),
  component: () => (
    <RoleGuard allow={["delivery", "admin", "developer", "accountant"]}>
      <OrderDetailPage />
    </RoleGuard>
  ),
});

const STATUS_FLOW = [
  { key: "received", label: "استلام الطلب", icon: Package, tone: "bg-primary text-primary-foreground" },
  { key: "on_the_way", label: "في الطريق", icon: Truck, tone: "bg-warning text-warning-foreground" },
  { key: "delivered", label: "تم التسليم", icon: CheckCircle2, tone: "bg-success text-success-foreground" },
];

const NEG_STATUSES = [
  { key: "failed", label: "فشل التسليم", icon: AlertCircle, tone: "bg-destructive text-destructive-foreground" },
  { key: "returned", label: "مرتجع", icon: RotateCcw, tone: "bg-muted-foreground text-background" },
];

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, total, status, delivery_status, delivery_notes, delivery_status_history, assigned_at, notes, customers(shop_name, owner_name, phone, address, city), order_items(id, product_name, qty, unit_price, line_total)",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase.rpc("update_delivery_status", {
        _order_id: orderId,
        _new_status: newStatus,
        _note: note || undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_d, status) => {
      toast.success("تم تحديث الحالة ✓");
      setNote("");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["delivery-my-orders"] });
      if (status === "delivered") setTimeout(() => navigate({ to: "/delivery" }), 800);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">جارٍ التحميل…</div>;
  }
  if (!order) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <AlertCircle className="mx-auto h-12 w-12 text-warning" />
          <p className="mt-3 font-bold">الطلب غير موجود أو ليس لديك صلاحية</p>
          <Button asChild className="mt-4"><Link to="/delivery">رجوع</Link></Button>
        </div>
      </div>
    );
  }

  const c = order.customers;
  const address = [c?.city, c?.address].filter(Boolean).join("، ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || c?.shop_name || "")}`;
  const currentStatus = order.delivery_status ?? "assigned";
  const isFinal = ["delivered", "failed", "returned"].includes(currentStatus);
  const history = Array.isArray(order.delivery_status_history) ? order.delivery_status_history : [];

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-3 py-4">
        <Link to="/delivery" className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary mb-3">
          <ArrowRight className="h-3.5 w-3.5" /> العودة لطلباتي
        </Link>

        {/* Customer card */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-xl font-bold leading-tight truncate">{c?.shop_name || "عميل"}</p>
              {c?.owner_name && <p className="text-xs text-muted-foreground mt-0.5">{c.owner_name}</p>}
              <p className="mt-2 text-sm inline-flex items-start gap-1.5">
                <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{address || "بدون عنوان"}</span>
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-mono font-bold" dir="ltr">
              #{order.order_number}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button asChild variant="hero" size="lg" className="gap-2 h-14 text-base">
              <a href={`tel:${c?.phone ?? ""}`}>
                <Phone className="h-5 w-5" /> اتصال
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 h-14 text-base">
              <a href={mapsUrl} target="_blank" rel="noreferrer">
                <Navigation className="h-5 w-5" /> الخريطة
              </a>
            </Button>
          </div>
        </section>

        {/* Items */}
        <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h3 className="font-bold mb-3 inline-flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> المنتجات</h3>
          <div className="space-y-2">
            {order.order_items?.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                <span className="text-sm font-bold truncate flex-1">{it.product_name}</span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0" dir="ltr">×{it.qty}</span>
                <span className="text-xs font-bold tabular-nums text-primary shrink-0 w-20 text-end" dir="ltr">
                  {Number(it.line_total).toLocaleString("en")} ج.م
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="font-bold">الإجمالي</span>
            <span className="font-display text-xl font-bold text-primary tabular-nums" dir="ltr">
              {Number(order.total).toLocaleString("en")} ج.م
            </span>
          </div>
          {order.notes && (
            <div className="mt-3 rounded-lg bg-accent/10 border border-accent/30 p-3">
              <p className="inline-flex items-center gap-1.5 text-xs font-bold mb-1"><FileText className="h-3.5 w-3.5" /> ملاحظات الطلب</p>
              <p className="text-xs">{order.notes}</p>
            </div>
          )}
          {order.delivery_notes && (
            <div className="mt-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
              <p className="inline-flex items-center gap-1.5 text-xs font-bold mb-1 text-primary"><FileText className="h-3.5 w-3.5" /> ملاحظات التوصيل</p>
              <p className="text-xs">{order.delivery_notes}</p>
            </div>
          )}
        </section>

        {/* Status actions */}
        {!isFinal && (
          <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
            <h3 className="font-bold mb-3">تحديث الحالة</h3>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظة (اختياري)…"
              rows={2}
              className="mb-3"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {STATUS_FLOW.map((s) => (
                <Button
                  key={s.key}
                  size="lg"
                  className={`h-14 text-base gap-2 ${s.tone}`}
                  disabled={updateStatus.isPending || currentStatus === s.key}
                  onClick={() => updateStatus.mutate(s.key)}
                >
                  {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <s.icon className="h-5 w-5" />}
                  {s.label}
                </Button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {NEG_STATUSES.map((s) => (
                <Button
                  key={s.key}
                  variant="outline"
                  size="lg"
                  className="h-12 gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate(s.key)}
                >
                  <s.icon className="h-4 w-4" />
                  {s.label}
                </Button>
              ))}
            </div>
          </section>
        )}

        {/* History */}
        {history.length > 0 && (
          <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
            <h3 className="font-bold mb-3 inline-flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> السجل</h3>
            <ol className="space-y-2">
              {history.slice().reverse().map((h: any, i: number) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="flex-1">
                    <p className="font-bold">{h.status}</p>
                    <p className="text-muted-foreground" dir="ltr">{new Date(h.at).toLocaleString("ar-EG")}</p>
                    {h.note && <p className="mt-0.5">{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </div>
  );
}
