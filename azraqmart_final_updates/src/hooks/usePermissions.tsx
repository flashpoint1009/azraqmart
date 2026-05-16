import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserRoles } from "./useUserRoles";

export type PermKey =
  | "dashboard" | "orders" | "products" | "categories" | "purchases"
  | "offers" | "customers" | "users" | "debts" | "accounting"
  | "warehouse" | "messages" | "login_banner" | "reports" | "developer" | "chatbot" | "banners" | "about";

export function usePermissions() {
  const { user } = useAuth();
  const { hasAny, isLoading: rolesLoading } = useUserRoles();

  const { data, isLoading } = useQuery({
    queryKey: ["my_permissions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data as Record<string, boolean> | null;
    },
  });

  // Developer & admin always have full access
  const fullAccess = hasAny("developer", "admin");

  const can = (k: PermKey) => {
    if (fullAccess) return true;
    if (!data) return false;
    return data[`can_${k}`] === true;
  };

  return { can, isLoading: rolesLoading || isLoading, fullAccess };
}
