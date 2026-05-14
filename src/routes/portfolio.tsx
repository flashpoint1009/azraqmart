import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShoppingCart, Package, Users, Truck, BarChart3, Boxes, Wallet,
  Bell, MessageSquare, ShieldCheck, Megaphone, Image as ImageIcon,
  LayoutDashboard, FileText, MapPin, Bot, Sparkles, Smartphone,
  Database, Zap, Lock, Globe, Code2, Layers, ArrowLeft, CheckCircle2,
} from "lucide-react";
import homeShot from "@/assets/portfolio/home.png";
import loginShot from "@/assets/portfolio/login.png";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "بورتفوليو — أزرق ماركت | منصة B2B متكاملة" },
      { name: "description", content: "بورتفوليو احترافي يعرض كل تفاصيل منصة أزرق ماركت: الفيتشرز، التقنيات، لقطات حقيقية من النظام، وأكثر." },
      { property: "og:title", content: "بورتفوليو أزرق ماركت" },
      { property: "og:description", content: "منصة B2B متكاملة لتجار الجملة في مصر — كل التفاصيل في صفحة واحدة." },
      { property: "og:url", content: "https://azraqmart.lovable.app/portfolio" },
    ],
    links: [{ rel: "canonical", href: "https://azraqmart.lovable.app/portfolio" }],
  }),
  component: PortfolioPage,
});

const STATS = [
  { value: "30+", label: "صفحة فعّالة" },
  { value: "15+", label: "نظام صلاحيات" },
  { value: "100%", label: "RTL عربي" },
  { value: "PWA", label: "تطبيق قابل للتثبيت" },
];

const FEATURES = [
  {
    icon: ShoppingCart, title: "كتالوج وسلة طلب",
    desc: "كتالوج جملة بفلاتر متقدمة، بحث فوري، سلة محفوظة لكل تاجر، وحساب تلقائي للأسعار والخصومات.",
    pages: ["/products", "/cart", "/orders"],
  },
  {
    icon: Package, title: "إدارة المنتجات والأقسام",
    desc: "CRUD كامل للمنتجات، رفع صور، تصنيفات هرمية، ضبط أسعار الجملة وحدود الكمية.",
    pages: ["/admin/products", "/admin/categories"],
  },
  {
    icon: Truck, title: "إدارة الطلبات والتوصيل",
    desc: "تتبع حالة الطلب من الإنشاء للتسليم، تعيين مندوبين، تتبع لحظي للموقع، ومناطق توصيل.",
    pages: ["/admin/orders", "/admin/live-tracking", "/delivery"],
  },
  {
    icon: Users, title: "العملاء والموظفين",
    desc: "ملفات تجار، سجل طلبات وديون لكل عميل، إدارة فريق العمل بصلاحيات دقيقة لكل صفحة.",
    pages: ["/admin/customers", "/admin/users"],
  },
  {
    icon: Boxes, title: "المخزن والمشتريات",
    desc: "حركة وارد/منصرف، جرد، مشتريات من الموردين، وتنبيهات نفاد الكمية.",
    pages: ["/warehouse", "/admin/purchases"],
  },
  {
    icon: Wallet, title: "المحاسبة والديون",
    desc: "متابعة المديونيات، تقارير مالية، فواتير ضريبية متوافقة مع مصلحة الضرائب.",
    pages: ["/accounting", "/admin/debts"],
  },
  {
    icon: BarChart3, title: "تقارير ولوحة قيادة",
    desc: "إحصائيات لحظية للمبيعات، أكثر المنتجات مبيعًا، أداء المندوبين، ورسوم بيانية.",
    pages: ["/admin", "/admin/reports"],
  },
  {
    icon: Bell, title: "إشعارات Push",
    desc: "إشعارات فورية لتحديثات الطلبات والعروض، مع لوحة لإرسال إشعارات جماعية.",
    pages: ["/notifications", "/admin/push"],
  },
  {
    icon: MessageSquare, title: "محادثات وشات بوت",
    desc: "رسائل بين العملاء والإدارة، شات بوت ذكي بالذكاء الاصطناعي للرد التلقائي.",
    pages: ["/admin/messages", "/admin/chatbot"],
  },
  {
    icon: Megaphone, title: "العروض والبانرز",
    desc: "بانرز قابلة للتعديل بالكامل (نص، صورة، زر، إخفاء)، عروض موسمية، وقسم عننا قابل للتحكم.",
    pages: ["/admin/banners", "/admin/about", "/admin/offers"],
  },
  {
    icon: ShieldCheck, title: "صلاحيات متقدمة",
    desc: "أدوار رئيسية للمدير والمحاسب يقدروا يديروا النظام بالكامل، وباقي الصلاحيات تتظبط حسب حاجة حضرتك والاتفاق بيننا.",
    pages: ["/admin/users"],
  },
  {
    icon: Code2, title: "لوحة المطور",
    desc: "إدارة كاملة للنظام، تراخيص SaaS، جولة تعريفية، وإحصائيات تقنية.",
    pages: ["/developer", "/developer/saas"],
  },
];

