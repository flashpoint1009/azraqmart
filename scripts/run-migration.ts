/**
 * Migration Runner Script
 *
 * Idempotent driver that applies the white-label SaaS migrations (tasks 1.3 → 14.4)
 * in the documented phase order. Prints which phase boundary the DB is at and aborts
 * on integrity errors so the platform stays operational at every step.
 *
 * Usage:
 *   npx tsx scripts/run-migration.ts [--dry-run] [--up-to-phase <N>]
 *
 * Environment:
 *   DATABASE_URL              — Direct Postgres connection string (preferred)
 *   SUPABASE_URL              — Supabase project URL (fallback)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (used with SUPABASE_URL)
 *
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MigrationEntry {
  /** File name (without directory) */
  filename: string;
  /** Task reference from the spec (e.g., "1.3") */
  task: string;
  /** Human-readable description */
  description: string;
  /** Migration phase boundary (0-9) */
  phase: number;
}

interface PhaseInfo {
  phase: number;
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Phase definitions (from design.md migration table)
// ---------------------------------------------------------------------------

const PHASES: PhaseInfo[] = [
  { phase: 0, name: 'Baseline', description: 'Snapshot DB; freeze schema' },
  { phase: 1, name: 'Platform Tables', description: 'Create tenants, tenant_branding, tenant_features, plans, tenant_billing, user_tenant_roles' },
  { phase: 2, name: 'Add tenant_id', description: 'Add tenant_id columns to domain tables, backfill, set NOT NULL' },
  { phase: 3, name: 'Shadow RLS', description: 'Enable RLS in shadow/permissive mode; log violations' },
  { phase: 4, name: 'Wire Resolver', description: 'Tenant resolver middleware + TenantContext + withTenantScope' },
  { phase: 5, name: 'Refactor Data Calls', description: 'Replace direct Supabase queries with tenant-scoped wrappers' },
  { phase: 6, name: 'Strict RLS', description: 'Switch policies to deny-by-default' },
  { phase: 7, name: 'Multi-tenant Features', description: 'Custom domains, branding, feature flags, billing, super-admin' },
  { phase: 8, name: 'Mobile Builds', description: 'Per-tenant Capacitor builds via GitHub Actions' },
  { phase: 9, name: 'Second Tenant Validation', description: 'Provision second tenant; cross-tenant security tests' },
];

// ---------------------------------------------------------------------------
// Ordered migration manifest (tasks 1.3 → 14.4)
//
// Each entry maps a SQL migration file to its task, phase, and description.
// The order here is the canonical application order.
// ---------------------------------------------------------------------------

const MIGRATION_MANIFEST: MigrationEntry[] = [
  // Phase 1: Platform tables
  {
    filename: '20250101000000_tenancy_baseline.sql',
    task: '1.3',
    description: 'Create platform tables (tenants, plans, tenant_branding, etc.)',
    phase: 1,
  },

  // Phase 2: Add tenant_id to domain tables
  {
    filename: '20260601000100_default_tenant.sql',
    task: '2.1',
    description: 'Insert default azraqmart tenant',
    phase: 2,
  },
  {
    filename: '20260601000200_add_tenant_id.sql',
    task: '2.2',
    description: 'Add nullable tenant_id, backfill to default tenant, set NOT NULL',
    phase: 2,
  },
  {
    filename: '20260601000300_indexes.sql',
    task: '2.3',
    description: 'Add composite (tenant_id, primary_sort_col) indexes',
    phase: 2,
  },

  // Phase 3: Shadow RLS
  {
    filename: '20260601000400_rls_shadow.sql',
    task: '3.1',
    description: 'Enable RLS in shadow/permissive mode with violation logging',
    phase: 3,
  },
  {
    filename: '20260601000500_rls_template.sql',
    task: '3.2',
    description: 'RLS policy template DDL function (apply_tenant_rls_policy)',
    phase: 3,
  },

  // Phase 4: Wire resolver (includes GUC helper)
  {
    filename: '20260601000550_set_tenant_guc.sql',
    task: '4.6',
    description: 'set_tenant_guc RPC for withTenantScope',
    phase: 4,
  },

  // Phase 6: Strict RLS
  {
    filename: '20260601001000_strict_rls.sql',
    task: '7.1',
    description: 'Switch RLS policies to deny-by-default',
    phase: 6,
  },

  // Phase 7: Multi-tenant features (owner constraint, status transitions, domains)
  {
    filename: '20260601000700_owner_constraint.sql',
    task: '10.5',
    description: 'Single-owner partial unique index + transfer_ownership function',
    phase: 7,
  },
  {
    filename: '20260601000900_status_transition_trigger.sql',
    task: '12.4',
    description: 'Status transition state machine trigger',
    phase: 7,
  },
  {
    filename: '20260601000800_primary_domain.sql',
    task: '14.4',
    description: 'Single primary-domain partial unique index on tenant_domains',
    phase: 7,
  },
  {
    filename: '20260601001100_tenant_domains_failed.sql',
    task: '14.5',
    description: 'Domain re-check failed status support',
    phase: 7,
  },
];

// ---------------------------------------------------------------------------
// Migration tracking table DDL
// ---------------------------------------------------------------------------

const TRACKING_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS public._migration_runner_log (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  task TEXT NOT NULL,
  phase INTEGER NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT NOT NULL
);
`;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function computeChecksum(content: string): string {
  // FNV-1a 32-bit hash for fast idempotency checks
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getMigrationsDir(): string {
  const scriptDir = import.meta.dirname ?? resolve(process.cwd(), 'scripts');
  const root = resolve(scriptDir, '..');
  return join(root, 'supabase', 'migrations');
}

function readMigrationFile(filename: string): string {
  const filepath = join(getMigrationsDir(), filename);
  if (!existsSync(filepath)) {
    throw new Error(`Migration file not found: ${filepath}`);
  }
  return readFileSync(filepath, 'utf-8');
}

function parseArgs(): { dryRun: boolean; upToPhase: number } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let upToPhase = 9;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--up-to-phase' && args[i + 1]) {
      upToPhase = parseInt(args[i + 1], 10);
      if (isNaN(upToPhase) || upToPhase < 1 || upToPhase > 9) {
        console.error('Error: --up-to-phase must be between 1 and 9');
        process.exit(1);
      }
      i++;
    }
  }

  return { dryRun, upToPhase };
}

// ---------------------------------------------------------------------------
// Database interaction
//
// Strategy:
//   1. If DATABASE_URL is set, use psql via child_process (most reliable for DDL)
//   2. Otherwise, use Supabase HTTP SQL endpoint (project REST API)
// ---------------------------------------------------------------------------

interface DbExecutor {
  execute(sql: string): Promise<{ error: string | null }>;
  query<T>(sql: string): Promise<{ data: T[] | null; error: string | null }>;
}

/**
 * Executor using psql via DATABASE_URL (preferred for DDL migrations)
 */
function createPsqlExecutor(databaseUrl: string): DbExecutor {
  return {
    async execute(sql: string): Promise<{ error: string | null }> {
      try {
        execSync(`psql "${databaseUrl}" -v ON_ERROR_STOP=1`, {
          input: sql,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 120_000,
        });
        return { error: null };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: msg.slice(0, 500) };
      }
    },
    async query<T>(sql: string): Promise<{ data: T[] | null; error: string | null }> {
      try {
        const result = execSync(
          `psql "${databaseUrl}" -v ON_ERROR_STOP=1 -t -A -F '|' -c "${sql.replace(/"/g, '\\"')}"`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000 }
        );
        // Parse psql tabular output — limited to simple queries
        const lines = result.trim().split('\n').filter(Boolean);
        const data = lines.map((line) => {
          // For simple key=value queries, return as object
          const parts = line.split('|');
          return parts as unknown as T;
        });
        return { data, error: null };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { data: null, error: msg.slice(0, 500) };
      }
    },
  };
}

