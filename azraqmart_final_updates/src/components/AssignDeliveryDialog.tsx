import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, User as UserIcon, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type DeliveryUser = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  assigned_districts: string[] | null;
  assigned_governorates: string[] | null;
};

export function AssignDeliveryDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  currentAssigned,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  orderNumber: number | null;
  currentAssigned?: string | null;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Fetch order's customer location
  const { data: orderInfo } = useQuery({
    queryKey: ["order-location", orderId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("customer_id, customers(governorate, district, shop_name, address)")
        .eq("id", orderId)
        .maybeSingle();
      return data as any;
    },
  });

  const custGov: string | null = orderInfo?.customers?.governorate ?? null;
  const custDist: string | null = orderInfo?.customers?.district ?? null;

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ["delivery_users"],
    enabled: open,
    queryFn: async () => {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "delivery");
      if (roleErr) throw roleErr;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as DeliveryUser[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, assigned_districts, assigned_governorates")
        .in("user_id", ids);
      return (profiles ?? []) as DeliveryUser[];
    },
  });

  const matches = (d: DeliveryUser) => {
    const dists = d.assigned_districts ?? [];
    const govs = d.assigned_governorates ?? [];
    if (custDist && dists.includes(custDist)) return true;
    if (custGov && govs.includes(custGov)) return true;
    return dists.length === 0 && govs.length === 0; // unrestricted driver
  };

  const sorted = useMemo(() => {
    const arr = [...drivers];
    arr.sort((a, b) => Number(matches(b)) - Number(matches(a)));
    return arr;
  }, [drivers, custDist, custGov]);

  const visible = showAll ? sorted : sorted.filter(matches);

  const assign = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("اختر مندوبًا");
      const { error } = await supabase.rpc("assign_order_to_delivery", {
        _order_id: orderId,
        _delivery_user_id: selected,
        _note: note || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إسناد الطلب للمندوب ✓");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["wh_orders"] });
      onOpenChange(false);
      setSelected(null);
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Truck className="h-5 w-5 text-primary" />
            إسناد الطلب {orderNumber ? `#${orderNumber}` : ""} لمندوب
          </DialogTitle>
        </DialogHeader>

        {(custGov || custDist) && (
          <div className="rounded-lg border border-border bg-surface-2/40 p-2.5 text-xs flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="font-bold">منطقة العميل:</span>
            <span>{custGov ?? "—"} {custDist ? `— ${custDist}` : ""}</span>
          </div>
        )}

        <div className="space-y-3">
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-2">
            {isLoading ? (
              <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin me-2" /> جارٍ التحميل…
              </div>
            ) : visible.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground space-y-2">
                <p>{drivers.length === 0 ? "لا يوجد مندوبين. أضف مستخدم بدور «مندوب»." : "لا يوجد مندوب مخصص لهذه المنطقة."}</p>
                {drivers.length > 0 && !showAll && (
                  <Button size="sm" variant="outline" onClick={() => setShowAll(true)}>عرض كل المندوبين</Button>
                )}
              </div>
            ) : (
              visible.map((d) => {
                const active = selected === d.user_id;
                const isCurrent = currentAssigned === d.user_id;
                const inArea = matches(d);
                return (
                  <button
                    key={d.user_id}
                    onClick={() => setSelected(d.user_id)}
                    className={`flex w-full items-center gap-3 border-b border-border/60 p-3 text-right transition last:border-0 ${
                      active ? "bg-primary/10" : "hover:bg-card"
                    }`}
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
                      <UserIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">{d.full_name || "مندوب"}</p>
                      <p className="text-[11px] text-muted-foreground" dir="ltr">{d.phone || ""}</p>
                      {(d.assigned_districts?.length ?? 0) > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {d.assigned_districts!.slice(0, 3).join("، ")}{d.assigned_districts!.length > 3 ? "…" : ""}
                        </p>
                      )}
                    </div>
                    {inArea ? (
                      <span className="rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">يغطي</span>
                    ) : (
                      <span className="rounded-md bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[10px] font-bold">خارج النطاق</span>
                    )}
                    {isCurrent && (
                      <span className="rounded-md bg-accent/15 text-accent-foreground border border-accent/30 px-2 py-0.5 text-[10px] font-bold">الحالي</span>
                    )}
                    {active && <span className="h-3 w-3 rounded-full bg-primary" />}
                  </button>
                );
              })
            )}
          </div>

          {visible.length > 0 && !showAll && drivers.some((d) => !matches(d)) && (
            <button onClick={() => setShowAll(true)} className="text-xs font-bold text-primary hover:underline">
              عرض كل المندوبين ({drivers.length})
            </button>
          )}

          <div>
            <label className="text-xs font-bold mb-1 block">ملاحظات للمندوب (اختياري)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="اتصل بالعميل قبل التوصيل…" />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={() => assign.mutate()} disabled={!selected || assign.isPending} className="gap-2">
              {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              إسناد
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
