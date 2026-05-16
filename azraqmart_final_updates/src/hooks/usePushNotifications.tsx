import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";

/**
 * Registers Capacitor Push Notifications on Android (native runtime only).
 * On the web it's a no-op — Realtime fallback handles in-app notifications.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const { primary: primaryRole } = useUserRoles();

  useEffect(() => {
    if (!user) return;
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted") return;

        await PushNotifications.register();

        PushNotifications.addListener("registration", async (tokenData) => {
          if (cancelled) return;
          await supabase.from("user_push_tokens").upsert(
            {
              user_id: user.id,
              token: tokenData.value,
              platform: Capacitor.getPlatform(),
              role: primaryRole ?? null,
              is_active: true,
              last_seen_at: new Date().toISOString(),
              device_info: { platform: Capacitor.getPlatform() },
            },
            { onConflict: "user_id,token" }
          );
        });

        PushNotifications.addListener("registrationError", (err) => {
          console.error("[push] registration error", err);
        });

        PushNotifications.addListener("pushNotificationReceived", (n) => {
          console.log("[push] received", n);
        });

        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const link = (action.notification.data as any)?.link;
          if (link && typeof window !== "undefined") {
            window.location.assign(link);
          }
        });
      } catch (e) {
        console.warn("[push] init failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, primaryRole]);
}
