import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  redirect,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/useAuth";
import { AppSettingsProvider } from "@/hooks/useAppSettings";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { FloatingCartButton } from "@/components/FloatingCartButton";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ChatWidget } from "@/components/ChatWidget";
import { Toaster } from "@/components/ui/sonner";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { applyBranding } from "@/lib/tenancy/branding";
import { TenantProvider, type TenantContextValue } from "@/lib/tenancy/context";
import type { Tenant, TenantBranding } from "@/lib/tenancy/types";

/**
 * Default tenant slug used as the `data-tenant` attribute when no tenant
 * has been resolved yet (e.g. during local dev before subdomains are
 * wired into DNS, or on the marketing apex). Aligns with the default
 * tenant seeded by migration 2.1 (`supabase/migrations/20250101000100_default_tenant.sql`).
 */
const DEFAULT_TENANT_SLUG = "azraqmart";

/**
 * Build a placeholder {@link TenantBranding} record for a resolved tenant.
 *
 * The full branding, effective feature set, and subscription record are
 * loaded by tasks 8.5 (branding inline) and 9.x (feature/subscription
 * loaders) in follow-up work. For now the resolver only carries tenant
 * identity, so the root route fills in neutral defaults so storefront
 * components that read `useTenant()` see a well-formed shape and the
 * inline `<style>` produced by `applyBranding` is valid CSS.
 */
function placeholderBranding(tenant: Tenant): TenantBranding {
  return {
    tenantId: tenant.id,
    logoUrl: null,
    primaryColor: "#000000",
    accentColor: "#000000",
    fontFamily: "system-ui, sans-serif",
    themeTokens: {},
    copyOverrides: {},
    version: 1,
  };
}

/**
 * Build a placeholder {@link TenantContextValue}. See {@link placeholderBranding}.
 */
