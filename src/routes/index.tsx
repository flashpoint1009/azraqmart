import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, Clock, MapPin, Search, Sparkles, Star, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import bannerOffers from "@/assets/banner-offers.jpg";
import bannerBestsellers from "@/assets/banner-bestsellers.jpg";
import categoryBeverages from "@/assets/category-beverages.jpg";
import categoryCleaning from "@/assets/category-cleaning.jpg";
import categoryDairyFrozen from "@/assets/category-dairy-frozen.jpg";
import categoryGrocery from "@/assets/category-grocery.jpg";
import categoryPersonalCare from "@/assets/category-personal-care.jpg";
import { AppHeader } from "@/components/AppHeader";
import { ProductCard } from "@/components/ProductCard";
import { WelcomeMessage } from "@/components/WelcomeMessage";
import { useAuth } from "@/hooks/useAuth";
import { useHomeBanners } from "@/hooks/useHomeBanners";
import { ROLE_HOME, useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/components/ProductCard";

const CATEGORY_IMAGES: Record<string, string> = {
  "بقالة وأطعمة": categoryGrocery,
  "مشروبات": categoryBeverages,
  "منظفات وأدوات منزلية": categoryCleaning,
  "عناية شخصية": categoryPersonalCare,
  "ألبان ومجمدات": categoryDairyFrozen,
};

const FALLBACK_CATEGORY_IMAGES = [categoryGrocery, categoryBeverages, categoryCleaning, categoryPersonalCare, categoryDairyFrozen];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zone Mart — تسوّق واطلب توصيل لحد بيتك" },
      { name: "description", content: "Zone Mart: سوبر ماركت أونلاين. اطلب البقالة والمنظفات والمشروبات بأسعار مميزة وتوصيل سريع لحد باب بيتك." },
      { property: "og:title", content: "Zone Mart — تسوّق واطلب توصيل لحد بيتك" },
      { property: "og:description", content: "اطلب احتياجاتك اليومية بأسعار مميزة مع توصيل سريع." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const { primary, isLoading: rolesLoading } = useUserRoles();
  const { byKey: bannerByKey } = useHomeBanners();

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
    <div className="min-h-screen bg-background pb-20 md:pb-8">
      <AppHeader />
      <WelcomeMessage />

      <main className="mx-auto max-w-[1440px] px-4 py-4 lg:px-6 space-y-5">

        {/* Delivery info bar */}
        <div className="flex items-center gap-2 rounded-xl bg-primary-soft p-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shrink-0">
            <Truck className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground">توصيل سريع لحد بيتك</p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> خلال 30-60 دقيقة
            </p>
          </div>
          <Link to="/account" className="text-[11px] font-bold text-primary flex items-center gap-0.5">
            <MapPin className="h-3 w-3" /> العنوان
          </Link>
        </div>

        {/* Promo Banner Slider */}
        <PromoBanners bannerByKey={bannerByKey} />

        {/* Categories — single row horizontal scroll */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold">الأقسام</h2>
            <Link to="/products" className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline">
              الكل <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {mainCategories.map((c, i) => {
              const img = c.image_url || CATEGORY_IMAGES[c.name] || FALLBACK_CATEGORY_IMAGES[i % FALLBACK_CATEGORY_IMAGES.length];
              return (
                <Link
                  key={c.id}
                  to="/products"
                  search={{ category: c.id } as never}
                  className="flex flex-col items-center gap-1.5 group shrink-0 snap-start"
                >
                  <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border group-hover:border-primary transition-colors shadow-sm">
                    <img src={img} alt={c.name} loading="lazy" className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-300" />
                  </div>
                  <span className="text-[10px] font-bold text-center leading-tight line-clamp-1 text-foreground w-16">{c.name}</span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Featured Products — horizontal scroll */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold">عروض مميزة 🔥</h2>
            <Link to="/products" className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline">
              عرض الكل <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {featuredProducts.slice(0, 10).map((p) => (
              <div key={p.id} className="w-[140px] sm:w-[160px] shrink-0 snap-start">
                <ProductCard p={p} />
              </div>
            ))}
          </div>
        </section>

        {/* Second banner */}
        {(() => {
          const bb = bannerByKey("bestsellers");
          if (bb && bb.is_visible === false) return null;
          return (
            <Link to="/products" className="block rounded-2xl overflow-hidden shadow-sm border border-border">
              <img
                src={bb?.image_url || bannerBestsellers}
                alt={bb?.title || "الأكثر مبيعاً"}
                loading="lazy"
                className="w-full h-32 sm:h-40 object-cover"
              />
            </Link>
          );
        })()}

        {/* More Products — horizontal scroll */}
        {featuredProducts.length > 10 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-bold">الأكثر طلباً</h2>
              <Link to="/products" className="text-xs font-bold text-primary inline-flex items-center gap-1 hover:underline">
                عرض الكل <ArrowLeft className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {featuredProducts.slice(10, 20).map((p) => (
                <div key={p.id} className="w-[140px] sm:w-[160px] shrink-0 snap-start">
                  <ProductCard p={p} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Trust badges */}
        <section className="grid grid-cols-3 gap-2">
          <TrustBadge icon={Truck} title="توصيل سريع" desc="خلال ساعة" />
          <TrustBadge icon={Star} title="منتجات طازة" desc="جودة مضمونة" />
          <TrustBadge icon={Sparkles} title="عروض يومية" desc="وفّر أكتر" />
        </section>

        {/* Our Branches */}
        <section>
          <h2 className="font-display text-lg font-bold mb-3">فروعنا 📍</h2>
          <div className="space-y-2">
            <BranchCard name="فرع زهراء المعادي" address="85 شارع خاتم المرسلين — أمام شركة الشرقية للدخان" hours="8 ص - 12 م" />
            <BranchCard name="فرع كمبوند تبارك" address="كمبوند تبارك — مدخل 2" hours="9 ص - 11 م" />
            <BranchCard name="فرع مساكن شيراتون" address="مساكن شيراتون قطعة 5 — بجوار مسجد الصديق" hours="9 ص - 12 م" />
          </div>
          {/* Contact */}
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="tel:01153818868" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-2 text-xs font-bold text-primary">
              📞 01153818868
            </a>
            <a href="mailto:info@zonemart.co" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-2 text-xs font-bold text-primary">
              ✉️ info@zonemart.co
            </a>
            <a href="https://www.instagram.com/zonemarteg" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-2 text-xs font-bold text-primary">
              📸 Instagram
            </a>
            <a href="https://tiktok.com/@zonemarteg" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-2 text-xs font-bold text-primary">
              🎵 TikTok
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

function PromoBanners({ bannerByKey }: { bannerByKey: (key: string) => any }) {
  const ob = bannerByKey("offers");
  if (ob && ob.is_visible === false) return null;

  return (
    <Link to="/products" className="block rounded-2xl overflow-hidden shadow-sm border border-border">
      <img
        src={ob?.image_url || bannerOffers}
        alt={ob?.title || "عروض الأسبوع"}
        loading="lazy"
        className="w-full h-36 sm:h-44 object-cover"
      />
    </Link>
  );
}

function TrustBadge({ icon: Icon, title, desc }: { icon: typeof Truck; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-3 text-center">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[11px] font-bold text-foreground">{title}</p>
      <p className="text-[10px] text-muted-foreground">{desc}</p>
    </div>
  );
}

function BranchCard({ name, address, hours }: { name: string; address: string; hours: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent-foreground shrink-0">
        <MapPin className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">{name}</p>
        <p className="text-[11px] text-muted-foreground truncate">{address}</p>
        <p className="text-[10px] text-primary font-semibold flex items-center gap-1 mt-0.5">
          <Clock className="h-3 w-3" /> {hours}
        </p>
      </div>
    </div>
  );
}
