import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Apple, ArrowLeft, Award, ChevronLeft, Clock, Coffee, Droplets, Heart, MapPin, Package, Phone, ShieldCheck, ShoppingBag, Snowflake, Sparkles, SprayCan, Star, Tag, Truck } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import bannerBestsellers from "@/assets/banner-bestsellers.jpg";
import bannerOffers from "@/assets/banner-offers.jpg";
import logoMark from "@/assets/logo.png";
import { useAppSettings } from "@/hooks/useAppSettings";
import categoryBeverages from "@/assets/category-beverages.jpg";
import categoryCleaning from "@/assets/category-cleaning.jpg";
import categoryDairyFrozen from "@/assets/category-dairy-frozen.jpg";
import categoryGrocery from "@/assets/category-grocery.jpg";
import categoryPersonalCare from "@/assets/category-personal-care.jpg";
import heroMarket from "@/assets/hero-market.jpg";
import { AppHeader } from "@/components/AppHeader";
import { ProductCard } from "@/components/ProductCard";
import { WelcomeMessage } from "@/components/WelcomeMessage";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useHomeBanners } from "@/hooks/useHomeBanners";
import { useAboutSection } from "@/hooks/useAboutSection";
import { ROLE_HOME, useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/components/ProductCard";

const CATEGORY_ICONS: Record<string, typeof ShoppingBag> = {
  "بقالة وأطعمة": Apple,
  "مشروبات": Coffee,
  "منظفات وأدوات منزلية": SprayCan,
  "عناية شخصية": Droplets,
  "ألبان ومجمدات": Snowflake,
};

const CATEGORY_IMAGES: Record<string, string> = {
  "بقالة وأطعمة": categoryGrocery,
  "مشروبات": categoryBeverages,
  "منظفات وأدوات منزلية": categoryCleaning,
  "عناية شخصية": categoryPersonalCare,
  "ألبان ومجمدات": categoryDairyFrozen,
};

const FALLBACK_CATEGORY_IMAGES = [
  categoryGrocery,
  categoryBeverages,
  categoryCleaning,
  categoryPersonalCare,
  categoryDairyFrozen,
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "أزرق ماركت — منصة تجار الجملة في مصر" },
      { name: "description", content: "أزرق ماركت: منصة B2B متكاملة لتجار الجملة. اطلب البقالة والمنظفات والمشروبات بأسعار الجملة وتسليم خلال 24 ساعة." },
      { property: "og:title", content: "أزرق ماركت — منصة تجار الجملة في مصر" },
      { property: "og:description", content: "اطلب منتجات الجملة بأسعار تنافسية مع توصيل سريع لكل المحافظات." },
      { property: "og:url", content: "https://azraqmart.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://azraqmart.lovable.app/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "أزرق ماركت",
          alternateName: "Azraq Market",
          url: "https://azraqmart.lovable.app/",
          logo: "https://azraqmart.lovable.app/icon-512.png",
          description: "منصة B2B متكاملة لتجار الجملة في مصر.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "أزرق ماركت",
          url: "https://azraqmart.lovable.app/",
          inLanguage: "ar",
        }),
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const { primary, isLoading: rolesLoading } = useUserRoles();
  const { settings } = useAppSettings();
  const { byKey: bannerByKey } = useHomeBanners();
  const logoSrc = settings?.logo_url || logoMark;

  const { data: customer } = useQuery({
    queryKey: ["customer-banner", user?.id],
    enabled: !!user && (!primary || primary === "merchant"),
    queryFn: async () => {
      const [profileR, customerR] = await Promise.all([
        supabase.from("profiles").select("full_name, shop_name, phone").eq("user_id", user!.id).maybeSingle(),
        supabase.from("customers").select("id, tier, shop_name, owner_name, points").eq("user_id", user!.id).maybeSingle(),
      ]);
      const customerId = customerR.data?.id;
      const ordersR = customerId
        ? await supabase.from("orders").select("status, total").eq("customer_id", customerId)
        : { data: [] as Array<{ status: string; total: number }> };
      const orders = ordersR.data ?? [];
      const inDelivery = orders.filter((o) => ["ready", "out_for_delivery", "shipping", "preparing"].includes(o.status)).length;
      const delivered = orders.filter((o) => o.status === "delivered").length;
      const totalSpent = orders.reduce((s, o) => s + Number(o.total ?? 0), 0);
      return {
        name: customerR.data?.owner_name || profileR.data?.full_name || customerR.data?.shop_name || profileR.data?.shop_name || "ضيفنا",
        shop: customerR.data?.shop_name || profileR.data?.shop_name || "",
        phone: profileR.data?.phone || "",
        tier: customerR.data?.tier || "عميل جديد",
        points: customerR.data?.points ?? 0,
        totalOrders: orders.length,
        inDelivery,
        delivered,
        totalSpent,
      };
    },
  });

  const { data: mainCategories = [] } = useQuery({
    queryKey: ["home-main-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, image_url")
        .is("parent_id", null)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: featuredProducts = [] } = useQuery<Product[]>({
    queryKey: ["home-featured-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brand, image_url, unit_price, carton_price, stock_qty, low_stock_threshold")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((p): Product => ({
        id: p.id,
        name: p.name,
        brand: p.brand ?? "",
        image: p.image_url ?? "https://placehold.co/300x300/e2e8f0/64748b?text=منتج",
        unitPrice: Number(p.unit_price),
        cartonPrice: Number(p.carton_price),
        unitsPerCarton: 1,
        moq: 1,
        stock: p.stock_qty <= 0 ? "out" : p.stock_qty <= (p.low_stock_threshold ?? 10) ? "low" : "in",
      }));
    },
  });

  const heroRef = useRef<HTMLElement>(null);
  const onHeroMove = (e: MouseEvent<HTMLElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.setProperty("--mx", `${x * 12}px`);
    el.style.setProperty("--my", `${y * 12}px`);
  };
  const onHeroLeave = () => {
    const el = heroRef.current;
    if (!el) return;
    el.style.setProperty("--mx", `0px`);
    el.style.setProperty("--my", `0px`);
  };

  const [greeting, setGreeting] = useState("أهلاً");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "صباح الخير" : h < 18 ? "مساء الفل" : "مساء الخير");
  }, []);

  if (!authLoading && !rolesLoading && user && primary && primary !== "merchant") {
    return <Navigate to={ROLE_HOME[primary]} replace />;
  }

  if (!authLoading && !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <AppHeader />
      <WelcomeMessage />

      <main className="mx-auto max-w-[1440px] px-4 py-5 lg:px-6 lg:py-8 space-y-6">
        {/* Hero — interactive image banner */}
        {(() => {
          const hb = bannerByKey("hero");
          if (hb && hb.is_visible === false) return null;
          const heroImg = hb?.image_url || heroMarket;
          const heroEyebrow = hb?.eyebrow?.trim() || greeting;
          const heroTitleTpl = hb?.title?.trim() || "أهلاً {name}";
          const heroName = customer?.name ?? "بيك";
          const [titlePre, titlePost] = (() => {
            const i = heroTitleTpl.indexOf("{name}");
            if (i === -1) return [heroTitleTpl, ""];
            return [heroTitleTpl.slice(0, i), heroTitleTpl.slice(i + "{name}".length)];
          })();
          const heroSubtitle = hb?.subtitle?.trim();
          const heroCtaLabel = hb?.cta_label?.trim() || "ابدأ طلب جديد";
          const heroCtaLink = hb?.cta_link?.trim() || "/products";
          return (
            <section
              ref={heroRef}
              onMouseMove={onHeroMove}
              onMouseLeave={onHeroLeave}
              className="group relative overflow-hidden rounded-2xl shadow-soft animate-fade-in min-h-[178px] sm:min-h-[260px]"
              style={{ ["--mx" as any]: "0px", ["--my" as any]: "0px" }}
            >
              <img
                src={heroImg}
                alt="مستودع أزرق ماركت لتجارة الجملة"
                width={1920}
                height={1080}
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover scale-105 transition-transform duration-500 ease-out will-change-transform group-hover:scale-110"
                style={{ transform: "translate3d(var(--mx), var(--my), 0) scale(1.05)" }}
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/55 via-primary/30 to-accent/20" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />

              <div className="relative p-4 sm:p-6 text-primary-foreground">
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-14 sm:h-16 sm:w-16 place-items-center rounded-2xl bg-white/95 backdrop-blur-md border border-white/40 shadow-lg ring-2 ring-white/20 overflow-hidden shrink-0">
                    <img src={logoSrc} alt="شعار أزرق ماركت" className="h-10 w-10 sm:h-12 sm:w-12 object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold opacity-95 inline-flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-accent animate-pulse" /> {heroEyebrow}
                    </p>
                    <h1 className="mt-0.5 font-display text-2xl sm:text-3xl font-bold leading-tight drop-shadow truncate">
                      {titlePre}<span className="text-accent">{heroName}</span>{titlePost}
                    </h1>
                    {heroSubtitle ? (
                      <p className="mt-0.5 text-xs sm:text-sm font-bold opacity-90 truncate">{heroSubtitle}</p>
                    ) : customer?.shop ? (
                      <p className="mt-0.5 text-xs sm:text-sm font-bold opacity-90 truncate">{customer.shop}</p>
                    ) : null}
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent/25 backdrop-blur-md border border-accent/40 px-2.5 py-0.5 text-[10px] sm:text-xs font-bold text-accent">
                      <Star className="h-3 w-3 fill-accent" /> {customer?.tier ?? "عميل جديد"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 sm:mt-4 flex gap-2">
                  <Button asChild variant="accent" size="sm" className="font-bold gap-1.5 h-10 sm:h-11 hover:scale-105 transition-transform shadow-lg flex-1 sm:flex-initial">
                    <Link to={heroCtaLink as any}>{heroCtaLabel} <ChevronLeft className="h-4 w-4" /></Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="bg-white/15 backdrop-blur-md border-white/40 text-primary-foreground hover:bg-white/25 hover:text-primary-foreground gap-1.5 h-10 sm:h-11 font-bold flex-1 sm:flex-initial">
                    <Link to="/orders">طلباتي</Link>
                  </Button>
                </div>
              </div>
            </section>
          );
        })()}

        {/* Categories — medium cards */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xl font-bold">تسوّق حسب القسم</h2>
            <Link to="/products" className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline">
              عرض الكل <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-6 md:mx-0 md:px-0 md:overflow-visible md:gap-3">
            {mainCategories.map((c, i) => {
              const categoryImage = c.image_url || CATEGORY_IMAGES[c.name] || FALLBACK_CATEGORY_IMAGES[i % FALLBACK_CATEGORY_IMAGES.length];
              return (
                <Link
                  key={c.id}
                  to="/products"
                  search={{ category: c.id } as never}
                  className="group relative overflow-hidden rounded-xl border border-border bg-card w-[96px] sm:w-[110px] aspect-square shrink-0 snap-start transition-all hover:shadow-elevated hover:border-primary md:w-auto"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <img src={categoryImage} alt={c.name} loading="lazy" width={768} height={768} className="absolute inset-0 h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <span className="absolute inset-x-1 bottom-1 z-10 text-[10px] sm:text-xs font-bold text-white drop-shadow text-center leading-tight line-clamp-2">{c.name}</span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Offers — interactive parallax banner */}
        {(() => {
          const ob = bannerByKey("offers");
          if (ob && ob.is_visible === false) return null;
          return (
            <InteractiveBanner
              image={ob?.image_url || bannerOffers}
              eyebrow={ob?.eyebrow?.trim() || "عروض الأسبوع"}
              title={ob?.title?.trim() || "خصومات تصل لـ 25%"}
              subtitle={ob?.subtitle?.trim() || "مختارات لينا بأسعار جملة لا تُقاوم — لفترة محدودة"}
              ctaLabel={ob?.cta_label?.trim() || "شوف العروض"}
              ctaTo={ob?.cta_link?.trim() || "/products"}
              icon={Tag}
              variant="offers"
            />
          );
        })()}

        {/* 10 products grid */}
        <ProductGrid title="عروض مختارة" products={featuredProducts.slice(0, 10)} />

        {/* Bestsellers — interactive shine banner */}
        {(() => {
          const bb = bannerByKey("bestsellers");
          if (bb && bb.is_visible === false) return null;
          return (
            <InteractiveBanner
              image={bb?.image_url || bannerBestsellers}
              eyebrow={bb?.eyebrow?.trim() || "الأعلى مبيعًا"}
              title={bb?.title?.trim() || "منتجاتنا المميزة"}
              subtitle={bb?.subtitle?.trim() || "الأكثر طلبًا عند تجار الجملة في سوقنا"}
              ctaLabel={bb?.cta_label?.trim() || "اكتشف الأكثر مبيعًا"}
              ctaTo={bb?.cta_link?.trim() || "/products"}
              icon={Award}
              variant="bestsellers"
            />
          );
        })()}

        {/* 10 products row */}
        <ProductGrid
          title="الأكثر مبيعًا"
          products={featuredProducts.slice(10, 20).length ? featuredProducts.slice(10, 20) : featuredProducts.slice(0, 10)}
          reverse
        />

        {/* About us */}
        <AboutSection />
      </main>
    </div>
  );
}

function InteractiveBanner({
  image, eyebrow, title, subtitle, ctaLabel, ctaTo, icon: Icon, variant,
}: {
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaTo: string;
  icon: typeof Tag;
  variant: "offers" | "bestsellers";
}) {
  const ref = useRef<HTMLElement>(null);
  const onMove = (e: MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (variant === "offers") {
      el.style.setProperty("--mx", `${x * 14}px`);
      el.style.setProperty("--my", `${y * 14}px`);
    } else {
      el.style.setProperty("--rx", `${-y * 6}deg`);
      el.style.setProperty("--ry", `${x * 8}deg`);
      el.style.setProperty("--sx", `${((e.clientX - r.left) / r.width) * 100}%`);
    }
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", `0px`);
    el.style.setProperty("--my", `0px`);
    el.style.setProperty("--rx", `0deg`);
    el.style.setProperty("--ry", `0deg`);
  };

  const overlay =
    variant === "offers"
      ? "bg-gradient-to-l from-accent/85 via-accent/55 to-primary/40"
      : "bg-gradient-to-l from-primary/85 via-primary/55 to-accent/40";

  return (
    <section
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="group relative overflow-hidden rounded-2xl shadow-soft animate-fade-in min-h-[110px] sm:min-h-[130px]"
      style={{
        ["--mx" as never]: "0px",
        ["--my" as never]: "0px",
        ["--rx" as never]: "0deg",
        ["--ry" as never]: "0deg",
        ["--sx" as never]: "50%",
        perspective: variant === "bestsellers" ? "900px" : undefined,
      }}
    >
      <div
        className="absolute inset-0 transition-transform duration-300 ease-out will-change-transform"
        style={
          variant === "bestsellers"
            ? { transform: "rotateX(var(--rx)) rotateY(var(--ry))" }
            : undefined
        }
      >
        <img
          src={image}
          alt={title}
          loading="lazy"
          width={1920}
          height={640}
          className="absolute inset-0 h-full w-full object-cover scale-110"
          style={
            variant === "offers"
              ? { transform: "translate3d(var(--mx), var(--my), 0) scale(1.1)" }
              : undefined
          }
        />
        <div className={`absolute inset-0 ${overlay}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        {variant === "bestsellers" && (
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 mix-blend-overlay"
            style={{
              background:
                "radial-gradient(circle at var(--sx) 50%, rgba(255,255,255,0.45), transparent 45%)",
            }}
          />
        )}
        {variant === "offers" && (
          <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/15 blur-3xl animate-pulse" />
        )}
      </div>

      <div className="relative px-4 sm:px-5 py-3 sm:py-4 text-white flex items-center justify-between gap-3 min-h-[110px] sm:min-h-[130px]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 shadow-md shrink-0 group-hover:scale-110 transition-transform">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold opacity-90 inline-flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5 animate-pulse" /> {eyebrow}
            </p>
            <h2 className="font-display text-base sm:text-lg font-bold leading-tight drop-shadow truncate">
              {title}
            </h2>
            <p className="text-[11px] opacity-90 truncate hidden sm:block">{subtitle}</p>
          </div>
        </div>
        <Button
          asChild
          variant="accent"
          size="sm"
          className="font-bold gap-1 h-9 hover:scale-105 transition-transform shadow-md shrink-0"
        >
          <Link to={ctaTo}>
            {ctaLabel} <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function ProductGrid({ title, products: items }: { title: string; products: Product[]; reverse?: boolean }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <Link to="/products" className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline">
          عرض الكل <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="relative -mx-4 lg:mx-0">
        <div
          className="flex gap-3 overflow-x-auto px-4 lg:px-0 pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((p) => (
            <div key={p.id} className="w-[108px] sm:w-[150px] shrink-0 snap-start">
              <ProductCard p={p} />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent hidden lg:block" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent hidden lg:block" />
      </div>
    </section>
  );
}

const ABOUT_ICONS: Record<string, typeof Truck> = {
  Truck, ShieldCheck, Tag, Heart, Award, Sparkles, Star, Phone, MapPin, Clock, ShoppingBag, Package,
};

function AboutSection() {
  const { about } = useAboutSection();
  if (about && about.is_visible === false) return null;

  const eyebrow = about?.eyebrow?.trim() || "عننا";
  const title = about?.title?.trim() || "أزرق ماركت — شريكك في تجارة الجملة";
  const description = about?.description?.trim()
    || "بنوصّل لتجار الجملة وأصحاب البقالات أفضل المنتجات بأسعار تنافسية، مع خدمة توصيل سريعة وضمان جودة.";
  const ctaLabel = about?.cta_label?.trim() || "تسوّق الآن";
  const ctaLink = about?.cta_link?.trim() || "/products";
  const stats = about?.stats?.length ? about.stats : [];
  const features = about?.features?.length ? about.features : [
    { icon: "Truck", title: "توصيل سريع", desc: "لكل محافظات مصر خلال 24-48 ساعة" },
    { icon: "ShieldCheck", title: "منتجات أصلية", desc: "ضمان الجودة من موردين معتمدين" },
    { icon: "Tag", title: "أسعار جملة", desc: "أفضل الأسعار للتجار وأصحاب البقالات" },
    { icon: "Heart", title: "خدمة عملاء", desc: "فريق دعم متاح لمساعدتك في أي وقت" },
  ];

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary-soft/40 via-card to-accent-soft/30 p-6 sm:p-8 animate-fade-in">
      <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative grid gap-6 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> {eyebrow}
          </p>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold">{title}</h2>
          {about?.subtitle?.trim() && (
            <p className="mt-2 text-sm font-bold text-primary/80">{about.subtitle}</p>
          )}
          <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed whitespace-pre-line">
            {description}
          </p>

          {stats.length > 0 && (
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {stats.map((s, i) => (
                <div key={i} className="rounded-xl border border-border bg-card/70 px-3 py-2 text-center">
                  <p className="font-display text-lg font-bold text-primary tabular-nums" dir="ltr">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground font-bold leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="default" size="lg" className="font-bold gap-1.5 h-11">
              <Link to={ctaLink as any}>{ctaLabel} <ChevronLeft className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {features.map((it, i) => {
            const Icon = ABOUT_ICONS[it.icon] || Sparkles;
            return (
              <div
                key={i}
                className="group rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-1 hover:shadow-elevated hover:border-primary animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary group-hover:scale-110 transition-transform">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-display font-bold text-sm">{it.title}</h3>
                <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{it.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, value, label }: { icon: typeof ShoppingBag; value: number; label: string }) {
  return (
    <div className="rounded-lg sm:rounded-xl border border-white/25 bg-black/35 p-1.5 sm:p-2.5 backdrop-blur-md shadow-md">
      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-80" />
      <p className="mt-1 font-display text-base sm:text-lg font-bold tabular-nums" dir="ltr">{value}</p>
      <p className="text-[9px] sm:text-[10px] font-semibold opacity-75 leading-tight">{label}</p>
    </div>
  );
}
