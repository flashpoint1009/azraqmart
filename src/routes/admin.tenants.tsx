/**
 * Super-Admin Console — Tenant Management page.
 *
 * Source of truth: `.kiro/specs/white-label-saas-system/tasks.md`
 *   - Task 16.7: Super-Admin UI routes
 *   - Task 15.5: Gate "Trigger mobile build" on `mobile_app` feature
 *
 * Provides a tenant list/create/suspend/resume table with a per-tenant
 * "Trigger mobile build" button that is gated by the `<Feature>` component
 * (task 9.4). The button is wrapped in `<Feature flag="mobile_app">` so it
 * renders the "Upgrade to enable" fallback when the tenant's plan does not
 * include the `mobile_app` feature.
 *
 * Requirements: 9.5, 10.1, 10.5
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Smartphone, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { StaffNav } from "@/components/StaffNav";
import { RoleGuard } from "@/components/RoleGuard";
import { Feature } from "@/components/Feature";
import { TenantProvider } from "@/lib/tenancy/context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type {
  FeatureKey,
  Tenant,
  TenantBranding,
  TenantFeatures,
  Subscription,
} from "@/lib/tenancy/types";

export const Route = createFileRoute("/admin/tenants")({
  head: () => ({ meta: [{ title: "إدارة المستأجرين — Super Admin" }] }),
  component: () => (
    <RoleGuard allow={["admin", "developer"]}>
      <TenantsPage />
    </RoleGuard>
  ),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal branding record for the TenantProvider context. */
function defaultBranding(tenantId: string): TenantBranding {
  return {
    tenantId,
    logoUrl: null,
    primaryColor: "#000000",
    accentColor: "#666666",
    fontFamily: "sans-serif",
    themeTokens: {},
    copyOverrides: {},
    version: 1,
  };
}

/** Minimal subscription record for the TenantProvider context. */
function defaultSubscription(tenant: Tenant): Subscription {
  return {
    tenantId: tenant.id,
    planId: tenant.planId,
    stripeCustomerId: "",
    stripeSubscriptionId: null,
    status: tenant.status,
    currentPeriodEnd: null,
  };
}

