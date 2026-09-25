// NEXUS M2 v68 (exec-host) — A LOG READ'S COUNT IS A FLOOR, AND NEWEST-FIRST IS WHY ITS ENTRIES ARE NOT
// (ADR 0016 amendment 68).
// v66 put `AT LEAST` on the three doors that read a DIFF and left the door that reads a LOG saying
// `N commit(s)`. Measured on this box (git 2.52) in a throwaway repo with 25 commits, git's own
// `rev-list --count HEAD` = 25: every one of the log read's 24 whole-line cut budgets printed a census —
// `git.log → exit 0: 8 commit(s) · newest …` for a pipe that held 25 lines and delivered 8 — with only
// v56's `(output truncated at budget (stdout))` beside it. So the same §28-facing species of sentence v66
// fixed was still being spoken by the door the plan's CONFIRM step uses.
// A log read is not a diff read, and the difference cuts both ways, which is why this proof measures both
// sides instead of pasting v66's sentence here. A diff section can be cut MID-BODY, so its last named
// change may be short and the ones before it are whole. A log line names exactly ONE commit and git prints
// them NEWEST FIRST: a cut cannot shorten an entry, it can only stop handing over the OLDER ones. Measured:
// 0 of the 24 windows lost the newest entry, and every window's survivors are git's own newest-k lines
// byte-for-byte (§2/§3) — so v37's read-back ("the newest logged commit IS the record I was handed")
// survives the cut that makes the COUNT a floor. That asymmetry is the increment: floor the count, keep the
// claim about the newest, and never imply an entry was shortened.
// §1 measures git's own bytes and census. §2 drives the shipped door at two budgets taken from those
// offsets. §3 sweeps every whole-line boundary (24 windows) and classifies each one. §4 lands a REAL commit
// through the commit door and reads it back through a budget tight enough to cut the log, asserting the
// byte-equality v37 was built for. §5 keeps v48's zero-case sentence untouched — a floor of nothing is not
// a floor of a count. §6 rebuilds the pre-v68 wording from the door's own bytes to show exactly what changed
// and proves an uncut read is byte-identical to it. §7 pins the family (the two notices stay siblings) and
// §8 holds §9: throwaway repos under os.tmpdir, hooks and signing neutralized LOCALLY there, staging done by
// plain git as the human, this repository's HEAD compared byte-wise at the end.
// Run after `npm run build`:  node docs/evidence/agents/log-window-proof.mjs
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
  GIT_LOG_FLAGS, NODE_SPAWN, createExecHost, diffWindowNotice, gitCommitPolicy, gitEnv, gitLogPolicy,
  logWindowNotice, registerGitCommitTool, registerGitLogTool,
} = eh;

