import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Headphones,
  Heart,
  Home,
  KeyRound,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Tag,
  User as UserIcon,
} from "lucide-react";
import logoMark from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/hooks/useAppSettings";
import { isFeatureEnabled } from "@/lib/features";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useUserRoles } from "@/hooks/useUserRoles";

type Item = {
  to: string;
  label: string;
  desc: string;
  icon: typeof Home;
  badge?: string | number;
  tone: "primary" | "accent" | "rose" | "emerald";
};

const TONE: Record<Item["tone"], string> = {
  primary: "from-primary to-primary/70 text-primary-foreground",
  accent: "from-accent to-accent/70 text-accent-foreground",
  rose: "from-rose-500 to-rose-400 text-white",
  emerald: "from-emerald-500 to-emerald-400 text-white",
};

export function CustomerDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { count } = useCart();
  const { settings } = useAppSettings();
  const { hasAny } = useUserRoles();
  const isStaff = hasAny("admin", "developer", "accountant", "warehouse", "delivery");
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setFullName(null); return; }
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setFullName(data?.full_name ?? null));
  }, [user?.id]);

  const close = () => onOpenChange(false);
  const logoSrc = settings?.logo_url || logoMark;
  const displayName = fullName || (user ? "عميلنا العزيز" : "طلباتك أوامر");
  const enabled = (key: Parameters<typeof isFeatureEnabled>[1]) => isFeatureEnabled(settings?.features, key);

  const shopItems: Item[] = [
    { to: "/", label: "الرئيسية", desc: "العروض والأقسام", icon: Home, tone: "primary" },
  ];
  if (user && !isStaff) {
    if (enabled("catalog")) shopItems.push({ to: "/products", label: "كل المنتجات", desc: "تصفّح الكتالوج كامل", icon: ShoppingBag, tone: "accent" });
    if (enabled("cart")) shopItems.push({ to: "/cart", label: "سلة المشتريات", desc: "راجع طلبك قبل التأكيد", icon: ShoppingCart, tone: "rose", badge: count > 0 ? count : undefined });
  }

  const groups: { title: string; items: Item[] }[] = [
    { title: "تسوّق", items: shopItems },
  ];
  if (user && !isStaff) {
    groups.push({
      title: "حسابي",
      items: [
        ...(enabled("account") ? [{ to: "/account", label: "بياناتي والعنوان", desc: "اسمك، تليفونك، وعنوان التوصيل", icon: UserIcon, tone: "emerald" as const }] : []),
        ...(enabled("customer_orders") ? [{ to: "/orders", label: "طلباتي", desc: "تتبّع الطلبات الحالية والسابقة", icon: Package, tone: "primary" as const }] : []),
        { to: "/account/password", label: "تغيير كلمة السر", desc: "حماية حسابك", icon: KeyRound, tone: "accent" },
      ],
    });
  } else if (user && isStaff) {
    groups.push({
      title: "حسابي",
      items: [
        { to: "/account/password", label: "تغيير كلمة السر", desc: "حماية حسابك", icon: KeyRound, tone: "accent" },
      ],
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[88vw] sm:w-[400px] p-0 flex flex-col bg-gradient-to-b from-background via-background to-primary-soft/20"
      >
        <SheetHeader className="px-5 pt-6 pb-4 border-b border-border/60 bg-gradient-to-l from-primary via-primary to-accent/80 text-primary-foreground relative overflow-hidden">
          <div className="absolute -top-16 -left-12 h-40 w-40 rounded-full bg-white/15 blur-3xl animate-pulse" />
          <div className="absolute -bottom-20 -right-10 h-44 w-44 rounded-full bg-accent/40 blur-3xl" />
          <SheetTitle className="sr-only">قائمة العميل</SheetTitle>

          <div className="relative flex items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/95 backdrop-blur-md border border-white/40 shadow-lg ring-2 ring-white/20 overflow-hidden">
              <img src={logoSrc} alt="logo" className="h-10 w-10 object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold opacity-90 inline-flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 animate-pulse" /> أهلاً بيك
              </p>
              <h3 className="font-display text-base font-bold leading-tight truncate drop-shadow">
                {displayName}
              </h3>
              {user && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent/30 backdrop-blur-md border border-accent/50 px-2 py-0.5 text-[10px] font-bold">
                  <Star className="h-2.5 w-2.5 fill-current" /> عميل مميز
                </span>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="px-2 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {g.title}
              </p>
              <ul className="space-y-1.5">
                {g.items.map((it, i) => {
                  const active = path === it.to;
                  return (
                    <li key={it.to} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                      <Link
                        to={it.to}
                        onClick={close}
                        className={`group relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-elevated ${
                          active
                            ? "border-primary bg-gradient-to-l from-primary-soft to-transparent shadow-soft"
                            : "border-border bg-card hover:border-primary/40"
                        }`}
                      >
                        <span
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${TONE[it.tone]} shadow-md group-hover:scale-110 group-hover:rotate-3 transition-transform`}
                        >
                          <it.icon className="h-5 w-5" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-tight truncate">{it.label}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{it.desc}</p>
                        </div>
                        {it.badge !== undefined && (
                          <span className="grid place-items-center min-w-[22px] h-5 px-1.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold shadow">
                            {it.badge}
                          </span>
                        )}
                        <ChevronLeft className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-x-1 transition-all" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Quick contact card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent-soft/60 via-card to-primary-soft/40 border border-border p-4 animate-fade-in">
            <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md">
                <Headphones className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-display font-bold text-sm">محتاج مساعدة؟</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">فريقنا متاح من 9 ص لـ 9 م</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button asChild size="sm" variant="default" className="h-8 gap-1 text-xs font-bold">
                    <a href="tel:+201206777762"><Phone className="h-3 w-3" /> 01206777762</a>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs font-bold border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700">
                    <a href="https://wa.me/201206777762" target="_blank" rel="noreferrer"><MessageCircle className="h-3 w-3" /> واتساب</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-border/60 px-4 py-3 bg-card/50 backdrop-blur">
          {user ? (
            <Button
              variant="outline"
              className="w-full gap-2 font-bold text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={async () => {
                await signOut();
                close();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" /> تسجيل الخروج
            </Button>
          ) : (
            <Button asChild variant="default" className="w-full gap-2 font-bold" onClick={close}>
              <Link to="/login"><UserIcon className="h-4 w-4" /> تسجيل الدخول</Link>
            </Button>
          )}
          <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
            <Logo /> <span>·</span> <span>طلباتك أوامر</span> <Heart className="h-3 w-3 text-rose-500 fill-rose-500" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