function placeholderTenantValue(tenant: Tenant): TenantContextValue {
  return {
    tenant,
    branding: placeholderBranding(tenant),
    features: { tenantId: tenant.id, enabled: new Set() },
    subscription: {
      tenantId: tenant.id,
      planId: tenant.planId,
      stripeCustomerId: "",
      stripeSubscriptionId: null,
      status: tenant.status,
      currentPeriodEnd: null,
    },
  };
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  /**
   * Resolve the request's tenant before any route loader runs.
   *
   * Resolution priority is implemented in `src/lib/tenancy/resolver.ts`:
   * verified custom domain → `<slug>.azraqmart.app` → `X-Tenant-Slug`
   * header → `/_t/<slug>/` dev path. The resolver is best-effort here:
   *
   *   - `suspended` / `cancelled` tenants → redirect to `/suspended`
   *     unless the current route is `/suspended` or `/api/billing/portal`
   *     (Requirement 4.10: block all routes except these two).
   *   - `not_found` in production → redirect to `/marketing` (the
   *     marketing landing page). In development we fall through with a
   *     `null` tenant so the existing single-tenant azraqmart app keeps
   *     working before subdomains are provisioned in DNS.
   *   - `invalid_host` is treated as `not_found`.
   *   - Any unexpected failure (no SSR async-local storage, DB outage,
   *     etc.) is swallowed so the app remains operational. Storefront
   *     pages that genuinely require a tenant can call `useTenant()`,
   *     which throws when the provider is not mounted.
   *
   * Requirements: 2.5, 2.6, 2.7, 4.10
   */
  beforeLoad: async () => {
    // Tenant resolution is handled server-side. In the client bundle,
    // we simply return null and let the app work as single-tenant.
    // The full multi-tenant resolution requires the server environment
    // (getRequest, DB access) which is not available in the client.
    const tenant: Tenant | null = null;
    return { tenant };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5",
      },
      { name: "theme-color", content: "#0f1f3a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Zone Mart" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { title: "Zone Mart — تسوّق واطلب توصيل لحد بيتك" },
      {
        name: "description",
        content:
          "Zone Mart: منصة B2B متكاملة لتجار الجملة. اطلب البقالة والمنظفات والمشروبات بأسعار الجملة وتسليم خلال 24 ساعة.",
      },
      { property: "og:title", content: "Zone Mart — منصة تجار الجملة في مصر" },
      {
        property: "og:description",
        content:
          "Zone Mart: منصة B2B متكاملة لتجار الجملة. اطلب البقالة والمنظفات والمشروبات بأسعار الجملة وتسليم خلال 24 ساعة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Zone Mart — منصة تجار الجملة في مصر" },
      {
        name: "twitter:description",
        content:
          "Zone Mart: منصة B2B متكاملة لتجار الجملة. اطلب البقالة والمنظفات والمشروبات بأسعار الجملة وتسليم خلال 24 ساعة.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/3e34fa51-65cd-4837-9d46-d7e51f4156b5",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/3e34fa51-65cd-4837-9d46-d7e51f4156b5",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/icon-512.png" },
      { rel: "apple-touch-icon", href: "/icon-512.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  // The `tenant` value is populated by the route's `beforeLoad`. Cast
  // through `unknown` because the generic context shape declared at the
  // call to `createRootRouteWithContext` only carries `queryClient`; the
  // tenant is an additional field merged in by `beforeLoad`.
  const ctx = Route.useRouteContext() as unknown as { tenant: Tenant | null };
  const tenantSlug = ctx.tenant?.slug ?? DEFAULT_TENANT_SLUG;

  // Generate branding CSS for inline injection in the <head>.
  // Per Requirement 3.8: inline tenant branding CSS in SSR response.
  const tenant = ctx.tenant;
  const tenantValue = tenant ? placeholderTenantValue(tenant) : null;
  const brandingCss = tenantValue ? applyBranding(tenantValue.branding, tenant!.slug) : null;

  return (
    <html lang="ar" dir="rtl" data-tenant={tenantSlug}>
      <head>
        <HeadContent />
        {brandingCss ? (
          <style
            data-tenant-branding={tenant!.slug}
            // The CSS comes from `applyBranding`, which sanitizes
            // tenant-supplied values (escapes `<` so `</style>` cannot
            // close the surrounding tag) — see `src/lib/tenancy/branding.ts`.
            dangerouslySetInnerHTML={{ __html: brandingCss }}
          />
        ) : null}
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // See note in `RootShell` on the cast: `tenant` is added by
  // `beforeLoad` and is not part of the route's declared context shape.
  const { queryClient, tenant } = Route.useRouteContext() as unknown as {
    queryClient: QueryClient;
    tenant: Tenant | null;
  };

  const tenantValue = tenant ? placeholderTenantValue(tenant) : null;

  return (
    <QueryClientProvider client={queryClient}>
      <MaybeTenantProvider value={tenantValue}>
        <AuthProvider>
          <ThemeProvider>
            <AppSettingsProvider>
              <PushBootstrap />
              <Outlet />
              <FloatingCartButton />
              <MobileBottomNav />
              <ChatWidget />
              <Toaster position="top-center" richColors />
            </AppSettingsProvider>
          </ThemeProvider>
        </AuthProvider>
      </MaybeTenantProvider>
    </QueryClientProvider>
  );
}

/**
 * Wraps children in a {@link TenantProvider} only when a tenant has been
 * resolved. When `value` is `null` (e.g. local dev before tenant
 * subdomains are wired into DNS, or the marketing apex), the provider is
 * skipped so storefront components that legitimately render without a
 * tenant can use {@link useOptionalTenant} to read it as `null`.
 *
 * Requirements: 2.5
 */
function MaybeTenantProvider({
  value,
  children,
}: {
  value: TenantContextValue | null;
  children: React.ReactNode;
}) {
  if (!value) return <>{children}</>;
  return <TenantProvider value={value}>{children}</TenantProvider>;
}

function PushBootstrap() {
  usePushNotifications();
  return null;
}
