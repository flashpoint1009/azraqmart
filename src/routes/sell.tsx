import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ShoppingCart, Package, Truck, Users, Boxes, Wallet, BarChart3, Bell,
  MessageSquare, ShieldCheck, Megaphone, Code2, Sparkles, ArrowLeft,
  CheckCircle2, Star, Zap, Crown, Rocket, Phone, Send, Smartphone,
  Globe, Clock, HeartHandshake,
} from "lucide-react";
import homeShot from "@/assets/portfolio/home.png";
import loginShot from "@/assets/portfolio/login.png";

// ⚠️ عدّل الرقم ده برقم الواتساب بتاعك (بدون + وبدون مسافات)
const WHATSAPP_NUMBER = "201000000000";

export const Route = createFileRoute("/sell")({
  head: () => ({
    meta: [
      { title: "اطلب تطبيقك الآن — أزرق ماركت | منصة B2B جاهزة للإطلاق" },
      { name: "description", content: "نظام جملة متكامل جاهز للإطلاق فورًا — كتالوج، طلبات، مخزن، محاسبة، توصيل، شات بوت ذكي. اطلب عرض سعر الآن." },
      { property: "og:title", content: "اطلب تطبيقك الآن — أزرق ماركت" },
      { property: "og:description", content: "منصة B2B جاهزة — وفّر شهور تطوير وابدأ بيع جملة على الإنترنت في أيام." },
      { property: "og:url", content: "https://azraqmart.lovable.app/sell" },
    ],
    links: [{ rel: "canonical", href: "https://azraqmart.lovable.app/sell" }],
  }),
  component: SellPage,
});

const HERO_STATS = [
  { icon: Rocket, value: "أيام", label: "بدل شهور تطوير" },
  { icon: Smartphone, value: "iOS+Android+Web", label: "تطبيق واحد" },
  { icon: Globe, value: "100%", label: "عربي RTL" },
  { icon: ShieldCheck, value: "بنكي", label: "مستوى الحماية" },
];

const PROBLEMS = [
  "تجارك بيطلبوا بالواتساب والطلبات بتضيع وسط الرسايل",
  "صعب تتابع المخزن والديون والمبيعات في مكان واحد",
  "محتاج مندوبين توصيل بس مفيش نظام يتابعهم لحظيًا",
  "كل تطبيق جاهز إما غالي جدًا أو مش بالعربي أو مش على مقاسك",
];

const SOLUTIONS = [
  { icon: ShoppingCart, title: "كتالوج وسلة احترافية", desc: "تجارك يطلبوا من تطبيق نظيف بدل الواتساب — أسعار جملة، خصومات، وحسابات تلقائية." },
  { icon: Boxes, title: "مخزن ومحاسبة متكاملين", desc: "وارد، منصرف، جرد، ديون، فواتير ضريبية — كله في لوحة واحدة." },
  { icon: Truck, title: "إدارة توصيل بتتبع لحظي", desc: "عيّن مندوبين، اتبعهم على الخريطة، وحدّد مناطق التغطية." },
  { icon: BarChart3, title: "تقارير ولوحة قيادة", desc: "اعرف مبيعاتك، أكتر منتج بيتباع، وأداء فريقك — لحظة بلحظة." },
  { icon: Bell, title: "إشعارات Push وعروض", desc: "ابعت إشعار لكل عملائك بضغطة زرار للعروض والتحديثات." },
  { icon: MessageSquare, title: "شات بوت ذكاء اصطناعي", desc: "يرد على استفسارات عملائك 24/7 من غير ما توظف خدمة عملاء." },
];

