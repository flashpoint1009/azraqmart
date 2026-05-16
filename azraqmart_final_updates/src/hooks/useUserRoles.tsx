import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "developer" | "admin" | "accountant" | "warehouse" | "merchant" | "delivery";

export function useUserRoles() {
  const { user } = useAuth();
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["user_roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data?.map((r) => r.role) ?? []) as AppRole[];
    },
  });

  const has = (role: AppRole) => roles.includes(role);
  const hasAny = (...rs: AppRole[]) => rs.some((r) => roles.includes(r));

  // Highest priority role for default landing
  const primary: AppRole | null =
    (["developer", "admin", "accountant", "warehouse", "delivery", "merchant"] as AppRole[]).find((r) =>
      roles.includes(r),
    ) ?? null;

  return { roles, has, hasAny, primary, isLoading };
}

export const ROLE_HOME: Record<AppRole, string> = {
  developer: "/developer",
  admin: "/admin",
  accountant: "/accounting",
  warehouse: "/warehouse",
  delivery: "/delivery",
  merchant: "/products",
};
