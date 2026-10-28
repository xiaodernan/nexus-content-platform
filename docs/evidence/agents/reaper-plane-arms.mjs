// NEXUS v529 (docs/evidence/agents) — THE PLATFORM ANSWER GATES THE BUILT-IN REAPER AND NEVER THE
// OPERATOR'S, AND WHICH CELLS MOVE IS MEASURED, NOT ASSERTED (ADR 0016 amendment 515).
//
// WHY THIS TOOL EXISTS. `npm run verify:proofs` ran for the first time in run 40603544099 (amendment
// 514 wired it), and the ubuntu box went red on four cases that Windows had always passed. The cause
// was not the OS: the host read `unsupported-platform` — an answer about ITS OWN built-in reaper — as
// a veto over a reaper the CALLER had supplied, so `reapTree: true` + the caller's reaper never
// reached the caller. Nothing in this repository could see that on a Windows box, because there the
// platform answers "yes" and the veto never fires.
//
// WHAT IT GRADES. The compiled rule, four byte-variants of it, over the cells below. Each cell runs
// in a CHILD PROCESS that redefines `process.platform` BEFORE importing the module, because
// `TREE_REAPER_AVAILABLE` is computed at import time — that is the whole trick, and it is why the
// ubuntu plane can be measured from here instead of waited for.
//
//   win32 / mine      the caller's reaper on a plane that also has a built-in   -> 'reaped'
//   linux / mine      the caller's reaper on a plane that has none              -> 'reaped' (v529)
//   linux / builtin   the built-in handed over BY NAME, faked plane             -> 'unsupported-platform'
//   linux / none      no reaper option at all, faked plane                      -> 'unsupported-platform'
//
// Only two of the four cells are run on the win32 plane, and the reason is a safety bound, not a
// shortcut: `linux / win32-plane + the BUILT-IN reaper` would reach the real `taskkill /PID 4242 /T /F`
// with a pid this tool invented, and an invented pid is somebody's real process. On the fake linux
// plane the built-in returns before touching the OS, which is why those cells are safe to run.
//
// A cell's "kills" counts direct `child.kill()` calls, and "reaped" counts calls into the caller's
// own function, because the ORDER is the finding since v55: a reaper is issued INSTEAD of the kill.
//
// Staleness is refused, not assumed: the plane is copied from `agents/exec-host/dist/execHost.js`, so
// the tool compares that file's mtime against `src/execHost.ts` and stops if the bytes it would grade
// are older than the bytes they claim to implement.
//
// Run from anywhere:  node docs/evidence/agents/reaper-plane-arms.mjs     (~30 s, 16 child processes)
// Human-run tool: deliberately NOT a `verify:*` script and carries no `sweep-budget-ms` row marker.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const SRC_TS = join(ROOT, 'agents/exec-host/src/execHost.ts');
const DIST_JS = join(ROOT, 'agents/exec-host/dist/execHost.js');
const RUNTIME_DIST = join(ROOT, 'agents/runtime/dist/index.js');

// The planes live as SIBLINGS of the repository, never inside it: a copy under the root would enter
// every census that walks the tree, and the sweeper that empties loose %TEMP% directories has already
// eaten one plane this project relied on.
const PLANE = join(dirname(ROOT), `nexus-reaper-plane-${process.pid}`);

function freshBytes() {
  assert.ok(existsSync(DIST_JS), `${DIST_JS} does not exist — the compiled host is the subject of this tool, so run \`npm run build -w @nexus/exec-host\` first`);
  const dist = statSync(DIST_JS).mtimeMs;
  const src = statSync(SRC_TS).mtimeMs;
  assert.ok(src <= dist, `agents/exec-host/src/execHost.ts (${new Date(src).toISOString()}) is NEWER than agents/exec-host/dist/execHost.js (${new Date(dist).toISOString()}): the bytes below would grade a build that does not implement them`);
  return readFileSync(DIST_JS, 'utf8');
}

/** One splice, asserted to hit once — an arm that matched twice would grade a file nobody wrote. */
function once(text, needle, replacement, label) {
  const hits = text.split(needle).length - 1;
  assert.equal(hits, 1, `arm ${label}: the needle ${JSON.stringify(needle.slice(0, 60))} matched ${hits} time(s) in the compiled host, expected exactly 1`);
  return text.replace(needle, replacement);
}

const GATE = 'reaperIsBuiltIn && !TREE_REAPER_AVAILABLE';
const WHOSE = 'const reaperIsBuiltIn = reaper === DEFAULT_TREE_REAPER;';

