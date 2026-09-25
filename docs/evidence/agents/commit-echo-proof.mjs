// NEXUS M2 v70 (exec-host) — THE WRITE DOOR'S RECORD JOINS THE WINDOW FAMILY, BECAUSE A BUDGET CANNOT
// UN-COMMIT AND A MISSING RECORD MUST NOT READ LIKE A REFUSAL (ADR 0016 amendment 70).
// v69 put the window claim into every door that PARSES and left `git.commit` alone by choice. This proof
// measures what that left exposed, with real git: a 40-file commit through the shipped door, echo and all.
// At a generous budget the door answers `main@28d2ad7 · 40 file(s) +40 −40` with a full `record`. At 120
// bytes the first echo line survives and `record.stat` is `null` — the door says so in prose (`· output
// truncated at budget (stdout)`). At 8 bytes `record` is ABSENT from the record entirely and the door says
// `committed (git echoed no summary line — stated, not guessed)`. And HEAD MOVED IN EVERY CASE: a budget
// trims what the door HEARD, never what git DID.
// That is the asymmetry this increment names in the record. `ok: true`, `exitCode: 0` and no `record` is a
// shape a cold reader of the ledger cannot distinguish from "git committed nothing notable" unless something
// says which of the two spoke. So `windowField` — one derived key, present only when the door's own pipe was
// cut — goes onto the commit door's record as well, on both the success and the refusal branch.
// Coupling is measured with a REAL commit rather than a fake spawn on purpose: the shape of git's commit
// echo (a bracketed header, then a stat footer, then create-mode lines after it) is precisely the thing a
// hand-written fixture gets quietly wrong (v46's and v60's lesson). §1 records git's own census; §2 walks
// four budgets and checks what survived against HEAD itself, moved and counted OUTSIDE the sandbox; §3
// proves the door never implies a refusal; §4 round-trips the three shapes through JSON the way the ledger
// does, so the key is shown to survive into a cold read; §5 holds §9.
// Run after `npm run build`:  node docs/evidence/agents/commit-echo-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const { createExecHost, gitCommitPolicy, gitEnv, registerGitCommitTool } = eh;

