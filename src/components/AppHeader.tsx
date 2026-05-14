import { LogIn, LogOut, Menu, Search, ShoppingCart } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CustomerDrawer } from "./CustomerDrawer";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useUserRoles } from "@/hooks/useUserRoles";
import { isFeatureEnabled } from "@/lib/features";

export function AppHeader({ onMenu }: { onMenu?: () => void }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { count: cartCount } = useCart();
  const { settings } = useAppSettings();
  const { primary, isLoading: rolesLoading } = useUserRoles();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Commerce UI (search + cart) is only for merchants or unauthenticated visitors.
  const isMerchantOrGuest = !user || rolesLoading || primary === "merchant" || primary === null;
  const showCart = isMerchantOrGuest && isFeatureEnabled(settings?.features, "cart");
  const showSearch = isMerchantOrGuest;
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => (onMenu ? onMenu() : setDrawerOpen(true))}
          className="relative group hover:bg-primary-soft hover:text-primary transition-all"
          aria-label="القائمة"
        >
          <Menu className="h-5 w-5 transition-transform group-hover:scale-110" />
        </Button>
        <CustomerDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
        <Logo />

        {showSearch && (
          <div className="hidden flex-1 max-w-xl mx-4 md:block">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="ابحث عن منتج…"
                aria-label="ابحث عن منتج"
                className="h-11 w-full rounded-xl border border-border bg-surface-2 pr-10 pl-16 text-sm font-medium outline-none transition focus:border-ring focus:bg-surface-1 focus:shadow-sm"
              />
              <kbd className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border bg-surface-1 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">⌘K</kbd>
            </div>
          </div>
        )}

        <div className="ms-auto flex items-center gap-2">
          <ThemeToggle />
          <NotificationBell />


          {showCart && (
            <Button asChild variant="default" className="gap-2 shadow-sm">
              <Link to="/cart">
                <ShoppingCart className="h-4 w-4" />
                <span className="hidden sm:inline">السلة</span>
                {cartCount > 0 && (
                  <Badge variant="secondary" className="bg-accent text-accent-foreground border-0 ms-1">{cartCount}</Badge>
                )}
              </Link>
            </Button>
          )}

          {user ? (
            <Button
              variant="outline"
              className="gap-2 font-bold text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">خروج</span>
            </Button>
          ) : (
            <Button asChild variant="outline" className="gap-2">
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">دخول</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
