import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Lock, Phone, ShieldCheck, Truck, Receipt, Store, User as UserIcon, Loader2, Package, Tag, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { normalizePhone, phoneToEmail } from "@/lib/phone-auth";
import warehouseHero from "@/assets/warehouse-hero3.jpg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — Zone Mart" },
      { name: "description", content: "سجّل دخولك على Zone Mart عشان تطلب احتياجاتك وتتابع طلباتك." },
      { property: "og:title", content: "تسجيل الدخول — Zone Mart" },
      { property: "og:description", content: "سجّل دخولك على Zone Mart وابدأ تسوّق." },
      { property: "og:url", content: "https://azraqmart.lovable.app/login" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://azraqmart.lovable.app/login" },
    ],
  }),
  component: LoginPage,
});

const ICONS: Record<string, LucideIcon> = {
  Truck, Receipt, ShieldCheck, Package, Store, Tag, Star, CheckCircle2,
};

type Feature = { icon: string; title: string; desc: string };
type Stat = { value: string; label: string };
type BannerSettings = {
  is_visible: boolean;
  badge_label: string;
  badge_title: string;
  hero_title: string;
  hero_highlight: string;
  hero_subtitle: string;
  features: Feature[];
  stats: Stat[];
};

const FALLBACK: BannerSettings = {
  is_visible: true,
  badge_label: "",
  badge_title: "",
  hero_title: "",
  hero_highlight: "",
  hero_subtitle: "",
  features: [],
  stats: [],
};

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const [identifier, setIdentifier] = useState(""); // login: username OR phone
  const [phone, setPhone] = useState(""); // signup
  const [username, setUsername] = useState(""); // signup
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [shopName, setShopName] = useState("");

  // Username setup modal (for users without a username)
  const [needsUsername, setNeedsUsername] = useState(false);
  const [pendingUsername, setPendingUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<(() => Promise<void>) | null>(null);

  const { data: bannerData } = useQuery({
    queryKey: ["login-banner"],
    queryFn: async () => {
      const { data } = await supabase.from("login_banner_settings").select("*").limit(1).maybeSingle();
      return data as unknown as BannerSettings | null;
    },
    staleTime: 60_000,
  });
  const banner: BannerSettings = bannerData ?? FALLBACK;

  const redirectByRole = async (userId?: string) => {
    if (!userId) return navigate({ to: "/" });
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (data ?? []).map((r) => r.role);
    if (roles.includes("developer")) return navigate({ to: "/developer" });
    if (roles.includes("admin")) return navigate({ to: "/admin" });
    if (roles.includes("accountant")) return navigate({ to: "/accounting" });
    if (roles.includes("warehouse")) return navigate({ to: "/warehouse" });
    return navigate({ to: "/" });
  };

  const proceedAfterLogin = async (userId: string) => {
    const { data: cust } = await supabase
      .from("customers")
      .select("is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (cust && cust.is_active === false) {
      await supabase.auth.signOut();
      toast.error("حسابك موقوف، اتصل بالإدارة");
      return;
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", userId)
      .maybeSingle();

    const doRedirect = async () => { await redirectByRole(userId); };

    if (!prof?.username) {
      setPendingRedirect(() => doRedirect);
      setNeedsUsername(true);
      return;
    }

    toast.success("تم تسجيل الدخول");
    await doRedirect();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const id = identifier.trim();
        if (!id) { toast.error("اكتب اسم المستخدم أو رقم الموبايل"); setLoading(false); return; }
        const { data: resolvedPhone, error: rpcErr } = await supabase.rpc("resolve_login_phone", { _identifier: id });
        if (rpcErr) throw rpcErr;
        if (!resolvedPhone) { toast.error("اسم المستخدم أو الرقم غير مسجل"); setLoading(false); return; }
        const normalized = normalizePhone(String(resolvedPhone)) ?? String(resolvedPhone);
        const email = phoneToEmail(normalized);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await proceedAfterLogin(data.user!.id);
      } else {
        if (!fullName.trim()) { toast.error("اكتب الاسم بالكامل"); setLoading(false); return; }
        const normalized = normalizePhone(phone);
        if (!normalized) { toast.error("رقم الموبايل غير صحيح. الصيغة: 01XXXXXXXXX"); setLoading(false); return; }
        const u = username.trim();
        if (!/^[A-Za-z][A-Za-z0-9_.]{2,29}$/.test(u)) {
          toast.error("اسم المستخدم: حروف إنجليزية وأرقام فقط، يبدأ بحرف، 3-30 خانة");
          setLoading(false); return;
        }
        const { data: avail } = await supabase.rpc("is_username_available", { _username: u });
        if (avail === false) { toast.error("اسم المستخدم محجوز، اختر اسم تاني"); setLoading(false); return; }
        const email = phoneToEmail(normalized);
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName, shop_name: shopName, phone: normalized, username: u },
          },
        });
        if (error) throw error;
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        toast.success("تم إنشاء الحساب");
        await proceedAfterLogin(signInData.user!.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
      const friendly =
        msg.includes("Invalid login") ? "بيانات الدخول غير صحيحة" :
        msg.includes("already registered") || msg.includes("User already") ? "الرقم ده مسجل من قبل، سجّل دخول" :
        msg.includes("at least 6") ? "كلمة المرور 6 أحرف على الأقل" :
        msg;
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUsername = async () => {
    const u = pendingUsername.trim();
    if (!/^[A-Za-z][A-Za-z0-9_.]{2,29}$/.test(u)) {
      toast.error("اسم المستخدم: حروف إنجليزية وأرقام فقط، يبدأ بحرف، 3-30 خانة");
      return;
    }
    setSavingUsername(true);
    try {
      const { data: avail } = await supabase.rpc("is_username_available", { _username: u });
      if (avail === false) { toast.error("اسم المستخدم محجوز"); return; }
      const { error } = await supabase.rpc("set_my_username", { _username: u });
      if (error) throw error;
      toast.success("تم حفظ اسم المستخدم");
      setNeedsUsername(false);
      if (pendingRedirect) await pendingRedirect();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSavingUsername(false);
    }
  };


  return (
    <div className={`min-h-screen relative overflow-hidden ${banner.is_visible ? "lg:grid lg:grid-cols-2" : ""}`}>
      {/* Mobile full-screen background image */}
      {banner.is_visible && (
        <div className="lg:hidden fixed inset-0 pointer-events-none">
          <img src={warehouseHero} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/45 via-primary/25 to-background/90" />
          <div className="absolute inset-0 bg-background/10" />
        </div>
      )}

      <div className="flex flex-col relative z-10">
        {banner.is_visible && (
          <div className="lg:hidden px-5 pt-5 pb-3 text-primary-foreground">
            <div className="flex items-center justify-end gap-3">
              <Logo />
            </div>
            <div className="mt-4 text-end">
              <p className="text-[11px] font-bold opacity-90">{banner.badge_label}</p>
              <p className="font-display text-[1.7rem] font-bold leading-tight mt-1 drop-shadow-lg">
                {banner.hero_title} {banner.hero_highlight && <span className="text-accent">{banner.hero_highlight}</span>}
              </p>
              <p className="mt-1.5 text-[11px] font-medium opacity-90 leading-relaxed max-w-sm ms-auto drop-shadow">
                {banner.hero_subtitle}
              </p>
            </div>
          </div>
        )}

        <div className={`items-center justify-between px-6 py-5 lg:px-10 lg:bg-background ${banner.is_visible ? "hidden lg:flex" : "flex"}`}>
          <Logo />
        </div>

        <div className="flex flex-1 items-start lg:items-center justify-center px-4 pb-6 pt-1 lg:px-16 lg:py-10 lg:bg-background">
          <div className="w-full max-w-sm animate-float-up rounded-3xl bg-white/15 dark:bg-white/10 backdrop-blur-2xl backdrop-saturate-150 border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-4 sm:p-6 lg:bg-transparent lg:border-0 lg:shadow-none lg:backdrop-blur-none lg:p-0 lg:rounded-none lg:max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-bold text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              {banner.badge_label}
            </div>
            <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {mode === "login" ? "أهلاً بيك" : "اعمل حساب جديد"}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {mode === "login"
                ? "سجّل دخولك للوصول إلى حسابك وطلباتك."
                : "سجّل بياناتك علشان تقدر تطلب وتتابع طلباتك."}
            </p>

            <div className="mt-4 grid grid-cols-2 rounded-xl border border-white/30 bg-white/20 backdrop-blur-md p-1 lg:border-border lg:bg-surface-2">
              {(["login", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`h-8 rounded-lg text-xs font-bold transition ${
                    mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "login" ? "تسجيل دخول" : "حساب جديد"}
                </button>
              ))}
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              {mode === "signup" && (
                <>
                  <div className="space-y-2">
                    <label htmlFor="signup-full-name" className="text-xs font-bold text-foreground">الاسم بالكامل</label>
                    <div className="relative">
                      <UserIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input id="signup-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required type="text" placeholder="محمد أحمد" className="h-12 w-full rounded-xl border border-border bg-surface-1 pr-10 pl-3 text-sm font-semibold outline-none transition focus:border-ring focus:shadow-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="signup-shop-name" className="text-xs font-bold text-foreground">اسم المحل / الشركة</label>
                    <div className="relative">
                      <Store className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input id="signup-shop-name" value={shopName} onChange={(e) => setShopName(e.target.value)} type="text" placeholder="بقالة النور" className="h-12 w-full rounded-xl border border-border bg-surface-1 pr-10 pl-3 text-sm font-semibold outline-none transition focus:border-ring focus:shadow-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="signup-username" className="text-xs font-bold text-foreground">اسم المستخدم (Username)</label>
                    <div className="relative">
                      <UserIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input id="signup-username" value={username} onChange={(e) => setUsername(e.target.value)} required dir="ltr" type="text" autoComplete="username" placeholder="emad1" className="h-12 w-full rounded-xl border border-border bg-surface-1 pr-10 pl-3 text-sm font-semibold outline-none transition focus:border-ring focus:shadow-sm" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">حروف إنجليزية وأرقام، يبدأ بحرف، 3-30 خانة. هتسجّل دخول بيه بدل الرقم.</p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="signup-phone" className="text-xs font-bold text-foreground">رقم الموبايل</label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input id="signup-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required dir="ltr" type="tel" inputMode="numeric" autoComplete="tel" placeholder="01012345678" className="h-12 w-full rounded-xl border border-border bg-surface-1 pr-10 pl-3 text-sm font-semibold outline-none transition focus:border-ring focus:shadow-sm" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">للتواصل والتوصيل. الصيغة: 01 يليه 9 أرقام.</p>
                  </div>
                </>
              )}

              {mode === "login" && (
                <div className="space-y-2">
                  <label htmlFor="login-identifier" className="text-xs font-bold text-foreground">اسم المستخدم أو رقم الموبايل</label>
                  <div className="relative">
                    <UserIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="login-identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      dir="ltr"
                      type="text"
                      autoComplete="username"
                      placeholder="emad1 أو 01012345678"
                      className="h-12 w-full rounded-xl border border-border bg-surface-1 pr-10 pl-3 text-sm font-semibold outline-none transition focus:border-ring focus:shadow-sm"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">تقدر تدخل باليوزر نيم بتاعك أو برقم الموبايل.</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="text-xs font-bold text-foreground">كلمة المرور</label>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} type={showPwd ? "text" : "password"} placeholder="••••••••" className="h-12 w-full rounded-xl border border-border bg-surface-1 pr-10 pl-16 text-sm font-semibold outline-none transition focus:border-ring focus:shadow-sm" />
                  <button type="button" onClick={() => setShowPwd((s) => !s)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md bg-surface-2 px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">
                    {showPwd ? "إخفاء" : "إظهار"}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={loading} size="lg" className="w-full font-bold gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"}
              </Button>

              <p className="text-center text-[11px] text-muted-foreground pt-2">
                بتسجيلك أنت توافق على{" "}
                <a href="#" className="font-bold text-foreground hover:text-primary">الشروط والأحكام</a> و
                <a href="#" className="font-bold text-foreground hover:text-primary"> سياسة الخصوصية</a>
              </p>
            </form>
          </div>
        </div>
      </div>

      {banner.is_visible && (
        <div className="relative hidden lg:block overflow-hidden">
          <img src={warehouseHero} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-hero opacity-55 mix-blend-multiply" />
          <div className="absolute inset-0 bg-black/15" />
          <div className="relative z-10 flex h-full flex-col justify-between p-12 text-primary-foreground">
            <div className="flex justify-end">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 backdrop-blur-md">
                <p className="text-[11px] font-bold opacity-80">{banner.badge_label}</p>
                <p className="text-sm font-bold">{banner.badge_title}</p>
              </div>
            </div>

            <div className="max-w-lg">
              <h2 className="font-display text-5xl font-bold leading-tight">
                {banner.hero_title} {banner.hero_highlight && <span className="text-accent">{banner.hero_highlight}</span>}.
              </h2>
              <p className="mt-4 text-lg font-medium opacity-90 leading-relaxed">
                {banner.hero_subtitle}
              </p>

              {banner.features.length > 0 && (
                <div className="mt-8 space-y-3">
                  {banner.features.map((f, i) => {
                    const Icon = ICONS[f.icon] ?? Star;
                    return (
                      <div key={i} className="flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/90 text-accent-foreground shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{f.title}</p>
                          <p className="text-xs opacity-80 mt-0.5">{f.desc}</p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 mt-1 ms-auto shrink-0 opacity-70" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {banner.stats.length > 0 && (
              <div className="grid grid-cols-3 gap-6 border-t border-white/15 pt-6">
                {banner.stats.map((s, i) => (
                  <div key={i}>
                    <p className="font-display text-2xl font-bold">{s.value}</p>
                    <p className="text-[11px] opacity-70">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {needsUsername && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold">اختار اسم مستخدم</h3>
            <p className="mt-1 text-xs text-muted-foreground">عشان متكتبش رقم الموبايل كل مرة، اختار اسم سهل تتذكره وهتسجّل دخول بيه من النهاردة.</p>
            <div className="mt-4 space-y-2">
              <input
                value={pendingUsername}
                onChange={(e) => setPendingUsername(e.target.value)}
                dir="ltr"
                placeholder="emad1"
                autoFocus
                className="h-12 w-full rounded-xl border border-border bg-surface-1 px-3 text-sm font-semibold outline-none focus:border-ring"
              />
              <p className="text-[10px] text-muted-foreground">حروف إنجليزية وأرقام، يبدأ بحرف، 3-30 خانة.</p>
            </div>
            <div className="mt-5 flex gap-2">
              <Button onClick={handleSaveUsername} disabled={savingUsername} className="flex-1 font-bold gap-2">
                {savingUsername && <Loader2 className="h-4 w-4 animate-spin" />} حفظ ومتابعة
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