/**
 * Executor using Supabase HTTP API (fallback when no direct DB access)
 * Uses the /rest/v1/rpc endpoint with a helper function, or the
 * Supabase Management API SQL endpoint.
 */
function createSupabaseExecutor(url: string, serviceRoleKey: string): DbExecutor {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
  };

  return {
    async execute(sql: string): Promise<{ error: string | null }> {
      // Try the Supabase SQL endpoint (available on hosted Supabase)
      const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ query: sql }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { error: `HTTP ${response.status}: ${text.slice(0, 300)}` };
      }
      return { error: null };
    },
    async query<T>(sql: string): Promise<{ data: T[] | null; error: string | null }> {
      const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ query: sql }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { data: null, error: `HTTP ${response.status}: ${text.slice(0, 300)}` };
      }

      const data = await response.json();
      return { data: data as T[], error: null };
    },
  };
}

function createExecutor(): DbExecutor {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    console.log('  Using: Direct Postgres connection (DATABASE_URL)');
    return createPsqlExecutor(databaseUrl);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceRoleKey) {
    console.log('  Using: Supabase HTTP API (SUPABASE_URL)');
    console.log('  Note: Requires exec_sql RPC function. Use DATABASE_URL for full DDL support.');
    return createSupabaseExecutor(supabaseUrl, serviceRoleKey);
  }

  console.error('Error: Set DATABASE_URL (preferred) or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Core migration logic
// ---------------------------------------------------------------------------

async function ensureTrackingTable(db: DbExecutor): Promise<void> {
  const { error } = await db.execute(TRACKING_TABLE_DDL);
  if (error) {
    // If the table already exists, this is fine (CREATE IF NOT EXISTS)
    // Only warn if it's a real connectivity issue
    if (error.includes('connection') || error.includes('FATAL')) {
      console.error(`  ✗ Cannot connect to database: ${error}`);
      process.exit(1);
    }
    // Otherwise the table likely already exists
  }
}

async function getAppliedMigrations(db: DbExecutor): Promise<Map<string, string>> {
  const sql = `SELECT filename, checksum FROM public._migration_runner_log ORDER BY id`;
  const { data, error } = await db.query<{ filename: string; checksum: string }>(sql);

  if (error) {
    // Table might not exist yet — return empty map
    return new Map();
  }

  const map = new Map<string, string>();
  if (data) {
    for (const row of data) {
      // Handle both object format and array format from psql
      if (typeof row === 'object' && row !== null && 'filename' in row) {
        map.set(row.filename, row.checksum);
      }
    }
  }
  return map;
}

async function recordMigration(
  db: DbExecutor,
  entry: MigrationEntry,
  checksum: string
): Promise<void> {
  const sql = `
    INSERT INTO public._migration_runner_log (filename, task, phase, checksum)
    VALUES ('${entry.filename.replace(/'/g, "''")}', '${entry.task}', ${entry.phase}, '${checksum}')
    ON CONFLICT (filename) DO NOTHING;
  `;
  await db.execute(sql);
}

function getCurrentPhase(applied: Map<string, string>): number {
  let maxPhase = 0;
  for (const entry of MIGRATION_MANIFEST) {
    if (applied.has(entry.filename)) {
      maxPhase = Math.max(maxPhase, entry.phase);
    }
  }
  return maxPhase;
}

function isPhaseComplete(phase: number, applied: Map<string, string>): boolean {
  const phaseMigrations = MIGRATION_MANIFEST.filter((m) => m.phase === phase);
  return phaseMigrations.every((m) => applied.has(m.filename));
}

function getPhaseStatus(applied: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const phaseInfo of PHASES) {
    if (phaseInfo.phase === 0) continue; // Baseline is implicit

    const phaseMigrations = MIGRATION_MANIFEST.filter((m) => m.phase === phaseInfo.phase);
    if (phaseMigrations.length === 0) {
      lines.push(`  Phase ${phaseInfo.phase} (${phaseInfo.name}): no SQL migrations`);
      continue;
    }

    const appliedCount = phaseMigrations.filter((m) => applied.has(m.filename)).length;
    const total = phaseMigrations.length;
    const status =
      appliedCount === total
        ? '✓ complete'
        : appliedCount === 0
          ? '○ pending'
          : `◐ partial (${appliedCount}/${total})`;

    lines.push(`  Phase ${phaseInfo.phase} (${phaseInfo.name}): ${status}`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Integrity checks — run at each phase boundary to ensure the platform
// stays operational. Aborts on failure per Requirement 11.6.
// ---------------------------------------------------------------------------

interface IntegrityCheck {
  name: string;
  /** Minimum phase at which this check becomes relevant */
  minPhase: number;
  sql: string;
  validate: (result: unknown[]) => { ok: boolean; message: string };
}

const INTEGRITY_CHECKS: IntegrityCheck[] = [
  {
    name: 'Platform tables exist',
    minPhase: 1,
    sql: `SELECT COUNT(*) AS cnt FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name IN ('tenants', 'tenant_branding', 'plans', 'tenant_billing', 'user_tenant_roles', 'tenant_features')`,
    validate: (rows) => {
      const row = rows[0] as { cnt: string } | undefined;
      const count = parseInt(row?.cnt ?? '0', 10);
      return {
        ok: count >= 6,
        message: count >= 6 ? `All 6 platform tables present` : `Only ${count}/6 platform tables found`,
      };
    },
  },
  {
    name: 'Default azraqmart tenant exists',
    minPhase: 2,
    sql: `SELECT COUNT(*) AS cnt FROM public.tenants WHERE slug = 'azraqmart'`,
    validate: (rows) => {
      const row = rows[0] as { cnt: string } | undefined;
      const count = parseInt(row?.cnt ?? '0', 10);
      return {
        ok: count >= 1,
        message: count >= 1 ? 'azraqmart tenant present' : 'azraqmart tenant MISSING',
      };
    },
  },

  {
    name: 'Domain tables have tenant_id NOT NULL',
    minPhase: 2,
    sql: `SELECT c.table_name, c.is_nullable
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
          AND c.column_name = 'tenant_id'
          AND c.table_name IN ('products', 'orders', 'customers')`,
    validate: (rows) => {
      const tableRows = rows as { table_name: string; is_nullable: string }[];
      if (tableRows.length === 0) return { ok: true, message: 'Domain tables not yet created (OK)' };
      const allNotNull = tableRows.every((r) => r.is_nullable === 'NO');
      return {
        ok: allNotNull,
        message: allNotNull
          ? 'All domain tables have tenant_id NOT NULL'
          : `Nullable tenant_id on: ${tableRows.filter((r) => r.is_nullable !== 'NO').map((r) => r.table_name).join(', ')}`,
      };
    },
  },
  {
    name: 'RLS enabled on domain tables',
    minPhase: 3,
    sql: `SELECT tablename, rowsecurity FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename IN ('products', 'orders', 'customers')`,
    validate: (rows) => {
      const tableRows = rows as { tablename: string; rowsecurity: boolean }[];
      if (tableRows.length === 0) return { ok: true, message: 'Domain tables not yet created (OK)' };
      const allEnabled = tableRows.every((r) => r.rowsecurity === true);
      return {
        ok: allEnabled,
        message: allEnabled
          ? 'RLS enabled on all domain tables'
          : `RLS disabled on: ${tableRows.filter((r) => !r.rowsecurity).map((r) => r.tablename).join(', ')}`,
      };
    },
  },

  {
    name: 'Strict RLS policies applied (tenant_isolation exists)',
    minPhase: 6,
    sql: `SELECT COUNT(*) AS cnt FROM pg_policies
          WHERE schemaname = 'public' AND policyname = 'tenant_isolation'`,
    validate: (rows) => {
      const row = rows[0] as { cnt: string } | undefined;
      const count = parseInt(row?.cnt ?? '0', 10);
      return {
        ok: count > 0,
        message: count > 0 ? `${count} tenant_isolation policies active` : 'No tenant_isolation policies found',
      };
    },
  },
  {
    name: 'Owner constraint exists',
    minPhase: 7,
    sql: `SELECT COUNT(*) AS cnt FROM pg_indexes
          WHERE schemaname = 'public'
          AND tablename = 'user_tenant_roles'
          AND indexname LIKE '%owner%'`,
    validate: (rows) => {
      const row = rows[0] as { cnt: string } | undefined;
      const count = parseInt(row?.cnt ?? '0', 10);
      return {
        ok: count >= 1,
        message: count >= 1 ? 'Owner uniqueness constraint present' : 'Owner constraint MISSING',
      };
    },
  },
];

async function runIntegrityChecks(
  db: DbExecutor,
  currentPhase: number
): Promise<{ passed: boolean; results: string[] }> {
  const results: string[] = [];
  let passed = true;

  for (const check of INTEGRITY_CHECKS) {
    if (currentPhase < check.minPhase) continue;

    const { data, error } = await db.query<unknown>(check.sql);
    if (error) {
      results.push(`  ✗ ${check.name}: query error — ${error.slice(0, 200)}`);
      passed = false;
      continue;
    }

    const { ok, message } = check.validate(data ?? []);
    if (ok) {
      results.push(`  ✓ ${check.name}: ${message}`);
    } else {
      results.push(`  ✗ ${check.name}: FAILED — ${message}`);
      passed = false;
    }
  }

  return { passed, results };
}

// ---------------------------------------------------------------------------
// Checksum drift detection
// ---------------------------------------------------------------------------

function detectChecksumDrift(
  applied: Map<string, string>,
  manifest: MigrationEntry[]
): string[] {
  const warnings: string[] = [];
  for (const entry of manifest) {
    const storedChecksum = applied.get(entry.filename);
    if (!storedChecksum) continue;

    try {
      const content = readMigrationFile(entry.filename);
      const currentChecksum = computeChecksum(content);
      if (currentChecksum !== storedChecksum) {
        warnings.push(
          `  ⚠ ${entry.filename} (task ${entry.task}): file changed since last apply ` +
          `(stored: ${storedChecksum}, current: ${currentChecksum})`
        );
      }
    } catch {
      // File might have been removed — not critical for drift detection
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { dryRun, upToPhase } = parseArgs();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  White-Label SaaS Migration Runner                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  if (dryRun) {
    console.log('  Mode: DRY RUN (no changes will be applied)');
  }
  console.log(`  Target: up to Phase ${upToPhase}`);
  console.log();

  const db = createExecutor();
  console.log();

  // Ensure tracking table exists
  await ensureTrackingTable(db);

  // Get already-applied migrations
  const applied = await getAppliedMigrations(db);

  // Print current phase status
  const currentPhase = getCurrentPhase(applied);
  console.log(`  Current DB phase boundary: Phase ${currentPhase} (${PHASES[currentPhase]?.name ?? 'Unknown'})`);
  console.log();
  console.log('  Phase Status:');
  const phaseStatus = getPhaseStatus(applied);
  for (const line of phaseStatus) {
    console.log(line);
  }
  console.log();

  // Check for checksum drift on already-applied migrations
  const driftWarnings = detectChecksumDrift(applied, MIGRATION_MANIFEST);
  if (driftWarnings.length > 0) {
    console.log('  Checksum Drift Warnings:');
    for (const w of driftWarnings) {
      console.log(w);
    }
    console.log();
  }

  // Determine which migrations to apply
  const pending = MIGRATION_MANIFEST.filter(
    (m) => !applied.has(m.filename) && m.phase <= upToPhase
  );

  if (pending.length === 0) {
    console.log(`  All migrations up to Phase ${upToPhase} are already applied. Nothing to do.`);
    console.log();

    // Run integrity checks even when nothing to apply
    console.log('  Running integrity checks...');
    const { passed, results } = await runIntegrityChecks(db, currentPhase);
    for (const line of results) {
      console.log(line);
    }
    if (!passed) {
      console.error('\n  ✗ Integrity checks FAILED. Investigate before proceeding.');
      process.exit(1);
    }
    console.log('\n  ✓ All integrity checks passed. Platform is operational.');
    return;
  }

  console.log(`  Migrations to apply: ${pending.length}`);
  console.log();

  // Apply migrations in order
  let appliedCount = 0;
  let lastCompletedPhase = currentPhase;

  for (const entry of pending) {
    const phaseLabel = `Phase ${entry.phase} (${PHASES[entry.phase]?.name ?? '?'})`;
    console.log(`  [${entry.task}] ${entry.description}`);
    console.log(`         File: ${entry.filename}`);
    console.log(`         Phase: ${phaseLabel}`);

    if (dryRun) {
      console.log('         → SKIPPED (dry run)');
      console.log();
      continue;
    }

    // Read the migration file
    let sql: string;
    try {
      sql = readMigrationFile(entry.filename);
    } catch (err) {
      console.error(`         ✗ ABORT: ${(err as Error).message}`);
      console.error(`\n  Migration aborted. DB remains at Phase ${lastCompletedPhase}.`);
      process.exit(1);
    }

    const checksum = computeChecksum(sql);

    // Execute the migration
    const { error } = await db.execute(sql);

    if (error) {
      console.error(`         ✗ FAILED: ${error}`);
      console.error(`\n  Migration aborted at task ${entry.task}. DB remains operational at Phase ${lastCompletedPhase}.`);
      console.error('  Fix the issue and re-run. Already-applied migrations will be skipped (idempotent).');
      process.exit(1);
    }

    // Record successful application
    await recordMigration(db, entry, checksum);
    applied.set(entry.filename, checksum);
    appliedCount++;

    console.log('         → Applied ✓');

    // Check if we just completed a phase boundary
    if (isPhaseComplete(entry.phase, applied) && entry.phase > lastCompletedPhase) {
      lastCompletedPhase = entry.phase;
      console.log();
      console.log(`  ═══ Phase ${entry.phase} (${PHASES[entry.phase]?.name}) COMPLETE ═══`);

      // Run integrity checks at phase boundary
      console.log('  Running integrity checks at phase boundary...');
      const { passed, results } = await runIntegrityChecks(db, lastCompletedPhase);
      for (const line of results) {
        console.log(line);
      }

      if (!passed) {
        console.error(`\n  ✗ Integrity check FAILED at Phase ${lastCompletedPhase} boundary.`);
        console.error('  The platform must remain operational at every phase boundary (Req 11.6).');
        console.error('  Aborting further migrations. Investigate and fix before re-running.');
        process.exit(1);
      }
      console.log('  ✓ Phase boundary integrity OK');
    }

    console.log();
  }

  // Final summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Migration Complete                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`  Applied: ${appliedCount} migration(s)`);
  console.log(`  DB now at: Phase ${lastCompletedPhase} (${PHASES[lastCompletedPhase]?.name ?? 'Unknown'})`);
  console.log();

  // Final integrity check
  console.log('  Final integrity checks...');
  const { passed, results } = await runIntegrityChecks(db, lastCompletedPhase);
  for (const line of results) {
    console.log(line);
  }
  if (!passed) {
    console.error('\n  ✗ Final integrity checks FAILED.');
    process.exit(1);
  }
  console.log('\n  ✓ All integrity checks passed. Platform is operational.');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
