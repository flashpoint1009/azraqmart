// Admin user management - developer only
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";

    // Verify caller is developer
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, svc);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const roleList = (roles ?? []).map((r: any) => r.role);
    const isDeveloper = roleList.includes("developer");
    const isAdmin = roleList.includes("admin");
    if (!isDeveloper && !isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const action = body.action as string;

    if (action === "list") {
      const { data: existingList, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) return json({ error: listErr.message }, 400);
      const [profilesRes, rolesRes, permsRes] = await Promise.all([
        admin.from("profiles").select("user_id, full_name, phone, shop_name, is_active"),
        admin.from("user_roles").select("user_id, role"),
        admin.from("user_permissions").select("*"),
      ]);
      if (profilesRes.error) return json({ error: profilesRes.error.message }, 400);
      if (rolesRes.error) return json({ error: rolesRes.error.message }, 400);
      if (permsRes.error) return json({ error: permsRes.error.message }, 400);

      const rolesByUser = new Map<string, { role: string }[]>();
      for (const r of rolesRes.data ?? []) {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push({ role: r.role });
        rolesByUser.set(r.user_id, arr);
      }
      const permsByUser = new Map<string, any>();
      for (const p of permsRes.data ?? []) permsByUser.set(p.user_id, p);
      const profilesByUser = new Map<string, any>();
      for (const p of profilesRes.data ?? []) profilesByUser.set(p.user_id, p);

      const users = (existingList?.users ?? []).map((u: any) => {
        const meta = u.user_metadata ?? {};
        const phone = meta.phone ?? String(u.email ?? "").replace("@phone.azraq.local", "");
        const profile = profilesByUser.get(u.id) ?? {
          user_id: u.id,
          full_name: meta.full_name ?? phone,
          phone,
          shop_name: meta.shop_name ?? null,
          is_active: true,
        };
        return {
          ...profile,
          missing_profile: !profilesByUser.has(u.id),
          user_roles: rolesByUser.get(u.id) ?? [],
          user_permissions: permsByUser.get(u.id) ?? {},
        };
      });

      return json({ users });
    }

    if (action === "repair_profiles") {
      if (!isDeveloper) return json({ error: "Forbidden" }, 403);
      const { data: existingList, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) return json({ error: listErr.message }, 400);
      let repaired = 0;
      for (const u of existingList?.users ?? []) {
        const meta = u.user_metadata ?? {};
        const phone = meta.phone ?? String(u.email ?? "").replace("@phone.azraq.local", "");
        const { error } = await admin.from("profiles").upsert({
          user_id: u.id,
          full_name: meta.full_name ?? phone,
          phone,
          shop_name: meta.shop_name ?? null,
          is_active: true,
        }, { onConflict: "user_id" });
        if (!error) repaired += 1;
      }
      return json({ ok: true, repaired });
    }

    if (action === "create") {
      const { phone, password, full_name, roles } = body;
      if (!phone || !password) return json({ error: "phone & password required" }, 400);
      let assignRoles: string[] = Array.isArray(roles) ? roles : [];
      if (!isDeveloper) assignRoles = assignRoles.filter((r) => r !== "developer");
      const email = `${phone}@phone.azraq.local`;
      // Detect existing user by email so we can give a clear Arabic error and recover.
      const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = existingList?.users?.find((u: any) => u.email === email);
      let uid: string;
      if (existing) {
        // Reuse the existing auth user, refresh password, ensure profile.
        uid = existing.id;
        const { error: pwErr } = await admin.auth.admin.updateUserById(uid, {
          password,
          user_metadata: { ...(existing.user_metadata ?? {}), phone, full_name: full_name ?? phone },
        });
        if (pwErr) return json({ error: `الرقم مسجل بالفعل ولا يمكن تحديثه: ${pwErr.message}` }, 400);
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { phone, full_name: full_name ?? phone },
        });
        if (error) {
          const msg = /already|exists|registered/i.test(error.message)
            ? "رقم الهاتف ده مسجل بالفعل"
            : error.message;
          return json({ error: msg }, 400);
        }
        uid = created.user!.id;
      }
      // ensure profile
      await admin.from("profiles").upsert({ user_id: uid, full_name: full_name ?? phone, phone }, { onConflict: "user_id" });
      // remove default 'merchant' if assigning custom roles
      if (assignRoles.length > 0) {
        await admin.from("user_roles").delete().eq("user_id", uid);
        await admin.from("user_roles").insert(assignRoles.map((r: string) => ({ user_id: uid, role: r })));
      }
      return json({ ok: true, user_id: uid, reused: !!existing });
    }

    if (action === "reset_password") {
      const { user_id, password } = body;
      if (!user_id || !password) return json({ error: "user_id & password required" }, 400);
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);
      if (user_id === userData.user.id) return json({ error: "لا يمكنك حذف نفسك" }, 400);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
