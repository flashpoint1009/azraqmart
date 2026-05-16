import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, MessageSquare, Pin, PinOff, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/messages")({
  head: () => ({ meta: [{ title: "رسائل العملاء" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer"]}>
      <MessagesPage />
    </RoleGuard>
  ),
});

function MessagesPage() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({
    queryKey: ["welcome_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("welcome_messages")
        .select("*, customers(shop_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("welcome_messages").update({ pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["welcome_admin"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("welcome_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["welcome_admin"] });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1100px] px-4 py-6 lg:px-6 lg:py-8 space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" /> رسائل العملاء
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">الرسائل العائمة</h1>
            <p className="text-xs text-muted-foreground mt-1">تظهر للعميل في أعلى الصفحة الرئيسية بعد تسجيل الدخول</p>
          </div>
          <NewMessageDialog />
        </header>

        <div className="grid gap-3">
          {list.map((m: any) => (
            <div key={m.id} className="rounded-2xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-start gap-3">
                <div
                  className="h-12 w-12 rounded-xl shrink-0 grid place-items-center text-white font-bold"
                  style={{ background: m.bg_color, color: m.text_color }}
                >
                  {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-cover rounded-xl" /> : "Aa"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display font-bold">{m.title}</p>
                    {m.pinned && <span className="rounded-md bg-warning/15 text-warning-foreground px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1"><Pin className="h-3 w-3" />مثبتة</span>}
                    {m.target_customer_id ? (
                      <span className="rounded-md bg-accent-soft text-accent-foreground px-2 py-0.5 text-[10px] font-bold">
                        {m.customers?.shop_name || "عميل محدد"}
                      </span>
                    ) : (
                      <span className="rounded-md bg-primary-soft text-primary px-2 py-0.5 text-[10px] font-bold">لكل العملاء</span>
                    )}
                  </div>
                  {m.body && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{m.body}</p>}
                  {m.expires_at && <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">حتى {new Date(m.expires_at).toLocaleString("ar-EG")}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => togglePin.mutate({ id: m.id, pinned: !m.pinned })} title={m.pinned ? "إلغاء التثبيت" : "تثبيت"}>
                    {m.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm("حذف الرسالة؟") && remove.mutate(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              لا توجد رسائل بعد. أضف أول رسالة من زر "رسالة جديدة".
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function NewMessageDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [bg, setBg] = useState("oklch(0.55 0.22 260)");
  const [color, setColor] = useState("#ffffff");
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetId, setTargetId] = useState("");

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, shop_name, phone").order("shop_name");
      return data ?? [];
    },
  });

  const upload = async (file: File) => {
    const path = `welcome-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("app-assets").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("app-assets").getPublicUrl(path);
    setImageUrl(data.publicUrl);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("اكتب عنوان الرسالة");
      const { error } = await supabase.from("welcome_messages").insert({
        title: title.trim(),
        body: body.trim() || null,
        bg_color: bg,
        text_color: color,
        pinned,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        image_url: imageUrl || null,
        target_customer_id: targetId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إنشاء الرسالة");
      qc.invalidateQueries({ queryKey: ["welcome_admin"] });
      setOpen(false);
      setTitle(""); setBody(""); setPinned(false); setExpiresAt(""); setImageUrl(""); setTargetId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> رسالة جديدة</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>رسالة عائمة جديدة</DialogTitle></DialogHeader>

        {/* Live preview */}
        <div className="rounded-2xl p-4 shadow-elevated" style={{ background: bg, color }}>
          <div className="flex items-start gap-3">
            {imageUrl && <img src={imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover ring-2 ring-white/20" />}
            <div className="flex-1">
              <p className="font-display font-bold">{title || "عنوان الرسالة"}</p>
              <p className="text-xs opacity-90 mt-1">{body || "محتوى الرسالة..."}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label>العنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عرض اليوم!" />
          </div>
          <div>
            <Label>المحتوى</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-ring"
              placeholder="خصم 20% على كل المنتجات حتى يوم الجمعة"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>لون الخلفية</Label>
              <Input value={bg} onChange={(e) => setBg(e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label>لون الخط</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 p-1" />
            </div>
          </div>
          <div>
            <Label>صورة (اختياري)</Label>
            <div className="flex items-center gap-2">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover border border-border" />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-lg border border-dashed border-border text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-bold hover:bg-primary-soft hover:text-primary">
                <Upload className="h-3.5 w-3.5" /> رفع
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              {imageUrl && <Button size="sm" variant="ghost" onClick={() => setImageUrl("")}>إزالة</Button>}
            </div>
          </div>
          <div>
            <Label>مستهدف لعميل محدد (اختياري)</Label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm">
              <option value="">كل العملاء</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.shop_name} — {c.phone}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ينتهي في (اختياري)</Label>
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm font-bold cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                تثبيت (لا يقدر يخفيها)
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>إنشاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
