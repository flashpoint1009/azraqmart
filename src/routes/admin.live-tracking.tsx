import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Truck, Wifi, WifiOff } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/live-tracking")({
  head: () => ({ meta: [{ title: "تتبّع المندوبين المباشر — أزرق ماركت" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer"]}>
      <Page />
    </RoleGuard>
  ),
});

type DriverLoc = {
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  is_online: boolean;
  last_updated_at: string;
  profiles?: { full_name: string | null; phone: string | null } | null;
};

function Page() {
  const qc = useQueryClient();

  const drivers = useQuery({
    queryKey: ["driver-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_locations")
        .select("driver_id, latitude, longitude, accuracy, speed, is_online, last_updated_at, profiles!driver_locations_driver_id_fkey(full_name, phone)")
        .order("last_updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DriverLoc[];
    },
    refetchInterval: 15000,
  });

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("driver_locations_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, () => {
        qc.invalidateQueries({ queryKey: ["driver-locations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const online = drivers.data?.filter((d) => d.is_online && Date.now() - new Date(d.last_updated_at).getTime() < 5 * 60_000) ?? [];
  const offline = drivers.data?.filter((d) => !online.includes(d)) ?? [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <StaffNav />
      <div className="border-b border-border bg-gradient-to-l from-accent/10 via-background to-primary/5">
        <div className="mx-auto max-w-[1100px] px-4 py-6 lg:px-6">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" /> تتبّع مباشر
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">تتبّع المندوبين على الخريطة</h1>
          <p className="text-sm text-muted-foreground mt-1">آخر مواقع المندوبين المُحدَّثة لحظة بلحظة.</p>
        </div>
      </div>
      <main className="mx-auto max-w-[1100px] px-4 py-5 lg:px-6 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="متصلون الآن" value={online.length} icon={Wifi} accent="text-emerald-600" />
          <Stat label="غير متصلين" value={offline.length} icon={WifiOff} accent="text-muted-foreground" />
          <Stat label="إجمالي المندوبين" value={drivers.data?.length ?? 0} icon={Truck} accent="text-primary" />
        </div>

        <Card className="p-4">
          <h2 className="font-bold mb-3">المندوبون النشطون</h2>
          {drivers.isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
          {drivers.data?.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد بيانات GPS بعد. تأكّد من تفعيل تتبّع الموقع في تطبيق المندوب.</p>
          )}
          <div className="space-y-2">
            {[...online, ...offline].map((d) => (
              <DriverRow key={d.driver_id} d={d} isOnline={online.includes(d)} />
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: number; icon: typeof Truck; accent: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2"><Icon className={`h-5 w-5 ${accent}`} /><p className="text-xs text-muted-foreground">{label}</p></div>
      <p className={`mt-2 text-2xl font-extrabold ${accent}`}>{value}</p>
    </Card>
  );
}

function DriverRow({ d, isOnline }: { d: DriverLoc; isOnline: boolean }) {
  const mapsUrl = `https://www.google.com/maps?q=${d.latitude},${d.longitude}`;
  const last = new Date(d.last_updated_at);
  const ageMin = Math.round((Date.now() - last.getTime()) / 60_000);
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold">{d.profiles?.full_name ?? "مندوب"}</p>
          <p className="text-xs text-muted-foreground">{d.profiles?.phone ?? "—"}</p>
        </div>
        <Badge variant={isOnline ? "default" : "outline"} className={isOnline ? "bg-emerald-600 text-white" : ""}>
          {isOnline ? "متصل" : "غير متصل"}
        </Badge>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{d.latitude.toFixed(5)}, {d.longitude.toFixed(5)} {d.accuracy ? `· دقة ${Math.round(d.accuracy)}م` : ""}</span>
        <span>منذ {ageMin} دقيقة</span>
      </div>
      <Button asChild size="sm" variant="outline" className="mt-2 gap-1.5">
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"><MapPin className="h-3.5 w-3.5" />فتح الخريطة</a>
      </Button>
    </div>
  );
}
