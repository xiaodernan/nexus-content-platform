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
//
// M2 v544 (ADR 0016 amendment 527) — TWO findings, both measured, and they revise how this proof works.
// (a) The 1 ms budget was a RACE with the machine, not a witness: on the ubuntu runner (run 40833035921)
// `git.log` produced 3 records with `killed` beside `exit 0, signal null` — the timer fired after the child
// had already finished and `kill()` was a no-op — and 1 record with no `killed` at all. Four attempts, zero
// landed kills, so the section reddened for a reason that says nothing about the door. §1 now delivers the
// budget callback as a microtask right after the spawn: the child CANNOT have finished, the signal is real,
// and the witness no longer depends on how fast the box is.
// (b) The record itself was over-claiming. `killedByBudget` was set by the timer alone, so a READ THAT HAD
// FINISHED was reported as killed and every door answered a complete answer with `ok: false` and "the exec
// host KILLED this read" — the exact false failure §2 replays deterministically through the host's own
// `spawnLike` point. The host now reports `killedByBudget: false` when the process reported a clean exit
// (code 0, no signal): nothing was killed, the answer is whole, and the door says so.
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

// M2 v544 (amendment 527): the budget callback is delivered as a microtask right after the spawn
// returns. Nothing about the kill is simulated — a real git child receives a real SIGTERM and the
// record carries what the OS reported — but the DELIVERY no longer races the child's own completion,
// which measured 0 of 4 witnesses on the ubuntu runner (run 40833035921).
const withBudgetDelivered = async (fn) => {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms, ...args) => {
    if (ms === 1) {
      const handle = real(() => {}, 1e9); // a real handle so the host's clearTimeout has something to cancel
      queueMicrotask(() => cb(...args));
      return handle;
    }
    return real(cb, ms, ...args);
  };
  try {
    return await fn();
  } finally {
    globalThis.setTimeout = real;
  }
};

console.log('§1 一次真超时：句子说对了动作是谁做的');
for (const [label, makePolicy, register, tool, args] of faces) {
  // v534/v542 tried to OUTRUN the old race with four attempts; v544 measured that on a fast runner the
  // attempt count cannot fix it (run 40833035921: 3 late timers + 1 clean read = no witness at all).
  // The timer is now delivered deterministically; a face that does not land a kill is a real red.
  const o = await withBudgetDelivered(() => read(makePolicy(), register, tool, args, 1, `kill:${label}`));
  console.log(`  ${label.padEnd(11)} ok=${o.ok} exit=${o.exitCode} killed=${JSON.stringify(o.killed)} windowed=${'windowed' in o} · ${String(o.detail).slice(0, 96)}…`);
  assert.equal(o.ok, false, `${label}: a killed read is not an answer`);
  assert.ok(o.killed, `${label}: the record says a KILL happened, not merely that numbers are missing`);
  assert.equal(o.killed.signal, 'SIGTERM', `${label}: the signal the host used (record says ${JSON.stringify(o.killed)})`);
  assert.equal(o.exitCode, null, `${label}: a signalled death has no exit code — v544 also pins the other half of the record`);
  assert.ok(o.detail.includes('the exec host KILLED this read at its own timeout budget'), `${label}: ${o.detail}`);
  assert.ok(!/git REFUSED/.test(o.detail), `${label}: the door must not credit git with the host's decision — it was still running: ${o.detail}`);
  assert.equal('windowed' in o, false, `${label}: a timeout trims no pipe, so v69's window key stays away (kill ≠ cut)`);
}

