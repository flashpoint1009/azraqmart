import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDownUp, ClipboardList, MapPin, Package, Plus, RotateCcw, Trash2, Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/warehouse-advanced")({
  head: () => ({ meta: [{ title: "إدارة المخزن المتقدمة — Zone Mart" }] }),
  component: () => (
    <RoleGuard allow={["warehouse", "admin", "developer"]}>
      <Page />
    </RoleGuard>
  ),
});

const MOVEMENT_LABELS: Record<string, string> = {
  in: "وارد", out: "منصرف", adjustment: "تسوية", return: "مرتجع", damage: "تالف", transfer: "نقل",
};
const STOCKTAKE_STATUS: Record<string, string> = {
  draft: "مسودة", in_progress: "قيد التنفيذ", completed: "مكتمل", cancelled: "ملغي",
};
const RETURN_STATUS: Record<string, string> = {
  pending: "بانتظار المراجعة", approved: "مقبول", rejected: "مرفوض", completed: "مكتمل",
};

function Page() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <StaffNav />
      <div className="border-b border-border bg-gradient-to-l from-accent/10 via-background to-primary/5">
        <div className="mx-auto max-w-[1100px] px-4 py-6 lg:px-6">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
            <Warehouse className="h-3.5 w-3.5" /> المخزن المتقدم
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">إدارة المخزن المتقدمة</h1>
          <p className="text-sm text-muted-foreground mt-1">حركة المخزون، الجرد، التنبيهات، المرتجعات، ومواقع التخزين.</p>
        </div>
      </div>
      <main className="mx-auto max-w-[1100px] px-4 py-5 lg:px-6">
        <Tabs defaultValue="movements">
          <TabsList className="flex w-full overflow-x-auto justify-start">
            <TabsTrigger value="movements" className="gap-1.5"><ArrowDownUp className="h-3.5 w-3.5" />سجل الحركة</TabsTrigger>
            <TabsTrigger value="stocktake" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" />الجرد</TabsTrigger>
            <TabsTrigger value="lowstock" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />تنبيه النفاد</TabsTrigger>
            <TabsTrigger value="returns" className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" />المرتجعات</TabsTrigger>
            <TabsTrigger value="bins" className="gap-1.5"><MapPin className="h-3.5 w-3.5" />مواقع التخزين</TabsTrigger>
          </TabsList>
          <TabsContent value="movements" className="mt-4"><MovementsTab /></TabsContent>
          <TabsContent value="stocktake" className="mt-4"><StocktakeTab /></TabsContent>
          <TabsContent value="lowstock" className="mt-4"><LowStockTab /></TabsContent>
          <TabsContent value="returns" className="mt-4"><ReturnsTab /></TabsContent>
          <TabsContent value="bins" className="mt-4"><BinsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ========================= Movements =========================
function MovementsTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("in");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");

  const movements = useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, movement_type, qty, qty_before, qty_after, reason, created_at, product_id, products(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const products = useQuery({
    queryKey: ["products-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, stock_qty").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!productId || !qty) throw new Error("املأ كل البيانات");
      const product = products.data?.find((p: any) => p.id === productId);
      if (!product) throw new Error("منتج غير موجود");
      const q = parseInt(qty);
      const prev = (product as any).stock_qty ?? 0;
      let next = prev;
      if (type === "in" || type === "return") next = prev + q;
      else if (type === "out" || type === "damage") next = Math.max(0, prev - q);
      else next = q;
      const { error: e1 } = await supabase.from("products").update({ stock_qty: next }).eq("id", productId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("stock_movements").insert({
        product_id: productId, movement_type: type, qty: q,
        qty_before: prev, qty_after: next, reason: reason || null,
        reference_type: "manual", created_by: user?.id ?? null,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الحركة");
      setOpen(false); setProductId(""); setQty(""); setReason(""); setType("in");
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["products-min"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">آخر الحركات</h2>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" />حركة جديدة</Button>
      </div>
      {movements.isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
      {movements.data?.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">لا توجد حركات بعد.</p>}
      <div className="space-y-2">
        {movements.data?.map((m: any) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-bold">{m.products?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("ar-EG")} {m.reason && `· ${m.reason}`}</p>
            </div>
            <div className="text-end">
              <Badge variant="outline">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</Badge>
              <p className="text-xs text-muted-foreground mt-1">{m.qty_before} → {m.qty_after}</p>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تسجيل حركة مخزون</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold mb-1 block">المنتج</label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="اختر منتج" /></SelectTrigger>
                <SelectContent>
                  {products.data?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} (متاح: {p.stock_qty})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block">نوع الحركة</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block">الكمية</label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block">السبب (اختياري)</label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ========================= Stocktake =========================
function StocktakeTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState("");

  const stocktakes = useQuery({
    queryKey: ["stocktakes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stocktakes").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!title) throw new Error("اكتب عنوان للجرد");
      const { error } = await supabase.from("stocktakes").insert({ title, status: "draft", created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم إنشاء جرد جديد"); setTitle(""); qc.invalidateQueries({ queryKey: ["stocktakes"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stocktakes").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم إكمال الجرد"); qc.invalidateQueries({ queryKey: ["stocktakes"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-4">
      <div className="flex gap-2 mb-4">
        <Input placeholder="عنوان جرد جديد (مثال: جرد نوفمبر)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button onClick={() => create.mutate()} disabled={create.isPending} className="gap-1.5"><Plus className="h-4 w-4" />جرد</Button>
      </div>
      {stocktakes.data?.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">لم يتم إنشاء جرد بعد.</p>}
      <div className="space-y-2">
        {stocktakes.data?.map((s: any) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-bold">{s.title}</p>
              <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("ar-EG")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={s.status === "completed" ? "default" : "outline"}>{STOCKTAKE_STATUS[s.status] ?? s.status}</Badge>
              {s.status !== "completed" && s.status !== "cancelled" && (
                <Button size="sm" variant="outline" onClick={() => complete.mutate(s.id)}>إكمال</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ========================= Low Stock =========================
function LowStockTab() {
  const products = useQuery({
    queryKey: ["low-stock-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, stock_qty, low_stock_threshold").order("stock_qty");
      if (error) throw error;
      return (data ?? []).filter((p: any) => (p.stock_qty ?? 0) <= (p.low_stock_threshold ?? 5));
    },
  });

  return (
    <Card className="p-4">
      <h2 className="font-bold mb-3">منتجات على وشك النفاد</h2>
      {products.isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
      {products.data?.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">لا توجد تنبيهات نفاد حاليًا.</p>}
      <div className="space-y-2">
        {products.data?.map((p: any) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-bold">{p.name}</p>
            <div className="text-end">
              <p className="text-sm font-bold text-destructive">المتاح: {p.stock_qty}</p>
              <p className="text-xs text-muted-foreground">الحد الأدنى: {p.low_stock_threshold ?? 5}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ========================= Returns =========================
function ReturnsTab() {
  const qc = useQueryClient();
  const returns = useQuery({
    queryKey: ["customer-returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_returns")
        .select("id, status, reason, total_amount, created_at, customer_id, profiles!customer_returns_customer_id_fkey(full_name, shop_name)")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("customer_returns").update({ status, processed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تحديث الحالة"); qc.invalidateQueries({ queryKey: ["customer-returns"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-4">
      <h2 className="font-bold mb-3">طلبات الإرجاع</h2>
      {returns.data?.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">لا توجد طلبات إرجاع.</p>}
      <div className="space-y-2">
        {returns.data?.map((r: any) => (
          <div key={r.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">{r.profiles?.shop_name ?? r.profiles?.full_name ?? "عميل"}</p>
                <p className="text-xs text-muted-foreground">{r.reason}</p>
              </div>
              <Badge variant="outline">{RETURN_STATUS[r.status] ?? r.status}</Badge>
            </div>
            {r.status === "pending" && (
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={() => setStatus.mutate({ id: r.id, status: "approved" })}>قبول</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "rejected" })}>رفض</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ========================= Bins =========================
function BinsTab() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");

  const bins = useQuery({
    queryKey: ["bin-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bin_locations").select("*").order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!code || !name) throw new Error("الكود والاسم مطلوبان");
      const { error } = await supabase.from("bin_locations").insert({ code, name, zone: zone || null, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تمت الإضافة"); setCode(""); setName(""); setZone(""); qc.invalidateQueries({ queryKey: ["bin-locations"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bin_locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["bin-locations"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-4">
      <h2 className="font-bold mb-3">مواقع التخزين (الأرفف والثلاجات)</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <Input placeholder="الكود (A1-01)" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="المنطقة (مبردات…)" value={zone} onChange={(e) => setZone(e.target.value)} />
        <Button onClick={() => create.mutate()} disabled={create.isPending}><Plus className="h-4 w-4 me-1" />إضافة</Button>
      </div>
      {bins.data?.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">لا توجد مواقع بعد.</p>}
      <div className="space-y-2">
        {bins.data?.map((b: any) => (
          <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-bold">{b.code} — {b.name}</p>
              {b.zone && <p className="text-xs text-muted-foreground">{b.zone}</p>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => remove.mutate(b.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
