import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TargetSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  link: z.string().max(300).optional().nullable(),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("user"), user_id: z.string().uuid() }),
    z.object({ kind: z.literal("customer"), customer_id: z.string().uuid() }),
    z.object({ kind: z.literal("all_customers") }),
    z.object({ kind: z.literal("governorate"), governorate: z.string().min(1).max(80) }),
    z.object({ kind: z.literal("all_delivery") }),
    z.object({ kind: z.literal("delivery"), user_id: z.string().uuid() }),
    z.object({ kind: z.literal("all_staff") }),
  ]),
});

/**
 * Send a push broadcast. Admin/Developer only.
 * Inserts one row in `notifications` per target user — the existing
 * `dispatch_push_on_notification` trigger calls /api/public/send-push for each row.
 */
export const sendPushBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TargetSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Verify caller is admin or developer
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleList = (roles ?? []).map((r: any) => r.role);
    if (!roleList.includes("admin") && !roleList.includes("developer")) {
      throw new Error("ليس لديك صلاحية لإرسال الإشعارات");
    }

    // Resolve target user_ids
    const userIds = await resolveTargets(data.target);
    if (userIds.length === 0) {
      return { ok: true, sent: 0, message: "لا يوجد مستلمون" };
    }

    const rows = userIds.map((uid) => ({
      user_id: uid,
      title: data.title,
      body: data.body,
      type: "broadcast",
      link: data.link || null,
      metadata: { broadcast_by: userId },
    }));

    // Chunk inserts to keep payload reasonable
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error, count } = await supabaseAdmin
        .from("notifications")
        .insert(chunk, { count: "exact" });
      if (error) throw new Error(error.message);
      inserted += count ?? chunk.length;
    }

    return { ok: true, sent: inserted };
  });

async function resolveTargets(target: z.infer<typeof TargetSchema>["target"]): Promise<string[]> {
  switch (target.kind) {
    case "user":
      return [target.user_id];
    case "customer": {
      const { data } = await supabaseAdmin
        .from("customers")
        .select("user_id")
        .eq("id", target.customer_id)
        .maybeSingle();
      return data?.user_id ? [data.user_id] : [];
    }
    case "all_customers": {
      const { data } = await supabaseAdmin
        .from("customers")
        .select("user_id")
        .not("user_id", "is", null)
        .eq("is_active", true);
      return uniq((data ?? []).map((r: any) => r.user_id));
    }
    case "governorate": {
      const { data } = await supabaseAdmin
        .from("customers")
        .select("user_id")
        .not("user_id", "is", null)
        .eq("is_active", true)
        .eq("governorate", target.governorate);
      return uniq((data ?? []).map((r: any) => r.user_id));
    }
    case "delivery":
      return [target.user_id];
    case "all_delivery": {
      const { data } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "delivery");
      return uniq((data ?? []).map((r: any) => r.user_id));
    }
    case "all_staff": {
      const { data } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "accountant", "warehouse", "developer"]);
      return uniq((data ?? []).map((r: any) => r.user_id));
    }
  }
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/* ------------- Read-only helpers used by the UI ------------- */

export const listBroadcastTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleList = (roles ?? []).map((r: any) => r.role);
    if (!roleList.includes("admin") && !roleList.includes("developer")) {
      throw new Error("forbidden");
    }

    const [customersRes, governoratesRes, deliveryRolesRes, profilesRes, tokensRes] =
      await Promise.all([
        supabaseAdmin
          .from("customers")
          .select("id, shop_name, phone, governorate, user_id")
          .eq("is_active", true)
          .order("shop_name"),
        supabaseAdmin
          .from("customers")
          .select("governorate")
          .not("governorate", "is", null),
        supabaseAdmin.from("user_roles").select("user_id").eq("role", "delivery"),
        supabaseAdmin.from("profiles").select("user_id, full_name, phone"),
        supabaseAdmin
          .from("user_push_tokens")
          .select("user_id")
          .eq("is_active", true),
      ]);

    const profilesById = new Map<string, any>();
    for (const p of profilesRes.data ?? []) profilesById.set(p.user_id, p);

    const tokenUsers = new Set<string>(
      (tokensRes.data ?? []).map((r: any) => r.user_id)
    );

    const deliveryAgents = (deliveryRolesRes.data ?? []).map((r: any) => {
      const p = profilesById.get(r.user_id);
      return {
        user_id: r.user_id,
        full_name: p?.full_name ?? "—",
        phone: p?.phone ?? "",
        has_device: tokenUsers.has(r.user_id),
      };
    });

    const governorates = uniq(
      (governoratesRes.data ?? [])
        .map((r: any) => (r.governorate ?? "").trim())
        .filter(Boolean)
    ).sort();

    return {
      customers: customersRes.data ?? [],
      governorates,
      deliveryAgents,
      stats: {
        active_devices: tokenUsers.size,
      },
    };
  });
