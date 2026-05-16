import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, Trash2, Package, Truck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "الإشعارات — Zone Mart" },
      { name: "description", content: "تابع تحديثات طلباتك وعروض Zone Mart من مكان واحد عبر مركز الإشعارات." },
      { property: "og:title", content: "الإشعارات — Zone Mart" },
      { property: "og:description", content: "تحديثات طلباتك وعروض Zone Mart في مكان واحد." },
      { property: "og:url", content: "https://azraqmart.lovable.app/notifications" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://azraqmart.lovable.app/notifications" },
    ],
  }),
  component: NotificationsPage,
});

const TYPE_ICON: Record<string, typeof Package> = {
  order_assigned: Truck,
  delivery_update: Truck,
};

function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  const clearAll = async () => {
    if (!user) return;
    if (!confirm("حذف كل الإشعارات؟")) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-3 py-4 sm:px-4 sm:py-6">
        <header className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-primary inline-flex items-center gap-1"><Bell className="h-3.5 w-3.5" /> الإشعارات</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">صندوق الإشعارات</h1>
            <p className="text-sm text-muted-foreground mt-1">{unreadCount} غير مقروء من {notifications.length}</p>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => markAllRead.mutate()}>
                <CheckCheck className="h-3.5 w-3.5" /> تعليم الكل
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={clearAll}>
                <Trash2 className="h-3.5 w-3.5" /> حذف الكل
              </Button>
            )}
          </div>
        </header>

        {notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Bell className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-bold">لا توجد إشعارات</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const Icon = TYPE_ICON[n.type] ?? Package;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) markRead.mutate(n.id);
                    if (n.link) navigate({ to: n.link });
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-3 text-right transition hover:bg-surface-2",
                    n.is_read ? "border-border bg-card" : "border-primary/30 bg-primary/5",
                  )}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-tight">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground" dir="ltr">{new Date(n.created_at).toLocaleString("ar-EG")}</p>
                  </div>
                  {!n.is_read && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary mt-2" />}
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
