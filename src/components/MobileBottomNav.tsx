import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Package, ShoppingCart, ClipboardList, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useCart } from "@/hooks/useCart";
import { useAppSettings } from "@/hooks/useAppSettings";
import { isFeatureEnabled } from "@/lib/features";
import { cn } from "@/lib/utils";

/** Sticky bottom navigation for merchants on mobile. Staff (admin/dev/etc) use the side menu. */
export function MobileBottomNav() {
  const { user } = useAuth();
  const { primary, isLoading } = useUserRoles();
  const { count } = useCart();
  const { settings } = useAppSettings();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (!user || isLoading) return null;
  // Only show for merchant role
  if (primary && primary !== "merchant") return null;

  const items = [
    { to: "/", label: "الرئيسية", icon: Home, feature: "dashboard" as const },
    { to: "/products", label: "المنتجات", icon: Package, feature: "catalog" as const },
    { to: "/cart", label: "السلة", icon: ShoppingCart, feature: "cart" as const, badge: count },
    { to: "/orders", label: "طلباتي", icon: ClipboardList, feature: "customer_orders" as const },
    { to: "/account", label: "حسابي", icon: User, feature: "account" as const },
  ].filter((it) => isFeatureEnabled(settings?.features, it.feature));

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="التنقل السفلي"
    >
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.to === "/" ? path === "/" : path.startsWith(it.to);
          return (
            <li key={it.to}>
              <Link
                to={it.to}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 transition-colors active:bg-primary-soft",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <div className="relative">
                  <it.icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
                  {it.badge && it.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground tabular-nums">
                      {it.badge > 99 ? "99+" : it.badge}
                    </span>
                  ) : null}
                </div>
                <span className="text-[10px] font-bold">{it.label}</span>
                {active && <span className="absolute top-0 inset-x-6 h-0.5 rounded-full bg-primary" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
