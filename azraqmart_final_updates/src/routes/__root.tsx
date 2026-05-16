import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/useAuth";
import { AppSettingsProvider } from "@/hooks/useAppSettings";
import { FloatingCartButton } from "@/components/FloatingCartButton";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ChatWidget } from "@/components/ChatWidget";
import { Toaster } from "@/components/ui/sonner";
import { usePushNotifications } from "@/hooks/usePushNotifications";

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
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5" },
      { name: "theme-color", content: "#0f1f3a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "أزرق ماركت" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { title: "أزرق ماركت — منصة تجار الجملة في مصر" },
      { name: "description", content: "أزرق ماركت: منصة B2B متكاملة لتجار الجملة. اطلب البقالة والمنظفات والمشروبات بأسعار الجملة وتسليم خلال 24 ساعة." },
      { property: "og:title", content: "أزرق ماركت — منصة تجار الجملة في مصر" },
      { property: "og:description", content: "أزرق ماركت: منصة B2B متكاملة لتجار الجملة. اطلب البقالة والمنظفات والمشروبات بأسعار الجملة وتسليم خلال 24 ساعة." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "أزرق ماركت — منصة تجار الجملة في مصر" },
      { name: "twitter:description", content: "أزرق ماركت: منصة B2B متكاملة لتجار الجملة. اطلب البقالة والمنظفات والمشروبات بأسعار الجملة وتسليم خلال 24 ساعة." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/3e34fa51-65cd-4837-9d46-d7e51f4156b5" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/3e34fa51-65cd-4837-9d46-d7e51f4156b5" },
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
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppSettingsProvider>
          <PushBootstrap />
          <Outlet />
          <FloatingCartButton />
          <MobileBottomNav />
          <ChatWidget />
          <Toaster position="top-center" richColors />
        </AppSettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function PushBootstrap() {
  usePushNotifications();
  return null;
}