// The variants: the shipped rule, the bug it replaced, and the two wrong repairs that the shipped
// cases were chosen to be unable to accept. Each is ONE condition splice, so no arm can move a line
// of honest fallback code by accident.
const VARIANTS = [
  {
    tag: 'V0-shipped',
    note: 'the rule as it landed: whose reaper it is decides whether the platform answer applies',
    build: (t) => t,
    expect: { 'win32/mine': 'reaped', 'linux/mine': 'reaped', 'linux/builtin': 'unsupported-platform', 'linux/none': 'unsupported-platform' },
  },
  {
    tag: 'V1-the-bug',
    note: 'the pre-fix bytes: the platform answer alone vetoes, whoever the reaper belongs to',
    build: (t) => once(t, GATE, '!TREE_REAPER_AVAILABLE', 'V1'),
    expect: { 'win32/mine': 'reaped', 'linux/mine': 'unsupported-platform', 'linux/builtin': 'unsupported-platform', 'linux/none': 'unsupported-platform' },
  },
  {
    tag: 'V2-gate-deleted',
    note: 'the over-repair: never consult the platform, so the built-in is "asked" where it cannot act',
    build: (t) => once(t, GATE, 'false', 'V2'),
    expect: { 'win32/mine': 'reaped', 'linux/mine': 'reaped', 'linux/builtin': 'reaper-failed', 'linux/none': 'reaper-failed' },
  },
  {
    tag: 'V3-presence-based',
    note: 'the naive repair: the OPTION being written is treated as extra reach, and an omitted one is not',
    build: (t) => once(t, WHOSE, 'const reaperIsBuiltIn = options.reaper !== void 0;', 'V3'),
    // On win32 the platform answer is true, so this variant still calls there — its two flips are the
    // SAME word on the fake plane for the wrong reason (the caller's reaper vetoed) and the built-in
    // being asked where it cannot act.
    expect: { 'win32/mine': 'reaped', 'linux/mine': 'unsupported-platform', 'linux/builtin': 'unsupported-platform', 'linux/none': 'reaper-failed' },
  },
];

const CELLS = [
  { key: 'win32/mine', platform: 'win32', which: 'mine' },
  { key: 'linux/mine', platform: 'linux', which: 'mine' },
  { key: 'linux/builtin', platform: 'linux', which: 'builtin' },
  { key: 'linux/none', platform: 'linux', which: 'none' },
];

const CELL_SCRIPT = `// generated by reaper-plane-arms.mjs — one cell of the matrix
import { pathToFileURL } from 'node:url';
const [modPath, platform, which] = process.argv.slice(2);
Object.defineProperty(process, 'platform', { value: platform, configurable: true });
const mod = await import(pathToFileURL(modPath).href);
class FakeChild {
  constructor() { this.killed = false; this.ends = []; }
  onData() {}
  onEnd(l) { this.ends.push(l); }
  kill() { this.killed = true; this.emitEnd({ code: null, signal: 'SIGTERM' }); }
  emitEnd(e) { for (const l of this.ends) l(e); }
}
let kills = 0;
let mineCalls = 0;
let child;
const spawnLike = () => {
  const c = new FakeChild();
  c.kill = () => { kills += 1; c.killed = true; c.emitEnd({ code: null, signal: 'SIGTERM' }); };
  child = c;
  return { onData: (l) => c.onData(l), onEnd: (l) => c.onEnd(l), kill: c.kill, pid: 4242 };
};
const mine = () => { mineCalls += 1; queueMicrotask(() => child.emitEnd({ code: 1, signal: null })); return true; };
const options = { spawnLike, reapTree: true };
if (which === 'mine') options.reaper = mine;
else if (which === 'builtin') options.reaper = mod.DEFAULT_TREE_REAPER;
const host = mod.createExecHost({ root: 'X:/jail', allow: [{ argv: ['git', 'status', '*'], timeoutMs: 20, maxOutputBytes: 6 }], envAllow: ['PATH'] }, options);
const r = await host.run({ argv: ['git', 'status', '--short'] }, { checkpoint: () => true });
process.stdout.write(JSON.stringify({ avail: mod.TREE_REAPER_AVAILABLE, verdict: r.descendantsStopped, mineCalls, kills, signal: r.signal, exitCode: r.exitCode, killedByBudget: r.killedByBudget }) + '\\n');
`;

function runCell(variantTag, modFile, cell) {
  const out = spawnSync(process.execPath, [join(PLANE, 'cell.mjs'), modFile, cell.platform, cell.which], { encoding: 'utf8', timeout: 60_000 });
  const stdout = (out.stdout || '').trim();
  assert.equal(out.status, 0, `arm ${variantTag} cell ${cell.key}: the child exited ${out.status}; stderr: ${(out.stderr || '').slice(0, 300)} stdout: ${stdout.slice(0, 200)}`);
  assert.ok(stdout.startsWith('{'), `arm ${variantTag} cell ${cell.key}: the child printed no JSON object — a crash before the verdict is not a verdict: ${stdout.slice(0, 200)}`);
  return JSON.parse(stdout);
}