const PLANS = [
  {
    icon: Zap, name: "البداية", tag: "للمشاريع الصغيرة",
    desc: "ابدأ بيع جملة على الإنترنت بأقل التكاليف وأسرع وقت ممكن.",
    features: [
      "كتالوج منتجات + سلة طلبات",
      "إدارة عملاء وطلبات",
      "لوحة تحكم للمدير",
      "تطبيق ويب متجاوب (PWA)",
      "تدريب وتسليم في أسبوع",
    ],
    cta: "اطلب عرض سعر",
  },
  {
    icon: Crown, name: "الاحترافية", tag: "الأكثر طلبًا", featured: true,
    desc: "حلّ متكامل لتجار الجملة الجادين — كل ما تحتاجه لإدارة بزنس كامل.",
    features: [
      "كل مميزات باقة البداية",
      "مخزن + محاسبة + ديون",
      "إدارة مندوبين توصيل + تتبع لحظي",
      "إشعارات Push + بانرز ديناميكية",
      "تطبيق iOS و Android كامل",
      "صلاحيات متعددة للموظفين",
      "دعم فني لمدة 3 شهور",
    ],
    cta: "اطلب عرض سعر",
  },
  {
    icon: Rocket, name: "المؤسسات", tag: "للشركات الكبرى",
    desc: "تخصيص كامل + مميزات حصرية + دعم مستمر — على مقاس شركتك بالظبط.",
    features: [
      "كل مميزات الباقة الاحترافية",
      "شات بوت ذكاء اصطناعي مخصص",
      "تكامل مع أنظمتك الحالية (ERP/CRM)",
      "تقارير وتحليلات متقدمة",
      "نطاق مخصص (Domain) خاص بك",
      "دعم فني VIP لمدة سنة",
      "تطوير مميزات إضافية حسب الطلب",
    ],
    cta: "تواصل معنا",
  },
];

const TRUST = [
  { icon: Clock, title: "تسليم سريع", desc: "تطبيقك يشتغل خلال أيام مش شهور." },
  { icon: HeartHandshake, title: "دعم مستمر", desc: "فريق تقني معاك بعد التسليم." },
  { icon: ShieldCheck, title: "حماية بنكية", desc: "كل بيانات تجارك مشفّرة ومحمية." },
  { icon: Sparkles, title: "تحديثات مجانية", desc: "بتستفيد من كل تحسينات النظام." },
];

const FAQS = [
  { q: "قد إيه وقت التسليم؟", a: "باقة البداية بتتسلّم في أسبوع، الاحترافية في 2-3 أسابيع، والمؤسسات حسب الاتفاق على المميزات المطلوبة." },
  { q: "هل التطبيق بيشتغل على iPhone و Android؟", a: "أيوه، نفس التطبيق بيشتغل على iOS و Android والويب — تجارك يحمّلوه من أي مكان." },
  { q: "أقدر أعدّل المحتوى بنفسي؟", a: "أكيد. البانرز، الأقسام، قسم 'عننا'، الإعلانات — كل ده بتتحكم فيه من لوحة الإدارة بدون مبرمج." },
  { q: "إيه نظام الصلاحيات؟", a: "المدير والمحاسب ليهم صلاحيات كاملة لإدارة النظام، وأي صلاحيات إضافية لباقي الموظفين بتتظبط على مقاسك بالاتفاق." },
  { q: "بعد التسليم لو حصلت مشكلة؟", a: "بتاخد دعم فني مجاني حسب باقتك (3 شهور للاحترافية، سنة كاملة للمؤسسات)، وبعدها فيه باقات دعم سنوية." },
  { q: "أقدر أشوف التطبيق قبل ما أشتري؟", a: "أكيد! اطلب Demo دلوقتي وهنوريك النظام كامل بكل تفاصيله." },
];

