// NEXUS — the EDGE suite gets a VERDICT, not a hand-run.
//
// `mvn -o -B test` in services/java-gateway was, until this row, something a person remembered to run.
// The service suite has its own row (docs/evidence/m7/service-suite-proof.mjs) and the Spring Cloud
// topology has its own (docs/evidence/java/spring-cloud-proof.mjs); the gateway's 22 tests were graded
// by neither, so a red there was visible only to whoever happened to run Maven. This proof closes that:
// it runs the whole suite, asserts the totals, and REFUSES if the graded tree moved underneath it.
//
// It grades the WORKING TREE's gateway sources (committed or not) and says which, because a test run
// always grades what is on disk — claiming otherwise would be the lie.
//
// It shells out through `../lib/syncproc.mjs`, NOT `node:child_process`'s sync API, for the measured
// reason recorded there and in the sibling service-suite proof: on this machine every synchronous
// child-process call fails with EBUSY, and the house rule is that EVERY proof which shells out imports
// that bridge. The JDK is the same shape as the service suites': JDK 25 + Maven (the workflow pins both)
// and an offline-warm ~/.m2, which the workflow's warm step buys online by running this module's
// `package` lifecycle — the test-phase artifacts this row reads are already in the cache it warms.
//
// Run:  node docs/evidence/java/gateway-suite-proof.mjs      (or: npm run verify:gateway-tests)
//
// Totals are DERIVED at §4 from the surefire log (tests, classes and the per-class sum), never restated
// in this comment: a quoted count is the next thing that goes stale — the rule the sibling row applied.
// sweep-budget-ms: 1200000
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, syncApiIsBroken } from '../lib/syncproc.mjs';

const ROOT = 'services/java-gateway';
const SKIP = process.argv.includes('--skip-if-no-maven');

/** Every `.java` under the gateway plus its pom, digested in a stable order. */
function digestGateway() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.java')) files.push(p);
    }
  };
  walk(join(ROOT, 'src'));
  files.push(join(ROOT, 'pom.xml'));
  const h = createHash('sha256');
  for (const p of files.sort()) {
    h.update(p.replace(/\\/g, '/'));
    h.update('\0');
    h.update(readFileSync(p));
    h.update('\0');
  }
  return { digest: h.digest('hex').slice(0, 16), files: files.length };
}

/** `true` when a working Maven + JDK answers; a machine without them cannot grade the gateway. */
function mavenAvailable() {
  try {
    execFileSync('mvn', ['-v'], { encoding: 'utf8', timeout: 60_000, shell: true });
    return true;
  } catch {
    return false;
  }
}

// ── §0 the toolchain ────────────────────────────────────────────────────────────────────────────────
if (!mavenAvailable()) {
  const line = '[§0] SKIPPED — no Maven on this machine, so the gateway suite is NOT graded here (not a pass)';
  if (SKIP) {
    console.log(line);
    process.exit(0);
  }
  throw new Error(`${line}; pass --skip-if-no-maven to treat that as a skip`);
}
const bridge = syncApiIsBroken()
  ? 'BROKEN — this proof runs on the syncproc bridge, exactly as the house rule requires'
  : 'healthy — the bridge is used anyway, because the rule does not depend on the host it runs on';
console.log(`[§0] toolchain: Maven answers · the REAL sync API on this host is ${bridge}`);

// ── §1 digest, run, digest ──────────────────────────────────────────────────────────────────────────
const before = digestGateway();
console.log(`[§1] digesting ${before.files} gateway source file(s) — ${before.digest}`);

// `out` is assigned on every path through the try/catch; seeding a never-read `''` is the exact shape
// the lint gate refuses (`no-useless-assignment` — hosted CI came red on it as the evidence lane landed,
// 2026-11-11). No seed, no dead store.
let out;
let exit = 0;
const started = Date.now();
try {
  out = execFileSync('mvn', ['-o', '-B', 'test'], { cwd: ROOT, encoding: 'utf8', timeout: 900_000, shell: true });
} catch (e) {
  // A red suite is a RESULT to report, not a crash: keep the log so the totals below can name it.
  out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  exit = typeof e.status === 'number' ? e.status : 1;
}
const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`[§2] mvn -o -B test — exit ${exit} in ${seconds}s`);

// ── §3 the tree must not have moved under the run ───────────────────────────────────────────────────
const after = digestGateway();
assert.equal(
  after.digest,
  before.digest,
  `the graded tree changed underneath this run: digest ${before.digest} before mvn, ${after.digest} after — the suite was graded while its sources moved`,
);
console.log(`[§3] nothing moved: digest ${before.digest} before and after`);

// ── §4 the totals, asserted ─────────────────────────────────────────────────────────────────────────
// Surefire prints one line per class (ending `-- in <class>`) and a final TOTAL line without it. Take the
// last line that does NOT name a class: that is the summary, whatever order the classes ran in.
const lines = out.split(/\r?\n/);
const parse = (line) => {
  const m = /Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/.exec(line);
  return m ? { tests: Number(m[1]), failures: Number(m[2]), errors: Number(m[3]), skipped: Number(m[4]) } : null;
};
const perClass = lines.filter((l) => /-- in /.test(l)).map(parse).filter(Boolean);
const totalLine = [...lines].reverse().find((l) => !/-- in /.test(l) && parse(l));
assert.ok(totalLine, `no surefire total in the log (exit ${exit}) — the run produced no summary to grade:\n${lines.slice(-15).join('\n')}`);
const total = parse(totalLine);

assert.equal(total.failures, 0, `${total.failures} Java test(s) FAILED — see the mvn log above`);
assert.equal(total.errors, 0, `${total.errors} Java test(s) ERRORED — see the mvn log above`);
assert.ok(total.tests > 0, 'the suite reported 0 tests, which is a census hole rather than a pass');
assert.equal(exit, 0, `mvn exited ${exit} while the surefire totals read clean — the build failed somewhere the tests do not cover`);
// Every test class on disk must appear in the run — *.Test.java AND *.Tests.java, both spellings ship.
const classCount = (() => {
  let n = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/Tests?\.java$/.test(name)) n += 1;
    }
  };
  walk(join(ROOT, 'src/test'));
  return n;
})();
assert.equal(
  perClass.length,
  classCount,
  `${classCount} test class(es) on disk but ${perClass.length} reported a total — a class was skipped by configuration, and its tests are silently absent from the grade`,
);

const sum = perClass.reduce((a, c) => a + c.tests, 0);
assert.equal(sum, total.tests, `the per-class totals sum to ${sum} but the summary says ${total.tests}`);
console.log(`[§4] ${total.tests} tests in ${perClass.length} class(es) · failures ${total.failures} · errors ${total.errors} · skipped ${total.skipped} · per-class sum ${sum} agrees`);

// ── §5 what was graded ──────────────────────────────────────────────────────────────────────────────
const dirty = (() => {
  try {
    return execFileSync('git', ['status', '--porcelain', '--', ROOT], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();
console.log(
  `[§5] graded the WORKING TREE at digest ${before.digest}; ${dirty ? `uncommitted under ${ROOT}:\n${dirty}` : `nothing under ${ROOT} is uncommitted`}`,
);
console.log('[gateway-suite-proof] ALL SECTIONS PASSED');
