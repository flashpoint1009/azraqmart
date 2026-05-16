/**
 * @server-only
 *
 * MFA gate middleware for Super-Admin Console mutating endpoints.
 *
 * See design §"Super-Admin Console" and Requirement 10.3:
 *   THE Super_Admin_Console SHALL require a verified MFA factor on the
 *   actor's session before executing any mutating endpoint.
 *
 * Supabase issues `aal: 'aal2'` for MFA-elevated sessions and includes
 * `amr: [{ method: 'totp', timestamp: <unix-seconds> }, ...]`. We treat
 * the highest `timestamp` in `amr` as the most recent MFA verification
 * and require it to fall within the configured freshness window.
 *
 * Safe HTTP methods (GET / HEAD / OPTIONS) bypass the gate — the rule
 * applies only to mutating requests.
 */

// This module imports nothing runtime-y; keep it tree-shake friendly and
// trivially testable. It must not reach out to the database or network.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_FRESHNESS_MS = 15 * 60_000; // 15 minutes

export type MfaResult =
  | { ok: true }
  | { ok: false; status: 401; reason: 'mfa_required' };

export interface CheckMfaOptions {
  /**
   * Maximum age (in ms) of the most recent `amr` entry that still counts
   * as a "recently-verified" MFA factor. Defaults to 15 minutes.
   */
  freshnessMs?: number;
  /**
   * Override the wall clock used to evaluate freshness; primarily for
   * deterministic testing. Returns the current time in ms since epoch.
   */
  now?: () => number;
}

/**
 * Extract the latest `timestamp` (in Unix seconds) from a Supabase JWT
 * `amr` claim. Returns `null` when the input is not an array, is empty,
 * or contains no usable timestamps.
 *
 * Exported for unit tests so the timestamp-walking logic can be
 * exercised without constructing a full Request + JWT.
 */
export function extractLatestAmrTs(amr: unknown): number | null {
  if (!Array.isArray(amr) || amr.length === 0) {
    return null;
  }

  let latest: number | null = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const ts = (entry as { timestamp?: unknown }).timestamp;
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) {
      continue;
    }
    if (latest === null || ts > latest) {
      latest = ts;
    }
  }
  return latest;
}

/**
 * Decide whether a request to a Super-Admin endpoint should be allowed
 * through the MFA gate.
 *
 * - Safe methods (GET/HEAD/OPTIONS) are always allowed.
 * - Mutating methods require `jwt.aal === 'aal2'` AND a fresh `amr`
 *   entry whose timestamp is within `freshnessMs` of `now()`.
 * - Otherwise responds with HTTP 401 / `mfa_required`.
 */
export function checkMfa(
  req: Request,
  jwt: Record<string, unknown>,
  opts?: CheckMfaOptions,
): MfaResult {
  const method = (req.method || 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return { ok: true };
  }

  const freshnessMs = opts?.freshnessMs ?? DEFAULT_FRESHNESS_MS;
  const nowMs = (opts?.now ?? Date.now)();

  if (jwt.aal !== 'aal2') {
    return { ok: false, status: 401, reason: 'mfa_required' };
  }

  const latestTs = extractLatestAmrTs(jwt.amr);
  if (latestTs === null) {
    return { ok: false, status: 401, reason: 'mfa_required' };
  }

  const ageSeconds = nowMs / 1000 - latestTs;
  const freshnessSeconds = freshnessMs / 1000;
  if (ageSeconds < 0 || ageSeconds > freshnessSeconds) {
    return { ok: false, status: 401, reason: 'mfa_required' };
  }

  return { ok: true };
}
