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

  // Apply theme dynamically
  useEffect(() => {
    if (!data || typeof document === "undefined") return;
    const root = document.documentElement;
    if (data.primary_color) root.style.setProperty("--primary", data.primary_color);
    if (data.accent_color) root.style.setProperty("--accent", data.accent_color);
    if (data.background_color) root.style.setProperty("--background", data.background_color);
    if (data.font_family) root.style.setProperty("--font-sans", data.font_family);
    if (data.app_name) document.title = data.app_name;
  }, [data]);

  return (
    <Ctx.Provider value={{ settings: data ?? null, refetch }}>{children}</Ctx.Provider>
  );
}

export function useAppSettings() {
  return useContext(Ctx);
}
