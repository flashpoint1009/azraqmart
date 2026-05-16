/**
 * Theming engine: deterministic CSS generation from a TenantBranding record.
 *
 * Source of truth:
 *   - `.kiro/specs/white-label-saas-system/design.md`
 *     §"Component: Theming Engine"
 *     §"Function: applyBranding"
 *     §"Correctness Properties" → Property 5 (Branding Idempotence)
 *
 * Requirements satisfied:
 *   - 3.1 Emit `:root[data-tenant="<slug>"] { --primary: ...; --accent: ...; ... }`
 *   - 3.2 Idempotence: same input yields byte-equal output
 *   - 3.3 `themeTokens` emitted in input iteration (insertion) order
 *   - 3.4 `</style>` and CSS-injection patterns escaped/stripped from values
 *   - 3.7 `tenant_branding.version` participates in the memoization key so cached
 *         CSS is invalidated whenever branding is saved
 *
 * This module is pure: no I/O, no global mutation other than an in-process LRU
 * cache used purely as a performance optimization. Import surface is restricted
 * to types from `./types`.
 */

import type { TenantBranding } from "./types";

// ---------------------------------------------------------------------------
// Constants and patterns
// ---------------------------------------------------------------------------

/** RFC-1123-flavored slug as enforced by the Zod schema upstream. */
const SLUG_REGEX = /^[a-z0-9](-?[a-z0-9])*$/;

/** Six-digit hex color (validated upstream; defensively re-checked here). */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/** CSS custom property name (must start with `--`, then [A-Za-z0-9_-]+). */
const TOKEN_KEY_REGEX = /^--[a-zA-Z0-9_-]+$/;

/**
 * Control characters to strip from any user-supplied value, except `\t` (0x09)
 * and `\n` (0x0A) which are tolerated inside CSS string-typed declarations.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B-\x1F\x7F]/g;

/** Fallback color when a supplied hex color fails validation. */
const FALLBACK_COLOR = "#000000";

/** Fallback font when fontFamily is empty after sanitization. */
const FALLBACK_FONT = "system-ui, sans-serif";

/** Fallback slug fragment if the supplied slug fails the SLUG_REGEX. */
const FALLBACK_SLUG = "unknown";

/** Maximum entries in the per-process CSS cache. */
const CSS_CACHE_MAX = 1000;

// ---------------------------------------------------------------------------
// Sanitization helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Strip control characters and escape any `<` so a `</style>` (case-insensitive)
 * substring cannot terminate the surrounding `<style>` tag. `<` is escaped using
 * the CSS hex escape `\3C ` (with the trailing space delimiter required to
 * separate the escape from any following hex-digit-like character).
 *
 * The escape is applied to **every** `<`, not just the literal `</style>`
 * sequence; CSS values legitimately never contain `<`, so this is safe and
 * eliminates whitespace-/case-tricks like `</STYLE>`, `< /style>`, etc.
 */
function sanitizeValue(raw: string): string {
  if (typeof raw !== "string") {
    return "";
  }
  // 1. Strip control characters (except \t and \n).
  let out = raw.replace(CONTROL_CHARS_REGEX, "");
  // 2. Escape `<` → `\3C ` so `</style>` cannot close a style tag.
  out = out.replace(/</g, "\\3C ");
  return out;
}

/**
 * Defensively re-validate a hex color. Upstream Zod (task 8.2) already
 * enforces the same regex, but `applyBranding` must never emit an invalid
 * color into user-facing CSS even if a malformed record sneaks past
 * validation (e.g. a hand-edited DB row).
 */
function safeColor(color: string | undefined | null): string {
  if (typeof color !== "string" || !HEX_COLOR_REGEX.test(color)) {
    return FALLBACK_COLOR;
  }
  return color;
}

/**
 * Sanitize a `font-family` declaration value. Upstream is expected to produce
 * a well-formed CSS font list (e.g. `'Inter', sans-serif`). We only strip
 * control characters and escape `<`.
 */
function safeFontFamily(font: string | undefined | null): string {
  if (typeof font !== "string") {
    return FALLBACK_FONT;
  }
  const sanitized = sanitizeValue(font).trim();
  return sanitized.length > 0 ? sanitized : FALLBACK_FONT;
}

/**
 * Validate a slug for use inside the `[data-tenant="..."]` attribute selector.
 * If the slug fails `SLUG_REGEX`, fall back to a stripped variant. The slug
 * is wrapped in double quotes in the selector, so we additionally remove
 * any character that could break out of the quoted attribute.
 */
function safeSlug(slug: string): string {
  if (typeof slug === "string" && SLUG_REGEX.test(slug)) {
    return slug;
  }
  // Strip everything outside the slug alphabet; if the result is empty,
  // use the fallback so the selector remains syntactically valid.
  const stripped =
    typeof slug === "string" ? slug.replace(/[^a-z0-9-]/g, "") : "";
  return stripped.length > 0 ? stripped : FALLBACK_SLUG;
}

// ---------------------------------------------------------------------------
// CSS construction (pure)
// ---------------------------------------------------------------------------