const TECH = [
  { icon: Zap, name: "TanStack Start", note: "SSR + File-based routing" },
  { icon: Layers, name: "React 19", note: "أحدث إصدار" },
  { icon: Sparkles, name: "TypeScript", note: "Type-safe بالكامل" },
  { icon: LayoutDashboard, name: "Tailwind v4", note: "Design tokens / OKLCH" },
  { icon: Database, name: "Lovable Cloud", note: "Postgres + Auth + Storage" },
  { icon: Lock, name: "Row-Level Security", note: "حماية على مستوى الصف" },
  { icon: Bot, name: "Lovable AI", note: "Gemini / GPT للشات بوت" },
  { icon: Smartphone, name: "PWA + Capacitor", note: "iOS / Android / Web" },
  { icon: Globe, name: "RTL + i18n", note: "عربي بالكامل" },
  { icon: Bell, name: "Web Push", note: "إشعارات فورية" },
  { icon: MapPin, name: "Geo Tracking", note: "تتبع المندوبين لحظيًا" },
  { icon: FileText, name: "PDF / Reports", note: "تصدير وفواتير" },
];

function PortfolioPage() {
  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.18),_transparent_60%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,_transparent,_hsl(var(--background)))]" />
        <div className="mx-auto max-w-[1200px] px-4 py-16 md:py-24 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> منصة B2B متكاملة • Case Study
              </span>
              <h1 className="font-display mt-4 text-4xl font-black leading-tight md:text-6xl">
                أزرق ماركت
                <span className="block bg-gradient-to-l from-primary via-accent to-primary bg-clip-text text-transparent">
                  منصة جملة كاملة في تطبيق واحد
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                نظام B2B متكامل لتجار الجملة في مصر — كتالوج، طلبات، مخزن، محاسبة، توصيل،
                صلاحيات، إشعارات، شات بوت ذكي، وكل ده في تطبيق واحد متجاوب يشتغل
                على الويب والموبايل.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#features" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition hover:scale-105">
                  استكشف الفيتشرز <ArrowLeft className="h-4 w-4" />
                </a>
                <Link to="/" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold transition hover:bg-accent/10">
                  جرّب التطبيق
                </Link>
              </div>
              <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {STATS.map((s) => (
                  <div key={s.label} className="rounded-2xl border border-border bg-card/50 p-4 backdrop-blur">
                    <div className="font-display text-2xl font-black text-primary md:text-3xl">{s.value}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-tr from-primary/30 via-accent/20 to-transparent blur-3xl" />
              <BrowserFrame src={homeShot} alt="الصفحة الرئيسية لأزرق ماركت" />
            </div>
          </div>
        </div>
      </section>

      {/* SCREENSHOTS BAND */}
      <section className="border-b border-border bg-muted/20 py-16">
        <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
          <SectionHeader eyebrow="لقطات حقيقية" title="من قلب التطبيق" subtitle="تصميم نظيف، تجربة سلسة، وأداء سريع — على الويب والموبايل." />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <FigureCard src={homeShot} caption="الصفحة الرئيسية — بانرز ديناميكية، أقسام، ومنتجات مميزة" />
            <FigureCard src={loginShot} caption="تسجيل الدخول — هيرو إعلاني + فورم نظيف بدخول بالموبايل" />
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
          <SectionHeader eyebrow="الفيتشرز" title="كل اللي تحتاجه لإدارة تجارة جملة" subtitle="12 منظومة متكاملة تشتغل مع بعض بدون انقطاع." />
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                <div className="absolute left-0 top-0 h-1 w-0 bg-gradient-to-r from-primary to-accent transition-all duration-500 group-hover:w-full" />
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display mt-4 text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {f.pages.map((p) => (
                    <code key={p} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">{p}</code>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* TECH STACK */}
      <section className="relative border-y border-border bg-gradient-to-b from-muted/30 to-background py-20">
        <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
          <SectionHeader eyebrow="Tech Stack" title="مبنية بأحدث التقنيات" subtitle="Stack حديث، type-safe، يشتغل من الصفر للملايين بدون قلق." />
          <div className="mt-12 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {TECH.map((t) => (
              <div key={t.name} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <t.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm">{t.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{t.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HIGHLIGHTS */}
      <section className="py-20">
        <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
          <SectionHeader eyebrow="ليه يستاهل" title="حاجات بتميّز المشروع" subtitle="مش مجرد CRUD — تجربة مكتملة جاهزة للإنتاج." />
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {[
              "صلاحيات على مقاس حضرتك: المدير والمحاسب ليهم تحكم كامل، وأي صلاحيات إضافية بتتظبط حسب حاجتك وبالاتفاق معانا.",
              "محتوى ديناميكي: كل البانرز، قسم عننا، الإعلانات — حضرتك بتعدّلهم بنفسك من غير ما تحتاج مبرمج.",
              "تتبع لحظي للمندوبين على الخريطة + تعيين تلقائي للطلبات.",
              "شات بوت ذكاء اصطناعي للرد على استفسارات عملائك 24/7.",
              "إشعارات Push للموبايل والويب لتحديثات الطلبات والعروض.",
              "PWA كامل + Capacitor — التطبيق يتثبّت على iOS و Android زي أي تطبيق.",
              "تصميم عربي RTL خالص بخطوط احترافية ووضع داكن/فاتح.",
              "حماية بنكية المستوى — كل تاجر يشوف بياناته هو بس.",
            ].map((h) => (
              <div key={h} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed">{h}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 py-20">
        <div className="mx-auto max-w-[900px] px-4 text-center lg:px-8">
          <h2 className="font-display text-3xl font-black md:text-5xl">
            عايز تشوف بنفسك؟
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            ادخل التطبيق دلوقتي وجرّب كل الفيتشرز اللي اتكلمنا عنها.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition hover:scale-105">
              ادخل التطبيق <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link to="/products" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold transition hover:bg-accent/10">
              شوف الكتالوج
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} أزرق ماركت — كل الحقوق محفوظة
      </footer>
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
        <Sparkles className="h-3 w-3" /> {eyebrow}
      </span>
      <h2 className="font-display mt-3 text-3xl font-black md:text-4xl">{title}</h2>
      <p className="mt-3 text-sm text-muted-foreground md:text-base">{subtitle}</p>
    </div>
  );
}

function BrowserFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <div className="ml-auto rounded-md bg-background/60 px-3 py-0.5 text-[10px] text-muted-foreground" dir="ltr">
          azraqmart.lovable.app
        </div>
      </div>
      <img src={src} alt={alt} className="block w-full" loading="lazy" />
    </div>
  );
}

function FigureCard({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10">
      <BrowserFrame src={src} alt={caption} />
      <figcaption className="px-4 py-3 text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
