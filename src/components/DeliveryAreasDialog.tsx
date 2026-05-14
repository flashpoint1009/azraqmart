import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Save } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { GOVERNORATES, REGIONS } from "@/lib/regions";

export function DeliveryAreasDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  userName?: string | null;
}) {
  const qc = useQueryClient();
  const [districts, setDistricts] = useState<string[]>([]);
  const [govs, setGovs] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["profile_areas", userId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("assigned_districts, assigned_governorates")
        .eq("user_id", userId)
        .maybeSingle();
      return data as any;
    },
  });

  useEffect(() => {
    if (data) {
      setDistricts(data.assigned_districts ?? []);
      setGovs(data.assigned_governorates ?? []);
    }
  }, [data]);

  const toggleDist = (d: string) =>
    setDistricts((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const toggleGov = (g: string) =>
    setGovs((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ assigned_districts: districts, assigned_governorates: govs })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ المناطق ✓");
      qc.invalidateQueries({ queryKey: ["delivery_users"] });
      qc.invalidateQueries({ queryKey: ["all_users_roles"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <MapPin className="h-5 w-5 text-primary" /> مناطق المندوب — {userName || ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              اختر الأحياء التي يغطيها المندوب. يمكنك أيضًا اختيار محافظة كاملة لتغطية كل أحيائها.
            </p>
            {GOVERNORATES.map((g) => {
              const allGov = govs.includes(g);
              return (
                <div key={g} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm">{g}</h4>
                    <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                      <input type="checkbox" checked={allGov} onChange={() => toggleGov(g)} className="h-4 w-4 accent-primary" />
                      تغطية كاملة للمحافظة
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {REGIONS[g].map((d) => {
                      const on = districts.includes(d) || allGov;
                      return (
                        <button
                          key={d}
                          type="button"
                          disabled={allGov}
                          onClick={() => toggleDist(d)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                            on
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-dashed border-border bg-transparent text-muted-foreground hover:bg-surface-2"
                          } ${allGov ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-2 justify-end pt-2 sticky bottom-0 bg-background pb-1">
              <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
