import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles, type AppRole, ROLE_HOME } from "@/hooks/useUserRoles";

export function RoleGuard({
  allow,
  children,
}: {
  allow: AppRole[];
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const { hasAny, primary, isLoading } = useUserRoles();

  if (authLoading || (user && isLoading)) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-sm font-bold text-muted-foreground">جارِ التحميل…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-sm text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-warning" />
          <h2 className="mt-3 font-display text-xl font-bold">يلزم تسجيل الدخول</h2>
          <Button asChild className="mt-4"><Link to="/login">تسجيل الدخول</Link></Button>
        </div>
      </div>
    );
  }

  if (!hasAny(...allow)) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-sm text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-3 font-display text-xl font-bold">لا تملك صلاحية الوصول</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            هذه الصفحة مخصصة لـ: {allow.join("، ")}
          </p>
          <Button asChild className="mt-4">
            <Link to={primary ? ROLE_HOME[primary] : "/"}>العودة للرئيسية</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