const base = freshBytes();
// The plane copy must resolve `@nexus/agent-runtime` from outside the repository, and a bare specifier
// walked up from the plane finds nothing: rewrite it to the built runtime's absolute path (one hit).
const portable = once(base, "from '@nexus/agent-runtime'", `from ${JSON.stringify(pathToFileURL(RUNTIME_DIST).href)}`, 'plane-import');
if (existsSync(PLANE)) rmSync(PLANE, { recursive: true, force: true });
mkdirSync(PLANE, { recursive: true });
writeFileSync(join(PLANE, 'cell.mjs'), CELL_SCRIPT, 'utf8');

let matched = 0;
let total = 0;
const flips = [];
for (const variant of VARIANTS) {
  const modFile = join(PLANE, `execHost.${variant.tag}.mjs`);
  writeFileSync(modFile, variant.build(portable), 'utf8');
  const observed = {};
  for (const cell of CELLS) {
    total += 1;
    const r = runCell(variant.tag, modFile, cell);
    observed[cell.key] = r.verdict;
    const want = variant.expect[cell.key];
    if (r.verdict === want) matched += 1;
    else flips.push(`${variant.tag} ${cell.key}: predicted ${want}, observed ${r.verdict} (mineCalls=${r.mineCalls} kills=${r.kills} signal=${r.signal})`);
    const movedFromShipped = variant.expect[cell.key] !== VARIANTS[0].expect[cell.key];
    if (cell.key.endsWith('/mine')) {
      assert.equal(r.mineCalls > 0, r.verdict === 'reaped', `${variant.tag} ${cell.key}: the caller's reaper was called ${r.mineCalls} time(s) yet the verdict is ${JSON.stringify(r.verdict)} — a verdict that does not track the call is a label, not a measurement`);
    }
    if (movedFromShipped) console.log(`  ${variant.tag} ${cell.key}: moved to ${r.verdict} (${variant.note})`);
  }
  console.log(`[${variant.tag}] ${CELLS.map((c) => `${c.key}=${observed[c.key]}`).join(' · ')}`);
}

// The three readings the shipped cases make, asserted against the SAME cells they mirror, so a case
// that quietly stopped testing anything shows up here as a mismatch between the two.
const shipped = VARIANTS[0];
const shippedCells = {};
for (const cell of CELLS) shippedCells[cell.key] = runCell('V0-shipped', join(PLANE, `execHost.${shipped.tag}.mjs`), cell);
assert.deepEqual(
  [shippedCells['linux/mine'].verdict, shippedCells['linux/none'].verdict, shippedCells['linux/builtin'].verdict],
  ['reaped', 'unsupported-platform', 'unsupported-platform'],
  'the three cells the shipped cases read must be these three verdicts, in that order',
);
assert.equal(shippedCells['linux/none'].kills, 1, 'the fallback kill must still fire when there is no reaper here — v55 honesty, unchanged by v529');
assert.equal(shippedCells['linux/mine'].kills, 0, 'a SUCCESSFUL reaper must not be followed by a direct kill — substitution, not addition');
assert.equal(shippedCells['linux/builtin'].signal, 'SIGTERM', 'the built-in that was never asked means the kill ended the run');
assert.notEqual(shippedCells['win32/mine'].avail, shippedCells['linux/mine'].avail, 'the fake plane must actually flip the exported platform answer, or no arm here graded anything');

// An arm that predicts the shipped table in every cell measures nothing, and two arms that flip the
// same cells are one arm wearing two names — both refusals belong in the summary the reader trusts.
const vacuous = VARIANTS.slice(1).filter((v) => CELLS.every((c) => v.expect[c.key] === VARIANTS[0].expect[c.key]));
assert.deepEqual(vacuous.map((v) => v.tag), [], `arm(s) predict the shipped verdict everywhere and therefore grade nothing: ${vacuous.map((v) => v.tag).join(', ')}`);
const signatures = VARIANTS.slice(1).map((v) => CELLS.filter((c) => v.expect[c.key] !== VARIANTS[0].expect[c.key]).map((c) => `${c.key}->${v.expect[c.key]}`).sort().join(','));
assert.equal(new Set(signatures).size, signatures.length, `two arms flip exactly the same cells (${signatures.join(' | ')}), so one of them is decoration`);
console.log(`arm signatures (cells each wrong repair moves, against the shipped rule): ${VARIANTS.slice(1).map((v, i) => `${v.tag} = [${signatures[i]}]`).join(' · ')}`);

rmSync(PLANE, { recursive: true, force: true });
assert.ok(!existsSync(PLANE), `the plane ${PLANE} survived this run — an arm that leaks its copy contaminates the next measurement`);

console.log(`\n${matched}/${total} cells matched their predictions across ${VARIANTS.length} byte-variants (${flips.length ? `MISMATCHED: ${flips.join(' | ')}` : 'the bug, the over-repair and the naive repair each move the cells named, and nothing else'})`);
if (flips.length) {
  console.error('reaper-plane-arms: MISMATCH — the rule does not answer the way the cases claim.');
  process.exit(1);
}
