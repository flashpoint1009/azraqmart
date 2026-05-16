/**
 * Mobile build header injection.
 *
 * The mobile build pipeline (see design §"Mobile Build Pipeline") produces a
 * per-tenant Capacitor binary by baking the tenant's slug into the build via
 * the Vite environment variable `VITE_TENANT_SLUG`. Every outbound request
 * from that binary must carry an `X-Tenant-Slug: <slug>` header so the
 * platform's Tenant Resolver can map the request back to the correct tenant
 * even when no host-based match is possible.
 *
 * This module exposes a thin `fetch` wrapper that adds the header when the
 * build-time slug is present and otherwise behaves as the identity. On the
 * platform web build the variable is unset, so the wrapper is a no-op.
 *
 * Validates: Requirements 9.2, 9.6
 */

/**
 * Slug shape accepted by the platform.
 *
 * Mirrors the validation rule defined in design §"Model: Tenant" and
 * Requirement 4.2: kebab-case, lowercase alphanumerics with single hyphen
 * separators, length 3..32. Reserved-slug enforcement is handled server-side
 * by the Tenant Resolver and is intentionally not duplicated here.
 */
const SLUG_REGEX = /^[a-z0-9](-?[a-z0-9])*$/;
const SLUG_MIN_LEN = 3;
const SLUG_MAX_LEN = 32;

const TENANT_HEADER = 'X-Tenant-Slug';

function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN_LEN &&
    slug.length <= SLUG_MAX_LEN &&
    SLUG_REGEX.test(slug)
  );
}

/**
 * Returns the build-time tenant slug or `null` when not set or invalid.
 *
 * The slug is read from `import.meta.env.VITE_TENANT_SLUG`, trimmed and
 * validated against {@link SLUG_REGEX}. An invalid value (wrong shape,
 * wrong length, or non-string) yields `null` and a `console.warn` so the
 * mobile binary still works in identity mode rather than emitting a header
 * that would never resolve.
 */
export function getBuildTimeTenantSlug(): string | null {
  // Vite replaces `import.meta.env.*` at build time. The optional chaining
  // and try/catch defend against environments where `import.meta` is not a
  // plain object (e.g. some SSR runtimes) so this module can be imported
  // safely from any context.
  let raw: unknown;
  try {
    raw = (import.meta as { env?: Record<string, unknown> }).env?.VITE_TENANT_SLUG;
  } catch {
    return null;
  }

  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') {
    console.warn(
      `[mobile-headers] VITE_TENANT_SLUG must be a string, got ${typeof raw}; ignoring.`,
    );
    return null;
  }

  const slug = raw.trim();
  if (slug === '') return null;

  if (!isValidSlug(slug)) {
    console.warn(
      `[mobile-headers] VITE_TENANT_SLUG="${slug}" is not a valid tenant slug; ignoring.`,
    );
    return null;
  }

  return slug;
}

/**
 * Wrap a fetch implementation so every outbound request includes
 * `X-Tenant-Slug: <slug>` when a build-time slug is set.
 *
 * When `slug` is `null` the original `inner` reference is returned unchanged,
 * making this a zero-cost no-op on the platform web build. When a slug is
 * provided, the returned function preserves the standard `fetch(input, init?)`
 * contract and supports both `Request` and `string`/`URL` inputs.
 *
 * If the caller already set `X-Tenant-Slug` (e.g. a hand-crafted request that
 * targets a different tenant) the existing header is left untouched.
 */
export function wrapFetchWithTenantHeader(
  inner: typeof fetch = fetch,
  slug: string | null = getBuildTimeTenantSlug(),
): typeof fetch {
  if (slug === null) return inner;

  const wrapped: typeof fetch = (input, init) => {
    // Branch on input shape: a Request carries its own headers, a string/URL
    // carries none, so we have to merge into whichever container exists.
    if (typeof Request !== 'undefined' && input instanceof Request) {
      const merged = new Headers(init?.headers ?? input.headers);
      if (!merged.has(TENANT_HEADER)) merged.set(TENANT_HEADER, slug);
      // When `init` is provided we merge it on top of the Request and let
      // fetch resolve the precedence. When it isn't, we clone the Request
      // so we can attach the merged headers without mutating the original.
      if (init) {
        return inner(input, { ...init, headers: merged });
      }
      return inner(new Request(input, { headers: merged }));
    }

    const headers = new Headers(init?.headers);
    if (!headers.has(TENANT_HEADER)) headers.set(TENANT_HEADER, slug);
    return inner(input, { ...(init ?? {}), headers });
  };

  return wrapped;
}