function waLink(text: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

function SellPage() {
  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      {/* TOP BAR */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-display text-lg font-black">أزرق ماركت</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="#solution" className="text-muted-foreground hover:text-foreground">الحل</a>
            <a href="#plans" className="text-muted-foreground hover:text-foreground">الباقات</a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground">أسئلة</a>
            <Link to="/portfolio" className="text-muted-foreground hover:text-foreground">شوف البورتفوليو</Link>
          </nav>
          <a href={waLink("السلام عليكم، عايز أعرف تفاصيل أكتر عن أزرق ماركت")} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:scale-105">
            <Phone className="h-3.5 w-3.5" /> تواصل
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,_hsl(var(--primary)/0.20),_transparent_55%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_right,_hsl(var(--accent)/0.18),_transparent_55%)]" />
        <div className="mx-auto max-w-[1200px] px-4 py-16 md:py-24 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
                <Star className="h-3.5 w-3.5 fill-primary" /> منصة B2B جاهزة للإطلاق
              </span>
              <h1 className="font-display mt-4 text-4xl font-black leading-[1.1] md:text-6xl">
                ابدأ بيع جملة على الإنترنت
                <span className="block bg-gradient-to-l from-primary via-accent to-primary bg-clip-text text-transparent">
                  في أيام مش شهور
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                <strong className="text-foreground">أزرق ماركت</strong> منصة جملة كاملة جاهزة للتسليم —
                كتالوج، طلبات، مخزن، محاسبة، توصيل، شات بوت ذكي.
                وفّر تكلفة فريق تطوير كامل وابدأ تبيع لتجارك من النهارده.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href={waLink("عايز أحجز Demo لأزرق ماركت")} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 transition hover:scale-105">
                  احجز Demo مجاني <ArrowLeft className="h-4 w-4" />
                </a>
                <a href="#contact" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3.5 text-sm font-bold transition hover:bg-accent/10">
                  اطلب عرض سعر
                </a>
              </div>
              <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {HERO_STATS.map((s) => (
                  <div key={s.label} className="rounded-2xl border border-border bg-card/60 p-3 backdrop-blur">
                    <s.icon className="h-5 w-5 text-primary" />
                    <div className="font-display mt-2 text-base font-black md:text-lg">{s.value}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/30 via-accent/20 to-transparent blur-3xl" />
              <div className="relative">
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/20">
                  <img src={homeShot} alt="معاينة الصفحة الرئيسية لأزرق ماركت" className="block w-full" />
                </div>
                <div className="absolute -bottom-6 -left-6 hidden w-48 overflow-hidden rounded-xl border border-border bg-card shadow-xl md:block">
                  <img src={loginShot} alt="معاينة شاشة تسجيل الدخول" className="block w-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="border-b border-border bg-muted/20 py-16">
        <div className="mx-auto max-w-[1000px] px-4 lg:px-8">
          <SectionHeader eyebrow="المشكلة" title="بتواجه واحدة من دول؟" subtitle="معظم تجار الجملة في مصر بيواجهوا نفس المشاكل دي كل يوم." />
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            {PROBLEMS.map((p) => (
              <div key={p} className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">✕</span>
                <p className="text-sm leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOLUTION */}
      <section id="solution" className="py-20">
        <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
          <SectionHeader eyebrow="الحل" title="منظومة واحدة بتحل كل ده" subtitle="أزرق ماركت بتدّيك كل الأدوات اللي محتاجها — جاهزة ومتكاملة." />
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SOLUTIONS.map((s) => (
              <article key={s.title} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                <div className="absolute right-0 top-0 h-1 w-0 bg-gradient-to-l from-primary to-accent transition-all duration-500 group-hover:w-full" />
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
                  <s.icon className="h-6 w-6" />
                </div>
                <h3 className="font-display mt-4 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </article>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/portfolio" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
              شوف كل التفاصيل في البورتفوليو <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="border-y border-border bg-gradient-to-b from-muted/30 to-background py-16">
        <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t) => (
              <div key={t.title} className="rounded-2xl border border-border bg-card p-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <t.icon className="h-6 w-6" />
                </div>
                <h4 className="font-display mt-3 text-base font-bold">{t.title}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANS */}
      <section id="plans" className="py-20">
        <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
          <SectionHeader eyebrow="الباقات" title="اختار اللي يناسب بزنسك" subtitle="3 باقات مرنة + إمكانية تخصيص كامل حسب احتياجك. كل باقة بسعر بيتحدد بعد فهم متطلباتك." />
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {PLANS.map((p) => (
              <article key={p.name}
                className={`relative flex flex-col rounded-3xl border p-7 transition ${
                  p.featured
                    ? "border-primary bg-gradient-to-b from-primary/10 via-card to-card shadow-2xl shadow-primary/20 lg:-translate-y-4 lg:scale-105"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-3 right-1/2 inline-flex translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-l from-primary to-accent px-3 py-1 text-[10px] font-black text-primary-foreground shadow-lg">
                    <Star className="h-3 w-3 fill-current" /> الأكثر طلبًا
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${p.featured ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                    <p.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-black">{p.name}</h3>
                    <span className="text-[11px] text-muted-foreground">{p.tag}</span>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                <div className="my-5 h-px bg-border" />
                <ul className="space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={waLink(`السلام عليكم، مهتم بباقة "${p.name}" من أزرق ماركت`)}
                  target="_blank" rel="noreferrer"
                  className={`mt-7 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition hover:scale-105 ${
                    p.featured
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                      : "border border-border bg-background hover:bg-accent/10"
                  }`}
                >
                  {p.cta} <ArrowLeft className="h-4 w-4" />
                </a>
              </article>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            * الأسعار بتتحدد بعد جلسة استشارية مجانية لفهم احتياجك بالظبط.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border bg-muted/20 py-20">
        <div className="mx-auto max-w-[900px] px-4 lg:px-8">
          <SectionHeader eyebrow="أسئلة شائعة" title="إجابات على أكتر الأسئلة" subtitle="لو سؤالك مش هنا، تواصل معانا مباشرة على الواتساب." />
          <div className="mt-10 space-y-3">
            {FAQS.map((f, i) => (
              <details key={i} className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <span className="font-display text-base font-bold">{f.q}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT FORM */}
      <ContactSection />

      {/* FOOTER */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} أزرق ماركت — كل الحقوق محفوظة •{" "}
        <Link to="/portfolio" className="text-primary hover:underline">البورتفوليو</Link>
      </footer>

      {/* FLOATING WHATSAPP */}
      <a
        href={waLink("السلام عليكم، عايز أعرف تفاصيل أزرق ماركت")}
        target="_blank" rel="noreferrer"
        className="fixed bottom-5 left-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl shadow-[#25D366]/40 transition hover:scale-110"
        aria-label="تواصل واتساب"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
        </svg>
      </a>
    </div>
  );
}

function ContactSection() {
  const [form, setForm] = useState({ name: "", phone: "", business: "", msg: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim() || form.name.length > 80) errs.name = "اكتب اسمك (لحد 80 حرف)";
    if (!/^[0-9+\-\s]{8,20}$/.test(form.phone)) errs.phone = "رقم تليفون غير صحيح";
    if (form.business.length > 100) errs.business = "اسم النشاط طويل جدًا";
    if (form.msg.length > 500) errs.msg = "الرسالة طويلة جدًا";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const text = `طلب عرض سعر — أزرق ماركت\n\nالاسم: ${form.name}\nالتليفون: ${form.phone}\nالنشاط: ${form.business || "—"}\n\n${form.msg || ""}`;
    window.open(waLink(text), "_blank");
  };

  return (
    <section id="contact" className="border-t border-border bg-gradient-to-br from-primary/10 via-background to-accent/10 py-20">
      <div className="mx-auto max-w-[1100px] px-4 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Send className="h-3 w-3" /> تواصل
            </span>
            <h2 className="font-display mt-3 text-3xl font-black md:text-5xl">جاهز تبدأ؟</h2>
            <p className="mt-4 text-base text-muted-foreground md:text-lg">
              املأ الفورم وهنرجعلك في أقرب وقت بعرض سعر مفصّل وجلسة استشارية مجانية.
            </p>
            <div className="mt-8 space-y-3">
              <a href={waLink("عايز أعرف تفاصيل أزرق ماركت")} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#25D366]">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold">تواصل مباشر</div>
                  <div className="text-xs text-muted-foreground">واتساب — رد سريع</div>
                </div>
              </a>
              <a href="#plans" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold">شوف الباقات</div>
                  <div className="text-xs text-muted-foreground">3 خيارات تناسب كل بزنس</div>
                </div>
              </a>
            </div>
          </div>

          <form onSubmit={onSubmit} className="rounded-3xl border border-border bg-card p-6 shadow-xl md:p-8">
            <h3 className="font-display text-xl font-black">اطلب عرض سعر</h3>
            <p className="mt-1 text-xs text-muted-foreground">هنبعتلك العرض على الواتساب فورًا.</p>
            <div className="mt-5 space-y-4">
              <Field label="الاسم" error={errors.name}>
                <input type="text" maxLength={80} required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="اسمك الكريم" />
              </Field>
              <Field label="رقم التليفون" error={errors.phone}>
                <input type="tel" maxLength={20} required value={form.phone} dir="ltr"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="01xxxxxxxxx" />
              </Field>
              <Field label="نشاطك (اختياري)" error={errors.business}>
                <input type="text" maxLength={100} value={form.business}
                  onChange={(e) => setForm({ ...form, business: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="مثلًا: تاجر جملة مواد غذائية" />
              </Field>
              <Field label="ملاحظات (اختياري)" error={errors.msg}>
                <textarea maxLength={500} rows={3} value={form.msg}
                  onChange={(e) => setForm({ ...form, msg: e.target.value })}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="أي تفاصيل إضافية" />
              </Field>
            </div>
            <button type="submit"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition hover:scale-[1.02]">
              ابعت الطلب على الواتساب <Send className="h-4 w-4" />
            </button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              بياناتك آمنة ومش بنشاركها مع أي حد.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
    </label>
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
