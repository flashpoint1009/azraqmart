import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CreditCard, MapPin, MessageCircle, Package, Phone, ShoppingBag, Star, User as UserIcon, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/customers/$customerId")({
  head: () => ({ meta: [{ title: "ملف العميل — Admin" }] }),
  component: CustomerProfile,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة",
  preparing: "قيد التحضير",
  ready: "جاهز للشحن",
  shipping: "في الطريق",
  delivered: "تم التسليم",
  cancelled: "ملغي",
  rejected: "مرفوض",
};

function CustomerProfile() {
  const { customerId } = useParams({ from: "/admin/customers/$customerId" });

  const { data, isLoading } = useQuery({
    queryKey: ["customer-profile", customerId],
    queryFn: async () => {
      const { data: c, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;

      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, status, total, payment_status, created_at, delivery_status")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);

      let username: string | null = null;
      if (c?.user_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("username")
          .eq("user_id", c.user_id)
          .maybeSingle();
        username = prof?.username ?? null;
      }
      return { customer: c, orders: orders ?? [], username };
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader /><StaffNav />
        <div className="grid place-items-center py-32"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }
  if (!data?.customer) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader /><StaffNav />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">لم يتم العثور على العميل</p>
          <Button asChild variant="outline" className="mt-4"><Link to="/admin/customers">رجوع</Link></Button>
        </div>
      </div>
    );
  }

  const c = data.customer;
  const orders = data.orders;
  const totalSpent = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const phoneClean = (c.phone || "").replace(/\D/g, "");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader /><StaffNav />
      <main className="mx-auto max-w-[1200px] px-4 py-6 lg:px-6 lg:py-8 space-y-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link to="/admin/customers"><ArrowRight className="h-4 w-4" /> رجوع للعملاء</Link>
          </Button>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1">
              <a href={`tel:+2${phoneClean}`}><Phone className="h-3.5 w-3.5" /> اتصال</a>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1">
              <a href={`https://wa.me/2${phoneClean}`} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /> واتساب</a>
            </Button>
          </div>
        </div>

        {/* Header card */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="flex flex-wrap items-start gap-5">
            <div className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground font-display text-3xl font-bold shadow-glow">
              {(c.shop_name || "?").charAt(0)}
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold">{c.shop_name}</h1>
                {c.tier && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
                    <Star className="h-3 w-3 fill-current" />{c.tier}
                  </span>
                )}
                {c.is_active === false && (
                  <span className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">موقوف</span>
                )}
              </div>
              <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                {c.owner_name && <p className="inline-flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> {c.owner_name}</p>}
                <p dir="ltr" className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {c.phone}</p>
                {data.username && <p className="inline-flex items-center gap-1.5 text-foreground font-semibold"><UserIcon className="h-3.5 w-3.5" /> @{data.username}</p>}
                <p className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {[c.governorate, c.district, c.address].filter(Boolean).join(" — ") || c.city || "بدون عنوان"}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-border pt-4">
            <Stat icon={ShoppingBag} value={String(orders.length)} label="إجمالي الطلبات" />
            <Stat icon={Package} value={String(delivered)} label="تم تسليمها" />
            <Stat icon={CreditCard} value={`${totalSpent.toLocaleString("en")} ج.م`} label="إجمالي المشتريات" />
            <Stat icon={CreditCard} value={`${Number(c.balance ?? 0).toLocaleString("en")} ج.م`} label="الرصيد الحالي" tone="accent" />
          </div>
        </section>

        {/* Address & limits */}
        <section className="grid gap-4 md:grid-cols-2">
          <Card title="معلومات الحساب">
            <Row label="الحد الائتماني" value={`${Number(c.credit_limit ?? 0).toLocaleString("en")} ج.م`} />
            <Row label="النقاط" value={String(c.points ?? 0)} />
            <Row label="حالة الحساب" value={c.is_active === false ? "موقوف" : "نشط"} />
            <Row label="تاريخ التسجيل" value={new Date(c.created_at).toLocaleDateString("ar-EG")} />
          </Card>
          <Card title="العنوان">
            <Row label="المحافظة" value={c.governorate || "—"} />
            <Row label="المنطقة" value={c.district || "—"} />
            <Row label="عنوان تفصيلي" value={c.address || "—"} />
          </Card>
        </section>

        {/* Orders */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold">آخر الطلبات</h2>
            <span className="text-xs text-muted-foreground">{orders.length} طلب</span>
          </div>
          {orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لا توجد طلبات بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-start py-2 px-2">رقم</th>
                    <th className="text-start py-2 px-2">التاريخ</th>
                    <th className="text-start py-2 px-2">الإجمالي</th>
                    <th className="text-start py-2 px-2">الحالة</th>
                    <th className="text-start py-2 px-2">الدفع</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border/60 hover:bg-surface-2/50">
                      <td className="py-2 px-2 font-bold tabular-nums" dir="ltr">#{o.order_number}</td>
                      <td className="py-2 px-2 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("ar-EG")}</td>
                      <td className="py-2 px-2 font-bold" dir="ltr">{Number(o.total).toLocaleString("en")} ج.م</td>
                      <td className="py-2 px-2">{STATUS_LABEL[o.status] || o.status}</td>
                      <td className="py-2 px-2 text-xs">{o.payment_status === "paid" ? "مدفوع" : "غير مدفوع"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, value, label, tone }: { icon: typeof ShoppingBag; value: string; label: string; tone?: "accent" }) {
  return (
    <div className={`rounded-xl border border-border ${tone === "accent" ? "bg-accent-soft" : "bg-surface-1"} p-3`}>
      <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <p className="mt-1 font-display text-lg font-bold tabular-nums" dir="ltr">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-base font-bold mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm border-b border-border/40 pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-foreground">{value}</span>
    </div>
  );
}