console.log('\n§2 预算晚于读本身：一个已经结束的进程不是一次击杀，完整的答案不能被判成失败');
{
  // The shape run 40833035921 measured on ubuntu, replayed deterministically through the host's own
  // injection point: the timer fires at the budget, kill() is a no-op against a child that has already
  // exited, and the exit event then says `code 0, signal null`. Before v544 the host called that a kill
  // and the git.log door answered `ok: false` with the whole log in hand.
  const [label, , register, tool, args] = faces[3]; // git.log — the face ubuntu measured
  const listeners = { data: () => {}, end: () => {} };
  let killAttempts = 0;
  const host = createExecHost(gitLogPolicy(root, { timeoutMs: 1 }), {
    spawnLike: () => ({
      onData: (l) => { listeners.data = l; },
      onEnd: (l) => { listeners.end = l; },
      kill: () => { killAttempts += 1; }, // a no-op: the process is already gone
      pid: 424242,
    }),
  });
  setTimeout(() => {
    listeners.data('stdout', 'abcdef0 a commit that finished on its own\n');
    listeners.end({ code: 0, signal: null });
  }, 30);
  const out = (await register(new ToolRegistry(), host, { env: {} }).invoke({ callId: 'v544:late', tool, args }, { checkpoint: () => true })).output;
  console.log(`  ${label}: ok=${out.ok} exit=${out.exitCode} killed=${'killed' in out} commits=${out.commits.length} · ${String(out.detail).slice(0, 140)}…`);
  assert.equal(killAttempts, 1, 'the host still ISSUED the kill at its budget — what changed is the record, not the attempt');
  assert.equal(out.ok, true, 'a read that reported a clean exit with no signal is an ANSWER — the budget expiring around it does not turn it into a failure');
  assert.equal(out.exitCode, 0, 'the exit code the process itself gave');
  assert.equal('killed' in out, false, 'no kill marker: no signal was reported');
  assert.ok(!/the exec host KILLED/.test(out.detail), `the sentence must not claim a kill: ${out.detail}`);
  assert.equal(out.commits.length, 1, 'the whole answer survived the late budget, parsed as usual');
}

console.log('\n§3 反向：git 真的拒绝时，那句话仍然该由 git 来说');
{
  const elsewhere = tmpOf(mkTmp('nexus-v74-notarepo'));
  const o = await read(gitStagedPolicy(elsewhere), registerGitStagedTool, 'git.staged', {}, 20_000, 'refuse:outside');
  console.log(`  git.staged outside a repo → ok=${o.ok} exit=${o.exitCode} killed=${'killed' in o} · ${String(o.detail).slice(0, 120)}…`);
  assert.equal(o.ok, false, 'git refuses a diff outside a repository (v52)');
  assert.ok(/git REFUSED this command/.test(o.detail), 'and the door still attributes that to git: ' + o.detail);
  assert.equal('killed' in o, false, 'with no kill marker on a real refusal — the two branches are not synonyms');
}

console.log('\n§4 两个分支各说各话：由数据决定，不由措辞决定');
const pure = killedField({ killedByBudget: true, signal: null, descendantsStopped: 'reaped' });
assert.deepEqual(pure, { killed: { signal: null, descendantsStopped: 'reaped' } }, 'v73\u2019s vocabulary, one source');
assert.deepEqual(killedField({ killedByBudget: false, signal: null }), {}, 'absent rather than empty (v55/v56 precedent)');
assert.ok(killedNotRefusal('nothing changed').includes('git refused nothing'), 'the new sentence names the speaker');
const uncut = await read(gitReadOnlyPolicy(root), registerGitTools, 'git.status', {}, 20_000, 'whole');
assert.equal(uncut.ok, true, 'and the same door over the same repository answers normally with room to run');
assert.equal('killed' in uncut, false, 'a whole read carries no kill marker');
console.log(`  killed → {killed:{…}} · not killed → no key · refusal → “git REFUSED” · kill → “the exec host KILLED” · one door, three worlds apart`);

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, "the home repository's HEAD is byte-identical: every write here was under os.tmpdir");
console.log(`\n[summary] faces driven to a real kill: ${faces.length} · sentences blaming git for the host's kill: 0 · records carrying the kill: ${faces.length}/${faces.length} · late budget over a FINISHED read answered whole with no kill marker: yes (run 40833035921's shape, replayed) · real refusal still attributed to git: yes · keys invented for this: 0 (one clause + one field, both derived) · door reads: ${doorReads} · home HEAD byte-identical: yes`);
for (const dir of temps) execFileSync('node', ['-e', `require("fs").rmSync(${JSON.stringify(dir)},{recursive:true,force:true})`]);
console.log('[cleanup] throwaway repositories removed');
