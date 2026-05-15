import { Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { cartStore } from "@/hooks/useCart";

export type Product = {
  id: string;
  name: string;
  brand: string;
  image: string;
  unitPrice: number;
  cartonPrice: number;
  unitsPerCarton: number;
  moq: number;
  stock: "in" | "low" | "out";
  badge?: "new" | "hot" | "deal";
  oldPrice?: number;
};

const stockMap = {
  in:  { label: "متوفر",     cls: "bg-success/15 text-success" },
  low: { label: "آخر كمية", cls: "bg-warning/15 text-warning-foreground" },
  out: { label: "نفد",       cls: "bg-destructive/10 text-destructive" },
};

const badgeMap = {
  new: { label: "جديد", cls: "bg-primary text-primary-foreground" },
  hot: { label: "🔥 الأكثر طلباً", cls: "bg-destructive text-destructive-foreground" },
  deal: { label: "عرض", cls: "bg-accent text-accent-foreground" },
};

export function ProductCard({ p }: { p: Product }) {
  const stock = stockMap[p.stock];

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:shadow-lg hover:border-primary/30 active:scale-[0.98]">
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        <img
          src={p.image}
          alt={p.name}
          loading="lazy"
          decoding="async"
          width={400}
          height={400}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Badge */}
        {p.badge && (
          <span className={`absolute top-2 right-2 rounded-lg px-2 py-0.5 text-[11px] font-bold shadow-sm ${badgeMap[p.badge].cls}`}>
            {badgeMap[p.badge].label}
          </span>
        )}

        {/* Stock indicator */}
        {p.stock !== "in" && (
          <span className={`absolute top-2 left-2 rounded-lg px-2 py-0.5 text-[11px] font-bold ${stock.cls}`}>
            {stock.label}
          </span>
        )}

        {/* Quick add overlay on hover (desktop) */}
        <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-200 p-2 hidden sm:block">
          <button
            disabled={p.stock === "out"}
            onClick={() => {
              cartStore.add(
                { id: p.id, name: p.name, brand: p.brand, image: p.image, unitPrice: p.unitPrice, cartonPrice: p.cartonPrice, unitsPerCarton: p.unitsPerCarton },
                1,
              );
              toast.success(`تمت الإضافة للسلة`);
            }}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground h-10 text-sm font-bold shadow-md transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShoppingBag className="h-4 w-4" /> أضف للسلة
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3">
        <p className="text-[11px] font-semibold text-muted-foreground line-clamp-1">{p.brand}</p>
        <h3 className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-foreground">{p.name}</h3>

        {/* Price */}
        <div className="mt-auto pt-2 flex items-center gap-2">
          <p className="text-lg font-bold text-primary tabular-nums" dir="ltr">
            {p.unitPrice}<span className="text-xs font-medium text-muted-foreground mr-0.5"> ج.م</span>
          </p>
          {p.oldPrice && p.oldPrice > p.unitPrice && (
            <p className="text-xs text-muted-foreground line-through tabular-nums" dir="ltr">{p.oldPrice}</p>
          )}
        </div>

        {/* Mobile add button */}
        <button
          disabled={p.stock === "out"}
          onClick={() => {
            cartStore.add(
              { id: p.id, name: p.name, brand: p.brand, image: p.image, unitPrice: p.unitPrice, cartonPrice: p.cartonPrice, unitsPerCarton: p.unitsPerCarton },
              1,
            );
            toast.success(`تمت الإضافة للسلة`);
          }}
          className="sm:hidden mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground h-10 text-sm font-bold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" /> أضف
        </button>
      </div>
    </article>
  );
}
