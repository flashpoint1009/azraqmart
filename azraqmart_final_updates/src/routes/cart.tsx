import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CreditCard, MapPin, Minus, Package, Pencil, Plus, ShieldCheck, ShoppingBag, Tag, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "سلة الطلب — أزرق ماركت" },
      { name: "description", content: "راجع منتجات سلتك، طبّق كوبون الخصم، وأكّد طلبك من أزرق ماركت بكل سهولة." },
      { property: "og:title", content: "سلة الطلب — أزرق ماركت" },
      { property: "og:description", content: "راجع منتجاتك وأكّد طلبك من أزرق ماركت." },
      { property: "og:url", content: "https://azraqmart.com/cart" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://azraqmart.com/cart" },
    ],
  }),
  component: CartPage,
});

type Profile = { shop_name: string | null; phone: string | null; address: string | null; city: string | null } | null;

function CartPage() {
  const { items, subtotal, setQty, remove, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; type: string; value: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<Profile>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("customers")
      .select("shop_name, phone, address, city")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data ?? null);
        setProfileLoaded(true);
      });
  }, [user]);

  const hasAddress = !!(profile?.address && profile?.phone);

  const discount = appliedCoupon
    ? appliedCoupon.type === "percent"
      ? Math.round(subtotal * (appliedCoupon.value / 100))
      : Math.min(subtotal, appliedCoupon.value)
    : 0;
  const tax = 0; // مؤقتاً
  const shipping = 0; // توصيل مجاني
  const total = Math.max(0, subtotal - discount + tax + shipping);

  const applyCoupon = async () => {
    const code = coupon.trim();
    if (!code) return;
    const { data, error } = await supabase
      .from("coupons")
      .select("code, discount_type, discount_value, min_order_total, expires_at, is_active")
      .eq("code", code)
      .maybeSingle();
    if (error || !data || !data.is_active) {
      toast.error("كود غير صالح");
      return;
    }
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      toast.error("الكود منتهي");
      return;
    }
    if (data.min_order_total && subtotal < Number(data.min_order_total)) {
      toast.error(`الحد الأدنى للطلب ${data.min_order_total} ج.م`);
      return;
    }
    setAppliedCoupon({ code: data.code, type: data.discount_type, value: Number(data.discount_value) });
    toast.success(`تم تطبيق الكوبون ${data.code}`);
  };

  const confirmOrder = async () => {
    if (!user) {
      toast.error("سجّل الدخول أولاً");
      navigate({ to: "/login" });
      return;
    }
    if (items.length === 0) {
      toast.error("السلة فارغة");
      return;
    }
    if (!hasAddress) {
      toast.error("عرّفنا عنوانك الأول علشان نوصلك");
      navigate({ to: "/account" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: customerR } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const customerId = customerR?.id;
      if (!customerId) {
        toast.error("عرّفنا عنوانك الأول علشان نوصلك");
        navigate({ to: "/account" });
        return;
      }

      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert({ customer_id: customerId, status: "pending", total, payment_status: "unpaid" })
        .select("id, order_number")
        .single();
      if (oErr) throw oErr;

      const { error: iErr } = await supabase.from("order_items").insert(
        items.map((i) => ({
          order_id: order.id,
          product_id: i.id.length === 36 ? i.id : null,
          product_name: i.name,
          qty: i.qty,
          unit_price: i.cartonPrice,
          line_total: i.cartonPrice * i.qty,
        })),
      );
      if (iErr) throw iErr;

      toast.success(`تم تأكيد طلبك رقم #${order.order_number} ✓`);
      clear();
      navigate({ to: "/orders/$orderId", params: { orderId: order.id } });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "حدث خطأ، حاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-primary">سلة الطلب</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mt-1">
              {items.length} منتج في سلتك
            </h1>
          </div>
          <Link to="/products" className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline">
            متابعة التسوّق <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-primary">
              <ShoppingBag className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-lg font-bold">السلة فارغة</h2>
            <p className="mt-1 text-sm text-muted-foreground">اضغط على "أضف" من شاشة المنتجات لتبدأ طلبك</p>
            <Button asChild variant="hero" className="mt-5 font-bold">
              <Link to="/products">تصفّح المنتجات</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
            <section className="space-y-3">
              {items.map((it) => (
                <div key={it.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-xs animate-fade-in">
                  {it.image && (
                    <img src={it.image} alt={it.name} className="h-24 w-24 sm:h-28 sm:w-28 rounded-xl object-cover bg-surface-2 shrink-0" />
                  )}
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {it.brand && <p className="text-[10px] font-bold uppercase text-primary">{it.brand}</p>}
                        <h3 className="text-sm font-bold text-foreground line-clamp-2 mt-0.5">{it.name}</h3>
                      </div>
                      <button onClick={() => remove(it.id)} aria-label={`حذف ${it.name} من السلة`} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-[11px] font-semibold text-muted-foreground mt-1 inline-flex items-center gap-1">
                      <Package className="h-3 w-3" /> {it.unitsPerCarton ?? "-"} قطعة/كرتونة • سعر القطعة <span dir="ltr">{it.unitPrice} ج.م</span>
                    </p>
                    <div className="mt-auto flex items-end justify-between pt-2">
                      <div className="flex items-center rounded-xl border border-border bg-surface-2 overflow-hidden">
                        <button onClick={() => setQty(it.id, it.qty - 1)} aria-label={`تقليل كمية ${it.name}`} className="grid h-9 w-9 place-items-center text-muted-foreground hover:bg-surface-3 hover:text-foreground"><Minus className="h-3.5 w-3.5" /></button>
                        <span className="w-10 text-center text-sm font-bold tabular-nums">{it.qty}</span>
                        <button onClick={() => setQty(it.id, it.qty + 1)} aria-label={`زيادة كمية ${it.name}`} className="grid h-9 w-9 place-items-center text-muted-foreground hover:bg-surface-3 hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="text-end">
                        <p className="text-[10px] font-semibold text-muted-foreground">الإجمالي</p>
                        <p className="font-display text-lg font-bold text-foreground" dir="ltr">{(it.cartonPrice * it.qty).toLocaleString("en")} <span className="text-xs font-medium text-muted-foreground">ج.م</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <aside className="lg:sticky lg:top-20 self-start space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-base font-bold text-foreground inline-flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> عنوان التوصيل
                  </h2>
                  <Link to="/account" className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> تعديل
                  </Link>
                </div>
                {!profileLoaded ? (
                  <p className="text-xs text-muted-foreground">جاري التحميل…</p>
                ) : hasAddress ? (
                  <div className="rounded-xl bg-primary-soft/40 border border-primary/15 p-3 space-y-1">
                    {profile?.shop_name && <p className="text-sm font-bold text-foreground">{profile.shop_name}</p>}
                    <p className="text-xs text-muted-foreground" dir="ltr">{profile?.phone}</p>
                    <p className="text-xs text-foreground leading-relaxed">{profile?.address}{profile?.city && `، ${profile.city}`}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-warning/40 bg-warning/5 p-4 text-center">
                    <MapPin className="mx-auto h-6 w-6 text-warning mb-2" />
                    <p className="text-xs font-bold text-foreground">عرّفنا عنوانك الأول علشان نوصلك</p>
                    <Button asChild size="sm" variant="default" className="mt-3 font-bold">
                      <Link to="/account">أضف عنوانك</Link>
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <h2 className="font-display text-base font-bold text-foreground mb-4">ملخّص الطلب</h2>

                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Tag className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={coupon}
                      onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                      placeholder="كود الخصم"
                      aria-label="كود الخصم"
                      className="h-10 w-full rounded-xl border border-border bg-surface-2 pr-9 pl-3 text-xs font-bold outline-none focus:border-ring uppercase"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="font-bold" onClick={applyCoupon}>تطبيق</Button>
                </div>
                {appliedCoupon && (
                  <div className="mb-3 flex items-center justify-between rounded-lg bg-success/10 px-3 py-2 text-xs font-bold text-success">
                    <span>تم تطبيق {appliedCoupon.code}</span>
                    <button onClick={() => setAppliedCoupon(null)} className="hover:underline">إلغاء</button>
                  </div>
                )}

                <dl className="space-y-2.5 text-sm">
                  <Row label="المجموع الفرعي" value={subtotal} />
                  {discount > 0 && <Row label="الخصم" value={-discount} tone="success" />}
                  <Row label="ضريبة القيمة المضافة" value={tax} customValue={<span className="text-muted-foreground">صفر</span>} />
                  <Row label="رسوم التوصيل" value={shipping} customValue={<span className="text-success">مجاني</span>} />
                </dl>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <span className="font-display text-sm font-bold text-foreground">الإجمالي</span>
                  <span className="font-display text-2xl font-bold text-primary" dir="ltr">{total.toLocaleString("en")}<span className="text-xs font-medium text-muted-foreground"> ج.م</span></span>
                </div>

                <Button variant="hero" size="lg" className="w-full mt-5 font-bold gap-2" onClick={confirmOrder} disabled={submitting}>
                  <CreditCard className="h-4 w-4" /> {submitting ? "جاري الإرسال..." : "ابعت طلبك"}
                </Button>
                <Link to="/orders" className="mt-3 block text-center text-xs font-bold text-primary hover:underline">
                  تابع طلبك من خلال التطبيق ←
                </Link>
              </div>

              <div className="rounded-2xl border border-border bg-gradient-card p-4 shadow-xs space-y-3">
                <Trust icon={Truck} title="توصيل مجاني" desc="لكل المحافظات" />
                <Trust icon={ShieldCheck} title="مرتجع مضمون" desc="خلال 7 أيام من الاستلام" />
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, value, tone, customValue }: { label: string; value: number; tone?: "success"; customValue?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="font-semibold text-foreground">{label}</dt>
      <dd className={`font-bold tabular-nums ${tone === "success" ? "text-success" : "text-foreground"}`} dir="ltr">
        {customValue ?? `${value < 0 ? "-" : ""}${Math.abs(value).toLocaleString("en")} ج.م`}
      </dd>
    </div>
  );
}

function Trust({ icon: Icon, title, desc }: { icon: typeof Truck; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs font-bold text-foreground">{title}</p>
        <p className="text-[10px] font-semibold text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
