/**
 * @server-only
 *
 * Admin authentication helpers for the Super-Admin Console
 * (`admin.azraqmart.app`).
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/design.md`
 *   - §"Super-Admin Console" — admin subdomain, `role=platform_admin` JWT claim,
 *     bypass of `TenantContext`.
 *   - §"Components and Interfaces → Component: Super-Admin Console" — bypass
 *     `TenantContext`; uses `platform_admin` JWT claim; respond 403 otherwise.
 *
 * This module is intentionally framework-agnostic: TanStack Start's middleware
 * story is still fluid, so the public API is a pair of pure functions that
 * downstream route handlers / middleware adapters can wrap however they like.
 *
 *   - `isAdminHost(host)` — does the request target `admin.azraqmart.app`?
 *   - `checkPlatformAdmin(req)` — does the request carry a valid Supabase JWT
 *     with the `role=platform_admin` claim?
 *
 * The verifier validates the HS256 signature against
 * `process.env.SUPABASE_JWT_SECRET` using Web Crypto (works in Cloudflare
 * Workers, Node 20+, and the test runtime). It also rejects expired tokens
 * (`exp <= now()`).
 *
 * Requirements: 10.1 (admin subdomain + `role=platform_admin` required),
 *              10.2 (HTTP 403 + no side effects when claim missing).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Outcome of `checkPlatformAdmin`.
 *
 * `status` deliberately splits 401 (auth failure: token missing or invalid)
 * from 403 (auth succeeded but caller is not a platform admin) so callers can
 * distinguish "please log in" from "you are forbidden".
 *
 * Per Requirement 10.2 the missing-claim case (`not_platform_admin`) MUST
 * surface as HTTP 403 with no side effects.
 */
export type AdminAuthResult =
  | { ok: true; userId: string; jwt: Record<string, unknown> }
  | {
      ok: false;
      status: 401 | 403;
      reason: "no_auth" | "invalid_token" | "not_platform_admin";
    };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The reserved admin host (Requirement 10.1, design §"Tenancy Model"). */
const ADMIN_HOST = "admin.azraqmart.app";

/** Required JWT claim value for super-admin sessions. */
const PLATFORM_ADMIN_ROLE = "platform_admin";

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Does `host` belong to the Super-Admin Console subdomain?
 *
 * Strips an optional `:port` suffix and lowercases the host before comparing,
 * so callers can pass the raw `Host` header. Returns `false` for the empty
 * string or any other host (including the platform apex).
 */
export function isAdminHost(host: string): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  return h === ADMIN_HOST;
}

/**
 * Validate that `req` carries a Supabase JWT whose `role` claim equals
 * `platform_admin`.
 *
 * Resolution order (first applicable rule wins):
 *
 *   1. Missing or malformed `Authorization: Bearer <token>` header
 *      → `{ ok: false, status: 401, reason: 'no_auth' }`.
 *   2. Token fails HS256 signature verification (or is structurally invalid,
 *      or has an `exp` claim that is not in the future)
 *      → `{ ok: false, status: 401, reason: 'invalid_token' }`.
 *   3. Token is valid but `payload.role !== 'platform_admin'`
 *      → `{ ok: false, status: 403, reason: 'not_platform_admin' }`
 *      (Requirement 10.2).
 *   4. Otherwise → `{ ok: true, userId: payload.sub, jwt: payload }`.
 *
 * The function never mutates `req` and never throws on bad input; it returns
 * a tagged-union result so callers can short-circuit with the right status
 * code (e.g. `respond(verdict.status)` in a TanStack Start handler).
 *
 * Verifier note: `SUPABASE_JWT_SECRET` is the symmetric secret used by
 * Supabase Auth for HS256 tokens. If it is missing, every call returns
 * `invalid_token` so misconfigured deployments fail closed instead of
 * silently letting requests through.
 */
export async function checkPlatformAdmin(req: Request): Promise<AdminAuthResult> {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const token = extractBearerToken(auth);
  if (!token) {
    return { ok: false, status: 401, reason: "no_auth" };
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    // Fail closed on misconfiguration; Requirement 10.2 forbids granting
    // access without a valid platform_admin JWT.
    return { ok: false, status: 401, reason: "invalid_token" };
  }

  const payload = await verifyHs256(token, secret);
  if (!payload) {
    return { ok: false, status: 401, reason: "invalid_token" };
  }

  if (payload.role !== PLATFORM_ADMIN_ROLE) {
    return { ok: false, status: 403, reason: "not_platform_admin" };
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) {
    // A Supabase-issued JWT always has `sub`; treat its absence as a malformed
    // token rather than a successful auth.
    return { ok: false, status: 401, reason: "invalid_token" };
  }

  return { ok: true, userId: sub, jwt: payload };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Pull the bearer token out of an `Authorization` header value. Returns
 * `null` if the header is missing, empty, or not in `Bearer <token>` form.
 *
 * The scheme match is case-insensitive (RFC 7235). Surrounding whitespace
 * and the empty token case are rejected.
 */
function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Decode and verify an HS256-signed JWT (Supabase tokens) using Web Crypto.
 *
 * Returns the decoded payload on success, or `null` on any failure
 * (malformed token, bad signature, expired token, unparseable payload).
 *
 * Implementation notes:
 *   - `crypto.subtle.verify` does the constant-time signature check; we do
 *     not roll our own MAC comparison.
 *   - We do not enforce `nbf`; Supabase does not set it on access tokens.
 *   - `exp` is treated as seconds-since-epoch per RFC 7519 §4.1.4.
 */
async function verifyHs256(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  // Optional header sanity check — reject tokens that are not HS256 so we
  // don't silently accept e.g. `alg: 'none'` payloads.
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  let signature: Uint8Array;
  try {
    signature = base64UrlDecodeToBytes(sigB64);
  } catch {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    signature as unknown as ArrayBuffer,
    data,
  );
  if (!ok) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    return null;
  }

  // Reject expired tokens. `exp` is seconds-since-epoch (RFC 7519).
  if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) {
    return null;
  }

  return payload;
}

/**
 * Convert a base64url-encoded string into raw bytes.
 *
 * Pads to a multiple of 4 with `=` and translates the URL-safe alphabet
 * (`-`, `_`) to standard base64 (`+`, `/`) before calling `atob`.
 */
function base64UrlDecodeToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Convenience: base64url → UTF-8 string. */
function base64UrlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64UrlDecodeToBytes(input));
}
