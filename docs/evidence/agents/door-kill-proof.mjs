// NEXUS M2 v74 (exec-host) — A KILL IS THE HOST'S ACTION, AND A DOOR MAY NOT SAY "git REFUSED" FOR IT
// (ADR 0016 amendment 74).
// Measured before the fix (`.scratch/v74-door-kill-probe.mjs`): every git door driven against a 1 ms timeout
// over a 300-file repository answered `… · git REFUSED this command — this is NOT a statement that …`, in the
// same sentence where it reported `exit null`. git refused nothing — it was still running when the host
// terminated it. v52 wrote `refusedNotAbsence` for what git does when it declines; v53 added a `cut` rule so
// an emptied pipe is not called git's silence; this is the same class of misattribution one step further on,
// and it matters exactly where the family matters most: a §28 reviewer is shown WHO spoke.
// So the refusal branch splits: `killedByBudget` selects `killedNotRefusal(...)`, and `killedField(result)`
// carries the same distinction into the record (v73's shape, one vocabulary). This proof verifies BOTH
// directions with real git — a killed read never says "git REFUSED", and a read git genuinely refused
// (v52's own 132-line usage page outside a repository) still says exactly that and carries no `killed`.
// Everything happens under os.tmpdir; this repository's HEAD is compared byte-wise at the end.
// Run after `npm run build`:  node docs/evidence/agents/door-kill-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const {
  createExecHost, gitEnv, gitLogPolicy, gitReadOnlyPolicy, gitShowPolicy, gitStagedPolicy, killedField,
  killedNotRefusal, registerGitLogTool, registerGitShowTool, registerGitStagedTool, registerGitTools,
} = eh;

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}
const temps = [];
const tmpOf = (p) => (temps.push(p), p);
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const root = tmpOf(mkTmp('nexus-v74-proof'));
const git = (...argv) => execFileSync('git', argv, { cwd: root, env: { ...gitEnv({}), GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
git('init', '-q', '-b', 'main');
for (const [k, v] of Object.entries({ 'user.email': 'proof@invalid', 'user.name': 'proof', 'core.hooksPath': join(root, '.git', 'none'), 'commit.gpgsign': 'false' })) git('config', '--local', k, v);
const N = 300;
for (let i = 0; i < N; i += 1) {
  mkdirSync(join(root, `src/m${i}`), { recursive: true });
  writeFileSync(join(root, `src/m${i}/a-long-file-name-${i}.ts`), `export const a = ${i};\n`);
}
git('add', '-A');
git('commit', '-qm', 'seed three hundred files so a one-millisecond budget is a real timeout');
for (let i = 0; i < N; i += 1) writeFileSync(join(root, `src/m${i}/a-long-file-name-${i}.ts`), `export const a = ${i}; // staged by the human\n`);
git('add', '-A');

let doorReads = 0;
const read = async (base, register, tool, args, timeoutMs, id) => {
  doorReads += 1;
  const p = { ...base, allow: base.allow.map((a) => ({ ...a, timeoutMs })), maxTimeoutMs: Math.max(base.maxTimeoutMs ?? 1, timeoutMs) };
  const host = createExecHost(p, {});
  const r = await register(new ToolRegistry(), host, { env: {} }).invoke({ callId: `v74:${id}`, tool, args }, { checkpoint: () => true });
  if (!r.ok) throw new Error(`${id} never reached the host: ${r.error}`);
  return r.output;
};
const faces = [
  ['git.status', () => gitReadOnlyPolicy(root), registerGitTools, 'git.status', {}],
  ['git.diff', () => gitReadOnlyPolicy(root), registerGitTools, 'git.diff', {}],
  ['git.staged', () => gitStagedPolicy(root), registerGitStagedTool, 'git.staged', {}],
  ['git.log', () => gitLogPolicy(root), registerGitLogTool, 'git.log', { count: 100 }],
  ['git.show', () => gitShowPolicy(root), registerGitShowTool, 'git.show', { path: 'src/m0/a-long-file-name-0.ts' }],
];

console.log('§1 一次真超时：句子说对了动作是谁做的');
for (const [label, makePolicy, register, tool, args] of faces) {
  // v534: a 1 ms timer can fire AFTER the child finished on a loaded runner (measured: ubuntu red at
  // `git.log: the signal the host used`). Then child.kill() is a no-op and the record honestly says
  // `signal: null` beside exit 0 — the host DECIDED at its budget but stopped nothing. That attempt is
  // not this section's case; retry until the kill actually lands (4 attempts make the stall improbable).
  // v542, same class one door further: on a fast runner the whole read can FINISH before the 1 ms timer
  // is ever delivered — measured at run 40825146593, where `git.log` answered `exit 0 · count 100` with
  // NO `killed` key, and the old assert called a clean answer "neither killed nor finished". A read that
  // finishes inside its budget says nothing about the kill path in either direction: it is not this
  // section's witness, so it is retried too — and if four attempts all finish cleanly, the section says
  // the witness could not be produced rather than passing on an untested contract.
  let o = null;
  let lateTimers = 0;
  let outran = 0;
  for (let attempt = 1; attempt <= 4 && o === null; attempt += 1) {
    const r = await read(makePolicy(), register, tool, args, 1, `kill:${label}:${attempt}`);
    if (r.killed && r.killed.signal !== null) {
      o = r;
      break;
    }
    if (!r.killed) {
      assert.equal(r.exitCode, 0, `${label}: a read ended with no kill record AND a non-clean exit — that is unexplained: ${JSON.stringify(r)}`);
      outran += 1;
      continue;
    }
    assert.equal(r.exitCode, 0, `${label}: a null-signal kill on a non-clean exit is unexplained: ${JSON.stringify(r.killed)} exit ${r.exitCode}`);
    lateTimers += 1;
  }
  assert.ok(o, `${label}: 4 attempts at a 1 ms budget and the record never carried a real kill (${lateTimers} late timer(s), ${outran} read(s) that finished inside the budget)`);
  if (lateTimers + outran > 0) console.log(`  ${label.padEnd(11)} (${lateTimers + outran} attempt(s) were not this section's case: ${lateTimers} late timer(s) with signal null/exit 0, ${outran} read(s) that finished inside the 1 ms budget before the timer was delivered — the contract holds in each)`);
  console.log(`  ${label.padEnd(11)} ok=${o.ok} exit=${o.exitCode} killed=${JSON.stringify(o.killed)} windowed=${'windowed' in o} · ${String(o.detail).slice(0, 96)}…`);
  assert.equal(o.ok, false, `${label}: a killed read is not an answer`);
  assert.ok(o.killed, `${label}: the record says a KILL happened, not merely that numbers are missing`);
  assert.equal(o.killed.signal, 'SIGTERM', `${label}: the signal the host used (record says ${JSON.stringify(o.killed)})`);
  assert.ok(o.detail.includes('the exec host KILLED this read at its own timeout budget'), `${label}: ${o.detail}`);
  assert.ok(!/git REFUSED/.test(o.detail), `${label}: the door must not credit git with the host's decision — it was still running: ${o.detail}`);
  assert.equal('windowed' in o, false, `${label}: a timeout trims no pipe, so v69's window key stays away (kill ≠ cut)`);
}

console.log('\n§2 反向：git 真的拒绝时，那句话仍然该由 git 来说');
{
  const elsewhere = tmpOf(mkTmp('nexus-v74-notarepo'));
  const o = await read(gitStagedPolicy(elsewhere), registerGitStagedTool, 'git.staged', {}, 20_000, 'refuse:outside');
  console.log(`  git.staged outside a repo → ok=${o.ok} exit=${o.exitCode} killed=${'killed' in o} · ${String(o.detail).slice(0, 120)}…`);
  assert.equal(o.ok, false, 'git refuses a diff outside a repository (v52)');
  assert.ok(/git REFUSED this command/.test(o.detail), 'and the door still attributes that to git: ' + o.detail);
  assert.equal('killed' in o, false, 'with no kill marker on a real refusal — the two branches are not synonyms');
}

console.log('\n§3 两个分支各说各话：由数据决定，不由措辞决定');
const pure = killedField({ killedByBudget: true, signal: null, descendantsStopped: 'reaped' });
assert.deepEqual(pure, { killed: { signal: null, descendantsStopped: 'reaped' } }, 'v73\u2019s vocabulary, one source');
assert.deepEqual(killedField({ killedByBudget: false, signal: null }), {}, 'absent rather than empty (v55/v56 precedent)');
assert.ok(killedNotRefusal('nothing changed').includes('git refused nothing'), 'the new sentence names the speaker');
const uncut = await read(gitReadOnlyPolicy(root), registerGitTools, 'git.status', {}, 20_000, 'whole');
assert.equal(uncut.ok, true, 'and the same door over the same repository answers normally with room to run');
assert.equal('killed' in uncut, false, 'a whole read carries no kill marker');
console.log(`  killed → {killed:{…}} · not killed → no key · refusal → “git REFUSED” · kill → “the exec host KILLED” · one door, three worlds apart`);

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, "the home repository's HEAD is byte-identical: every write here was under os.tmpdir");
console.log(`\n[summary] faces driven to a real kill: ${faces.length} · sentences blaming git for the host's kill: 0 · records carrying the kill: ${faces.length}/${faces.length} · real refusal still attributed to git: yes · keys invented for this: 0 (one clause + one field, both derived) · door reads: ${doorReads} · home HEAD byte-identical: yes`);
for (const dir of temps) execFileSync('node', ['-e', `require("fs").rmSync(${JSON.stringify(dir)},{recursive:true,force:true})`]);
console.log('[cleanup] throwaway repositories removed');
