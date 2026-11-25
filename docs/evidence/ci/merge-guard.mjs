/**
 * NEXUS §157 — merge regression guard.
 *
 * WHY THIS EXISTS (measured, not remembered): across 2026-11-24/25 a parallel line whose
 * merge-base predated several fixes kept reintroducing the SAME defects on every merge,
 * and each one only surfaced as a RED hosted CI job ~40 minutes later:
 *
 *   1. topology job's `NEXUS_DOMAIN_DB_URL` env was dropped → domain-service could not
 *      reach CI's 55433 Postgres → Hibernate "Unable to determine Dialect".
 *   2. `verify-actuator.mts` reverted to a hard-coded 5433 maintenance connection →
 *      ECONNREFUSED before any JVM started.
 *   3. `.scratch` exemption in lint-tree vanished → the area crashed (all files ignored).
 *   4. New root `scripts/*.mjs` were not registered in tsconfig.tools/eslint config →
 *      lint-tree PARSE errors (rules never saw those files).
 *   5. record-encoding's `LOOKALIKE` roster lost its island amendments → S2b RED.
 *
 * All five are CHEAP to check locally and EXPENSIVE to discover on hosted CI. This guard
 * turns the five into a sub-second local gate: run `npm run verify:merge-guard` after any
 * merge, before push, and a regression is named at once instead of 40 minutes later.
 *
 * Read-only: this script never edits a file. It exits 1 with every failing check listed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p) => {
  try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return null; }
};
const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${detail}`);
};

// 1. topology job DB env
const workflow = read('.github/workflows/main-line.yml') || '';
check('topology DB env',
  workflow.includes('NEXUS_DOMAIN_DB_URL: jdbc:postgresql://127.0.0.1:55433/nexus') &&
  workflow.includes('NEXUS_DOMAIN_PG_PORT: 55433'),
  'topology job lost NEXUS_DOMAIN_DB_URL / PG_PORT (domain-service will not reach CI Postgres)');

// 2. actuator DB URL parsing (not a hard-coded maintenance connection)
const actuator = read('scripts/verify-actuator.mts') || '';
check('actuator DB parsing',
  actuator.includes('function apiDatabaseTarget') && actuator.includes('apiDatabaseTarget(API_DB_URL)'),
  'verify-actuator.mts lost apiDatabaseTarget() — maintenance connection is hard-coded again');

// 3. .scratch exemption
const lintTree = read('tools/ci/lint-tree.mjs') || '';
check('lint-tree .scratch exemption',
  lintTree.includes("dir: '.scratch'"),
  'lint-tree lost the .scratch exemption — the area will crash (all files ignored)');

// 4. root scripts registration in both configs
const tsconfigTools = read('tsconfig.tools.json') || '';
const eslintConfig = read('eslint.config.mjs') || '';
for (const script of ['stress-gateway', 'check-web-health', 'diagnose-connectivity', 'start-web-clean']) {
  check(`script registered: ${script}`,
    tsconfigTools.includes(`scripts/${script}.mjs`) && eslintConfig.includes(`scripts/${script}.mjs`),
    'not in both tsconfig.tools.json and eslint.config.mjs — lint-tree will report PARSE');
}

// 5. record-encoding island roster amendments
const proof = read('docs/evidence/agents/record-encoding-proof.mjs') || '';
check('record-encoding island roster',
  (proof.match(/"i":\[36335\]/g) || []).length >= 15 &&
  proof.includes('stress-gentle-dev-lowmem-2026-11-25.md'),
  'island roster lost amendments — S2b will refuse new render-bearing lines');

// 6. 两道登录闸必须在规则真值表里（否则管理员面板端不出撞库防护）
const rateRules = read('apps/web/src/server/security/rateLimit.ts') || '';
const insightRoute = read('apps/web/src/app/api/insight/login/route.ts') || '';
const authRoute = read('apps/web/src/app/api/auth/login/route.ts') || '';
check('login gates in rate table',
  rateRules.includes("'auth/login':") && rateRules.includes("'insight/login':") &&
  insightRoute.includes("IP_RATE_RULES['insight/login']") &&
  authRoute.includes("IP_RATE_RULES['auth/login']"),
  'login gates missing from IP_RATE_RULES or routes reverted to hard-coded numbers');

// 7. world-bible bilingual parity (cheap, already proven but cheap to recheck)
// (skipped here: verify:world-bible is the authority for that)

if (failures.length) {
  console.error('MERGE GUARD FAILED — these regressed after a merge:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('MERGE GUARD OK — no known CI-critical config regressed');