// ---------------------------------------------------------------------------
// Status badge color mapping
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  trialing: "secondary",
  past_due: "outline",
  suspended: "destructive",
  cancelled: "destructive",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function TenantsPage() {
  const queryClient = useQueryClient();

  // Fetch tenants with their plan features to determine mobile_app availability
  const tenantsQuery = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenants")
        .select("id, slug, name, status, plan_id, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        slug: string;
        name: string;
        status: string;
        plan_id: string;
        created_at: string;
        updated_at: string;
      }>;
    },
  });

  // Fetch plan_features to determine which tenants have mobile_app enabled
  const planFeaturesQuery = useQuery({
    queryKey: ["admin-plan-features"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("plan_features")
        .select("plan_id, feature_key, enabled");
      if (error) throw error;
      return (data ?? []) as Array<{
        plan_id: string;
        feature_key: string;
        enabled: boolean;
      }>;
    },
  });

  // Fetch tenant-level feature overrides
  const overridesQuery = useQuery({
    queryKey: ["admin-tenant-features"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_features")
        .select("tenant_id, feature_key, enabled, expires_at");
      if (error) throw error;
      return (data ?? []) as Array<{
        tenant_id: string;
        feature_key: string;
        enabled: boolean;
        expires_at: string | null;
      }>;
    },
  });

  /**
   * Build the effective feature set for a tenant by combining plan features
   * with tenant-level overrides (mirrors computeEnabledFeatures logic).
   */
  function buildTenantFeatures(tenantId: string, planId: string): TenantFeatures {
    const enabled = new Set<FeatureKey>();

    // Seed from plan features
    for (const pf of planFeaturesQuery.data ?? []) {
      if (pf.plan_id === planId && pf.enabled) {
        enabled.add(pf.feature_key as FeatureKey);
      }
    }

    // Apply tenant overrides
    const now = Date.now();
    for (const o of overridesQuery.data ?? []) {
      if (o.tenant_id !== tenantId) continue;
      if (o.expires_at !== null) {
        const expiresAtMs = Date.parse(o.expires_at);
        if (Number.isNaN(expiresAtMs) || expiresAtMs <= now) continue;
      }
      if (o.enabled) {
        enabled.add(o.feature_key as FeatureKey);
      } else {
        enabled.delete(o.feature_key as FeatureKey);
      }
    }

    return { tenantId, enabled: enabled as ReadonlySet<FeatureKey> };
  }

  // Suspend tenant mutation
  const suspendMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Admin action" }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      toast.success("تم إيقاف المستأجر");
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Resume tenant mutation
  const resumeMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      toast.success("تم استئناف المستأجر");
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isLoading =
    tenantsQuery.isLoading || planFeaturesQuery.isLoading || overridesQuery.isLoading;

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <StaffNav />
      <div className="border-b border-border bg-gradient-to-l from-accent/10 via-background to-primary/5">
        <div className="mx-auto max-w-[1100px] px-4 py-6 lg:px-6">
          <p className="text-xs font-bold text-primary inline-flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Super Admin
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">
            إدارة المستأجرين
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            عرض وإدارة جميع المستأجرين على المنصة.
          </p>
        </div>
      </div>
      <main className="mx-auto max-w-[1100px] px-4 py-5 lg:px-6">
        {isLoading && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            جارٍ التحميل…
          </p>
        )}
        {!isLoading && tenantsQuery.data?.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            لا يوجد مستأجرون بعد.
          </p>
        )}
        <div className="space-y-3">
          {tenantsQuery.data?.map((t) => {
            const tenant: Tenant = {
              id: t.id,
              slug: t.slug,
              name: t.name,
              status: t.status as Tenant["status"],
              planId: t.plan_id,
              createdAt: t.created_at,
              updatedAt: t.updated_at,
            };
            const features = buildTenantFeatures(t.id, t.plan_id);

            return (
              <TenantRow
                key={t.id}
                tenant={tenant}
                features={features}
                onSuspend={() => suspendMutation.mutate(t.id)}
                onResume={() => resumeMutation.mutate(t.id)}
                isSuspending={suspendMutation.isPending}
                isResuming={resumeMutation.isPending}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tenant row component
// ---------------------------------------------------------------------------

interface TenantRowProps {
  tenant: Tenant;
  features: TenantFeatures;
  onSuspend: () => void;
  onResume: () => void;
  isSuspending: boolean;
  isResuming: boolean;
}

function TenantRow({
  tenant,
  features,
  onSuspend,
  onResume,
  isSuspending,
  isResuming,
}: TenantRowProps) {
  const [buildTarget, setBuildTarget] = useState<"android" | "ios">("android");

  const triggerBuild = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/admin/tenants/${tenant.id}/mobile-build`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: buildTarget }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || "Build trigger failed");
      }
      return res.json() as Promise<{ runId: string }>;
    },
    onSuccess: (data) => {
      toast.success(`تم بدء البناء — Run ID: ${data.runId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Build a TenantProvider context value for this specific tenant so the
  // <Feature> component can evaluate the mobile_app flag correctly.
  const tenantContextValue = {
    tenant,
    branding: defaultBranding(tenant.id),
    features,
    subscription: defaultSubscription(tenant),
  };

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Tenant info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm truncate">{tenant.name}</h3>
            <Badge variant={STATUS_VARIANT[tenant.status] ?? "outline"}>
              {tenant.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tenant.slug} · Created{" "}
            {new Date(tenant.createdAt).toLocaleDateString("en-US")}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Suspend / Resume */}
          {tenant.status === "active" || tenant.status === "trialing" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onSuspend}
              disabled={isSuspending}
            >
              <PauseCircle className="h-3.5 w-3.5 me-1" />
              Suspend
            </Button>
          ) : tenant.status === "suspended" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onResume}
              disabled={isResuming}
            >
              <PlayCircle className="h-3.5 w-3.5 me-1" />
              Resume
            </Button>
          ) : null}

          {/* Trigger mobile build — gated by mobile_app feature (Req 9.5) */}
          <TenantProvider value={tenantContextValue}>
            <Feature flag="mobile_app">
              <div className="flex items-center gap-1">
                <select
                  className="text-xs border rounded px-1.5 py-1 bg-background"
                  value={buildTarget}
                  onChange={(e) =>
                    setBuildTarget(e.target.value as "android" | "ios")
                  }
                >
                  <option value="android">Android</option>
                  <option value="ios">iOS</option>
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => triggerBuild.mutate()}
                  disabled={triggerBuild.isPending}
                >
                  <Smartphone className="h-3.5 w-3.5 me-1" />
                  Trigger Build
                </Button>
              </div>
            </Feature>
          </TenantProvider>
        </div>
      </div>
    </Card>
  );
}
