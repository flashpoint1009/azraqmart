import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/ImageUpload";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/products")({
  head: () => ({ meta: [{ title: "المنتجات — أزرق ماركت" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer", "accountant"]}>
      <AdminProducts />
    </RoleGuard>
  ),
});

type Form = {
  id?: string;
  name: string;
  category_id: string;
  brand: string;
  unit_price: string;
  carton_price: string;
  stock_qty: string;
  image_url: string;
  image_url_2: string;
  sku: string;
  low_stock_threshold: string;
};

const empty: Form = { name: "", category_id: "", brand: "", unit_price: "", carton_price: "", stock_qty: "", image_url: "", image_url_2: "", sku: "", low_stock_threshold: "10" };

function AdminProducts() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Form>(empty);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories-flat"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name, parent_id").order("name");
      if (error) throw error;
      return data;
    },
  });

  const catLabel = (id: string | null) => {
    if (!id) return "—";
    const c: any = categories.find((x: any) => x.id === id);
    if (!c) return "—";
    const p: any = c.parent_id ? categories.find((x: any) => x.id === c.parent_id) : null;
    return p ? `${p.name} / ${c.name}` : c.name;
  };

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const payload: any = {
        name: f.name,
        category_id: f.category_id || null,
        brand: f.brand || null,
        unit_price: Number(f.unit_price || 0),
        carton_price: Number(f.carton_price || 0),
        stock_qty: Number(f.stock_qty || 0),
        image_url: f.image_url || null,
        image_url_2: f.image_url_2 || null,
        sku: f.sku || null,
        low_stock_threshold: Number(f.low_stock_threshold || 10),
      };
      if (f.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        if (!payload.name) throw new Error("اكتب اسم المنتج");
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("تم الحفظ ✓");
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["admin-products"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = list.filter((p: any) => `${p.name} ${p.brand ?? ""} ${p.sku ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-6 text-end">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />أزرق ماركت</p>
          <h1 className="font-display text-3xl font-bold mt-1">المنتجات</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} منتج · ضيف وعدّل بالصور والأسعار والمخزون.</p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <section className="space-y-2 order-2 lg:order-1">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الكود…" className="h-11 w-full rounded-xl border border-border bg-card pr-10 pl-3 text-sm font-medium outline-none focus:border-ring" />
            </div>

            {isLoading && <div className="text-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>}

            {filtered.map((p: any) => {
              const tone = p.stock_qty <= 0 ? "text-destructive" : p.stock_qty <= (p.low_stock_threshold ?? 10) ? "text-warning-foreground" : "text-success";
              const lbl = p.stock_qty <= 0 ? "غير متاح" : p.stock_qty <= (p.low_stock_threshold ?? 10) ? "منخفض" : "متاح";
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-xs">
                  <div className="flex flex-col gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setForm({
                      id: p.id, name: p.name, category_id: p.category_id ?? "", brand: p.brand ?? "",
                      unit_price: String(p.unit_price ?? 0), carton_price: String(p.carton_price ?? 0),
                      stock_qty: String(p.stock_qty ?? 0), image_url: p.image_url ?? "", image_url_2: p.image_url_2 ?? "",
                      sku: p.sku ?? "", low_stock_threshold: String(p.low_stock_threshold ?? 10),
                    })}>تعديل</Button>
                    <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => { if (confirm(`حذف ${p.name}؟`)) remove.mutate(p.id); }}>حذف</Button>
                  </div>
                  <div className="flex-1 min-w-0 text-end">
                    <p className="text-sm font-bold truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{catLabel(p.category_id)} · {p.brand ?? ""}</p>
                    <p className="text-[11px] mt-0.5">
                      <span className="text-muted-foreground">شراء: </span>
                      <span dir="ltr" className="tabular-nums font-bold">{Number(p.unit_price).toLocaleString("en")}</span>
                      <span className="text-muted-foreground"> · بيع: </span>
                      <span dir="ltr" className="tabular-nums font-bold text-primary">{Number(p.carton_price).toLocaleString("en")} ج.م</span>
                    </p>
                    <p className={`text-[11px] font-bold mt-0.5 ${tone}`}>مخزون: {p.stock_qty} · {lbl}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="h-14 w-14 rounded-lg object-cover bg-surface-2" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-surface-2 grid place-items-center"><Package className="h-5 w-5 text-muted-foreground" /></div>
                    )}
                    {p.image_url_2 && <img src={p.image_url_2} alt="" className="h-14 w-14 rounded-lg object-cover bg-surface-2" />}
                  </div>
                </div>
              );
            })}

            {!isLoading && filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">لا توجد منتجات</div>
            )}
          </section>

          <aside className="order-1 lg:order-2">
            <div className="sticky top-4 rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
              <h3 className="font-display text-lg font-bold text-end">{form.id ? "تعديل المنتج" : "منتج جديد"}</h3>
              <Input dir="rtl" placeholder="اسم المنتج" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

              <div>
                <label className="text-[11px] font-bold text-muted-foreground">القسم</label>
                <select dir="rtl" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— بدون قسم —</option>
                  {(categories as any[]).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parent_id ? `${(categories as any[]).find((x) => x.id === c.parent_id)?.name ?? ""} / ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
              </div>

              <Input dir="rtl" placeholder="الماركة" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">سعر الشراء</label>
                  <Input type="number" dir="ltr" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">سعر البيع</label>
                  <Input type="number" dir="ltr" value={form.carton_price} onChange={(e) => setForm({ ...form, carton_price: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">الكمية</label>
                  <Input type="number" dir="ltr" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">حد التنبيه</label>
                  <Input type="number" dir="ltr" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
                </div>
              </div>
              <Input dir="rtl" placeholder="الكود (SKU)" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />

              <div className="flex gap-3">
                <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} folder="products" label="صورة 1" />
                <ImageUpload value={form.image_url_2} onChange={(url) => setForm({ ...form, image_url_2: url })} folder="products" label="صورة 2" />
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="hero" className="flex-1 gap-2" onClick={() => save.mutate(form)} disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {form.id ? "حفظ التعديل" : "إضافة منتج"}
                </Button>
                {form.id && <Button variant="outline" onClick={() => setForm(empty)}>إلغاء</Button>}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
