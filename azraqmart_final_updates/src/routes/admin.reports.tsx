import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Package, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({ meta: [{ title: "التقارير — Admin" }] }),
  component: AdminReports,
});

const monthly = [
  { m: "يناير", revenue: 184, orders: 412, customers: 612 },
  { m: "فبراير", revenue: 212, orders: 478, customers: 638 },
  { m: "مارس", revenue: 248, orders: 522, customers: 672 },
  { m: "إبريل", revenue: 275, orders: 568, customers: 708 },
  { m: "مايو", revenue: 312, orders: 642, customers: 754 },
  { m: "يونيو", revenue: 348, orders: 712, customers: 802 },
  { m: "يوليو", revenue: 392, orders: 798, customers: 847 },
];

const channels = [
  { name: "تطبيق Android", value: 48 },
  { name: "موقع ويب", value: 32 },
  { name: "PWA Mobile", value: 14 },
  { name: "موظف مبيعات", value: 6 },
];
const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function AdminReports() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-primary">لوحة التحكم / التقارير</p>
            <h1 className="font-display text-3xl font-bold text-foreground mt-1">تقارير الأداء</h1>
            <p className="text-sm text-muted-foreground mt-1">آخر 7 أشهر • تحديث لحظي</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2"><FileSpreadsheet className="h-4 w-4" />Excel</Button>
            <Button variant="hero" className="gap-2"><Download className="h-4 w-4" />تصدير PDF</Button>
          </div>
        </header>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Kpi label="نمو الإيرادات" value="+24.8%" trend="up" hint="مقارنة بالربع السابق" icon={TrendingUp} />
          <Kpi label="معدل الطلب الشهري" value="712" trend="up" hint="+18% عن الشهر الماضي" icon={Package} />
          <Kpi label="تسرّب العملاء" value="2.4%" trend="down" hint="-0.6% — تحسن جيد" icon={Users} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-xs">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-foreground">الإيرادات الشهرية</h3>
                <p className="text-xs text-muted-foreground">آلاف الجنيهات المصرية</p>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer>
                <AreaChart data={monthly}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="m" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <h3 className="font-display text-base font-bold text-foreground mb-4">قنوات البيع</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={channels} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                    {channels.map((_, i) => <Cell key={i} fill={colors[i]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Kpi({ label, value, trend, hint, icon: Icon }: { label: string; value: string; trend: "up" | "down"; hint: string; icon: typeof TrendingUp }) {
  const TrendIcon = trend === "up" ? TrendingUp : TrendingDown;
  const tone = trend === "up" ? "text-success bg-success/10" : "text-destructive bg-destructive/10";
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="h-5 w-5" /></div>
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${tone}`}><TrendIcon className="h-3 w-3" />{trend === "up" ? "ارتفاع" : "تراجع"}</span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-foreground tabular-nums" dir="ltr">{value}</p>
      <p className="text-xs font-bold text-foreground mt-1">{label}</p>
      <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}
