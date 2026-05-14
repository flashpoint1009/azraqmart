import { Link, useRouterState } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAppSettings } from "@/hooks/useAppSettings";
import { isFeatureEnabled } from "@/lib/features";

export function FloatingCartButton() {
  const { user } = useAuth();
  const { count } = useCart();
  const { hasAny } = useUserRoles();
  const { settings } = useAppSettings();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (!user) return null;
  if (!isFeatureEnabled(settings?.features, "cart")) return null;
  // Hide for staff
  if (hasAny("admin", "developer", "accountant", "warehouse")) return null;
  // Hide on cart, login, admin areas
  if (path.startsWith("/cart") || path.startsWith("/login") || path.startsWith("/admin") || path.startsWith("/warehouse") || path.startsWith("/accounting") || path.startsWith("/developer") || path.startsWith("/delivery")) return null;

  // Bottom nav already shows cart on mobile, so this FAB is hidden — only kept for legacy fallback.
  return (
    <Link
      to="/cart"
      aria-label="السلة"
      className="hidden fixed bottom-5 left-5 z-50 place-items-center h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)] ring-4 ring-background/70 active:scale-95 transition-transform"
    >
      <ShoppingCart className="h-6 w-6" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 grid place-items-center min-w-[22px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold ring-2 ring-background">
          {count}
        </span>
      )}
    </Link>
  );
}
