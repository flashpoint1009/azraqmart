import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles, ROLE_HOME } from "@/hooks/useUserRoles";

export const Route = createFileRoute("/account/password")({
  head: () => ({
    meta: [
      { title: "تغيير كلمة المرور — أزرق ماركت" },
      { name: "description", content: "حدّث كلمة مرور حسابك في أزرق ماركت لحماية بيانات تجارتك ومعاملاتك." },
      { property: "og:title", content: "تغيير كلمة المرور — أزرق ماركت" },
      { property: "og:description", content: "حدّث كلمة المرور لحسابك في أزرق ماركت." },
      { property: "og:url", content: "https://azraqmart.com/account/password" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "canonical", href: "https://azraqmart.com/account/password" },
    ],
  }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { user } = useAuth();
  const { primary } = useUserRoles();
  const navigate = useNavigate();
  const backTo = primary ? ROLE_HOME[primary] : "/";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  if (!user) {
    return <div className="p-8 text-center">سجّل الدخول أولاً</div>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 4) return toast.error("كلمة السر يجب أن لا تقل عن 4 أحرف");
    if (pw !== pw2) return toast.error("كلمتا السر غير متطابقتين");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم تغيير كلمة السر بنجاح");
    navigate({ to: backTo });
  };

  return (
    <div className="mx-auto max-w-md p-6">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ms-2 gap-1.5">
        <Link to={backTo}><ArrowRight className="h-4 w-4" /> رجوع</Link>
      </Button>
      <Card className="p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold">تغيير كلمة السر</h1>
          <p className="text-xs text-muted-foreground mt-1">اختَر كلمة سر جديدة وقوية لحماية حسابك</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>كلمة السر الجديدة</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>تأكيد كلمة السر</Label>
            <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} dir="ltr" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
