import { Bell, CheckCheck, Package, Truck } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, typeof Package> = {
  order_assigned: Truck,
  delivery_update: Truck,
};

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  if (!user) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="الإشعارات">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-bold">الإشعارات</p>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
            >
              <CheckCheck className="h-3 w-3" /> تعليم الكل كمقروء
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">لا توجد إشعارات</div>
          ) : (
            notifications.map((n) => {
              const Icon = TYPE_ICON[n.type] ?? Package;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) markRead.mutate(n.id);
                    if (n.link) navigate({ to: n.link });
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border/60 px-3 py-2.5 text-right transition hover:bg-surface-2",
                    !n.is_read && "bg-primary/5",
                  )}
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-tight">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{n.body}</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground" dir="ltr">
                      {new Date(n.created_at).toLocaleString("ar-EG")}
                    </p>
                  </div>
                  {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary mt-1.5" />}
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-border p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate({ to: "/notifications" })}>
            عرض كل الإشعارات
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
