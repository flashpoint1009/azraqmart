import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HomeBanner = {
  key: string;
  title: string | null;
  subtitle: string | null;
  eyebrow: string | null;
  cta_label: string | null;
  cta_link: string | null;
  image_url: string | null;
  is_visible: boolean;
};

export function useHomeBanners() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["home_banners"],
    queryFn: async () => {
      const { data } = await supabase.from("home_banners" as any).select("*");
      return (data ?? []) as unknown as HomeBanner[];
    },
  });

  const byKey = (k: string) => data.find((b) => b.key === k);
  return { banners: data, byKey, isLoading };
}
