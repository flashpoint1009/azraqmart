import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  MessageCircle,
  Package,
  Printer,
  Truck,
  XCircle,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/orders/$orderId")({
  head: () => ({ meta: [{ title: "تفاصيل الطلب — Zone Mart" }] }),
  component: OrderDetailPage,
});

const STATUS: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: "قيد المراجعة", cls: "bg-warning/15 text-warning-foreground", icon: Clock },
  preparing: { label: "قيد التحضير", cls: "bg-primary-soft text-primary", icon: Package },
  ready: { label: "جاهز للشحن", cls: "bg-primary-soft text-primary", icon: Package },
  shipping: { label: "في الطريق", cls: "bg-accent-soft text-accent-foreground", icon: Truck },
  out_for_delivery: {
    label: "خرج للتوصيل",
    cls: "bg-accent-soft text-accent-foreground",
    icon: Truck,
  },
  delivered: { label: "تم التسليم", cls: "bg-success/10 text-success", icon: CheckCircle2 },
  canceled: { label: "ملغي", cls: "bg-destructive/10 text-destructive", icon: XCircle },
};

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { user } = useAuth();
  const { settings } = useAppSettings();

  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data: order } = await supabase
        .from("orders")
        .select("id, order_number, status, total, payment_status, created_at, notes, customer_id, assigned_delivery, delivery_status")
        .eq("id", orderId)
        .maybeSingle();
      if (!order) return null;
      const { data: items } = await supabase
        .from("order_items")
        .select("product_name, qty, unit_price, line_total")
        .eq("order_id", order.id);
      const { data: customer } = await supabase
        .from("customers")
        .select("shop_name, phone, address, city")
        .eq("id", order.customer_id!)
        .maybeSingle();
      let delivery: { full_name: string | null; phone: string | null } | null = null;
      if (order.assigned_delivery) {
        const { data: d } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("user_id", order.assigned_delivery)
          .maybeSingle();
        delivery = d ?? null;
      }
      return { order, items: items ?? [], customer, delivery };
    },
  });

  const downloadPdf = () => {
    if (!data) return;
    const { order, items, customer } = data;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    let y = 40;
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, W, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text(settings?.app_name || "Azraq Market", W - 40, 35, { align: "right" });
    doc.setFontSize(10);
    doc.text(settings?.app_slogan || "Wholesale", W - 40, 55, { align: "right" });
    doc.setTextColor(20, 20, 20);
    y = 100;
    doc.setFontSize(16);
    doc.text(`Invoice #${order.order_number}`, 40, y);
    doc.setFontSize(10);
    doc.text(new Date(order.created_at).toLocaleString("en-GB"), W - 40, y, { align: "right" });
    y += 25;
    doc.setFontSize(11);
    doc.text(`Customer: ${customer?.shop_name ?? user?.email ?? "-"}`, 40, y);
    y += 16;
    if (customer?.phone) {
      doc.text(`Phone: ${customer.phone}`, 40, y);
      y += 16;
    }
    if (customer?.address) {
      doc.text(`Address: ${customer.address}${customer.city ? ", " + customer.city : ""}`, 40, y);
      y += 16;
    }
    doc.text(`Status: ${order.status}  |  Payment: ${order.payment_status ?? "-"}`, 40, y);
    y += 24;

    // table header
    doc.setFillColor(240, 244, 255);
    doc.rect(40, y, W - 80, 22, "F");
    doc.setFontSize(10);
    doc.text("Product", 50, y + 15);
    doc.text("Qty", W - 220, y + 15);
    doc.text("Price", W - 160, y + 15);
    doc.text("Total", W - 90, y + 15);
    y += 28;
    items.forEach((it) => {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      doc.text(String(it.product_name).slice(0, 50), 50, y);
      doc.text(String(it.qty), W - 220, y);
      doc.text(Number(it.unit_price).toFixed(2), W - 160, y);
      doc.text(Number(it.line_total).toFixed(2), W - 90, y);
      y += 18;
    });
    y += 10;
    doc.setDrawColor(220);
    doc.line(40, y, W - 40, y);
    y += 20;
    doc.setFontSize(13);
    doc.text(`Total: ${Number(order.total).toFixed(2)} EGP`, W - 40, y, { align: "right" });
    doc.save(`invoice-${order.order_number}.pdf`);
  };

  const sendInvoice = () => {
    if (!data) return;
    const { order, items, customer } = data;
    const lines = items
      .map(
        (it) =>
          `- ${it.product_name} × ${it.qty} = ${Number(it.line_total).toLocaleString("en")} ج.م`,
      )
      .join("\n");
    const message = [
      `${settings?.app_name || "Zone Mart"}`,
      `فاتورة طلب #${order.order_number}`,
      customer?.shop_name ? `العميل: ${customer.shop_name}` : null,
      customer?.phone ? `الهاتف: ${customer.phone}` : null,
      "",
      lines,
      "",
      `الإجمالي: ${Number(order.total).toLocaleString("en")} ج.م`,
    ]
      .filter(Boolean)
      .join("\n");
    const phone = customer?.phone?.replace(/\D/g, "") || "";
    const normalizedPhone = phone.startsWith("0") ? `20${phone.slice(1)}` : phone;
    const url = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6">
          <p className="text-sm text-muted-foreground">جاري التحميل…</p>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl p-6">
          <p className="text-sm font-bold">الطلب غير موجود</p>
          <Button asChild variant="outline" className="mt-3">
            <Link to="/orders">رجوع</Link>
          </Button>
        </main>
      </div>
    );
  }

  const { order, items, customer, delivery } = data;
  const s = STATUS[order.status] ?? STATUS.pending;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 lg:px-6 lg:py-8">
        <div className="mb-4 flex items-center justify-between">
          <Link
            to="/orders"
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            <ArrowRight className="h-3.5 w-3.5" /> طلباتي
          </Link>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 font-bold"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" /> طباعة
            </Button>
            <Button variant="hero" size="sm" className="gap-1.5 font-bold" onClick={downloadPdf}>
              <Download className="h-3.5 w-3.5" /> تحميل PDF
            </Button>
            <Button variant="accent" size="sm" className="gap-1.5 font-bold" onClick={sendInvoice}>
              <MessageCircle className="h-3.5 w-3.5" /> إرسال الفاتورة
            </Button>
          </div>
        </div>

        <article className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="text-[11px] font-bold text-primary">فاتورة طلب</p>
              <h1 className="font-display text-2xl font-bold mt-1" dir="ltr">
                #{order.order_number}
              </h1>
              <p className="text-xs text-muted-foreground mt-1" dir="ltr">
                {new Date(order.created_at).toLocaleString("ar-EG")}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${s.cls}`}
            >
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </span>
          </header>

          <section className="grid gap-4 sm:grid-cols-2 py-5 border-b border-border">
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">العميل</p>
              <p className="text-sm font-bold mt-1">{customer?.shop_name ?? user?.email}</p>
              {customer?.phone && (
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {customer.phone}
                </p>
              )}
              {customer?.address && (
                <p className="text-xs text-muted-foreground">
                  {customer.address}
                  {customer.city && `، ${customer.city}`}
                </p>
              )}
            </div>
            <div className="sm:text-end">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">حالة الدفع</p>
              <p className="text-sm font-bold mt-1">
                {order.payment_status === "paid" ? "مدفوع" : "غير مدفوع"}
              </p>
            </div>
          </section>

          {(order.assigned_delivery || delivery) && (
            <section className="py-4 border-b border-border">
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">المندوب</p>
              <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary-soft/40 p-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Truck className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{delivery?.full_name || "مندوب التوصيل"}</p>
                  {delivery?.phone && (
                    <a href={`tel:${delivery.phone}`} className="text-xs text-primary font-mono inline-flex items-center gap-1" dir="ltr">
                      <MessageCircle className="h-3 w-3" /> {delivery.phone}
                    </a>
                  )}
                </div>
                {order.delivery_status && (
                  <span className="text-[10px] font-bold rounded-md bg-primary/10 text-primary border border-primary/30 px-2 py-0.5">
                    {order.delivery_status}
                  </span>
                )}
              </div>
            </section>
          )}

          <section className="py-5">
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-[11px] font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start">المنتج</th>
                    <th className="px-3 py-2 text-center">الكمية</th>
                    <th className="px-3 py-2 text-end">السعر</th>
                    <th className="px-3 py-2 text-end">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 font-semibold">{it.product_name}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{it.qty}</td>
                      <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                        {Number(it.unit_price).toLocaleString("en")}
                      </td>
                      <td className="px-3 py-2 text-end font-bold tabular-nums" dir="ltr">
                        {Number(it.line_total).toLocaleString("en")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="flex items-center justify-between border-t border-border pt-5">
            <span className="font-display text-base font-bold">الإجمالي</span>
            <span className="font-display text-2xl font-bold text-primary" dir="ltr">
              {Number(order.total).toLocaleString("en")}
              <span className="text-xs font-medium text-muted-foreground"> ج.م</span>
            </span>
          </footer>
        </article>
      </main>
    </div>
  );
}
