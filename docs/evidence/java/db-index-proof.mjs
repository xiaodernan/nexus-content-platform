// NEXUS — the soft-delete queries on `projects` take an INDEX SCAN, not a seq scan (§DB-perf).
//
// The static gate (apps/web/test/db-performance-surface.test.ts) grades the CONFIGURATION: the pool is
// tuned and the partial indexes are DECLARED. This proof grades the CONSEQUENCE: that Postgres, with
// realistic row counts, actually walks the index for the four queries `ProjectRepository` issues. A
// declared index is not the same as a used one — a wrong column order or a planner that prefers a seq
// scan for a small table would leave the gate green and the query slow. Here the plan is read, not assumed.
//
// It builds a throwaway TEMP table (auto-dropped at session end) mirroring `projects` with the SAME index
// shape as 0000_init + 0047, loads 2000 rows with a realistic soft-delete ratio, and EXPLAINs each query.
// No production data is touched. `enable_seqscan = off` forces the planner to REVEAL index paths: a tiny
// table is cheaper to seq-scan, so on 2000 rows Postgres would "honestly" choose a seq scan and this proof
// would say the index is unused when it is merely unused-for-a-trivially-small-table. The switch shows
// whether an index path EXISTS for each WHERE — which is the thing under test.
//
// Runs only where a Postgres answers (the proof host has nexus-postgres on 55100). Elsewhere it skips —
// a proof that needs a database cannot grade one that isn't there; "skipped" is honest, not "passed".
//
// Run:  node docs/evidence/java/db-index-proof.mjs            (or: npm run verify:db-index)
//       node docs/evidence/java/db-index-proof.mjs --strict   (treat "no database" as a hard failure)

import assert from 'node:assert/strict';
import postgres from 'postgres';

const STRICT = process.argv.includes('--strict');

const CANDIDATES = [
  process.env.NEXUS_DB_URL,
  'postgres://nexus:nexus_dev_only@127.0.0.1:55100/nexus',
  'postgres://nexus:nexus@127.0.0.1:55100/nexus',
  'postgres://nexus:nexus_dev_only@127.0.0.1:55433/nexus',
].filter(Boolean);

async function connect() {
  for (const url of CANDIDATES) {
    try {
      const sql = postgres(url, { max: 1, connect_timeout: 10 });
      await sql`select 1`;
      return { sql, url };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const connected = await connect();
if (!connected) {
  const line = '[§0] SKIPPED — no Postgres reachable, so the soft-delete index paths are NOT graded here (not a pass)';
  if (STRICT) throw new Error(`${line}; pass --strict to treat that as a skip`);
  console.log(line);
  process.exit(0);
}
const { sql } = connected;
console.log('[§0] toolchain: Postgres answers · building the throwaway mirror of `projects`');

await sql`set enable_seqscan = off`;
await sql`
  create temp table explain_projects (
    id uuid primary key,
    owner_id uuid not null,
    slug text not null,
    visibility text not null,
    fork_of uuid,
    deleted_at timestamptz
  )`;
await sql`create index projects_owner_idx on explain_projects (owner_id)`;
await sql`create unique index projects_owner_slug_key on explain_projects (owner_id, slug)`;
await sql`create index projects_visibility_idx on explain_projects (visibility) where deleted_at is null`;
await sql`create index projects_fork_of_idx on explain_projects (fork_of)`;
await sql`create index projects_owner_live_idx on explain_projects (owner_id) where deleted_at is null`;
await sql`create index projects_fork_of_live_idx on explain_projects (fork_of) where deleted_at is null`;
await sql`insert into explain_projects (id, owner_id, slug, visibility, fork_of, deleted_at)
  select gen_random_uuid(), gen_random_uuid(), 's' || g,
         (array['public','private','unlisted'])[1 + (g % 3)],
         case when g % 11 = 0 then gen_random_uuid() end,
         case when g % 13 = 0 then now() else null end
  from generate_series(1, 2000) as g`;
console.log('[§1] mirror built: 2000 rows, ~8% soft-deleted, indexes shaped like 0000_init + 0047');

const plan = async (label, query, mustContain) => {
  const rows = await sql.unsafe(`explain ${query}`);
  // EXPLAIN returns one column named "QUERY PLAN"; read it regardless of how the client keys it.
  const text = rows.map((r) => r['QUERY PLAN'] ?? r.query_plan ?? Object.values(r)[0] ?? '').join('\n');
  assert.ok(text.includes('Index Scan'), `[§2] ${label}: expected an Index Scan, got:\n${text}`);
  if (mustContain) {
    assert.ok(
      text.toLowerCase().includes(mustContain.toLowerCase()),
      `[§2] ${label}: plan does not name the expected column (${mustContain}):\n${text}`,
    );
  }
  console.log(`[§2] ${label}: Index Scan ✓`);
};

await plan(
  'owner_id soft-delete scan',
  `select id from explain_projects where owner_id = gen_random_uuid() and deleted_at is null`,
  'owner',
);
await plan(
  'owner_id + slug lookup',
  `select id from explain_projects where owner_id = gen_random_uuid() and slug = 'x' and deleted_at is null`,
);
await plan(
  'visibility soft-delete scan',
  `select id from explain_projects where visibility = 'public' and deleted_at is null`,
  'visibility',
);
await plan(
  'fork_of soft-delete scan',
  `select id from explain_projects where fork_of = gen_random_uuid() and deleted_at is null`,
  'fork',
);

console.log('[db-index-proof] ALL SECTIONS PASSED — the four soft-delete queries take an index path');
await sql.end();
process.exit(0);
