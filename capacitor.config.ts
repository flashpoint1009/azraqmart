/**
 * capacitor.config.ts — per-tenant Capacitor configuration.
 *
 * This file is consumed by the Mobile Build Pipeline (tasks.md §15.3,
 * `.github/workflows/build-tenant-app.yml`) which sets `TENANT_SLUG`,
 * `TENANT_APP_NAME`, and `TENANT_SPLASH_COLOR` in the build environment
 * before running `cap sync` / `gradle assembleRelease` / `xcodebuild`.
 *
 * It produces a unique `appId`, `appName`, deep-link scheme, and
 * `server.url` per tenant from a single shared codebase, satisfying:
 *
 *   - Requirement 9.1 (white-label mobile builds)
 *   - design.md §"Mobile Build Pipeline"
 *
 * Invariants enforced at config evaluation time (so misconfigured builds
 * fail loudly rather than silently shipping the wrong tenant):
 *
 *   - `TENANT_SLUG` matches `^[a-z0-9](-?[a-z0-9])*$` and is 3..32 chars
 *     (kebab-case, no leading/trailing dash) — same shape used by the
 *     platform `tenants.slug` CHECK constraint.
 *   - `appId` reverse-DNS contains no dashes (Android requirement).
 */

import type { CapacitorConfig } from "@capacitor/cli";

// ---------------------------------------------------------------------------
// Tenant identity (from the build environment; defaults to the founding
// `azraqmart` tenant when running locally / in non-pipeline contexts).
// ---------------------------------------------------------------------------

const TENANT_SLUG = (process.env.TENANT_SLUG || "azraqmart").toLowerCase();
const TENANT_APP_NAME = process.env.TENANT_APP_NAME || "Azraqmart";
const TENANT_SPLASH_COLOR = process.env.TENANT_SPLASH_COLOR || "#1a3d2e";

// ---------------------------------------------------------------------------
// Slug shape validation. Throw at config time — this aborts `cap sync` and
// the surrounding CI build with a clear error rather than producing a
// garbage `appId`.
// ---------------------------------------------------------------------------

const SLUG_PATTERN = /^[a-z0-9](-?[a-z0-9])*$/;

if (
  TENANT_SLUG.length < 3 ||
  TENANT_SLUG.length > 32 ||
  !SLUG_PATTERN.test(TENANT_SLUG)
) {
  throw new Error(
    `[capacitor.config] Invalid TENANT_SLUG="${TENANT_SLUG}". ` +
      `Expected kebab-case, 3..32 chars, no leading/trailing dash, ` +
      `matching ${SLUG_PATTERN}.`,
  );
}

// ---------------------------------------------------------------------------
// Derived per-tenant values.
//   - `appId`            reverse-DNS, dashes stripped (Android constraint).
//   - `deepLinkScheme`   used for `<scheme>://` deep links on iOS/Android.
//   - `serverUrl`        platform subdomain on `azraqmart.app`.
// ---------------------------------------------------------------------------

const slugNoDashes = TENANT_SLUG.replace(/-/g, "");
const appId = `app.azraqmart.${slugNoDashes}`;
const appName = TENANT_APP_NAME;
const deepLinkScheme = slugNoDashes;
const serverUrl = `https://${TENANT_SLUG}.azraqmart.app`;

const config: CapacitorConfig = {
  appId,
  appName,
  webDir: "dist",

  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: "https",
  },

  ios: {
    scheme: deepLinkScheme,
  },

  android: {
    allowMixedContent: false,
    backgroundColor: TENANT_SPLASH_COLOR,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: TENANT_SPLASH_COLOR,
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: TENANT_SPLASH_COLOR,
    },
  },
};

export default config;
