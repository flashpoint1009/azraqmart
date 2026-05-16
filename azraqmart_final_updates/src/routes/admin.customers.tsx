import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, MapPin, MessageCircle, Search, ShoppingBag, Star, UserPlus, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/customers")({
  head: () => ({ meta: [{ title: "العملاء — Admin" }] }),
  component: AdminCustomers,
});

type Cust = {
  id: string;
  shop_name: string;
  owner_name: string | null;
  phone: string;
  governorate: string | null;
  district: string | null;
  city: string | null;
  tier: string | null;
  balance: number | null;
  user_id: string | null;
  is_active: boolean | null;
  orders_count?: number;
  spent?: number;
};

function AdminCustomers() {
  const [search, setSearch] = useState("");
  const [msgTarget, setMsgTarget] = useState<Cust | null>(null);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, shop_name, owner_name, phone, governorate, district, city, tier, balance, user_id, is_active")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const list = (data ?? []) as Cust[];

      // Aggregate orders count + spent
      const ids = list.map((c) => c.id);
      if (ids.length) {
        const { data: ordRows } = await supabase
          .from("orders")
          .select("customer_id, total")
          .in("customer_id", ids);
        const map = new Map<string, { count: number; spent: number }>();
        (ordRows ?? []).forEach((o) => {
          const cur = map.get(o.customer_id as string) ?? { count: 0, spent: 0 };
          cur.count += 1;
          cur.spent += Number(o.total) || 0;
          map.set(o.customer_id as string, cur);
        });
        list.forEach((c) => {
          const a = map.get(c.id);
          c.orders_count = a?.count ?? 0;
          c.spent = a?.spent ?? 0;
        });
      }
      return list;
    },
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? customers.filter(
        (c) =>
          c.shop_name?.toLowerCase().includes(q) ||
          c.owner_name?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.city?.toLowerCase().includes(q) ||
          c.governorate?.toLowerCase().includes(q) ||
          c.district?.toLowerCase().includes(q),
      )
    : customers;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-primary">لوحة التحكم / العملاء</p>
            <h1 className="font-display text-3xl font-bold text-foreground mt-1">قاعدة العملاء</h1>
            <p className="text-sm text-muted-foreground mt-1">{customers.length} عميل مسجّل</p>
          </div>
          <Button variant="hero" className="gap-2" disabled><UserPlus className="h-4 w-4" />إضافة عميل</Button>
        </header>

        <div className="mb-4 relative max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم المحل، الاسم، التليفون، المدينة…"
            className="h-11 w-full rounded-xl border border-border bg-card pr-10 pl-3 text-sm font-medium outline-none focus:border-ring"
          />
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground">
            لا يوجد عملاء مطابقين
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <article key={c.id} className="rounded-2xl border border-border bg-card p-5 shadow-xs hover:shadow-md transition group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-primary text-primary-foreground font-display font-bold shadow-glow">
                      {(c.shop_name || "?").charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-display text-base font-bold text-foreground">{c.shop_name}</h3>
                      <p className="text-[11px] font-semibold text-muted-foreground">{c.owner_name || c.phone}</p>
                    </div>
                  </div>
                  {c.tier && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                      <Star className="h-3 w-3 fill-current" />{c.tier}
                    </span>
                  )}
                </div>

                <p className="mt-3 text-xs font-semibold text-muted-foreground inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[c.governorate, c.district].filter(Boolean).join(" — ") || c.city || "—"}
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
                  <Mini icon={ShoppingBag} value={String(c.orders_count ?? 0)} label="طلب" />
                  <Mini value={`${((c.spent ?? 0) / 1000).toFixed(1)}K`} suffix="ج.م" label="مشتريات" />
                  <Mini icon={CreditCard} value={Number(c.balance ?? 0).toLocaleString("en")} suffix="ج.م" label="رصيد" tone="accent" />
                </div>

                <div className="mt-4 flex gap-2">
                  <Button asChild variant="outline" size="sm" className="flex-1 font-bold">
                    <Link to="/admin/customers/$customerId" params={{ customerId: c.id }}>عرض الملف</Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="font-bold gap-1"><MessageCircle className="h-3.5 w-3.5" /> رسالة</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <a href={`https://wa.me/2${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">واتساب</a>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMsgTarget(c)} disabled={!c.user_id}>
                        إشعار داخلي
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <InAppMessageDialog target={msgTarget} onClose={() => setMsgTarget(null)} />
    </div>
  );
}

function Mini({ icon: Icon, value, suffix, label, tone }: { icon?: typeof ShoppingBag; value: string; suffix?: string; label: string; tone?: "accent" }) {
  return (
    <div>
      <p className={`font-display text-base font-bold tabular-nums ${tone === "accent" ? "text-accent-foreground" : "text-foreground"}`} dir="ltr">
        {value}{suffix && <span className="text-[9px] font-medium text-muted-foreground"> {suffix}</span>}
      </p>
      <p className="text-[10px] font-bold text-muted-foreground inline-flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}{label}
      </p>
    </div>
  );
}

function InAppMessageDialog({ target, onClose }: { target: Cust | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const open = !!target;
  const send = async () => {
    if (!target?.user_id) return;
    if (!title.trim()) { toast.error("اكتب عنوان الرسالة"); return; }
    setSending(true);
    try {
      const { error } = await supabase.from("notifications").insert({
        user_id: target.user_id,
        title: title.trim(),
        body: body.trim() || null,
        type: "admin_message",
        link: "/notifications",
      });
      if (error) throw error;
      toast.success("تم إرسال الإشعار");
      setTitle(""); setBody("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ في الإرسال");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إرسال إشعار داخلي — {target?.shop_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان الرسالة"
            className="h-11 w-full rounded-xl border border-border bg-surface-1 px-3 text-sm font-semibold outline-none focus:border-ring"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="نص الرسالة (اختياري)"
            rows={4}
            className="w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-sm font-medium outline-none focus:border-ring"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={send} disabled={sending} className="gap-2">
            {sending && <Loader2 className="h-4 w-4 animate-spin" />} إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
