import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ProductCard, type Product } from "@/components/ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type ProductsSearch = { category?: string; sub?: string; q?: string };

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "المنتجات — أزرق ماركت" },
      { name: "description", content: "تصفّح كتالوج أزرق ماركت لمنتجات الجملة: بقالة، مشروبات، منظفات، عناية شخصية، ألبان ومجمدات بأسعار جملة وتوصيل سريع." },
      { property: "og:title", content: "كتالوج المنتجات — أزرق ماركت" },
      { property: "og:description", content: "أحدث منتجات الجملة بأسعار تنافسية لتجار وأصحاب المحلات في مصر." },
      { property: "og:url", content: "https://azraqmart.com/products" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://azraqmart.com/products" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "كتالوج منتجات أزرق ماركت",
          url: "https://azraqmart.com/products",
          description: "كتالوج منتجات الجملة في أزرق ماركت.",
        }),
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): ProductsSearch => ({
    category: typeof search.category === "string" ? search.category : undefined,
    sub: typeof search.sub === "string" ? search.sub : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: ProductsPage,
});

const FALLBACK_IMG = "https://placehold.co/400x400/eef/667?text=منتج";

function ProductsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/products" });
  const activeCat = search.category;
  const activeSub = search.sub;
  const q = search.q ?? "";

  const setSearch = (next: Partial<ProductsSearch>) => {
    navigate({ search: (prev: ProductsSearch) => ({ ...prev, ...next }) });
  };

  const { data: categories = [] } = useQuery({
    queryKey: ["all-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, parent_id, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mainCats = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const subCats = useMemo(
    () => (activeCat ? categories.filter((c) => c.parent_id === activeCat) : []),
    [categories, activeCat],
  );

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-list", activeCat, activeSub],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, name, brand, category_id, unit_price, carton_price, stock_qty, low_stock_threshold, image_url")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (activeSub) {
        query = query.eq("category_id", activeSub);
      } else if (activeCat) {
        const subIds = categories.filter((c) => c.parent_id === activeCat).map((c) => c.id);
        const ids = [activeCat, ...subIds];
        query = query.in("category_id", ids);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map<Product>((r) => ({
        id: r.id,
        name: r.name,
        brand: r.brand ?? "",
        image: r.image_url || FALLBACK_IMG,
        unitPrice: Number(r.unit_price ?? 0),
        cartonPrice: Number(r.carton_price ?? 0),
        unitsPerCarton: 1,
        moq: 1,
        stock: r.stock_qty <= 0 ? "out" : r.stock_qty <= (r.low_stock_threshold ?? 10) ? "low" : "in",
      }));
    },
    enabled: categories.length > 0 || (!activeCat && !activeSub),
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return products;
    const needle = q.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(needle) || p.brand.toLowerCase().includes(needle),
    );
  }, [products, q]);

  const activeMainName = mainCats.find((c) => c.id === activeCat)?.name;
  const activeSubName = subCats.find((c) => c.id === activeSub)?.name;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1440px] px-3 py-4 lg:px-6 lg:py-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-primary">كتالوج المنتجات</p>
            <h1 className="font-display text-2xl font-bold text-foreground mt-1">
              {activeSubName || activeMainName || "كل المنتجات"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} منتج</p>
          </div>
        </header>

        {/* Search */}
        <div className="relative mb-4">
          <label htmlFor="products-search" className="sr-only">ابحث عن منتج أو ماركة</label>
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="products-search"
            value={q}
            onChange={(e) => setSearch({ q: e.target.value || undefined })}
            placeholder="ابحث عن منتج أو ماركة…"
            aria-label="ابحث عن منتج أو ماركة"
            className="h-11 w-full rounded-xl border border-border bg-card pr-10 pl-3 text-sm font-medium outline-none focus:border-ring"
          />
        </div>

        <div className="flex gap-4">
          {/* Sidebar filter */}
          <aside className="hidden lg:block w-60 shrink-0 sticky top-4 self-start">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
              <h2 className="font-display font-bold text-sm mb-3 text-end">الأقسام</h2>
              <button
                onClick={() => setSearch({ category: undefined, sub: undefined })}
                className={cn(
                  "w-full text-end rounded-lg px-3 py-2 text-xs font-bold transition mb-1",
                  !activeCat
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-primary-soft hover:text-primary",
                )}
              >
                كل الأقسام
              </button>
              <ul className="space-y-1">
                {mainCats.map((c) => {
                  const isOpen = activeCat === c.id;
                  const children = categories.filter((s) => s.parent_id === c.id);
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setSearch({ category: isOpen ? undefined : c.id, sub: undefined })}
                        className={cn(
                          "w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold transition",
                          isOpen
                            ? "bg-primary-soft text-primary"
                            : "text-foreground hover:bg-primary-soft/50",
                        )}
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                        <span>{c.name}</span>
                      </button>
                      {isOpen && children.length > 0 && (
                        <ul className="mt-1 mr-3 border-r-2 border-primary-soft pr-3 space-y-0.5">
                          {children.map((s) => (
                            <li key={s.id}>
                              <button
                                onClick={() => setSearch({ sub: activeSub === s.id ? undefined : s.id })}
                                className={cn(
                                  "w-full text-end rounded px-2 py-1.5 text-[11px] font-semibold transition",
                                  activeSub === s.id
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-primary-soft hover:text-primary",
                                )}
                              >
                                {s.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          {/* Mobile chips for main categories */}
          <div className="flex-1 min-w-0">
            <div className="lg:hidden mb-3 flex gap-2 overflow-x-auto pb-1 -mx-3 px-3">
              <button
                onClick={() => setSearch({ category: undefined, sub: undefined })}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold",
                  !activeCat ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
                )}
              >
                الكل
              </button>
              {mainCats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSearch({ category: c.id, sub: undefined })}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold",
                    activeCat === c.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Sub-cats chips when category selected (mobile) */}
            {activeCat && subCats.length > 0 && (
              <div className="lg:hidden mb-3 flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3">
                {subCats.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSearch({ sub: activeSub === s.id ? undefined : s.id })}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-[11px] font-bold",
                      activeSub === s.id ? "bg-accent text-accent-foreground" : "bg-primary-soft text-primary",
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            {/* Active filter pill */}
            {(activeCat || activeSub || q) && (
              <div className="mb-3 flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => navigate({ search: {} as ProductsSearch })}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3 w-3" /> مسح الفلاتر
                </button>
              </div>
            )}

            {isLoading ? (
              <p className="py-12 text-center text-muted-foreground">جاري التحميل…</p>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center">
                <p className="text-muted-foreground font-bold">لا توجد منتجات في هذا القسم</p>
                <p className="text-xs text-muted-foreground mt-1">جرّب قسم آخر أو امسح الفلاتر</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {filtered.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
