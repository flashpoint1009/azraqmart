import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Send, Smartphone, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listBroadcastTargets, sendPushBroadcast } from "@/lib/push.functions";

export const Route = createFileRoute("/admin/push")({
  head: () => ({ meta: [{ title: "إشعارات Push" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer"]}>
      <PushPage />
    </RoleGuard>
  ),
});

type Kind =
  | "all_customers"
  | "governorate"
  | "customer"
  | "all_delivery"
  | "delivery"
  | "all_staff";

function PushPage() {
  const fetchTargets = useServerFn(listBroadcastTargets);
  const sendFn = useServerFn(sendPushBroadcast);

  const targets = useQuery({
    queryKey: ["push_targets"],
    queryFn: () => fetchTargets(),
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [kind, setKind] = useState<Kind>("all_customers");
  const [governorate, setGovernorate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [deliveryId, setDeliveryId] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("اكتب عنوان الإشعار");
      if (!body.trim()) throw new Error("اكتب نص الإشعار");

      let target: any;
      if (kind === "all_customers") target = { kind };
      else if (kind === "all_delivery") target = { kind };
      else if (kind === "all_staff") target = { kind };
      else if (kind === "governorate") {
        if (!governorate) throw new Error("اختر المحافظة");
        target = { kind, governorate };
      } else if (kind === "customer") {
        if (!customerId) throw new Error("اختر العميل");
        target = { kind, customer_id: customerId };
      } else if (kind === "delivery") {
        if (!deliveryId) throw new Error("اختر مندوب التوصيل");
        target = { kind, user_id: deliveryId };
      }

      const res = await sendFn({
        data: {
          title: title.trim(),
          body: body.trim(),
          link: link.trim() || null,
          target,
        },
      });
      return res;
    },
    onSuccess: (res) => {
      toast.success(`تم الإرسال إلى ${res.sent} مستخدم`);
      setTitle("");
      setBody("");
      setLink("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const customersWithUser = useMemo(
    () => (targets.data?.customers ?? []).filter((c: any) => c.user_id),
    [targets.data]
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[900px] px-4 py-6 lg:px-6 lg:py-8 space-y-5">
        <header>
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
            <Bell className="h-3 w-3" /> إشعارات فورية
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">إرسال إشعار Push</h1>
          <p className="text-xs text-muted-foreground mt-1">
            يصل الإشعار للجوال حتى لو التطبيق مقفول. الأجهزة المسجلة حالياً:{" "}
            <span className="font-bold text-foreground">{targets.data?.stats.active_devices ?? 0}</span>
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
          {/* Live preview */}
          <div className="rounded-xl border border-border bg-gradient-to-br from-surface-2 to-card p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground font-bold">Zone Mart • الآن</p>
                <p className="font-display font-bold text-sm mt-0.5">{title || "عنوان الإشعار"}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{body || "محتوى الإشعار سيظهر هنا..."}</p>
              </div>
            </div>
          </div>

          <div>
            <Label>العنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عرض جديد!" maxLength={120} />
          </div>

          <div>
            <Label>النص</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-ring"
              placeholder="خصم 20% على كل المنتجات لمدة 24 ساعة فقط"
            />
          </div>

          <div>
            <Label>رابط (اختياري)</Label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/products" dir="ltr" />
            <p className="text-[10px] text-muted-foreground mt-1">عند الضغط على الإشعار يفتح هذا الرابط داخل التطبيق</p>
          </div>

          {/* Recipients */}
          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1.5">
              <UsersIcon className="h-3.5 w-3.5" /> المستلمون
            </Label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            >
              <option value="all_customers">كل العملاء</option>
              <option value="governorate">عملاء بمحافظة محددة</option>
              <option value="customer">عميل محدد</option>
              <option value="all_delivery">كل مندوبي التوصيل</option>
              <option value="delivery">مندوب توصيل محدد</option>
              <option value="all_staff">كل الموظفين (إدارة)</option>
            </select>

            {kind === "governorate" && (
              <select
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
              >
                <option value="">— اختر محافظة —</option>
                {(targets.data?.governorates ?? []).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            )}

            {kind === "customer" && (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
              >
                <option value="">— اختر العميل —</option>
                {customersWithUser.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.shop_name} — {c.phone}
                  </option>
                ))}
              </select>
            )}

            {kind === "delivery" && (
              <select
                value={deliveryId}
                onChange={(e) => setDeliveryId(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
              >
                <option value="">— اختر المندوب —</option>
                {(targets.data?.deliveryAgents ?? []).map((d: any) => (
                  <option key={d.user_id} value={d.user_id}>
                    {d.full_name} {d.phone ? `— ${d.phone}` : ""} {d.has_device ? "📱" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="hero"
              onClick={() => send.mutate()}
              disabled={send.isPending}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {send.isPending ? "جاري الإرسال..." : "إرسال الإشعار"}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-6">
          <p className="font-bold text-amber-700 dark:text-amber-400 mb-1">ملاحظات مهمة</p>
          <ul className="list-disc pr-4 space-y-1 text-muted-foreground">
            <li>الإشعار يصل فقط للأجهزة اللي حمّلت تطبيق الـ APK وفتحته مرة على الأقل وسمحت بالإشعارات.</li>
            <li>يلزم بناء الـ APK بعد إضافة <code className="text-foreground">google-services.json</code> داخل <code className="text-foreground">android/app/</code>.</li>
            <li>الإشعار يتسجل تلقائياً في صفحة "الإشعارات" داخل التطبيق حتى لو الجهاز مش مسجّل.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
