import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity, Bell, Bot, Building2, ClipboardList, FolderTree, Image, LayoutDashboard, MapPin, Menu, MessageSquare,
  Package, Palette, Receipt, Settings2, ShoppingBag, Tag, Truck, Users, Wallet, Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { usePermissions, type PermKey } from "@/hooks/usePermissions";
import { useAppSettings } from "@/hooks/useAppSettings";
import { isFeatureEnabled, type SystemFeatureKey } from "@/lib/features";
import { cn } from "@/lib/utils";

type Tab = { to: string; label: string; icon: typeof LayoutDashboard; roles: AppRole[]; perm?: PermKey; feature?: SystemFeatureKey };

const tabs: Tab[] = [
  { to: "/admin", label: "اللوحة", icon: LayoutDashboard, roles: ["admin", "developer"], perm: "dashboard", feature: "dashboard" },
  { to: "/admin/orders", label: "الطلبات", icon: ClipboardList, roles: ["admin", "developer", "accountant", "warehouse"], perm: "orders", feature: "orders" },
  { to: "/warehouse", label: "المخزن", icon: Warehouse, roles: ["warehouse", "developer", "admin"], perm: "warehouse", feature: "warehouse" },
  { to: "/warehouse-advanced", label: "المخزن المتقدم", icon: Package, roles: ["warehouse", "developer", "admin"], perm: "warehouse" },
  { to: "/admin/live-tracking", label: "تتبّع المندوبين", icon: MapPin, roles: ["admin", "developer"] },
  { to: "/admin/products", label: "المنتجات", icon: Package, roles: ["developer", "admin", "accountant"], perm: "products", feature: "products" },
  { to: "/admin/categories", label: "الأقسام", icon: FolderTree, roles: ["developer", "admin", "accountant"], perm: "categories", feature: "categories" },
  { to: "/admin/purchases", label: "المشتريات", icon: ShoppingBag, roles: ["developer", "admin", "accountant"], perm: "purchases", feature: "purchases" },
  { to: "/admin/offers", label: "العروض", icon: Tag, roles: ["developer", "admin", "accountant"], perm: "offers", feature: "offers" },
  { to: "/accounting", label: "المحاسبة", icon: Receipt, roles: ["accountant", "developer", "admin"], perm: "accounting", feature: "accounting" },
  { to: "/admin/debts", label: "المديونيات", icon: Wallet, roles: ["admin", "developer", "accountant"], perm: "debts", feature: "debts" },
  { to: "/admin/customers", label: "العملاء", icon: Users, roles: ["developer", "admin", "accountant"], perm: "customers", feature: "customers" },
  { to: "/admin/messages", label: "الإعلانات", icon: MessageSquare, roles: ["developer", "admin"], perm: "messages", feature: "messages" },
  { to: "/admin/chatbot", label: "روبوت الدردشة", icon: Bot, roles: ["developer", "admin"], perm: "chatbot", feature: "chatbot" },
  { to: "/admin/banners", label: "البانرز", icon: Image, roles: ["developer", "admin"], perm: "banners" },
  { to: "/admin/about", label: "قسم عننا", icon: Image, roles: ["developer", "admin"], perm: "about" },
  { to: "/admin/push", label: "إشعارات Push", icon: Bell, roles: ["developer", "admin"] },
  { to: "/delivery", label: "طلباتي (مندوب)", icon: Truck, roles: ["delivery", "developer", "admin"], feature: "delivery" },
  { to: "/admin/users", label: "المستخدمين", icon: Users, roles: ["admin"], perm: "users", feature: "users" },
  { to: "/developer", label: "المطور", icon: Settings2, roles: ["developer"], perm: "developer" },
  { to: "/developer/saas", label: "SaaS متقدم", icon: Activity, roles: ["developer"] },
  { to: "/admin/tenants", label: "إدارة المستأجرين", icon: Building2, roles: ["developer", "admin"] },
  { to: "/admin/branding", label: "تخصيص العلامة", icon: Palette, roles: ["developer", "admin"] },
];

export function StaffNav() {
  const { hasAny } = useUserRoles();
  const { can } = usePermissions();
  const { settings } = useAppSettings();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const isDeveloper = hasAny("developer");
  const visible = tabs.filter((t) => hasAny(...t.roles) && (!t.perm || can(t.perm)) && (isDeveloper || !t.feature || isFeatureEnabled(settings?.features, t.feature)));
  if (visible.length === 0) return null;

  const current = visible.find((t) => path === t.to || (t.to !== "/admin" && path.startsWith(t.to)));

  return (
    <div className="border-b border-border bg-card/60 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-3 py-2 lg:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Menu className="h-4 w-4" />
              القائمة
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0">
            <SheetHeader className="border-b border-border px-4 py-3 text-right">
              <SheetTitle className="text-sm">قائمة التنقل</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 p-2 overflow-y-auto h-[calc(100vh-60px)]">
              {visible.map((t) => {
                const active = path === t.to || (t.to !== "/admin" && path.startsWith(t.to));
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "inline-flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-bold transition",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground hover:bg-primary-soft hover:text-primary",
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
        {current && (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary">
            <current.icon className="h-3.5 w-3.5" />
            {current.label}
          </div>
        )}
      </div>
    </div>
  );
}
