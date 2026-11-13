import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * §DB-perf (2026-11-11) — the domain service's database connection is TUNED, not defaulted.
 *
 * The topology proof and the service suite grade running processes; neither one can see a connection
 * pool that was left at HikariCP's defaults. But a pool at defaults on a host with 2.5 GB free RAM and
 * five JVMs is a real, named hazard: ten idle connections holding the OS file cache down, and zero
 * plan caching on the driver so every repeated JPA query re-parses. This file grades the BYTES of the
 * configuration — the same discipline as the metrics-surface gate — so a revert to defaults is a red
 * test, not a silent regression.
 *
 * What this file canNOT prove: that the pool survives load, or that the driver cache actually warms.
 * Those need a running database under load, which is the EXPLAIN proof's job (db-index-explain.test.ts).
 * Here the configuration is graded, not a process.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const DOMAIN_YML = join(
  REPO_ROOT,
  'services/java-domain-service/src/main/resources/application.yml',
);
const MIGRATION_0047 = join(REPO_ROOT, 'infra/migrations/0047_soft_delete_partial_indexes.sql');

/** Read the `datasource:` block of the domain yml as raw text (no YAML parse — robust to comments). */
function datasourceBlock(file: string): string {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('datasource:');
  expect(start, `${file} must declare a datasource`).toBeGreaterThan(-1);
  // Take everything up to the next top-level key (`jpa:`, `logging:`, `management:` …).
  const rest = text.slice(start);
  const nextTop = rest.search(/\n[a-z]/);
  return nextTop === -1 ? rest : rest.slice(0, nextTop);
}

describe('domain datasource is tuned, not defaulted', () => {
  const yml = readFileSync(DOMAIN_YML, 'utf8');
  const block = datasourceBlock(DOMAIN_YML);

  it('carries an explicit HikariCP pool block', () => {
    expect(block).toContain('hikari:');
    expect(block).toContain('maximum-pool-size');
    expect(block).toContain('leak-detection-threshold');
  });

  it('keeps the pool small enough for a 2.5 GB-free host running five JVMs', () => {
    const m = block.match(/maximum-pool-size:\s*(\d+)/);
    expect(m, 'maximum-pool-size must be a number').not.toBeNull();
    const size = Number(m![1]);
    expect(size, `pool of ${size} is too large for this host; keep it <= 12`).toBeLessThanOrEqual(12);
    expect(size, `pool of ${size} is too small to do any work; keep it >= 4`).toBeGreaterThanOrEqual(4);
  });

  it('detects leaked connections instead of exhausting the pool silently', () => {
    const m = block.match(/leak-detection-threshold:\s*(\d+)/);
    expect(m, 'leak-detection-threshold must be set').not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
  });

  it('turns on the pgjdbc plan cache and batched fetches in the JDBC URL', () => {
    const urlMatch = yml.match(/url:\s*\$\{[^}]*jdbc:postgresql:\/\/[^?]*\?([^}\n]*)/);
    expect(urlMatch, 'the JDBC url must carry pgjdbc tuning parameters').not.toBeNull();
    const params = urlMatch![1];
    expect(params, 'prepareThreshold caches server-side plans for repeated JPA queries').toContain(
      'prepareThreshold=',
    );
    expect(params, 'preparedStatementCacheQueries keeps those plans across connections').toContain(
      'preparedStatementCacheQueries=',
    );
    expect(params, 'defaultRowFetchSize batches rows and cuts network round-trips').toContain(
      'defaultRowFetchSize=',
    );
  });
});

describe('soft-delete hot paths have partial indexes (smaller, hotter than the full ones)', () => {
  const migration = readFileSync(MIGRATION_0047, 'utf8');

  it('adds a partial index for owner_id soft-delete scans', () => {
    expect(migration).toContain('projects_owner_live_idx');
    expect(migration).toContain('WHERE "projects"."deleted_at" is null');
  });

  it('adds a partial index for fork_of soft-delete scans', () => {
    expect(migration).toContain('projects_fork_of_live_idx');
    expect(migration).toContain('WHERE "projects"."deleted_at" is null');
  });

  it('is re-runnable (IF NOT EXISTS) and touches no data', () => {
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS');
  });
});