const PIN = gitEnv({});
const raw = (dir, ...argv) =>
  execFileSync('git', argv, { cwd: dir, env: { ...PIN, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', maxBuffer: 1 << 23 });
const N = 25;
function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}
const homeHead = raw('.', 'rev-parse', 'HEAD').trim();
const workRoot = mkTmp('nexus-v68-proof');
let spawns = 0;
let doorReads = 0;
const counting = (cmd, args, opts) => {
  spawns += 1;
  return NODE_SPAWN(cmd, args, opts);
};
/** the door, at a budget the proof does not choose to flatter the fix */
const logDoor = async (root, budget, count) => {
  doorReads += 1;
  const host = createExecHost(gitLogPolicy(root, budget === undefined ? {} : { maxOutputBytes: budget }), { spawnLike: counting });
  const r = await registerGitLogTool(new ToolRegistry(), host, { env: {} })
    .invoke({ callId: `v68:${budget ?? 'free'}:${count}`, tool: 'git.log', args: { count } }, { checkpoint: () => true });
  if (!r.ok) throw new Error(`git.log refused: ${r.error}`);
  return r.output;
};

// --- the fixture: 25 commits with subjects long enough that a byte budget is a real window ---
const r1 = join(workRoot, 'r1');
mkdirSync(r1, { recursive: true });
raw(r1, 'init', '-q', '-b', 'main');
for (const [k, v] of Object.entries({ 'core.hooksPath': join(r1, '.git', 'no-hooks'), 'user.email': 'proof@invalid', 'user.name': 'proof', 'commit.gpgsign': 'false', 'core.autocrlf': 'false' })) {
  raw(r1, 'config', '--local', k, v);
}
writeFileSync(join(r1, 'a.txt'), 'seed\n');
raw(r1, 'add', '-A');
raw(r1, 'commit', '-qm', 'seed commit whose subject carries a little length so lines cost bytes');
for (let i = 1; i < N; i += 1) {
  writeFileSync(join(r1, 'a.txt'), `seed\nline ${i}\n`);
  raw(r1, 'add', 'a.txt');
  raw(r1, 'commit', '-qm', `chore: commit number ${i} of twenty-five, padded on purpose`);
}
const gitLog = raw(r1, 'log', '--oneline', ...GIT_LOG_FLAGS, '-n', String(N));
const lines = gitLog.split('\n').filter((l) => l !== '');
const census = Number(raw(r1, 'rev-list', '--count', 'HEAD').trim());

// --- §1 git's own words: the census the door is being asked to speak ---
console.log('§1 git 自己的数字');
console.log(`  rev-list --count HEAD = ${census} · git log --oneline -n ${N} printed ${lines.length} lines / ${Buffer.byteLength(gitLog)} bytes`);
assert.equal(census, N, 'the fixture really holds 25 commits, or every window below is vacuous');
assert.equal(lines.length, N, 'and git really printed all of them for the ask this proof replays');
const newest = lines[0].slice(0, 7);
const bytesOf = (list, keep) => list.slice(0, keep).reduce((b, l) => b + Buffer.byteLength(l, 'utf8') + 1, 0);
const budgetOf = (keep) => bytesOf(lines, keep);
console.log(`  newest line = ${JSON.stringify(lines[0])}`);

// --- §2 the shipped door at two budgets derived from git's own offsets ---
console.log('\n§2 出货的门在两个真实预算下');
{
  const o = await logDoor(r1, budgetOf(8), N);
  console.log(`  keep 8 of ${N}: ${o.detail}`);
  assert.equal(o.commits.length, 8, 'the window really holds eight of git twenty-five lines');
  assert.ok(o.detail.includes('AT LEAST 8 commit(s)'), `the count is a floor and the sentence says so: ${o.detail}`);
  assert.ok(!o.detail.includes(': 8 commit(s)'), `the census phrasing is unreachable on a cut read: ${o.detail}`);
  assert.ok(o.detail.includes('this door asked for 25'), 'and the floor names what it is a floor OF — the bound this door asked git for');
  assert.ok(o.detail.includes('OLDER than every entry named here'), 'the direction of the missing entries is stated');
  assert.deepEqual(o.commits.map((c) => c.hash), lines.slice(0, 8).map((l) => l.slice(0, 7)), 'every surviving entry is git\'s own, in git\'s own newest-first order');
  const one = await logDoor(r1, budgetOf(1), N);
  console.log(`  keep 1 of ${N}: ${one.detail}`);
  assert.equal(one.commits.length, 1, 'the tightest window that names anything names ONE commit');
  assert.ok(one.detail.includes('AT LEAST 1 commit(s)'), `one line is not a census of a 25-commit history: ${one.detail}`);
  assert.ok(one.detail.includes('newest'), 'even here the newest-first clause is what the door can still promise');
}

// --- §3 EVERY whole-line boundary of that read, classified ---
console.log('\n§3 全部行界的普查（窗口population）');
let cuts = 0, floored = 0, censusShaped = 0, newestLost = 0, overCount = 0, wrongSurvivors = 0, rebuiltCensus = 0;
for (let keep = 1; keep < lines.length; keep += 1) {
  const o = await logDoor(r1, budgetOf(keep), N);
  cuts += 1;
  if (o.detail.includes('AT LEAST')) floored += 1; else censusShaped += 1;
  // the PRE-v68 wording, rebuilt from this window's own bytes: take the clause out and the door is back to
  // speaking a census. Done for every window, so "all 24 were censuses before" is a measurement here rather
  // than a memory of the probe that found the bug.
  const stripped = o.detail.replace(logWindowNotice({ window: true, read: o.commits.length, asked: N }), '').replace('AT LEAST ', '');
  if (stripped.startsWith(`git.log → exit 0: ${o.commits.length} commit(s)`)) rebuiltCensus += 1;
  if (o.commits[0].hash !== newest) newestLost += 1;
  if (o.commits.length > census) overCount += 1;
  if (o.commits.map((c) => c.hash).join(' ') !== lines.slice(0, o.commits.length).map((l) => l.slice(0, 7)).join(' ')) wrongSurvivors += 1;
  assert.ok(o.truncated, `budget ${keep} claimed to read the whole pipe — the sweep would be measuring nothing`);
}
console.log(`  ${cuts} 个整行截断窗口：${floored} 个报 floor、${censusShaped} 个报 census · ${rebuiltCensus} 个剥掉子句后回到 census 措辞 · ${newestLost} 个丢了最新条目 · ${wrongSurvivors} 个幸存者与 git 不一致 · ${overCount} 个报得比仓库还多`);
assert.equal(rebuiltCensus, cuts, `every window's own bytes contain a pre-v68 census sentence (${rebuiltCensus}/${cuts})`);
assert.equal(censusShaped, 0, 'not one cut window may phrase its count as the repository\'s');
assert.equal(floored, cuts, 'and every one of them floors it');
assert.equal(newestLost, 0, `newest-first is the whole asymmetry: 0 of ${cuts} windows may lose the newest entry`);
assert.equal(wrongSurvivors, 0, 'and no window may rename or reorder what survived — they are git\'s own lines');
assert.equal(overCount, 0, 'a floor never overstates the history');

// --- §4 v37's read-back through a budget tight enough to cut: the claim that MATTERS still holds ---
console.log('\n§4 真提交 + 截断的读回：v37 的断言活下来，count 不活');
writeFileSync(join(r1, 'a.txt'), 'seed\nline 24\nexported by the human\n');
raw(r1, 'add', 'a.txt'); // staging is the human's act (§9/§28)
const commitHost = createExecHost(gitCommitPolicy(r1), { spawnLike: counting });
doorReads += 1; // the write door counts as a door read too, so the two numbers can be compared honestly
const committed = await registerGitCommitTool(new ToolRegistry(), commitHost, { env: {} })
  .invoke({ callId: 'v68:commit', tool: 'git.commit', args: { message: 'feat: the commit this proof reads back through a cut log' } }, { checkpoint: () => true });
assert.ok(committed.ok, `the granted commit must land or §4 proves nothing: ${JSON.stringify(committed.error ?? committed.output)}`);
const rec = committed.output;
const landed = rec.record?.hash;
assert.ok(landed, `the commit door's own record must carry a hash for §4 to read back: ${JSON.stringify(rec)}`);
const afterCensus = Number(raw(r1, 'rev-list', '--count', 'HEAD').trim());
console.log(`  commit door: ${rec.detail}`);
console.log(`  the history now holds ${afterCensus} commits (git's own count), and one line costs ${Buffer.byteLength(raw(r1, 'log', '--oneline', ...GIT_LOG_FLAGS, '-n', '1'), 'utf8')} bytes`);
assert.equal(afterCensus, N + 1, '§4 is measuring a read-back of a commit that really landed');
for (const keep of [1, 2, 5]) {
  const o = await logDoor(r1, budgetOf(keep), N + 1);
  assert.equal(o.commits[0].hash, landed, `v37's equality survives even at keep=${keep}: the newest entry a window can name IS the commit the agent was handed`);
  assert.ok(o.commits.length < afterCensus, `and the SAME read's count (${o.commits.length}) is below the census (${afterCensus}) — the two halves disagree, deliberately, because the sentence says which is a floor`);
  assert.ok(o.detail.includes('AT LEAST'), `count clause at keep=${keep}: ${o.detail}`);
  console.log(`  keep=${keep}: newest ${o.commits[0].hash} === record ${landed} · door counted ${o.commits.length} of ${afterCensus}`);
}

// --- §5 v48's zero case is NOT floored: nothing to floor ---
console.log('\n§5 一个字节都不剩的预算仍是 v48 的那句');
{
  const o = await logDoor(r1, 4, N);
  console.log(`  budget 4B: ${o.detail}`);
  assert.equal(o.commits.length, 0, 'no whole line survived');
  assert.ok(o.detail.includes('no complete line survived the output budget'), `v48 owns this case: ${o.detail}`);
  assert.ok(!o.detail.includes('AT LEAST'), 'a floor of NOTHING is not a floor of a count');
  assert.ok(!o.detail.includes('OLDER than every entry'), 'and it names no entries for anything to be older than');
  assert.ok(!o.detail.includes('(empty log)'), 'the false absence stays reserved for an un-cut empty history');
}

// --- §6 the pre-v68 wording, rebuilt from the door's own bytes; and the uncut read equals it ---
console.log('\n§6 被替换的措辞由门自己的字节重建');
{
  const cut = await logDoor(r1, budgetOf(8), N);
  const k = cut.commits.length;
  assert.ok(k > 0 && k < N, `this budget has to leave a window that names something, and it named ${k}`);
  const notice = logWindowNotice({ window: true, read: k, asked: N });
  assert.ok(notice.length > 0, 'the clause under test must exist before it can be removed');
  const rebuilt = cut.detail.replace(notice, '').replace('AT LEAST ', '');
  const censusShapedAgain = `git.log → exit 0: ${k} commit(s)`;
  assert.ok(rebuilt.startsWith(censusShapedAgain), `this is the sentence v68 replaced, rebuilt from the door's own bytes: ${rebuilt}`);
  console.log(`  v68 之前的门就是这样说的: ${censusShapedAgain} · …（${k} 个幸存条目 / ${N} 个存在）`);
  const whole = await logDoor(r1, undefined, N);
  assert.ok(!whole.detail.includes('AT LEAST'), `an uncut read must not inherit the clause: ${whole.detail}`);
  assert.ok(!whole.detail.includes('FLOOR'), 'nor its explanation');
  assert.equal(whole.commits.length, N, 'and it really read all 25');
  console.log(`  未截断: ${whole.detail.slice(0, 96)}…`);
  const exactBoundary = await logDoor(r1, bytesOf(raw(r1, 'log', '--oneline', ...GIT_LOG_FLAGS, '-n', String(N)).split('\n').filter((l) => l !== ''), N), N);
  assert.equal(exactBoundary.detail, whole.detail, 'a budget landing exactly on the LAST line boundary is the same answer as no budget at all — the rule keys off a cut, not off a small number');
}

// --- §7 the family stays siblings, in data ---
console.log('\n§7 家族：一条规则，两种读法');
assert.equal(logWindowNotice({ window: false, read: 9, asked: 25 }), '', 'no clause for a read that was not cut');
const diff = diffWindowNotice({ window: true, subject: 'the index', named: 8, partial: { path: 'src/x.ts', additions: 1, deletions: 0 } });
const log = logWindowNotice({ window: true, read: 8, asked: 25 });
assert.ok(diff.includes('MAY stop') && !log.includes('MAY stop'), 'v66 has to hedge about a section cut mid-body; a log line cannot be cut mid-commit');
assert.ok(!log.includes('hunk') && !log.includes('census of it'), 'and the two sentences do not share a template they would both be wrong in');
console.log(`  diff notice: ${diff.slice(0, 70)}…\n  log  notice: ${log.slice(0, 70)}…`);

// --- §8 §9 holds, and the counters add up ---
assert.equal(raw('.', 'rev-parse', 'HEAD').trim(), homeHead, "the home repository's HEAD is byte-identical: nothing here wrote outside os.tmpdir");
assert.equal(spawns, doorReads, `${spawns} door-spawned processes over ${doorReads} door reads: every window above cost a real git, so the sweep measured the doors and not this file`);
console.log(`\n[summary] commits in fixture: ${census} · git printed ${lines.length} lines / ${Buffer.byteLength(gitLog)} bytes · whole-line cut windows swept: ${cuts} · floored: ${floored} · census-shaped: ${censusShaped} · newest entry lost: ${newestLost} · survivors disagreeing with git: ${wrongSurvivors} · zero-line case still v48's: yes · door-spawned processes: ${spawns}`);
execFileSync('node', ['-e', `require("fs").rmSync(${JSON.stringify(workRoot)},{recursive:true,force:true})`]);
console.log('[cleanup] throwaway repos removed');