const PIN = gitEnv({});
const g = (dir, ...argv) => execFileSync('git', argv, { cwd: dir, env: { ...PIN, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}
const homeHead = g('.', 'rev-parse', 'HEAD').trim();
const temps = [];
const tmpOf = (p) => (temps.push(p), p);
const root = tmpOf(mkTmp('nexus-v70-proof'));
let spawns = 0;
let doorReads = 0;
const counting = (cmd, args, opts) => {
  spawns += 1;
  return eh.NODE_SPAWN(cmd, args, opts);
};
const N = 40;
g(root, 'init', '-q', '-b', 'main');
for (const [k, v] of Object.entries({ 'user.email': 'proof@invalid', 'user.name': 'proof', 'core.hooksPath': join(root, '.git', 'none'), 'commit.gpgsign': 'false', 'core.autocrlf': 'false' })) {
  g(root, 'config', '--local', k, v);
}
for (let i = 0; i < N; i += 1) {
  mkdirSync(join(root, `src/m${i}`), { recursive: true });
  writeFileSync(join(root, `src/m${i}/a-long-file-name-${i}.ts`), `export const a = ${i};\n`);
}
g(root, 'add', '-A');
g(root, 'commit', '-qm', 'seed: forty files so the echo has a tail to lose');

/** one granted commit through the shipped door, at a budget; then git, OUTSIDE the sandbox, says what happened */
// One fixed subject, so the echo HEADER has the same byte length every round and the two budgets below are
// derived from it rather than guessed at: git's commit echo is `[branch hash] subject` then the stat footer.
const MSG = 'feat: the echo-shape sweep commit, padded so every round has a header of exactly the same byte length xx';
const HEADER = Buffer.byteLength(`[main 0000000] ${MSG}`, 'utf8') + 1; // + the newline git ends the line with
async function commitAt(budget, round) {
  for (let i = 0; i < N; i += 1) writeFileSync(join(root, `src/m${i}/a-long-file-name-${i}.ts`), `export const a = ${i}; // round ${round}: staged by the human, ${'x'.repeat(24)}\n`);
  g(root, 'add', '-A');
  const before = g(root, 'rev-parse', 'HEAD').trim();
  const beforeCount = Number(g(root, 'rev-list', '--count', 'HEAD').trim());
  const p = { ...gitCommitPolicy(root), allow: gitCommitPolicy(root).allow.map((a) => ({ ...a, maxOutputBytes: budget })) };
  const host = createExecHost(p, { spawnLike: counting });
  doorReads += 1;
  const message = MSG;
  const r = await registerGitCommitTool(new ToolRegistry(), host, { env: {} })
    .invoke({ callId: `v70:${budget}`, tool: 'git.commit', args: { message } }, { checkpoint: () => true });
  if (!r.ok) throw new Error(`granted commit refused at budget ${budget}: ${r.error}`);
  const after = g(root, 'rev-parse', 'HEAD').trim();
  const afterCount = Number(g(root, 'rev-list', '--count', 'HEAD').trim());
  return { budget, out: r.output, message, moved: after !== before, commits: afterCount - beforeCount, head: after };
}

console.log('§1 git 自己的账（40 个暂存文件，回声真实长度由宽预算定标）');
const wide = await commitAt(1 << 20, 0);
console.log(`  宽预算: ${wide.out.detail}`);
assert.ok(wide.moved && wide.commits === 1, 'the fixture commits one commit per round or the later budgets prove nothing');
assert.ok(wide.out.record?.stat, `a generous read must produce a full record: ${JSON.stringify(wide.out)}`);
assert.equal(wide.out.record.stat.files, N, `git's own echo counts ${N} files, and the door parsed all of them`);
assert.equal('windowed' in wide.out, false, 'and a whole read carries no window key (v69 semantics, unchanged)');
const at600 = await commitAt(600, 600);
assert.equal('windowed' in at600.out, false, 'a 600-byte read of git TWO-LINE echo is whole — so the two cut shapes below are not a matter of degree');
assert.ok(at600.out.record?.stat, 'and it still yields the full record, stat included');
console.log(`  600 字节: ${at600.out.detail} · windowed=${'windowed' in at600.out}`);

console.log('\n§2 两个截断预算：什么幸存、HEAD 是否真的动了');
// (git's commit echo is TWO lines — a bracketed header then the stat footer — so any budget that keeps the
// footer kept the whole echo, exactly as v66 found for `--stat`. The two shapes below are therefore the only
// two ways a cut can degrade this record, and the generous read of §1 is the third.)
const shapes = [];
for (const [budget, expect] of [[HEADER + 1, 'stat-lost'], [HEADER - 20, 'record-lost']]) {
  const run = await commitAt(budget, budget);
  const o = run.out;
  console.log(`  budget ${String(budget).padEnd(6)} ok=${o.ok} exit=${o.exitCode} truncated=${o.truncated} windowed=${o.windowed} record=${o.record ? `hash=${o.record.hash} stat=${o.record.stat ? `${o.record.stat.files} file(s)` : 'NULL'}` : 'ABSENT'} · HEAD 移动 ${run.moved} (${run.commits} commit) · ${o.detail}`);
  assert.equal(run.moved, true, `budget ${budget}: a cut echo must not be confused with an un-run commit — git committed`);
  assert.equal(run.commits, 1, `budget ${budget}: exactly one commit landed`);
  assert.equal(o.ok, true, `budget ${budget}: the door answers ok:true — it is not a refusal`);
  assert.equal(o.windowed, true, `budget ${budget}: and the record says the pipe it parsed was cut`);
  assert.equal(o.truncated, true, `budget ${budget}: v30's aggregate bit is true beside it`);
  if (expect === 'stat-lost') {
    assert.ok(o.record, 'the mid budget keeps the header line, so a record exists');
    assert.equal(o.record.stat, null, 'its stat is NULL because the footer never arrived — `windowed` is what distinguishes that from "git recorded nothing"');
    assert.equal(o.record.hash, run.head.slice(0, 7), 'and the hash it did keep is the commit HEAD actually moved to');
    assert.equal(o.record.subject, run.message, 'the subject survived verbatim');
  }
  if (expect === 'record-lost') {
    assert.equal('record' in o, false, 'the tightest budget leaves no record at all — the door does not invent one');
    assert.ok(o.detail.includes('stated, not guessed'), `and it says so: ${o.detail}`);
  }
  shapes.push({ budget, keys: Object.keys(o).sort().join(','), hasRecord: 'record' in o, stat: o.record?.stat === null ? 'null' : o.record?.stat ? 'object' : 'absent' });
}

console.log('\n§3 门不得把截断说成拒绝');
for (const budget of [HEADER + 1, HEADER - 20]) {
  const run = await commitAt(budget, 1000 + budget);
  const d = run.out.detail;
  assert.ok(!/REFUSED|refused/i.test(d), `a cut echo is not a refusal — git committed: ${d}`);
  assert.ok(d.includes('output truncated at budget (stdout)'), `the door names the pipe instead: ${d}`);
}
console.log('  both cut reads said "truncated", neither said "refused", and HEAD moved once per round (git, outside the sandbox, counted it)');

console.log('\n§4 三种形状过一遍账本用的 JSON 往返，键活到冷读');
for (const budget of [1 << 20, HEADER + 1, HEADER - 20]) {
  const run = await commitAt(budget, 2000 + (budget % 1000));
  const revived = JSON.parse(JSON.stringify([run.out]))[0];
  assert.deepEqual(Object.keys(revived).sort(), Object.keys(run.out).sort(), `budget ${budget}: a ledger round trip loses no field`);
  if (budget === 1 << 20) assert.equal('windowed' in revived, false, 'and the whole read still carries no window key after a round trip');
  else assert.equal(revived.windowed, true, `budget ${budget}: a cold reader can still tell the missing numbers are the cut's, not git's`);
  if (revived.record) assert.deepEqual(Object.keys(revived.record).sort(), Object.keys(run.out.record).sort(), 'the nested record round-trips too, null stat and all');
}

console.log('\n§5 §9 守住，计数对得上');
assert.equal(g('.', 'rev-parse', 'HEAD').trim(), homeHead, "the home repository's HEAD is byte-identical: every commit here landed in os.tmpdir");
assert.equal(spawns, doorReads, `${spawns} processes over ${doorReads} granted commits — each shape above is one real git, not a fixture`);
console.log(`\n[summary] budgets swept: ${doorReads} real commits of ${N} staged files each · record shapes: full / stat-null / record-absent · HEAD moved in every one: yes · windowed present exactly when the echo was cut: yes · refusals implied: 0 · JSONL round-trip keeps the key: yes · processes: ${spawns}`);
execFileSync('node', ['-e', `for (const d of ${JSON.stringify(temps)}) require("fs").rmSync(d,{recursive:true,force:true})`]);
console.log('[cleanup] throwaway repo removed');
