import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Receipt, Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/debts")({
  head: () => ({ meta: [{ title: "المديونيات — Zone Mart" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer", "accountant"]}>
      <DebtsPage />
    </RoleGuard>
  ),
});

type Filter = "all" | "open" | "partial" | "paid";

function DebtsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState<{ id: string; name: string; balance: number } | null>(null);
  const [amount, setAmount] = useState(0);

  const { data: customers = [], isLoading, error } = useQuery({
    queryKey: ["debts-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, shop_name, owner_name, phone, balance, credit_limit")
        .order("balance", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const pay = useMutation({
    mutationFn: async () => {
      if (!paying || amount <= 0) throw new Error("أدخل مبلغ صحيح");
      const newBalance = Math.max(0, Number(paying.balance) - amount);
      const { error: e1 } = await supabase
        .from("customers")
        .update({ balance: newBalance })
        .eq("id", paying.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("cash_transactions").insert({
        type: "in",
        amount,
        reference_type: "customer_payment",
        reference_id: paying.id,
        description: `تحصيل من ${paying.name}`,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الدفعة");
      qc.invalidateQueries({ queryKey: ["debts-customers"] });
      setPaying(null);
      setAmount(0);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = customers.filter((c: any) => {
    const bal = Number(c.balance ?? 0);
    if (filter === "open" && bal <= 0) return false;
    if (filter === "partial" && (bal <= 0 || bal >= Number(c.credit_limit ?? 0))) return false;
    if (filter === "paid" && bal !== 0) return false;
    if (q.trim()) {
      const n = q.toLowerCase();
      return (
        c.shop_name?.toLowerCase().includes(n) ||
        c.owner_name?.toLowerCase().includes(n) ||
        c.phone?.includes(n)
      );
    }
    return true;
  });

  const totals = customers.reduce(
    (acc: any, c: any) => {
      const b = Number(c.balance ?? 0);
      if (b > 0) {
        acc.openCount += 1;
        acc.openSum += b;
      }
      return acc;
    },
    { openCount: 0, openSum: 0 },
  );

  const exportCsv = () => {
    const rows = [["العميل", "الموبايل", "الرصيد", "حد الائتمان"]];
    filtered.forEach((c: any) =>
      rows.push([c.shop_name ?? "—", c.phone ?? "—", String(c.balance ?? 0), String(c.credit_limit ?? 0)]),
    );
    const csv = "\uFEFF" + rows.map((r) => r.map((x) => `"${x}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `debts-${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <StaffNav />
      <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6 lg:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> تصدير CSV
          </Button>
          <div className="text-end">
            <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Zone Mart
            </p>
            <h1 className="font-display text-3xl font-bold mt-1">المديونيات</h1>
            <p className="text-sm text-muted-foreground mt-1">متابعة ديون العملاء وتسجيل المدفوعات.</p>
          </div>
        </header>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-bold text-muted-foreground">عملاء عليهم مديونية</p>
            <p className="font-display text-2xl font-bold mt-1 tabular-nums" dir="ltr">{totals.openCount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-bold text-muted-foreground">إجمالي المديونيات</p>
            <p className="font-display text-2xl font-bold mt-1 tabular-nums text-destructive" dir="ltr">
              {totals.openSum.toLocaleString("en")} ج.م
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-bold text-muted-foreground">إجمالي العملاء</p>
            <p className="font-display text-2xl font-bold mt-1 tabular-nums" dir="ltr">{customers.length}</p>
          </div>
        </div>

        <div className="mb-4 relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث باسم العميل أو الموبايل…"
            className="h-12 w-full rounded-xl border border-border bg-card pr-10 pl-3 text-sm font-medium outline-none focus:border-ring"
          />
        </div>

        <div className="mb-5 flex flex-wrap gap-2 justify-end">
          {[
            { v: "all", t: "الكل" },
            { v: "open", t: "مفتوح" },
            { v: "partial", t: "جزئي" },
            { v: "paid", t: "مسدد" },
          ].map((s) => (
            <button
              key={s.v}
              onClick={() => setFilter(s.v as Filter)}
              className={`h-9 px-4 rounded-full text-xs font-bold transition ${
                filter === s.v
                  ? "bg-foreground text-background"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.t}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            تعذر تحميل البيانات: {(error as Error).message}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] font-bold uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-end">العميل</th>
                <th className="p-3 text-end">الموبايل</th>
                <th className="p-3 text-end">حد الائتمان</th>
                <th className="p-3 text-end">الرصيد المستحق</th>
                <th className="p-3 text-end">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    جارِ التحميل…
                  </td>
                </tr>
              )}
              {!isLoading &&
                filtered.map((c: any) => {
                  const b = Number(c.balance ?? 0);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                      <td className="p-3 text-end">
                        <p className="font-bold">{c.shop_name}</p>
                        <p className="text-[11px] text-muted-foreground">{c.owner_name ?? ""}</p>
                      </td>
                      <td className="p-3 text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                        {c.phone}
                      </td>
                      <td className="p-3 tabular-nums text-end" dir="ltr">
                        {Number(c.credit_limit ?? 0).toLocaleString("en")}
                      </td>
                      <td
                        className={`p-3 font-bold tabular-nums text-end ${
                          b > 0 ? "text-destructive" : "text-success"
                        }`}
                        dir="ltr"
                      >
                        {b.toLocaleString("en")} ج.م
                      </td>
                      <td className="p-3 text-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={b <= 0}
                          onClick={() => {
                            setPaying({ id: c.id, name: c.shop_name, balance: b });
                            setAmount(b);
                          }}
                          className="gap-1.5"
                        >
                          <Receipt className="h-3.5 w-3.5" /> تحصيل
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    لا توجد مديونيات تطابق الفلتر
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {paying && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
              <h3 className="font-display text-lg font-bold">تحصيل من {paying.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                الرصيد الحالي: <span className="font-bold text-destructive" dir="ltr">{paying.balance.toLocaleString("en")} ج.م</span>
              </p>
              <div className="mt-4">
                <label className="text-xs font-bold">المبلغ المحصّل</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPaying(null)}>
                  إلغاء
                </Button>
                <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
                  حفظ الدفعة
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
