import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Internal endpoint invoked by the `dispatch_push_on_notification` DB trigger.
 * Authenticated via INTERNAL_PUSH_SECRET.
 * Sends FCM v1 push to all active tokens of the target user using a Service Account.
 */
export const Route = createFileRoute("/api/public/send-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({} as any));

          // ---- auth: validate against push_config.internal_secret ----
          const provided = request.headers.get("x-internal-secret") || (body && body.secret);
          const { data: cfg } = await supabaseAdmin
            .from("push_config")
            .select("internal_secret, is_enabled")
            .eq("id", 1)
            .maybeSingle();
          if (cfg?.is_enabled === false) {
            return json({ ok: true, sent: 0, skipped: "push disabled" });
          }
          const expected = (cfg as any)?.internal_secret;
          if (expected && provided !== expected) {
            return json({ ok: false, error: "unauthorized" }, 401);
          }

          // ---- service account creds ----
          const projectId = process.env.FCM_PROJECT_ID;
          const clientEmail = process.env.FCM_CLIENT_EMAIL;
          const privateKeyRaw = process.env.FCM_PRIVATE_KEY;
          if (!projectId || !clientEmail || !privateKeyRaw) {
            return json(
              { ok: false, error: "FCM service account secrets missing" },
              200
            );
          }

          const userId: string | undefined = body.user_id;
          const title: string = body.title || "إشعار";
          const text: string = body.body || "";
          const link: string | null = body.link || null;
          const meta = body.metadata || {};
          const type: string = body.type ?? "info";

          if (!userId) return json({ ok: false, error: "user_id required" }, 400);

          // ---- target tokens ----
          const { data: tokens, error } = await supabaseAdmin
            .from("user_push_tokens")
            .select("token, platform")
            .eq("user_id", userId)
            .eq("is_active", true);

          if (error) return json({ ok: false, error: error.message }, 500);
          if (!tokens || tokens.length === 0) return json({ ok: true, sent: 0 });

          // ---- get OAuth access token ----
          const accessToken = await getAccessToken(clientEmail, privateKeyRaw);

          // ---- send v1 messages ----
          const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
          const results = await Promise.allSettled(
            tokens.map((t) =>
              fetch(url, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: {
                    token: t.token,
                    notification: { title, body: text },
                    data: {
                      link: link ?? "",
                      type,
                      ...Object.fromEntries(
                        Object.entries(meta).map(([k, v]) => [k, String(v ?? "")])
                      ),
                    },
                    android: {
                      priority: "HIGH",
                      notification: { sound: "default", channel_id: "default" },
                    },
                  },
                }),
              }).then(async (r) => ({
                ok: r.ok,
                status: r.status,
                body: await r.text(),
              }))
            )
          );

          // Deactivate dead tokens (UNREGISTERED / INVALID_ARGUMENT 404/400)
          const dead: string[] = [];
          results.forEach((r, i) => {
            if (r.status === "fulfilled" && !r.value.ok) {
              const s = r.value.status;
              const bodyText = r.value.body || "";
              if (s === 404 || /UNREGISTERED|NOT_FOUND/i.test(bodyText)) {
                dead.push(tokens[i].token);
              }
            }
          });
          if (dead.length) {
            await supabaseAdmin
              .from("user_push_tokens")
              .update({ is_active: false })
              .in("token", dead);
          }

          const sent = results.filter(
            (r) => r.status === "fulfilled" && (r as any).value.ok
          ).length;

          return json({ ok: true, sent, attempted: tokens.length, dead: dead.length });
        } catch (e: any) {
          console.error("[send-push] error", e);
          return json({ ok: false, error: e?.message ?? "unknown" }, 500);
        }
      },
    },
  },
});

/* ---------------- OAuth helper (cached) ---------------- */

let cachedToken: { value: string; exp: number } | null = null;

async function getAccessToken(clientEmail: string, privateKeyPem: string) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: unknown) =>
    base64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(claim)}`;

  const key = await importPrivateKey(privateKeyPem);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      new TextEncoder().encode(unsigned)
    )
  );
  const jwt = `${unsigned}.${base64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to obtain access token: ${res.status} ${t}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, exp: now + (json.expires_in || 3600) };
  return cachedToken.value;
}

async function importPrivateKey(pem: string) {
  // Allow keys stored with literal \n (escaped) in the env var.
  const normalized = pem.replace(/\\n/g, "\n");
  const b64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(input: Uint8Array | ArrayBuffer) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
