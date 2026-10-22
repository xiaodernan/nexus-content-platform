// NEXUS — the SERVICE suite gets a VERDICT, not a hand-run.
//
// _Ledger note: the ADR entry is DEFERRED — the ledger file and the m7 README both hold another lane's
// uncommitted changes, so appending here would stage their bytes. This file cites no version number._
//
// `npm run verify:api-tests` runs the Java tests and a human reads the log; nothing asserts the totals, and the
// doc gate grades only the two vitest arms, so a failing Java test would be visible only to whoever remembered
// to run Maven. This proof closes that: it runs the whole suite, asserts the totals, and REFUSES if the graded
// tree moved underneath it — the same rule the doc gate's §6 applies to the vitest arms.
//
// It grades the WORKING TREE's service sources (committed or not) and says which, because a test run always
// grades what is on disk — claiming otherwise would be the lie.
//
// Run:  node docs/evidence/m7/service-suite-proof.mjs      (or: npm run verify:service)
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'services/nexus-api';
const SKIP = process.argv.includes('--skip-if-no-maven');

/** Every `.java` under the service plus its pom, digested in a stable order. */
function digestService() {
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

/** `true` when a working Maven + JDK answers; a machine without them cannot grade the service. */
function mavenAvailable() {
  try {
    execSync('mvn -v', { stdio: 'ignore', timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

// ── §0 the toolchain ────────────────────────────────────────────────────────────────────────────────
if (!mavenAvailable()) {
  const line = '[§0] SKIPPED — no Maven on this machine, so the service suite is NOT graded here (not a pass)';
  if (SKIP) {
    console.log(line);
    process.exit(0);
  }
  throw new Error(`${line}; pass --skip-if-no-maven to treat that as a skip`);
}
console.log('[§0] toolchain: Maven answers');

// ── §1 digest, run, digest ──────────────────────────────────────────────────────────────────────────
const before = digestService();
console.log(`[§1] digesting ${before.files} service source file(s) → ${before.digest}`);

let out = '';
let exit = 0;
const started = Date.now();
try {
  out = execSync('mvn -o -B test', { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 900_000 });
} catch (e) {
  // A red suite is a RESULT to report, not a crash: keep the log so the totals below can name it.
  out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  exit = typeof e.status === 'number' ? e.status : 1;
}
const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`[§2] mvn -o -B test → exit ${exit} in ${seconds}s`);

// ── §3 the tree must not have moved under the run ───────────────────────────────────────────────────
const after = digestService();
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
// Every test class on disk must appear in the run, or a class was skipped by configuration and the total is
// smaller than the tree claims (the "dropped file reads as a missing one" failure the vitest arms guard).
const classCount = (() => {
  let n = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('Test.java')) n += 1;
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
    return execSync(`git status --porcelain -- ${ROOT}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();
console.log(
  `[§5] graded the WORKING TREE at digest ${before.digest}; ${dirty ? `uncommitted under ${ROOT}:\n${dirty}` : `nothing under ${ROOT} is uncommitted`}`,
);
console.log('[service-suite-proof] ALL SECTIONS PASSED');
