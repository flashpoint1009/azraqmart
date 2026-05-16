-- Migration: enforce "at most one primary domain per tenant" on
-- `public.tenant_domains` via a partial unique index.
--
-- Source of truth:
--   - .kiro/specs/white-label-saas-system/requirements.md
--       Requirement 8.8: "THE System SHALL allow at most one
--       `tenant_domains` row per tenant with `is_primary=true`."
--   - .kiro/specs/white-label-saas-system/design.md
--       §"Model: TenantDomain" / "Validation Rules":
--       "Only one isPrimary=true per tenant."
--
-- The base `tenant_domains` table is created in
-- `20250101000000_tenancy_baseline.sql`, which intentionally defers this
-- constraint to a follow-up migration (task 14.4). A regular UNIQUE
-- constraint on `tenant_id` alone would forbid multiple non-primary
-- domains per tenant, which we want to allow. Postgres' partial unique
-- index lets us scope uniqueness to rows matching the predicate
-- `is_primary = true`, leaving non-primary rows unconstrained.
--
-- The index is named explicitly (`uniq_tenant_domains_primary`) so it can
-- be referenced by `COMMENT ON INDEX` and dropped in a reversible
-- migration if ever needed. `CREATE UNIQUE INDEX IF NOT EXISTS` keeps the
-- migration idempotent across re-runs.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_domains_primary
  ON public.tenant_domains (tenant_id)
  WHERE is_primary = true;

COMMENT ON INDEX public.uniq_tenant_domains_primary IS
  'Partial unique index — at most one primary domain per tenant.';
