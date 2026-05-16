import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2, Database, CheckCircle2, AlertTriangle, PackageSearch, Users, ShoppingCart, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/** Professional Demo data — Egyptian wholesale market. */
const DEMO_TAG = "[DEMO]"; // we mark demo rows by prefix in notes/sku for safe cleanup

const IMG = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=70`;

const CATEGORIES = [
  { name: "بقالة وأطعمة", image: IMG("photo-1542838132-92c53300491e"), children: ["زيوت وسمن", "أرز ومكرونة", "بقوليات", "صلصات وتوابل", "معلبات"] },
  { name: "مشروبات", image: IMG("photo-1581636625402-29b2a704ef13"), children: ["مشروبات غازية", "عصائر", "مياه معدنية", "قهوة وشاي"] },
  { name: "ألبان ومجمدات", image: IMG("photo-1563636619-e9143da7973b"), children: ["ألبان", "أجبان", "مجمدات"] },
  { name: "منظفات وأدوات منزلية", image: IMG("photo-1583947215259-38e31be8751f"), children: ["مساحيق غسيل", "منظفات سائلة", "ورقيات"] },
  { name: "عناية شخصية", image: IMG("photo-1556228720-195a672e8a03"), children: ["شامبو وصابون", "مستلزمات أطفال"] },
  { name: "سناكس وحلوى", image: IMG("photo-1623660053975-cf75a8be0908"), children: ["شوكولاتة", "بسكويت", "شيبسي ومقرمشات"] },
];

const PRODUCT_TEMPLATES: { name: string; brand: string; cat: string; img: string; unit: number; cartonQty: number }[] = [
  { name: "زيت عباد الشمس 1.5 لتر", brand: "كريستال", cat: "زيوت وسمن", img: IMG("photo-1474979266404-7eaacbcd87c5"), unit: 92, cartonQty: 6 },
  { name: "زيت ذرة 1 لتر", brand: "عافية", cat: "زيوت وسمن", img: IMG("photo-1620706857370-e1b9770e8bb1"), unit: 78, cartonQty: 12 },
  { name: "سمن نباتي 1 كجم", brand: "العائلة", cat: "زيوت وسمن", img: IMG("photo-1628689469838-524a4a973b8e"), unit: 110, cartonQty: 8 },
  { name: "أرز مصري درجة أولى 5 كجم", brand: "السنابل", cat: "أرز ومكرونة", img: IMG("photo-1586201375761-83865001e31c"), unit: 240, cartonQty: 6 },
  { name: "مكرونة إسباجتي 400 جم", brand: "الملكة", cat: "أرز ومكرونة", img: IMG("photo-1551462147-37885acc36f1"), unit: 14, cartonQty: 24 },
  { name: "مكرونة شعرية 250 جم", brand: "الملكة", cat: "أرز ومكرونة", img: IMG("photo-1556888-b1ed8c4cf12d"), unit: 8, cartonQty: 30 },
  { name: "عدس أصفر 1 كجم", brand: "الدوحة", cat: "بقوليات", img: IMG("photo-1612257999756-9d1b9f5a8ed3"), unit: 38, cartonQty: 12 },
  { name: "فول مدمس 400 جم", brand: "كاليفورنيا", cat: "معلبات", img: IMG("photo-1564834724105-918b73d1b9e0"), unit: 18, cartonQty: 24 },
  { name: "طماطم مصبرة 400 جم", brand: "هاينز", cat: "صلصات وتوابل", img: IMG("photo-1607330289024-1535c6b4e1c1"), unit: 22, cartonQty: 24 },
  { name: "كاتشب 460 جم", brand: "هاينز", cat: "صلصات وتوابل", img: IMG("photo-1607330289024-1535c6b4e1c1"), unit: 65, cartonQty: 12 },
  { name: "كوكاكولا 1 لتر — كرتونة", brand: "كوكاكولا", cat: "مشروبات غازية", img: IMG("photo-1554866585-cd94860890b7"), unit: 22, cartonQty: 12 },
  { name: "بيبسي 1 لتر — كرتونة", brand: "بيبسي", cat: "مشروبات غازية", img: IMG("photo-1625772299848-391b6a87d7b3"), unit: 22, cartonQty: 12 },
  { name: "سبرايت 330 مل", brand: "كوكاكولا", cat: "مشروبات غازية", img: IMG("photo-1625740822546-83a87f4f06e6"), unit: 8, cartonQty: 24 },
  { name: "عصير برتقال 1 لتر", brand: "جهينة", cat: "عصائر", img: IMG("photo-1600271886742-f049cd451bba"), unit: 26, cartonQty: 12 },
  { name: "عصير مانجو 240 مل", brand: "بيتي", cat: "عصائر", img: IMG("photo-1600271886742-f049cd451bba"), unit: 9, cartonQty: 24 },
  { name: "مياه معدنية 1.5 لتر", brand: "حياة", cat: "مياه معدنية", img: IMG("photo-1622597467836-f3285f2131b8"), unit: 7, cartonQty: 6 },
  { name: "نسكافيه كلاسيك 200 جم", brand: "نستله", cat: "قهوة وشاي", img: IMG("photo-1559056199-641a0ac8b55e"), unit: 280, cartonQty: 6 },
  { name: "شاي ليبتون فتلة 100 ظرف", brand: "ليبتون", cat: "قهوة وشاي", img: IMG("photo-1597318181409-cf64d0b5d8a2"), unit: 95, cartonQty: 12 },
  { name: "حليب طويل الصلاحية 1 لتر", brand: "جهينة", cat: "ألبان", img: IMG("photo-1563636619-e9143da7973b"), unit: 38, cartonQty: 12 },
  { name: "جبنة بيضاء كرتون 500 جم", brand: "بيتي", cat: "أجبان", img: IMG("photo-1486297678162-eb2a19b0a32d"), unit: 75, cartonQty: 12 },
  { name: "جبنة شيدر شرائح 200 جم", brand: "المراعي", cat: "أجبان", img: IMG("photo-1452195100486-9cc805987862"), unit: 55, cartonQty: 24 },
  { name: "آيس كريم فانيليا 1 لتر", brand: "ميستر فروست", cat: "مجمدات", img: IMG("photo-1567206563064-6f60f40a2b57"), unit: 70, cartonQty: 8 },
  { name: "مسحوق غسيل 6 كجم", brand: "بيرسيل", cat: "مساحيق غسيل", img: IMG("photo-1583947215259-38e31be8751f"), unit: 280, cartonQty: 4 },
  { name: "سائل غسيل أطباق 1 لتر", brand: "فيري", cat: "منظفات سائلة", img: IMG("photo-1610557892470-55d9e80c0bce"), unit: 48, cartonQty: 12 },
  { name: "مناديل ورقية 100 ورقة", brand: "فاين", cat: "ورقيات", img: IMG("photo-1583947215259-38e31be8751f"), unit: 14, cartonQty: 24 },
  { name: "شامبو 700 مل", brand: "صن سيلك", cat: "شامبو وصابون", img: IMG("photo-1556228720-195a672e8a03"), unit: 95, cartonQty: 12 },
  { name: "صابون استحمام 125 جم", brand: "لوكس", cat: "شامبو وصابون", img: IMG("photo-1556228720-195a672e8a03"), unit: 18, cartonQty: 48 },
  { name: "حفاضات أطفال مقاس 4 — 64 قطعة", brand: "بامبرز", cat: "مستلزمات أطفال", img: IMG("photo-1632037503044-bbc11200c83e"), unit: 360, cartonQty: 4 },
  { name: "شوكولاتة جالكسي 40 جم", brand: "جالكسي", cat: "شوكولاتة", img: IMG("photo-1623660053975-cf75a8be0908"), unit: 14, cartonQty: 48 },
  { name: "بسكويت أوريو 36 جم", brand: "أوريو", cat: "بسكويت", img: IMG("photo-1558961363-fa8fdf82db35"), unit: 7, cartonQty: 24 },
  { name: "شيبسي شيبس 35 جم", brand: "شيبسي", cat: "شيبسي ومقرمشات", img: IMG("photo-1566478989037-eec170784d0b"), unit: 6, cartonQty: 30 },
];

const CUSTOMER_TEMPLATES = [
  { shop_name: "بقالة النور", owner_name: "محمد السيد", city: "القاهرة", tier: "ذهبي", credit_limit: 50000 },
  { shop_name: "ماركت الأمانة", owner_name: "أحمد فؤاد", city: "الجيزة", tier: "فضي", credit_limit: 25000 },
  { shop_name: "سوبر ماركت المدينة", owner_name: "خالد عبدالعزيز", city: "الإسكندرية", tier: "ذهبي", credit_limit: 75000 },
  { shop_name: "بقالة الحاج علي", owner_name: "علي حسن", city: "المنصورة", tier: "برونزي", credit_limit: 10000 },
  { shop_name: "مينى ماركت السلام", owner_name: "محمود إبراهيم", city: "طنطا", tier: "فضي", credit_limit: 20000 },
  { shop_name: "ماركت الأسرة", owner_name: "سامي مصطفى", city: "أسيوط", tier: "برونزي", credit_limit: 8000 },
  { shop_name: "سوبر ماركت الرحمة", owner_name: "كريم حافظ", city: "الزقازيق", tier: "فضي", credit_limit: 30000 },
  { shop_name: "بقالة أبو يوسف", owner_name: "يوسف الشحات", city: "بنها", tier: "برونزي", credit_limit: 7500 },
  { shop_name: "ماركت العائلة", owner_name: "هاني عبدالله", city: "بورسعيد", tier: "ذهبي", credit_limit: 60000 },
  { shop_name: "بقالة البركة", owner_name: "أسامة شعبان", city: "الإسماعيلية", tier: "فضي", credit_limit: 18000 },
  { shop_name: "ماركت النخبة", owner_name: "وليد رمضان", city: "السويس", tier: "فضي", credit_limit: 22000 },
  { shop_name: "سوبر ماركت العصر", owner_name: "إبراهيم محمد", city: "المنيا", tier: "برونزي", credit_limit: 12000 },
  { shop_name: "بقالة الأمل", owner_name: "ماجد صلاح", city: "سوهاج", tier: "برونزي", credit_limit: 9000 },
  { shop_name: "ماركت السعادة", owner_name: "طارق عمر", city: "أسوان", tier: "فضي", credit_limit: 26000 },
  { shop_name: "هايبر ماركت المحبة", owner_name: "حسام الدين", city: "القاهرة", tier: "ذهبي", credit_limit: 90000 },
];

const ORDER_STATUSES = ["pending", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["unpaid", "partial", "paid"];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomPhone() { return "010" + Math.floor(10000000 + Math.random() * 89999999).toString(); }

export function DemoSeeder() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<string>("");

  const counts = useQuery({
    queryKey: ["demo_counts"],
    queryFn: async () => {
      const [p, c, cu, o] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("categories").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
      ]);
      return { products: p.count ?? 0, categories: c.count ?? 0, customers: cu.count ?? 0, orders: o.count ?? 0 };
    },
  });

  const seed = useMutation({
    mutationFn: async () => {
      setProgress("جاري تجهيز الأقسام…");
      // 1) Categories — parents first
      const catIdByName = new Map<string, string>();
      for (let i = 0; i < CATEGORIES.length; i++) {
        const c = CATEGORIES[i];
        const { data: existing } = await supabase.from("categories").select("id").eq("name", c.name).is("parent_id", null).maybeSingle();
        let parentId = existing?.id;
        if (!parentId) {
          const { data, error } = await supabase.from("categories").insert({ name: c.name, image_url: c.image, sort_order: i * 10, is_active: true }).select("id").single();
          if (error) throw error;
          parentId = data.id;
        }
        catIdByName.set(c.name, parentId!);

        for (let j = 0; j < c.children.length; j++) {
          const childName = c.children[j];
          const { data: ex } = await supabase.from("categories").select("id").eq("name", childName).eq("parent_id", parentId).maybeSingle();
          if (!ex) {
            const { data, error } = await supabase.from("categories").insert({ name: childName, parent_id: parentId, sort_order: j, is_active: true }).select("id").single();
            if (error) throw error;
            catIdByName.set(childName, data.id);
          } else {
            catIdByName.set(childName, ex.id);
          }
        }
      }

      setProgress("جاري إضافة المنتجات…");
      // 2) Products
      const productRows = PRODUCT_TEMPLATES.map((p, idx) => ({
        sku: `DEMO-${String(idx + 1).padStart(4, "0")}`,
        name: p.name,
        brand: p.brand,
        category: p.cat,
        category_id: catIdByName.get(p.cat) ?? null,
        unit_price: p.unit,
        carton_price: Math.round(p.unit * p.cartonQty * 0.9 * 100) / 100,
        stock_qty: randInt(10, 500),
        low_stock_threshold: 20,
        image_url: p.img,
        is_active: true,
      }));
      const { error: pErr } = await supabase.from("products").upsert(productRows, { onConflict: "sku" });
      if (pErr) throw pErr;

      const { data: insertedProducts } = await supabase.from("products").select("id, unit_price, carton_price").like("sku", "DEMO-%");

      setProgress("جاري إضافة العملاء…");
      // 3) Customers
      const customerRows = CUSTOMER_TEMPLATES.map((c) => ({
        ...c,
        phone: randomPhone(),
        address: `${c.city} — وسط البلد`,
        balance: 0,
        is_active: true,
        points: randInt(0, 500),
      }));
      const { data: insertedCustomers, error: cErr } = await supabase.from("customers").insert(customerRows).select("id");
      if (cErr) throw cErr;

      setProgress("جاري إضافة الطلبات…");
      // 4) Orders + items
      const allProds = (insertedProducts ?? []) as Array<{ id: string; unit_price: number; carton_price: number }>;
      const prodNameById = new Map<string, string>(productRows.map((r) => [r.sku, r.name]));
      // We need product names — refetch with names
      const { data: prodsWithNames } = await supabase.from("products").select("id, name, carton_price").like("sku", "DEMO-%");
      const nameById = new Map<string, string>((prodsWithNames ?? []).map((p: any) => [p.id, p.name]));
      const allCusts = insertedCustomers ?? [];
      for (let i = 0; i < 25; i++) {
        const cust = pick(allCusts);
        const itemCount = randInt(2, 6);
        const status = pick(ORDER_STATUSES);
        const paymentStatus = status === "delivered" ? pick(["paid", "partial"]) : pick(PAYMENT_STATUSES);
        const daysAgo = randInt(0, 60);
        const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();

        const itemsData: { product_id: string; qty: number; price: number; subtotal: number; name: string }[] = [];
        let total = 0;
        const usedProds = new Set<string>();
        for (let k = 0; k < itemCount; k++) {
          const prod = pick(allProds);
          if (usedProds.has(prod.id)) continue;
          usedProds.add(prod.id);
          const qty = randInt(1, 8);
          const price = Number(prod.carton_price);
          const sub = price * qty;
          itemsData.push({ product_id: prod.id, qty, price, subtotal: sub, name: nameById.get(prod.id) ?? "منتج" });
          total += sub;
        }

        const { data: order, error: oErr } = await supabase.from("orders").insert({
          customer_id: cust.id,
          status,
          payment_status: paymentStatus,
          total,
          notes: `${DEMO_TAG} طلب تجريبي`,
          created_at: createdAt,
        }).select("id").single();
        if (oErr) throw oErr;

        const itemsRows = itemsData.map((it) => ({
          order_id: order.id,
          product_id: it.product_id,
          product_name: it.name,
          qty: it.qty,
          unit_price: it.price,
          line_total: it.subtotal,
        }));
        await supabase.from("order_items").insert(itemsRows);
      }
      void prodNameById;

      setProgress("جاري إضافة العروض…");
      // 5) Coupons
      const coupons = [
        { code: "DEMO10", discount_type: "percent", discount_value: 10, min_order_total: 1000, is_active: true },
        { code: "WELCOME50", discount_type: "fixed", discount_value: 50, min_order_total: 500, is_active: true },
        { code: "RAMADAN20", discount_type: "percent", discount_value: 20, min_order_total: 2000, is_active: true },
      ];
      for (const c of coupons) {
        const { data: ex } = await supabase.from("coupons").select("id").eq("code", c.code).maybeSingle();
        if (!ex) await supabase.from("coupons").insert(c);
      }

      setProgress("تم بنجاح ✓");
    },
    onSuccess: () => {
      toast.success("تم تجهيز ديمو احترافي كامل ✓");
      qc.invalidateQueries();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setProgress("");
    },
  });

  const wipe = useMutation({
    mutationFn: async () => {
      setProgress("جاري مسح بيانات الديمو…");
      // Order: items → orders (demo) → products (demo SKU) → demo customers (by phone prefix... safer: by shop_name list)
      const demoShopNames = CUSTOMER_TEMPLATES.map((c) => c.shop_name);

      // delete orders with DEMO tag (cascade removes items via ondelete? no; delete items first)
      const { data: demoOrders } = await supabase.from("orders").select("id").like("notes", `${DEMO_TAG}%`);
      if (demoOrders?.length) {
        const ids = demoOrders.map((o) => o.id);
        await supabase.from("order_items").delete().in("order_id", ids);
        await supabase.from("orders").delete().in("id", ids);
      }

      // delete demo products by sku prefix
      await supabase.from("products").delete().like("sku", "DEMO-%");

      // delete demo customers
      await supabase.from("customers").delete().in("shop_name", demoShopNames);

      // delete demo coupons
      await supabase.from("coupons").delete().in("code", ["DEMO10", "WELCOME50", "RAMADAN20"]);

      setProgress("");
    },
    onSuccess: () => {
      toast.success("تم مسح بيانات الديمو ✓");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = seed.isPending || wipe.isPending;

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-accent/5 p-5 shadow-xs">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display text-lg font-bold inline-flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" /> ديمو احترافي كامل
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-prose">
              يضيف <b>6 أقسام</b> + <b>21 قسم فرعي</b> + <b>{PRODUCT_TEMPLATES.length} منتج</b> حقيقي مع صور وأسعار جملة + <b>{CUSTOMER_TEMPLATES.length} عميل</b> من محافظات مختلفة + <b>25 طلب</b> بحالات متنوعة + <b>3 عروض كوبونات</b>.
              مثالي للعرض على عملاء جدد قبل البيع.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Stat icon={Tag} label="أقسام" value={counts.data?.categories ?? 0} />
          <Stat icon={PackageSearch} label="منتجات" value={counts.data?.products ?? 0} />
          <Stat icon={Users} label="عملاء" value={counts.data?.customers ?? 0} />
          <Stat icon={ShoppingCart} label="طلبات" value={counts.data?.orders ?? 0} />
        </div>

        {progress && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2 text-xs font-bold text-primary">
            <Database className="h-3.5 w-3.5 animate-pulse" /> {progress}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => seed.mutate()} disabled={busy} variant="hero" size="lg" className="gap-2">
            <Sparkles className="h-4 w-4" /> {seed.isPending ? "جاري الإنشاء…" : "إنشاء ديمو احترافي"}
          </Button>
          <Button
            onClick={() => {
              if (confirm("هتمسح بيانات الديمو كلها (المنتجات والعملاء والطلبات والكوبونات اللي اضفناها). متأكد؟")) wipe.mutate();
            }}
            disabled={busy}
            variant="outline"
            size="lg"
            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" /> {wipe.isPending ? "جاري المسح…" : "مسح بيانات الديمو"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-xs leading-relaxed">
        <p className="font-bold text-warning-foreground inline-flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> ملاحظات</p>
        <ul className="mt-2 space-y-1 text-muted-foreground list-disc me-4">
          <li>المنتجات بتتعلّم باسم <code dir="ltr">DEMO-XXXX</code> في الـ SKU علشان نقدر نمسحها بأمان.</li>
          <li>الطلبات بتتعلّم بـ <code>{DEMO_TAG}</code> في الملاحظات.</li>
          <li>العملاء بيتم تمييزهم بأسماء محلاتهم (انظر القائمة).</li>
          <li>التشغيل بياخد من 30 ثانية لدقيقة حسب سرعة الاتصال.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-xs">
        <p className="font-bold mb-2 inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> أسماء عملاء الديمو</p>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOMER_TEMPLATES.map((c) => (
            <span key={c.shop_name} className="rounded-md bg-surface-2 px-2 py-1 font-medium">{c.shop_name}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Tag; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-1.5 font-display text-xl font-bold tabular-nums" dir="ltr">{value}</p>
      <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
    </div>
  );
}
