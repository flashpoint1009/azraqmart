import { Heart, Plus } from "lucide-react";
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
};

const stockMap = {
  in:  { label: "متوفر",     cls: "bg-success/10 text-success" },
  low: { label: "آخر كمية", cls: "bg-warning/15 text-warning-foreground" },
  out: { label: "نفد",       cls: "bg-destructive/10 text-destructive" },
};

export function ProductCard({ p }: { p: Product }) {
  const stock = stockMap[p.stock];
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft hover:border-primary/40 active:scale-[0.99]">
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        <img
          src={p.image}
          alt={p.name}
          loading="lazy"
          decoding="async"
          width={300}
          height={300}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
        />
        <span className={`absolute top-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold ${stock.cls} backdrop-blur-sm`}>{stock.label}</span>
        {p.badge && (
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-accent px-1.5 py-0.5 text-[9px] font-bold text-accent-foreground shadow-sm">
            {p.badge === "new" ? "جديد" : p.badge === "hot" ? "🔥 رايج" : "عرض"}
          </span>
        )}
        <button
          aria-label="إضافة للمفضلة"
          className="absolute top-1.5 left-1.5 grid h-7 w-7 place-items-center rounded-full bg-background/90 text-muted-foreground backdrop-blur transition hover:text-destructive hover:scale-110 active:scale-95"
        >
          <Heart className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-2">
        <p className="text-[9px] font-bold uppercase tracking-wide text-primary line-clamp-1">{p.brand}</p>
        <h3 className="mt-0.5 line-clamp-2 min-h-[2rem] text-[11px] font-bold leading-tight text-foreground">{p.name}</h3>

        <div className="mt-1.5 flex items-baseline justify-between gap-1">
          <p className="text-sm font-bold text-primary tabular-nums" dir="ltr">{p.cartonPrice}<span className="text-[9px] font-medium text-muted-foreground"> ج.م</span></p>
          <p className="text-[10px] font-medium text-muted-foreground tabular-nums" dir="ltr">{p.unitPrice} للقطعة</p>
        </div>

        <button
          disabled={p.stock === "out"}
          onClick={() => {
            cartStore.add(
              { id: p.id, name: p.name, brand: p.brand, image: p.image, unitPrice: p.unitPrice, cartonPrice: p.cartonPrice, unitsPerCarton: p.unitsPerCarton },
              1,
            );
            toast.success(`تمت إضافة ${p.name}`);
          }}
          className="mt-2 inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold shadow-sm transition-all hover:opacity-90 hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" /> أضف للسلة
        </button>
      </div>
    </article>
  );
}
