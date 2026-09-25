// NEXUS M2 v69 (exec-host) — A DOOR'S RECORD MUST ANSWER THE WINDOW QUESTION ITS SENTENCE ANSWERS
// (ADR 0016 amendment 69).
// v48/v52/v56/v63/v65/v66/v68 all made a door SAY that a number is a count of what it read, not a census of
// the repository. Every one of those rules lives in `detail`. The structured record — the part other code
// reads — kept only v30's single `truncated` bit, which is a statement about TWO pipes. So the sentence and
// the record could disagree without either being false, and a consumer that skipped the prose had nothing to
// consult. Measured here: `git.status` at a 98-byte budget over a 40-change index answers
// `… the read was CUT at the budget …` and carries `truncated: true`, and carried NO marker that its
// `counts`/`files` were a window (`v69-stderr-probe.mjs` printed `streams=undefined`).
// The honest scope, measured before written: for a git door the aggregate bit happens to coincide with the
// stream it parses TODAY, because git puts nothing on stderr on a successful read — §1 re-measures that over
// eight real states, so this proof does NOT claim a git door ever mislabelled a number (v56 §5's discipline).
// What is fixed is the layer: the host computed `truncatedStreams`, every door READ it to write its own
// sentence, and then dropped it. §2 pins the coupling door by door and cut/uncut; §3 shows the bit alone is
// NOT the claim with a two-pipe program through `exec.run`, where `truncated:true` and a whole parsed stdout
// coexist; §4 shows an uncut record has no key to misread (absent, never false — v55/v56 precedent), which is
// what keeps the 55 tracked proofs the "nothing else moved" assertion; §5 holds §9.
// Run after `npm run build`:  node docs/evidence/agents/record-window-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const {
  createExecHost, gitEnv, gitLogPolicy, gitReadOnlyPolicy, gitShowPolicy, gitStagedPolicy, logWindowNotice,
  NODE_SPAWN, registerGitLogTool, registerGitShowTool, registerGitStagedTool, registerGitTools, stdoutWasCut, windowField,
} = eh;

