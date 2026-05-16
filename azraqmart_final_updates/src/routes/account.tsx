import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, MapPin, Phone, Save, Store, User as UserIcon, Building2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { GOVERNORATES, REGIONS } from "@/lib/regions";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "حسابي — أزرق ماركت" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [district, setDistrict] = useState("");

  const districts = useMemo(() => REGIONS[governorate] ?? [], [governorate]);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    supabase
      .from("customers")
      .select("shop_name, owner_name, phone, address, city, governorate, district")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) console.error("[account] load error", error);
        const row = data?.[0];
        if (row) {
          setShopName(row.shop_name ?? "");
          setOwnerName(row.owner_name ?? "");
          setPhone(row.phone ?? "");
          setAddress(row.address ?? "");
          setGovernorate(row.governorate ?? "");
          setDistrict(row.district ?? "");
        }
        setLoading(false);
      });
  }, [user, navigate]);

  const save = async () => {
    if (!user) return;
    if (!phone.trim() || !address.trim()) {
      toast.error("التليفون والعنوان مطلوبين");
      return;
    }
    if (!governorate || !district) {
      toast.error("اختر المحافظة والحي");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        shop_name: shopName.trim() || ownerName.trim() || phone.trim() || "عميل",
        owner_name: ownerName.trim() || null,
        phone: phone.trim(),
        address: address.trim(),
        city: governorate,
        governorate,
        district,
      };
      const { data: existingRows, error: selErr } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (selErr) throw selErr;
      const existing = existingRows?.[0];
      if (existing) {
        const { error } = await supabase.from("customers").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert({ user_id: user.id, ...payload });
        if (error) throw error;
      }
      toast.success("تم حفظ بياناتك ✓");
    } catch (e: any) {
      console.error("[account] save error", e);
      toast.error(e?.message ?? "حصل خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-6 lg:px-6 lg:py-8">
        <Link to="/" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline mb-4">
          <ArrowRight className="h-3.5 w-3.5" /> الرئيسية
        </Link>
        <header className="mb-5">
          <p className="text-xs font-bold text-primary">بياناتي</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">حسابي</h1>
          <p className="text-xs text-muted-foreground mt-1">حدّث بياناتك مرة واحدة وكل طلباتك هتروح على نفس العنوان</p>
        </header>

        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-soft space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">جاري التحميل…</p>
          ) : (
            <>
              <Field icon={Store} label="اسم المحل / المؤسسة">
                <input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="مثلاً: سوبرماركت النور" className="input" />
              </Field>
              <Field icon={UserIcon} label="اسم صاحب المحل">
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="الاسم بالكامل" className="input" />
              </Field>
              <Field icon={Phone} label="رقم التليفون *">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" inputMode="tel" dir="ltr" className="input" />
              </Field>
              <Field icon={Building2} label="المحافظة *">
                <select
                  value={governorate}
                  onChange={(e) => { setGovernorate(e.target.value); setDistrict(""); }}
                  className="input"
                >
                  <option value="">اختر المحافظة</option>
                  {GOVERNORATES.map((g) => (<option key={g} value={g}>{g}</option>))}
                </select>
              </Field>
              <Field icon={MapPin} label="الحي / المنطقة *">
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="input"
                  disabled={!governorate}
                >
                  <option value="">{governorate ? "اختر الحي" : "اختر المحافظة أولاً"}</option>
                  {districts.map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              </Field>
              <Field icon={MapPin} label="العنوان بالتفصيل *">
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="شارع، رقم العقار، علامة مميزة" rows={3} className="input resize-none py-2" />
              </Field>

              <Button variant="hero" size="lg" className="w-full font-bold gap-2 mt-2" onClick={save} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ بياناتي"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground" dir="ltr">{user?.email}</p>
            </>
          )}
        </section>
      </main>
      <style>{`.input{height:2.5rem;width:100%;border-radius:0.75rem;border:1px solid hsl(var(--border));background:hsl(var(--surface-2,var(--muted)));padding:0 0.75rem;font-size:.8125rem;font-weight:600;outline:none}.input:focus{border-color:hsl(var(--ring))}`}</style>
    </div>
  );
}

function Field({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      {children}
    </label>
  );
}
