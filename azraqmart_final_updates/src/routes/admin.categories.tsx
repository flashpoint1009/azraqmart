import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, FolderTree, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/ImageUpload";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/categories")({
  head: () => ({ meta: [{ title: "الأقسام — أزرق ماركت" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer", "accountant"]}>
      <CategoriesPage />
    </RoleGuard>
  ),
});

type Cat = { id: string; name: string; parent_id: string | null; image_url: string | null; sort_order: number; is_active: boolean };

function CategoriesPage() {
  const qc = useQueryClient();
  const [parentId, setParentId] = useState<string | null>(null);
  const [form, setForm] = useState<{ id?: string; name: string; image_url: string; sort_order: string }>({ name: "", image_url: "", sort_order: "0" });

  const { data: cats = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order").order("name");
      if (error) throw error;
      return data as Cat[];
    },
  });

  const visible = cats.filter((c) => c.parent_id === parentId);
  const parentCat = parentId ? cats.find((c) => c.id === parentId) : null;

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("اكتب اسم القسم");
      const payload = {
        name: form.name.trim(),
        parent_id: parentId,
        image_url: form.image_url || null,
        sort_order: Number(form.sort_order || 0),
      };
      if (form.id) {
        const { error } = await supabase.from("categories").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("تم الحفظ ✓");
      setForm({ name: "", image_url: "", sort_order: "0" });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-6 text-end">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5"><FolderTree className="h-3.5 w-3.5" />أزرق ماركت</p>
          <h1 className="font-display text-3xl font-bold mt-1">الأقسام</h1>
          <p className="text-sm text-muted-foreground mt-1">أنشئ أقسام رئيسية وفرعية مع صور.</p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="order-2 lg:order-1">
            {parentCat && (
              <button onClick={() => setParentId(parentCat.parent_id)} className="mb-3 inline-flex items-center gap-1 rounded-lg bg-card border border-border px-3 py-1.5 text-xs font-bold hover:bg-surface-2">
                <ChevronLeft className="h-3.5 w-3.5" /> رجوع لـ {cats.find((c) => c.id === parentCat.parent_id)?.name ?? "الأقسام الرئيسية"}
              </button>
            )}
            <p className="mb-3 text-xs font-bold text-muted-foreground text-end">
              {parentCat ? `داخل: ${parentCat.name}` : "الأقسام الرئيسية"} · {visible.length} قسم
            </p>

            {isLoading && <div className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></div>}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {visible.map((c) => (
                <article key={c.id} className="rounded-2xl border border-border bg-card p-3 shadow-xs hover:shadow-md transition group">
                  <button onClick={() => setParentId(c.id)} className="block w-full">
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.name} className="aspect-square w-full rounded-xl object-cover bg-surface-2" />
                    ) : (
                      <div className="aspect-square w-full rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground font-display font-bold text-2xl">
                        {c.name.charAt(0)}
                      </div>
                    )}
                    <p className="mt-2 font-bold text-sm text-center line-clamp-1">{c.name}</p>
                  </button>
                  <div className="mt-2 flex gap-1">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]" onClick={() => setForm({ id: c.id, name: c.name, image_url: c.image_url ?? "", sort_order: String(c.sort_order) })}>تعديل</Button>
                    <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => { if (confirm(`حذف ${c.name}؟ سيتم حذف الأقسام الفرعية أيضاً`)) remove.mutate(c.id); }}>حذف</Button>
                  </div>
                </article>
              ))}
            </div>

            {!isLoading && visible.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">لا توجد أقسام هنا. ابدأ بإضافة قسم جديد ←</div>
            )}
          </section>

          <aside className="order-1 lg:order-2">
            <div className="sticky top-4 rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
              <h3 className="font-display text-lg font-bold text-end">{form.id ? "تعديل قسم" : `قسم جديد ${parentCat ? `داخل ${parentCat.name}` : "(رئيسي)"}`}</h3>
              <Input dir="rtl" placeholder="اسم القسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">ترتيب العرض</label>
                <Input type="number" dir="ltr" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
              <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} folder="categories" label="صورة القسم" />
              <div className="flex gap-2">
                <Button variant="hero" className="flex-1 gap-2" onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {form.id ? "حفظ" : "إضافة"}
                </Button>
                {form.id && <Button variant="outline" onClick={() => setForm({ name: "", image_url: "", sort_order: "0" })}>إلغاء</Button>}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