/**
 * Build the CSS string for a TenantBranding record. Pure; no caching here.
 *
 * Output shape:
 *
 * ```css
 * :root[data-tenant="acme"] {
 *   --primary: #ff0000;
 *   --accent: #00ff00;
 *   --font-family: 'Helvetica Neue', sans-serif;
 *   --foo: bar;
 * }
 * ```
 *
 * Each declaration is on its own line with two-space indentation. Token
 * iteration order is preserved per ECMA-262 string-keyed property order.
 */
function buildCss(branding: TenantBranding, slug: string): string {
  const tenantSlug = safeSlug(slug);
  const primary = safeColor(branding.primaryColor);
  const accent = safeColor(branding.accentColor);
  const fontFamily = safeFontFamily(branding.fontFamily);

  const lines: string[] = [];
  lines.push(`:root[data-tenant="${tenantSlug}"] {`);
  lines.push(`  --primary: ${primary};`);
  lines.push(`  --accent: ${accent};`);
  lines.push(`  --font-family: ${fontFamily};`);

  // themeTokens: preserve iteration order, drop keys with invalid CSS custom
  // property syntax, sanitize values.
  const tokens = branding.themeTokens ?? {};
  for (const key of Object.keys(tokens)) {
    if (!TOKEN_KEY_REGEX.test(key)) {
      continue;
    }
    const rawValue = tokens[key];
    if (typeof rawValue !== "string") {
      continue;
    }
    const value = sanitizeValue(rawValue).trim();
    if (value.length === 0) {
      continue;
    }
    lines.push(`  ${key}: ${value};`);
  }

  lines.push(`}`);
  // Trailing newline keeps inlined `<style>` blocks tidy and stable.
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Memoization (LRU by insertion order, capped at CSS_CACHE_MAX)
// ---------------------------------------------------------------------------

/**
 * Process-local cache mapping `${tenantId}:${version}:${slug}` to the
 * generated CSS string. Map iteration order in JS is insertion order, so
 * we evict the oldest entry once we exceed `CSS_CACHE_MAX`.
 *
 * Slug is included in the cache key in addition to (tenantId, version) from
 * the design contract because slug is a function argument and changing the
 * slug without bumping `version` would otherwise return a stale selector.
 */
const cssCache = new Map<string, string>();

function cacheKey(branding: TenantBranding, slug: string): string {
  // tenantId and version come from the validated TenantBranding record;
  // slug is sanitized so the key is stable under defensive normalization.
  return `${branding.tenantId}:${branding.version}:${safeSlug(slug)}`;
}

function getCached(key: string): string | undefined {
  if (!cssCache.has(key)) {
    return undefined;
  }
  // Touch the entry to mark it as most recently used.
  const value = cssCache.get(key) as string;
  cssCache.delete(key);
  cssCache.set(key, value);
  return value;
}

function setCached(key: string, value: string): void {
  if (cssCache.has(key)) {
    cssCache.delete(key);
  }
  cssCache.set(key, value);
  while (cssCache.size > CSS_CACHE_MAX) {
    const oldest = cssCache.keys().next();
    if (oldest.done) {
      break;
    }
    cssCache.delete(oldest.value);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate the deterministic, sanitized CSS string for a tenant's branding.
 *
 * Determinism: for any fixed `(branding, slug)` the function returns a
 * byte-identical string on every call (Property 5 — Branding Idempotence).
 *
 * @param branding The validated `TenantBranding` record. `primaryColor` and
 *   `accentColor` are expected to match `^#[0-9a-fA-F]{6}$` (Zod-enforced
 *   upstream); invalid values are defensively replaced with `#000000`.
 * @param slug The tenant's slug, used to build the
 *   `:root[data-tenant="<slug>"]` selector. Expected to match the slug regex;
 *   defensively sanitized.
 * @returns A CSS string safe to inline inside a `<style>` tag.
 */
export function applyBranding(branding: TenantBranding, slug: string): string {
  const key = cacheKey(branding, slug);
  const cached = getCached(key);
  if (cached !== undefined) {
    return cached;
  }
  const css = buildCss(branding, slug);
  setCached(key, css);
  return css;
}

/**
 * Resolve the logo URL for a given variant.
 *
 * Variant-aware logos (e.g. a separate dark-mode asset) are future work; for
 * now both variants resolve to `branding.logoUrl`. The signature is in place
 * so callers can be wired today and a richer record (e.g. `logoUrlDark`)
 * can be added without churning consumers.
 *
 * @returns The logo URL, or `null` when no logo has been configured.
 */
export function resolveLogo(
  branding: TenantBranding,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  variant: "light" | "dark"
): string | null {
  return branding.logoUrl ?? null;
}

// ---------------------------------------------------------------------------
// Test seam
// ---------------------------------------------------------------------------

/**
 * Reset the in-process CSS cache. Intended for use in unit tests so cache
 * state does not leak between cases. Not part of the public production API.
 */
export function __resetBrandingCacheForTests(): void {
  cssCache.clear();
}
