import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MapPin, Phone, Plus, ShieldCheck, Trash2, Users2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { DeliveryAreasDialog } from "./DeliveryAreasDialog";

const ROLE_LABELS: Record<string, string> = {
  developer: "مطور",
  admin: "مدير",
  accountant: "محاسب",
  warehouse: "مخزن",
  delivery: "مندوب",
  merchant: "تاجر",
};

const ROLE_TONES: Record<string, string> = {
  developer: "bg-primary/10 text-primary border-primary/30",
  admin: "bg-accent/15 text-accent-foreground border-accent/30",
  accountant: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  warehouse: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  delivery: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
  merchant: "bg-muted text-muted-foreground border-border",
};

export const PERMS: { key: string; label: string }[] = [
  { key: "can_dashboard", label: "اللوحة" },
  { key: "can_orders", label: "الطلبات" },
  { key: "can_products", label: "المنتجات" },
  { key: "can_categories", label: "الأقسام" },
  { key: "can_purchases", label: "المشتريات" },
  { key: "can_offers", label: "العروض" },
  { key: "can_customers", label: "العملاء" },
  { key: "can_debts", label: "المديونيات" },
  { key: "can_accounting", label: "المحاسبة" },
  { key: "can_warehouse", label: "المخزن" },
  { key: "can_messages", label: "الإعلانات" },
  { key: "can_banners", label: "البانرز" },
  { key: "can_about", label: "قسم عننا" },
  { key: "can_chatbot", label: "روبوت الدردشة" },
  { key: "can_reports", label: "التقارير" },
  { key: "can_users", label: "إدارة المستخدمين" },
  { key: "can_developer", label: "إعدادات المطور" },
];

type Props = {
  /** "developer" sees & manages everyone with all permissions; "admin" only sees staff (no devs/admins) and is limited to permissions they own. */
  scope: "developer" | "admin";
};