const PIN = gitEnv({});
const g = (dir, ...argv) => execFileSync('git', argv, { cwd: dir, env: { ...PIN, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}
let spawns = 0;
const counting = (cmd, args, opts) => {
  spawns += 1;
  return NODE_SPAWN(cmd, args, opts);
};
const homeHead = g('.', 'rev-parse', 'HEAD').trim();
const temps = [];
const tmpOf = (p) => (temps.push(p), p);
const root = tmpOf(mkTmp('nexus-v69-repo'));
let doorReads = 0;

g(root, 'init', '-q', '-b', 'main');
for (const [k, v] of Object.entries({ 'core.hooksPath': join(root, '.git', 'none'), 'user.email': 'proof@invalid', 'user.name': 'proof', 'commit.gpgsign': 'false', 'core.autocrlf': 'false' })) g(root, 'config', '--local', k, v);
const N = 40;
for (let i = 0; i < N; i += 1) {
  mkdirSync(join(root, 'src', `m${i}`), { recursive: true });
  writeFileSync(join(root, `src/m${i}/a-long-file-name-${i}.ts`), `export const a = ${i};\n`);
}
g(root, 'add', '-A');
g(root, 'commit', '-qm', 'seed forty files with longish paths so a budget is a real window');
// eight more commits, so the LOG door's answer is long enough to be cut by the same budgets too — a door
// whose whole answer fits cannot demonstrate a window, and §2 would be measuring nothing.
for (let i = 1; i <= 8; i += 1) {
  writeFileSync(join(root, 'untracked-note.md'), `a note nobody staged, revision ${i}\n`);
  g(root, 'add', 'untracked-note.md');
  g(root, 'commit', '-qm', `docs: the ${i}th of eight commits, each subject padded to cost bytes`);
}
writeFileSync(join(root, 'src/m9/a-long-file-name-9.ts'), `export const a = 9; // staged, and touched again in the tree\n${Array.from({ length: 40 }, (_, i) => `export const extra${i} = 'a line long enough that this door has bytes to lose';`).join('\n')}\n`);
g(root, 'add', 'src/m9/a-long-file-name-9.ts');
g(root, 'commit', '-qm', 'feat: the forty added lines git.show reads back for one path');
for (let i = 0; i < N; i += 1) writeFileSync(join(root, `src/m${i}/a-long-file-name-${i}.ts`), `export const a = ${i}; // staged, and touched again in the tree\n`);
g(root, 'add', '-A');
for (let i = 0; i < 6; i += 1) writeFileSync(join(root, `src/m${i}/a-long-file-name-${i}.ts`), `export const a = ${i}; // staged, and touched again in the tree\n// and once more, unstaged\n`);
writeFileSync(join(root, 'untracked-note.md'), 'a note nobody staged\n');
const porcelain = g(root, 'status', '--short');
const rows = porcelain.split('\n').filter((l) => l !== '');
const bytesOf = (keep) => rows.slice(0, keep).reduce((b, l) => b + Buffer.byteLength(l, 'utf8') + 1, 0);

/** one door, one budget: returns its record and its sentence, nothing else */
async function read(policy, register, tool, args, budget, id) {
  doorReads += 1;
  const p = { ...policy, allow: policy.allow.map((a) => ({ ...a, maxOutputBytes: budget })) };
  const host = createExecHost(p, { spawnLike: counting });
  const r = await register(new ToolRegistry(), host, { env: {} }).invoke({ callId: `v69:${id}:${budget}`, tool, args }, { checkpoint: () => true });
  if (!r.ok) throw new Error(`${id} refused: ${r.error}`);
  return r.output;
}
// the wording every one of the family's clauses produces — v48's hedge, v56's pipe, v63's window ratio,
// v66's AT LEAST + notice, v68's floor. The record bit must agree with ALL of them, not one of them.
const saysWindow = (detail) => /AT LEAST|the read was CUT|FLOOR|no complete line survived|NOT a statement|MAY stop|output truncated/.test(detail);
const doors = [
  ['git.status', () => gitReadOnlyPolicy(root), registerGitTools, 'git.status', {}],
  ['git.diff', () => gitReadOnlyPolicy(root), registerGitTools, 'git.diff', {}],
  ['git.diff --stat', () => gitReadOnlyPolicy(root), registerGitTools, 'git.diff', { stat: true }],
  ['git.staged', () => gitStagedPolicy(root), registerGitStagedTool, 'git.staged', {}],
  ['git.staged --stat', () => gitStagedPolicy(root), registerGitStagedTool, 'git.staged', { stat: true }],
  ['git.log', () => gitLogPolicy(root), registerGitLogTool, 'git.log', { count: 5 }],
  ['git.show', () => gitShowPolicy(root), registerGitShowTool, 'git.show', { path: 'src/m9/a-long-file-name-9.ts' }],
];

console.log('§1 git 自己：一只成功的读，stderr 上有字节吗');
const stderrStates = [
  ['status --short', ['status', '--short']], ['diff --cached', ['diff', '--cached']], ['diff', ['diff']],
  ['diff --cached --stat', ['diff', '--cached', '--stat']], ['log --oneline -n 5', ['log', '--oneline', '-n', '5']],
  ['show --format= -- path', ['show', 'HEAD', '--format=', '--', 'src/m0/a-long-file-name-0.ts']],
  ['rev-parse HEAD', ['rev-parse', 'HEAD']], ['ls-files -c', ['ls-files', '-c']],
];
let nonzeroStderr = 0;
for (const [label, argv] of stderrStates) {
  const r = (() => { try { return { code: 0, out: g(root, ...argv), err: '' }; } catch (e) { return { code: e.status, out: e.stdout ?? '', err: e.stderr ?? '' }; } })();
  if (Buffer.byteLength(r.err) > 0) nonzeroStderr += 1;
  console.log(`  ${label.padEnd(24)} exit ${r.code} · stdout ${Buffer.byteLength(r.out)} B · stderr ${Buffer.byteLength(r.err)} B`);
}
console.log(`  ${stderrStates.length} 只成功的读里，stderr 非空的有 ${nonzeroStderr} 只`);
assert.equal(nonzeroStderr, 0, 'this increment does not claim a git door ever muted a number with stderr bytes — measured, git puts nothing on stderr here (v56 §5 again, eight states)');

console.log('\n§2 每一扇门、截断与不截断：句子里的窗口声明 ⇄ 记录里的 windowed');
const table = [];
for (const [label, makePolicy, register, tool, args] of doors) {
  const whole = await read(makePolicy(), register, tool, args, 1 << 20, `whole:${label}`);
  const cut = await read(makePolicy(), register, tool, args, bytesOf(3), `cut:${label}`);
  const wWhole = 'windowed' in whole;
  const wCut = 'windowed' in cut;
  table.push([label, wWhole, saysWindow(whole.detail), wCut, saysWindow(cut.detail)]);
  assert.equal(wWhole, false, `${label}: an uncut record must have NO key at all, not a false one: ${JSON.stringify(whole).slice(0, 120)}`);
  assert.equal(saysWindow(whole.detail), false, `${label}: and its sentence must not hedge either: ${whole.detail}`);
  assert.equal(wCut, true, `${label}: a read whose parsed pipe was cut carries the bit — its numbers are floors: ${JSON.stringify(cut).slice(0, 60)}`);
  assert.equal(saysWindow(cut.detail), true, `${label}: and the SAME read's sentence says so — one fact, two faces`);
  assert.equal(cut.truncated, true, `${label}: v30's aggregate bit is also true here (that is the point of v69)`);
  // v69 deliberately hands on ONE derived bit, not the host's pipe list: `stdoutWasCut` is the door's rule,
  // and a consumer that had to re-derive it would be a second copy of it (v51/v54's one-source argument).
  assert.equal('truncatedStreams' in cut, false, `${label}: the record carries the claim, not a list for the reader to compute a claim from`);
}
for (const [label, aw, ad, cw, cd] of table) console.log(`  ${label.padEnd(18)} 未截断 记录=${aw ? '有' : '无'} 句子=${ad ? '有' : '无'} · 截断 记录=${cw ? '有' : '无'} 句子=${cd ? '有' : '无'}`);
console.log(`  ${table.length} 扇门 × 2 个预算，记录与句子一致：${table.every(([, aw, ad, cw, cd]) => aw === ad && cw === cd) ? 'YES' : 'NO'}`);

console.log('\n§3 那一位聚合的布尔值不是这个声明：一个双管程序对照');
{
  const dir = tmpOf(mkTmp('nexus-v69-pipes'));
  const script = join(dir, 'p.mjs');
  writeFileSync(script, "process.stdout.write('the answer, whole and small\\n');\nprocess.stderr.write('x'.repeat(9000) + '\\n');\n", 'utf8');
  const policy = { root: dir, allow: [{ argv: ['node', script], timeoutMs: 10_000, maxOutputBytes: 512 }], envAllow: ['PATH'], maxTimeoutMs: 10_000, maxOutputBytes: 512 };
  const host = createExecHost(policy, { spawnLike: counting });
  const r = await host.run({ argv: ['node', script], cwd: '.', env: { PATH: process.env.PATH ?? '' } }, { preApproved: true });
  doorReads += 1;
  console.log(`  exec.run: ran=${r.ran} reason=${JSON.stringify(r.reason ?? '')} killed=${r.killedByBudget} · truncated=${r.truncated} · streams=${JSON.stringify(r.truncatedStreams)} · exit ${r.exitCode} · spawnError ${JSON.stringify(r.spawnError)} · stdout kept ${Buffer.byteLength(r.stdout)} B of ${Buffer.byteLength('the answer, whole and small\n')} B`);
  assert.equal(r.ran, true, 'the stand-in program must actually run or §3 measures nothing');
  assert.equal(r.truncated, true, 'the aggregate bit fires');
  assert.deepEqual(r.truncatedStreams, ['stderr'], 'and it was the pipe nobody parses that lost the bytes');
  assert.equal(stdoutWasCut(r), false, 'so `truncated: true` alone is exactly the ambiguity v69 removes: the parsed answer is WHOLE');
  assert.deepEqual(windowField(r), {}, 'the derived record field declines to claim a window here — which is what a consumer of a door record needs to be able to ask');
  assert.ok(r.stdout.includes('the answer, whole'), 'and the answer did arrive intact beside 9 000 bytes of noise');
}

console.log('\n§4 记录里没有别的键在漂移：同一扇门截断前后只差这一个键');
for (const [label, makePolicy, register, tool, args] of doors) {
  const whole = await read(makePolicy(), register, tool, args, 1 << 20, `k1:${label}`);
  const cut = await read(makePolicy(), register, tool, args, bytesOf(3), `k2:${label}`);
  const stripped = { ...cut };
  delete stripped.windowed;
  assert.deepEqual(Object.keys(stripped).sort(), Object.keys(whole).sort(), `${label}: v69 adds ONE key to the record and moves no other — the shape of a cut answer is the shape of a whole one minus its bytes`);
}
console.log(`  ${doors.length} 扇门：截断记录去掉 windowed 后与未截断记录同形（不多不少一个键）`);

console.log('\n§5 §9 守住，计数对得上');
assert.equal(g('.', 'rev-parse', 'HEAD').trim(), homeHead, "the home repository's HEAD is byte-identical: nothing here wrote outside os.tmpdir");
assert.equal(spawns, doorReads + nonzeroStderr, `${spawns} processes = ${doorReads} door/host reads + ${nonzeroStderr} unexpected stderr states — every window above was a real git, not a replay`);
console.log(`\n[summary] doors coupled sentence↔record: ${table.length} × 2 budgets · keys added to a record: 1 (windowed, absent when whole) · aggregate bit alone proven insufficient: exec.run with stdout whole and 9 000 B of stderr cut · git reads whose stderr was non-empty at exit 0: ${nonzeroStderr}/8 · door-spawned processes: ${spawns}`);
execFileSync('node', ['-e', `for (const d of ${JSON.stringify(temps)}) require("fs").rmSync(d,{recursive:true,force:true})`]);
console.log('[cleanup] throwaway repos removed');
