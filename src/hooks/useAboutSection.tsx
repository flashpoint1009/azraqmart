import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AboutStat = { label: string; value: string };
export type AboutFeature = { icon: string; title: string; desc: string };

export type AboutSection = {
  key: string;
  is_visible: boolean;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  stats: AboutStat[];
  features: AboutFeature[];
  cta_label: string | null;
  cta_link: string | null;
};

export function useAboutSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["about_section"],
    queryFn: async () => {
      const { data } = await supabase.from("about_section" as any).select("*").eq("key", "main").maybeSingle();
      return data as unknown as AboutSection | null;
    },
  });
  return { about: data ?? null, isLoading };
}