export function UsersManager({ scope }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { settings } = useAppSettings();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [areasFor, setAreasFor] = useState<{ id: string; name: string } | null>(null);

  const { data: list = [] } = useQuery({
    queryKey: ["all_users_roles", scope],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "list" } });
      if (error || data?.error) throw new Error(data?.error || error?.message || "تعذر تحميل المستخدمين");
      return data?.users ?? [];
    },
  });

  // Current viewer's own permissions — used for admin scope to know what they can grant.
  const { data: myPerms } = useQuery({
    queryKey: ["my_perm_row", user?.id],
    enabled: !!user && scope === "admin",
    queryFn: async () => {
      const { data } = await supabase.from("user_permissions").select("*").eq("user_id", user!.id).maybeSingle();
      return (data ?? {}) as Record<string, boolean>;
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role, on }: { userId: string; role: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("تم تحديث الصلاحيات");
      qc.invalidateQueries({ queryKey: ["all_users_roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPerm = useMutation({
    mutationFn: async ({ userId, key, value }: { userId: string; key: string; value: boolean }) => {
      const { error } = await supabase
        .from("user_permissions")
        .upsert({ user_id: userId, [key]: value } as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all_users_roles"] });
      qc.invalidateQueries({ queryKey: ["my_permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActive = useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active: value }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم التحديث");
      qc.invalidateQueries({ queryKey: ["all_users_roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const callAdmin = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("admin-users", { body });
    if (error || data?.error) throw new Error(data?.error || error?.message || "خطأ");
    return data;
  };

  const createUser = useMutation({
    mutationFn: callAdmin,
    onSuccess: () => {
      toast.success("تم إنشاء المستخدم");
      qc.invalidateQueries({ queryKey: ["all_users_roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPw = useMutation({
    mutationFn: callAdmin,
    onSuccess: () => toast.success("تم تغيير كلمة السر"),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: callAdmin,
    onSuccess: () => {
      toast.success("تم حذف المستخدم");
      qc.invalidateQueries({ queryKey: ["all_users_roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const repairUsers = useMutation({
    mutationFn: () => callAdmin({ action: "repair_profiles" }),
    onSuccess: (data) => {
      toast.success(`تم إصلاح ${data?.repaired ?? 0} حساب`);
      qc.invalidateQueries({ queryKey: ["all_users_roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Admin can assign any role except "developer". Developer can assign all.
  const ALL_ROLES = scope === "developer"
    ? ["admin", "accountant", "warehouse", "delivery"]
    : ["admin", "accountant", "warehouse", "delivery", "merchant"];

  // Developer manages STAFF only (no merchants). Admin sees EVERYONE.
  const visibleList = list.filter((u: any) => {
    const roles = (u.user_roles ?? []).map((x: any) => x.role);
    if (scope === "developer") {
      // staff = anyone who is not purely a merchant
      return roles.some((r: string) => r !== "merchant");
    }
    return true;
  });

  // Developer-enforced cap on staff count
  const staffCount = list.filter((u: any) => {
    const roles = (u.user_roles ?? []).map((x: any) => x.role);
    return roles.some((r: string) => r !== "merchant");
  }).length;
  const maxStaff = settings?.max_users ?? 10;
  const reachedCap = scope === "developer" && staffCount >= maxStaff;

  const filtered = visibleList.filter((u: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.phone || "").includes(q) ||
      (u.shop_name || "").toLowerCase().includes(q)
    );
  });

  const canGrantPerm = (key: string) => {
    if (scope === "developer") return true;
    return myPerms?.[key] === true;
  };

  return (
    <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border bg-surface-2/40">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="font-display font-bold inline-flex items-center gap-2">
            <Users2 className="h-4 w-4 text-primary" />
            {scope === "admin" ? "موظفيك" : "المستخدمين"}
            <Badge variant="secondary" className="ms-1">{visibleList.length}</Badge>
          </h3>
          <CreateUserDialog
            allowedRoles={ALL_ROLES}
            disabled={reachedCap}
            onCreate={(b) => createUser.mutate({ action: "create", ...b })}
          />
          {scope === "developer" && (
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => repairUsers.mutate()} disabled={repairUsers.isPending}>
              إصلاح الحسابات
            </Button>
          )}
        </div>
        <Input
          placeholder="بحث بالاسم، الهاتف، المحل..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10"
        />
        {scope === "developer" && (
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            عدد الموظفين الحالي: <b dir="ltr">{staffCount} / {maxStaff}</b> — الحد بيتعدّل من تبويب «الهوية» حسب الاتفاق.
            {reachedCap && <span className="text-destructive"> — وصلت للحد الأقصى.</span>}
          </p>
        )}
        {scope === "admin" && (
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            بتشوف كل المستخدمين (تجار، موظفين، حتى مديرين زيك). الصلاحيات اللي تقدر تديها هي اللي المطور سمح لك بيها.
          </p>
        )}
      </div>

      <div className="divide-y divide-border">
        {filtered.map((u: any) => {
          const userRoles: string[] = (u.user_roles ?? []).map((x: any) => x.role);
          const perms = u.user_permissions ?? {};
          const isExpanded = expanded === u.user_id;
          const isActive = u.is_active !== false;
          const isFullAccess = userRoles.includes("developer") || userRoles.includes("admin");
          const isSelf = u.user_id === user?.id;

          return (
            <div key={u.user_id} className={`p-4 sm:p-5 ${!isActive ? "opacity-60 bg-destructive/5" : ""}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold">{u.full_name || u.shop_name || "—"}</p>
                    {isSelf && <Badge variant="outline" className="text-[10px]">أنت</Badge>}
                    {!isActive && <Badge variant="destructive" className="text-[10px]">معطّل</Badge>}
                  </div>
                  <p className="text-xs font-mono text-muted-foreground inline-flex items-center gap-1 mt-0.5" dir="ltr">
                    <Phone className="h-3 w-3" />{u.phone || "—"}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant={isActive ? "outline" : "default"}
                    className={`h-9 text-xs gap-1 ${isActive ? "" : "bg-success text-success-foreground hover:bg-success/90"}`}
                    onClick={() => setActive.mutate({ userId: u.user_id, value: !isActive })}
                    disabled={isSelf}
                  >
                    {isActive ? "تعطيل" : "تفعيل"}
                  </Button>
                  <Button size="icon" variant="outline" className="h-9 w-9" title="تغيير كلمة السر" onClick={() => {
                    const pw = prompt("كلمة السر الجديدة:");
                    if (pw && pw.length >= 4) resetPw.mutate({ action: "reset_password", user_id: u.user_id, password: pw });
                  }}><KeyRound className="h-4 w-4" /></Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 text-destructive hover:bg-destructive/10"
                    title="حذف"
                    disabled={isSelf}
                    onClick={() => {
                      if (confirm(`حذف ${u.full_name || u.phone}؟`)) deleteUser.mutate({ action: "delete", user_id: u.user_id });
                    }}
                  ><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Role chips */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {ALL_ROLES.map((r) => {
                  const on = userRoles.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => setRole.mutate({ userId: u.user_id, role: r, on: !on })}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${on ? ROLE_TONES[r] : "border-dashed border-border bg-transparent text-muted-foreground hover:bg-surface-2"}`}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  );
                })}
              </div>

              {userRoles.includes("delivery") && (
                <button
                  onClick={() => setAreasFor({ id: u.user_id, name: u.full_name || u.phone || "مندوب" })}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-400 hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" /> إدارة مناطق التغطية
                </button>
              )}

              <button
                onClick={() => setExpanded(isExpanded ? null : u.user_id)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {isExpanded ? "إخفاء" : "عرض"} الصلاحيات التفصيلية
              </button>

              {isExpanded && (
                <div className="mt-3 rounded-xl border border-border bg-surface-2/40 p-3">
                  {isFullAccess && (
                    <p className="text-[11px] text-muted-foreground mb-2">المطور والمدير عندهم صلاحية كاملة تلقائيًا.</p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PERMS.map((p) => {
                      const checked = isFullAccess || perms[p.key] === true;
                      const allowed = canGrantPerm(p.key);
                      const disabled = isFullAccess || !allowed;
                      return (
                        <label
                          key={p.key}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                            checked
                              ? "border-primary/40 bg-primary/5 text-primary"
                              : "border-border bg-card text-muted-foreground hover:border-primary/30"
                          } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                          title={!allowed && !isFullAccess ? "ما تقدرش تدي صلاحية ماعندكش" : undefined}
                        >
                          <span>{p.label}</span>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary cursor-pointer"
                            checked={checked}
                            disabled={disabled}
                            onChange={(e) => setPerm.mutate({ userId: u.user_id, key: p.key, value: e.target.checked })}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">لا يوجد مستخدمون</div>
        )}
      </div>
      {areasFor && (
        <DeliveryAreasDialog
          open={!!areasFor}
          onOpenChange={(v) => { if (!v) setAreasFor(null); }}
          userId={areasFor.id}
          userName={areasFor.name}
        />
      )}
    </section>
  );
}

function CreateUserDialog({ allowedRoles, onCreate, disabled }: { allowedRoles: string[]; onCreate: (b: any) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [roles, setRoles] = useState<string[]>([allowedRoles.includes("merchant") ? "merchant" : allowedRoles[0]]);

  const submit = () => {
    if (!phone || !pw) return toast.error("الهاتف وكلمة السر مطلوبين");
    onCreate({ phone, password: pw, full_name: name, roles });
    setOpen(false);
    setPhone(""); setName(""); setPw(""); setRoles([allowedRoles[0]]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" disabled={disabled} title={disabled ? "وصلت للحد الأقصى" : undefined}>
          <Plus className="h-4 w-4" />مستخدم جديد
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>إنشاء مستخدم جديد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>رقم الهاتف</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="010xxxxxxxx" />
          </div>
          <div>
            <Label>كلمة السر</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} dir="ltr" />
          </div>
          <div>
            <Label>الصلاحيات</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {allowedRoles.map((r) => (
                <label key={r} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold transition ${roles.includes(r) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2 hover:border-primary/50"}`}>
                  <input type="checkbox" className="hidden" checked={roles.includes(r)} onChange={(e) => setRoles((rs) => e.target.checked ? [...rs, r] : rs.filter((x) => x !== r))} />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} className="w-full sm:w-auto">إنشاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
