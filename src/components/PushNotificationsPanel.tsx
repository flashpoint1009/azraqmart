import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Send, Globe, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function PushNotificationsPanel() {
  const qc = useQueryClient();
  const [endpoint, setEndpoint] = useState("");
  const [enabled, setEnabled] = useState(true);

  const cfg = useQuery({
    queryKey: ["push_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("push_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (cfg.data) {
      setEndpoint(cfg.data.endpoint_url ?? "");
      setEnabled(cfg.data.is_enabled ?? true);
    }
  }, [cfg.data]);

  const stats = useQuery({
    queryKey: ["push_stats"],
    queryFn: async () => {
      const [tokens, unread] = await Promise.all([
        supabase.from("user_push_tokens").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
      ]);
      return { tokens: tokens.count ?? 0, unread: unread.count ?? 0 };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("push_config")
        .update({ endpoint_url: endpoint || null, is_enabled: enabled, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ إعدادات الإشعارات");
      qc.invalidateQueries({ queryKey: ["push_config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("سجّل دخول أولاً");
      const { error } = await supabase.from("notifications").insert({
        user_id: u.user.id,
        title: "إشعار تجريبي",
        body: "تم إرسال هذا الإشعار من لوحة المطور — النظام يعمل بنجاح ✓",
        type: "test",
        link: "/notifications",
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("تم إرسال إشعار تجريبي إليك"),
    onError: (e: Error) => toast.error(e.message),
  });

  const autoFillEndpoint = () => {
    if (typeof window === "undefined") return;
    setEndpoint(`${window.location.origin}/api/public/send-push`);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h3 className="font-display font-bold mb-4 inline-flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" /> مركز الإشعارات Push
        </h3>

        <div className="grid gap-3 sm:grid-cols-2 mb-4">
          <Stat label="أجهزة مسجّلة (Push)" value={stats.data?.tokens ?? 0} icon={<Smartphone className="h-4 w-4" />} />
          <Stat label="إشعارات غير مقروءة" value={stats.data?.unread ?? 0} icon={<Bell className="h-4 w-4" />} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <div>
              <p className="text-sm font-bold">تفعيل إرسال Push</p>
              <p className="text-[11px] text-muted-foreground">عند الإيقاف يبقى التطبيق يعرض الإشعارات داخلياً عبر Realtime فقط.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div>
            <Label className="inline-flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Endpoint إرسال Push
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://your-app.lovable.app/api/public/send-push"
                dir="ltr"
              />
              <Button type="button" variant="outline" onClick={autoFillEndpoint}>اقتراح</Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              يستخدمه الـ Database Trigger لإرسال FCM عند أي إشعار جديد. يجب أن يحتوي على ملفات FCM_SERVER_KEY و INTERNAL_PUSH_SECRET في الـ Secrets.
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-6">
            <p className="font-bold text-amber-700 dark:text-amber-400 inline-flex items-center gap-1.5 mb-1">
              <ShieldCheck className="h-3.5 w-3.5" /> الأمان
            </p>
            <p className="text-muted-foreground">
              مفتاح <code className="text-foreground">FCM_SERVER_KEY</code> وكذلك <code className="text-foreground">INTERNAL_PUSH_SECRET</code> محفوظان كـ Secrets في الخادم ولا يظهران في الواجهة الأمامية أبداً. الـ endpoint يطلب التحقق من السر الداخلي قبل تنفيذ الإرسال.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => sendTest.mutate()} disabled={sendTest.isPending} className="gap-2">
              <Send className="h-3.5 w-3.5" /> إرسال إشعار تجريبي
            </Button>
            <Button variant="hero" onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
              حفظ الإعدادات
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h3 className="font-display font-bold mb-3 inline-flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" /> إعداد التطبيق على Android
        </h3>
        <ol className="space-y-2 text-xs text-muted-foreground leading-6 list-decimal pr-4">
          <li>أنشئ مشروع Firebase وأضف تطبيق Android (نفس الـ package name الموجود في Capacitor).</li>
          <li>حمّل ملف <code className="text-foreground">google-services.json</code> وضعه داخل <code className="text-foreground">android/app/</code>.</li>
          <li>انسخ الـ Server Key من Firebase → Project Settings → Cloud Messaging واحفظه في Secrets كـ <code className="text-foreground">FCM_SERVER_KEY</code>.</li>
          <li>في صفحة الـ APK، عند فتح التطبيق سيُطلب من المستخدم الإذن، ثم يُحفظ الـ Token تلقائياً في قاعدة البيانات.</li>
          <li>اضغط "إرسال إشعار تجريبي" أعلاه للتأكد من أن السلسلة كاملة تعمل.</li>
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-surface-2 to-card p-3.5">
      <p className="text-[11px] font-bold text-muted-foreground inline-flex items-center gap-1.5">{icon}{label}</p>
      <p className="font-display text-2xl font-bold tabular-nums mt-1" dir="ltr">{value}</p>
    </div>
  );
}
