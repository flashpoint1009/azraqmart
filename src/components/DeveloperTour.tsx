import { useEffect, useState } from "react";
import { Compass, ChevronRight, ChevronLeft, X, Sparkles, Package, ShoppingCart, Ticket, Users2, KeyRound, Database, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOUR_KEY = "dev_tour_v1_seen";

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  tip?: string;
  tab?: string;
};

const STEPS: Step[] = [
  {
    icon: Compass,
    title: "أهلاً بك في لوحة المطور 👋",
    body: "هذه جولة سريعة (٧ خطوات) تشرح إزاي تجرب التطبيق بالكامل من تعبئة البيانات لحد متابعة الطلبات والكوبونات.",
    tip: "تقدر تخرج من الجولة في أي وقت، وتفتحها تاني من زر «الجولة» أعلى الصفحة.",
  },
  {
    icon: Sparkles,
    title: "1. تعبئة بيانات الديمو",
    tab: "demo",
    body: "روح لتبويب «ديمو» واضغط «تعبئة بيانات الديمو». هيتم إضافة ٦ أقسام، ٣١ منتج بصور، ١٥ عميل، ٢٥ طلب، و٣ كوبونات.",
    tip: "كل البيانات بتتعلّم بـ DEMO- علشان تقدر تشيلها بضغطة واحدة لاحقاً.",
  },
  {
    icon: Package,
    title: "2. تجربة المنتجات",
    body: "افتح الصفحة الرئيسية «/» — هتلاقي المنتجات بصورها وأسعارها. جرب البحث، الفلترة بالأقسام، وافتح أي منتج لتشوف تفاصيله.",
    tip: "كاتالوج المنتجات بيستخدم lazy-loading للصور، فالأداء على الموبايل ممتاز.",
  },
  {
    icon: ShoppingCart,
    title: "3. السلة وإنشاء طلب",
    body: "أضف منتجات للسلة من زر «+»، افتح السلة من الأيقونة في الأسفل (موبايل) أو من الهيدر، واختر عميل ثم اعمل «إنشاء طلب».",
    tip: "تقدر تجرب كحساب تاجر مختلف لتشوف الفرق في الصلاحيات.",
  },
  {
    icon: Ticket,
    title: "4. تطبيق كوبون خصم",
    body: "في السلة، أدخل كود كوبون (مثلاً WELCOME10) لتشوف الخصم يتطبق فوراً قبل تأكيد الطلب.",
    tip: "الكوبونات الديمو موجودة في تبويب «القاعدة» → جدول coupons.",
  },
  {
    icon: Users2,
    title: "5. المستخدمين والصلاحيات",
    tab: "users",
    body: "من تبويب «المستخدمين» تقدر تضيف موظف وتربطه بصلاحية (مدير، محاسب، مخزن، تاجر). جرب تسجّل دخول بحساب مختلف لتشوف اختلاف الواجهة.",
    tip: "زر «إصلاح الحسابات» بيحل أي مشاكل في ربط الأرقام بالملفات.",
  },
  {
    icon: KeyRound,
    title: "6. التحكم في المكونات",
    tab: "branding",
    body: "من تبويب «الهوية» → «مكونات النسخة الحالية» تقدر تشيل أي وحدة (سلة، عروض، محاسبة...) وهتختفي فوراً من كل الواجهات.",
    tip: "ده مفيد علشان تفصّل النسخة لكل عميل حسب احتياجه.",
  },
  {
    icon: Database,
    title: "7. متابعة البيانات",
    tab: "system",
    body: "تبويب «النظام» بيعرض إحصائيات لحظية، و«القاعدة» بيخليك تتصفح أي جدول مباشرة. خلاص، إنت جاهز للديمو!",
    tip: "لما تخلص، ارجع لتبويب «ديمو» واضغط «حذف بيانات الديمو» علشان تنضف القاعدة.",
  },
];

export function DeveloperTour({ onSwitchTab }: { onSwitchTab?: (tab: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const close = () => {
    localStorage.setItem(TOUR_KEY, "1");
    setOpen(false);
    setStep(0);
  };

  const goTo = (i: number) => {
    setStep(i);
    const tab = STEPS[i].tab;
    if (tab) onSwitchTab?.(tab);
  };

  const next = () => (step < STEPS.length - 1 ? goTo(step + 1) : close());
  const prev = () => step > 0 && goTo(step - 1);

  const S = STEPS[step];
  const Icon = S?.icon ?? Compass;
  const isLast = step === STEPS.length - 1;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
      >
        <Compass className="h-4 w-4" /> الجولة التفاعلية
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in"
          onClick={close}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-surface-2 hover:bg-muted transition"
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-6 pt-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-muted-foreground">
                    خطوة {step + 1} من {STEPS.length}
                  </p>
                  <h3 className="font-display text-lg font-bold leading-tight">{S.title}</h3>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-foreground/90">{S.body}</p>

              {S.tip && (
                <div className="mt-4 flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{S.tip}</span>
                </div>
              )}

              {/* Progress dots */}
              <div className="mt-5 flex items-center justify-center gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === step ? "w-6 bg-primary" : "w-1.5 bg-muted hover:bg-muted-foreground/40"
                    }`}
                    aria-label={`خطوة ${i + 1}`}
                  />
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={prev} disabled={step === 0} className="gap-1">
                  <ChevronRight className="h-4 w-4" /> السابق
                </Button>
                <Button variant="hero" size="sm" onClick={next} className="gap-1">
                  {isLast ? "إنهاء الجولة" : "التالي"}
                  {!isLast && <ChevronLeft className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
