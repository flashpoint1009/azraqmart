import { createFileRoute } from "@tanstack/react-router";
import { Users2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { UsersManager } from "@/components/UsersManager";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "إدارة الموظفين — أزرق ماركت" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer"]}>
      <Page />
    </RoleGuard>
  ),
});

function Page() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <StaffNav />
      <div className="border-b border-border bg-gradient-to-l from-accent/10 via-background to-primary/5">
        <div className="mx-auto max-w-[1100px] px-4 py-6 lg:px-6">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5" /> فريق العمل
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">إدارة الموظفين والصلاحيات</h1>
          <p className="text-sm text-muted-foreground mt-1">أضف موظفين وتحكم في الصفحات اللي يقدر يدخلها كل واحد.</p>
        </div>
      </div>
      <main className="mx-auto max-w-[1100px] px-4 py-5 lg:px-6">
        <UsersManager scope="admin" />
      </main>
    </div>
  );
}
