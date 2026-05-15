import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppSettings = {
  id: string;
  app_name: string;
  app_slogan: string | null;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  font_family: string | null;
  max_users: number | null;
  max_customers: number | null;
  license_key: string | null;
  features: Record<string, boolean> | null;
};

const Ctx = createContext<{ settings: AppSettings | null; refetch: () => void }>({
  settings: null,
  refetch: () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const { data, refetch } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AppSettings | null;
    },
  });

  // Theme colors are defined in styles.css — no dynamic override needed.
  // The developer panel can update app_settings but colors are baked into the CSS build.
  useEffect(() => {
    if (!data || typeof document === "undefined") return;
    // Only set title
    if (data.app_name) document.title = data.app_name;
  }, [data]);

  return (
    <Ctx.Provider value={{ settings: data ?? null, refetch }}>{children}</Ctx.Provider>
  );
}

export function useAppSettings() {
  return useContext(Ctx);
}
