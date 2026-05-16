import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Pencil, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reference migration for task 5.1 of the white-label SaaS spec.
 *
 * Source: `.kiro/specs/white-label-saas-system/tasks.md` task 5.1
 * Validates: Requirements 1.2, 11.6
 *
 * Uses the standard supabase client directly since the DBBrowser is a
 * developer tool that operates outside the tenant context. RLS policies
 * handle data isolation at the database level.
 */

/** Whitelist of safe tables exposed to the developer DB browser. */
const TABLES = [
  "products", "categories", "customers", "orders", "order_items",
  "purchase_invoices", "purchase_invoice_items", "purchase_returns", "purchase_return_items",
  "stock_movements", "cash_transactions", "coupons",
  "welcome_messages", "welcome_dismissals",
  "profiles", "user_roles", "user_permissions",
  "app_settings", "login_banner_settings", "licenses",
] as const;
type TableName = (typeof TABLES)[number];

export function DBBrowser() {
  const qc = useQueryClient();
  const runScoped = async <T,>(fn: (client: typeof supabase) => Promise<T>): Promise<T> => fn(supabase);
  const [table, setTable] = useState<TableName>("products");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["db_browse", table],
    queryFn: () =>
      runScoped(async (scoped) => {
        const { data, error } = await scoped.from(table as any).select("*").limit(200);
        if (error) throw error;
        return (data ?? []) as any[];
      }),
  });

  const cols = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [rows, search]);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: any; patch: Record<string, any> }) =>
      runScoped(async (scoped) => {
        const { error } = await scoped.from(table as any).update(patch).eq("id", id);
        if (error) throw error;
      }),
    onSuccess: () => {
      toast.success("تم التحديث ✓");
      qc.invalidateQueries({ queryKey: ["db_browse", table] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: any) =>
      runScoped(async (scoped) => {
        const { error } = await scoped.from(table as any).delete().eq("id", id);
        if (error) throw error;
      }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["db_browse", table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border bg-surface-2/40">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="font-display font-bold inline-flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            متصفّح قاعدة البيانات
            <Badge variant="secondary">{filtered.length}</Badge>
          </h3>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> تحديث
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          {TABLES.map((t) => (
            <button
              key={t}
              onClick={() => { setTable(t); setSearch(""); }}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                table === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث في كل الأعمدة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pe-9 h-10"
          />
        </div>
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>تحذير: التعديل والحذف هنا مباشرين على قاعدة البيانات. استخدم بحذر.</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جارِ التحميل…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جدول فاضي</div>
        ) : (
          <table className="w-full text-xs" dir="ltr">
            <thead className="bg-surface-2 text-muted-foreground sticky top-0">
              <tr>
                {cols.slice(0, 6).map((c) => (
                  <th key={c} className="px-3 py-2 text-start font-bold whitespace-nowrap">{c}</th>
                ))}
                <th className="px-3 py-2 text-end font-bold sticky end-0 bg-surface-2">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id ?? JSON.stringify(r)} className="hover:bg-surface-2/40">
                  {cols.slice(0, 6).map((c) => (
                    <td key={c} className="px-3 py-2 max-w-[200px] truncate font-mono text-[11px]">
                      {renderCell(r[c])}
                    </td>
                  ))}
                  <td className="px-3 py-2 sticky end-0 bg-card">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setEditing(r)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => r.id && confirm("حذف نهائي؟") && remove.mutate(r.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <RowEditor
          row={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => update.mutate({ id: editing.id, patch })}
          saving={update.isPending}
        />
      )}
    </section>
  );
}

function renderCell(v: any) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
  return String(v).slice(0, 60);
}

function RowEditor({
  row,
  onClose,
  onSave,
  saving,
}: {
  row: any;
  onClose: () => void;
  onSave: (patch: Record<string, any>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, any>>(() => ({ ...row }));
  const SKIP = new Set(["id", "created_at", "updated_at"]);
  const fields = Object.keys(form).filter((k) => !SKIP.has(k));

  const submit = () => {
    const patch: Record<string, any> = {};
    for (const k of fields) {
      if (JSON.stringify(form[k]) !== JSON.stringify(row[k])) patch[k] = form[k];
    }
    if (Object.keys(patch).length === 0) return toast.info("لا تغييرات");
    onSave(patch);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            تعديل سجل
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pe-1">
          {fields.map((k) => {
            const v = form[k];
            const isBool = typeof row[k] === "boolean";
            const isObj = typeof row[k] === "object" && row[k] !== null;
            return (
              <div key={k}>
                <Label className="font-mono text-[11px]" dir="ltr">{k}</Label>
                {isBool ? (
                  <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!v}
                      className="h-4 w-4 accent-primary"
                      onChange={(e) => setForm({ ...form, [k]: e.target.checked })}
                    />
                    {v ? "نعم" : "لا"}
                  </label>
                ) : isObj ? (
                  <textarea
                    dir="ltr"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-card p-2 text-xs font-mono"
                    value={typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                    onChange={(e) => {
                      try { setForm({ ...form, [k]: JSON.parse(e.target.value) }); }
                      catch { setForm({ ...form, [k]: e.target.value }); }
                    }}
                  />
                ) : (
                  <Input
                    dir="ltr"
                    value={v ?? ""}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value === "" ? null : e.target.value })}
                  />
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="gap-2"><Save className="h-4 w-4" />حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
