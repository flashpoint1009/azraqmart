-- Migration: add a `failed` flag to `public.tenant_domains` so the domain
-- re-check cron worker can mark domains that did not verify within 24
-- hours and stop re-running DNS / Cloudflare checks against them.
--
-- Source of truth:
--   - .kiro/specs/white-label-saas-system/requirements.md
--       Requirement 8.9: "WHILE a custom domain remains unverified, THE
--       System SHALL re-check DNS at most every 10 minutes for up to 24
--       hours, after which IF still unverified THEN THE Domain_Manager
--       SHALL mark the domain `failed`."
--   - .kiro/specs/white-label-saas-system/design.md
--       §"Component: Custom Domain Manager".
--
-- The base `tenant_domains` table is created in
-- `20250101000000_tenancy_baseline.sql` with columns id, tenant_id,
-- domain, verification_token, verified, is_primary, created_at — but no
-- `failed` flag. Task 14.5 (`src/server/cron/domain-recheck.ts`) needs
-- a persistent terminal state for the verification state machine so the
-- cron worker can:
--   * filter pending rows efficiently with
--     `WHERE verified = false AND failed = false`;
--   * stop touching rows whose 24h window has elapsed.
--
-- We add it as `boolean NOT NULL DEFAULT false` so existing rows backfill
-- to "still pending / not failed" without any data migration step.
-- `IF NOT EXISTS` keeps the migration idempotent across re-runs.
--
-- The supporting partial index on `created_at` (filtered by the active
-- predicate) keeps the cron worker's two queries cheap even as the
-- `tenant_domains` table grows: both queries scan strictly the active
-- subset, and `created_at` is the column compared against the 24h cutoff.

ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS failed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenant_domains.failed IS
  'Terminal state for the verification state machine — set by the domain re-check cron worker after the 24h window expires (Requirement 8.9).';

CREATE INDEX IF NOT EXISTS idx_tenant_domains_unverified_active
  ON public.tenant_domains (created_at)
  WHERE verified = false AND failed = false;

COMMENT ON INDEX public.idx_tenant_domains_unverified_active IS
  'Partial index used by the domain re-check cron worker (Requirement 8.9) to scan only pending custom domains.';
