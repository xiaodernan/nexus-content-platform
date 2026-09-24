// NEXUS M2 v66 (exec-host) — A CUT DIFF TALLY IS A WINDOW CLAIM, NOT A CENSUS
// (ADR 0016 amendment 66).
// v63 taught `git.status` that a read the output budget trimmed may only speak about the read. The
// three doors that read a DIFF never got that rule, so they went on printing git's phrasing —
// "N change(s)", "N files", "+a −b across h hunk(s)" — over a window, while §28 weighs a commit
// decision on those numbers. Measured on this box (git 2.52) in a throwaway repo whose index holds 25
// staged changes of 3 hunks each, git's own footer `25 files changed, 75 insertions(+), 75 deletions(-)`:
// a budget that keeps 8 of the 25 sections made `git.staged` answer `index holds 8 change(s): 8
// modified · +24 −24 across 24 hunk(s)` — and 774 of that diff's 776 line boundaries produced such a
// census-shaped answer. `git.diff` said `1 files, +0 −0 (0 hunks)` about a file git counts at +1 −1,
// and `0 files, +0 −0 (0 hunks)` about a real 4-section diff. `git.show` said `HEAD changed
// src/mod-09/a-long-file-name-9.ts · +12 −0` where git's own `--numstat` for that path is `60  0`;
// 59 of its 67 possible windows short-count a file the door simultaneously says HEAD changed.
// This proof does not take the new sentence on trust. §1 re-measures the census through real git and
// checks that a WHOLE read is still worded exactly as before v66. §2 drives the shipped doors through
// REAL git at two budgets chosen from git's own byte offsets — one where the cut lands between two
// sections and one inside a hunk — and grades the doors' "the changes named before the last are
// whole" claim against git's own per-path `--numstat`. §3 sweeps EVERY line boundary of the recorded
// bytes (774 windows) for the properties the sentence rests on, and §3a proves the replay is faithful
// by re-running real git at twelve of those budgets and comparing the whole answer byte for byte.
// §4–§6 cover the doors where the cut location IS knowable (`git.show`, one path) and the `--stat`
// faces, which a footer-position measurement shows need no window clause at all. §7 lets one real
// commit through the commit door and shows the census phrasing was the FALSE statement: the index held
// 25, the window named 8, and HEAD recorded 25. §9 holds: throwaway repos under os.tmpdir, hooks and
// signing neutralized LOCALLY there, staging done by plain git as the human, this repository's HEAD
// compared byte-wise at the end.
// Run after `npm run build`:  node docs/evidence/agents/cut-tally-proof.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const {
  GIT_DIFF_FLAGS, NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, gitReadOnlyPolicy, gitShowPolicy,
  gitStagedPolicy, parseDiffStat, registerGitCommitTool, registerGitShowTool, registerGitStagedTool, registerGitTools,
} = eh;

const PIN = gitEnv({});
const raw = (dir, ...argv) =>
  new Promise((resolve) => {
    execFile('git', argv, { cwd: dir, env: { ...PIN, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', maxBuffer: 1 << 23 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
const setup = async (dir, ...argv) => {
  const r = await raw(dir, ...argv);
  if (r.code !== 0) throw new Error(`setup ${argv.join(' ')} → ${r.code}: ${r.stderr}`);
  return r;
};
function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}

const homeHead = (await raw('.', 'rev-parse', 'HEAD')).stdout.trim();
const workRoot = mkTmp('nexus-v66-proof');
let spawns = 0;
const counting = (cmd, args, opts) => {
  spawns += 1;
  return NODE_SPAWN(cmd, args, opts);
};

// --- the fixture: ONE human seed commit of 25×60 lines, then 25 staged edits of 3 hunks each, then
// 4 of those files edited AGAIN so the working-tree door has its own 4-section answer ---
const N = 25;
const pathOf = (i) => `src/mod-${String(i).padStart(2, '0')}/a-long-file-name-${i}.ts`;
const bodyOf = (i, tag) => Array.from({ length: 60 }, (_, k) => `${tag} ${i}-${k} ${'q'.repeat(20)}`);
const r1 = join(workRoot, 'r1');
mkdirSync(r1, { recursive: true });
await raw(r1, 'init', '-q', '-b', 'main');
for (const [k, v] of [['user.email', 'proof@nexus.test'], ['user.name', 'NEXUS Proof'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) await setup(r1, 'config', k, v);
await setup(r1, 'config', 'core.hooksPath', join(r1, '.nohooks')); // §9: neutralized LOCALLY, in the throwaway repo
for (let i = 1; i <= N; i += 1) {
  mkdirSync(join(r1, pathOf(i).split('/').slice(0, -1).join('/')), { recursive: true });
  writeFileSync(join(r1, pathOf(i)), bodyOf(i, 'seed').join('\n') + '\n');
}
await setup(r1, 'add', '.');
await setup(r1, 'commit', '-q', '-m', 'human seed: 25 files of 60 added lines each');
for (let i = 1; i <= N; i += 1) {
  const l = bodyOf(i, 'seed');
  for (const k of [3, 20, 45]) l[k] = `EDITED ${i}-${k} ${'z'.repeat(26)}`;
  writeFileSync(join(r1, pathOf(i)), l.join('\n') + '\n');
}
await setup(r1, 'add', '.'); // the human stages; §28 keeps staging outside the doors
for (let i = 1; i <= 4; i += 1) {
  const l = bodyOf(i, 'seed');
  for (const k of [3, 20, 45]) l[k] = `EDITED ${i}-${k} ${'z'.repeat(26)}`;
  l[50] = `UNSTAGED ${i} ${'w'.repeat(26)}`;
  writeFileSync(join(r1, pathOf(i)), l.join('\n') + '\n');
}

// The five faces, captured from real git through the EXACT argv each policy allows — so every budget
// below is derived from git's own byte offsets rather than remembered from a previous run.
const face = {
  staged: (await setup(r1, 'diff', ...GIT_DIFF_FLAGS, '--cached')).stdout,
  stagedStat: (await setup(r1, 'diff', ...GIT_DIFF_FLAGS, '--cached', '--stat')).stdout,
  work: (await setup(r1, 'diff', ...GIT_DIFF_FLAGS)).stdout,
  workStat: (await setup(r1, 'diff', ...GIT_DIFF_FLAGS, '--stat')).stdout,
  show: (await setup(r1, 'show', ...GIT_DIFF_FLAGS, '--format=', '--', pathOf(9))).stdout,
};
const boundariesOf = (text) => {
  const out = [];
  let o = 0;
  for (const l of text.split('\n')) {
    o += l.length + 1;
    out.push(o);
  }
  return out;
};
const sectionStart = (text, n) => {
  let o = 0;
  let seen = 0;
  for (const l of text.split('\n')) {
    if (l.startsWith('diff --git ') && seen++ === n) return o;
    o += l.length + 1;
  }
  return text.length;
};

/** The shipped doors: real git, or the same host+door replaying git's recorded bytes. */
async function door(kind, { budget = 1 << 20, args = {}, replay = null, callId = 'v66' } = {}) {
  const policy = kind === 'staged' ? gitStagedPolicy : kind === 'show' ? gitShowPolicy : gitReadOnlyPolicy;
  const tool = kind === 'work' ? 'git.diff' : `git.${kind}`;
  const host = createExecHost(policy(r1, { maxOutputBytes: budget }), replay === null ? { spawnLike: counting } : { spawnLike: replay });
  const reg = kind === 'staged' ? registerGitStagedTool(new ToolRegistry(), host, { env: {} })
    : kind === 'show' ? registerGitShowTool(new ToolRegistry(), host, { env: {} })
      : registerGitTools(new ToolRegistry(), host, { env: {} });
  const res = await reg.invoke({ callId, tool, args }, { checkpoint: () => true });
  if (res.output?.ok !== true) throw new Error(`${tool} refused: ${JSON.stringify(res.output ?? res.error)}`);
  return res.output;
}
/** A SpawnLike that hands back recorded bytes in 16 KB pieces — the HOST still does the truncating. */
const replayer = (text) => () => {
  const listeners = [];
  const ends = [];
  const child = {
    onData: (l) => listeners.push(l),
    onEnd: (l) => ends.push(l),
    kill: () => ends.forEach((l) => l({ code: null, signal: 'SIGTERM' })),
  };
  queueMicrotask(() => {
    for (let i = 0; i < text.length; i += 16384) for (const l of listeners) l('stdout', text.slice(i, i + 16384));
    for (const l of ends) l({ code: 0, signal: null });
  });
  return child;
};

const WINDOW = /this is a WINDOW on .*, NOT a census of it/;

// --- §1 git's own census, and the doors saying it in git's words when the read is WHOLE ---
const census = {
  staged: (await setup(r1, 'diff', ...GIT_DIFF_FLAGS, '--cached', '--shortstat')).stdout.trim(),
  work: (await setup(r1, 'diff', ...GIT_DIFF_FLAGS, '--shortstat')).stdout.trim(),
  showNum: (await setup(r1, 'show', ...GIT_DIFF_FLAGS, '--format=', '--numstat', '--', pathOf(9))).stdout.trim(),
  numstat: (await setup(r1, 'diff', ...GIT_DIFF_FLAGS, '--cached', '--numstat')).stdout.trim().split('\n').map((l) => l.split('\t')),
  nameOnly: (await setup(r1, 'diff', ...GIT_DIFF_FLAGS, '--cached', '--name-only')).stdout.trim().split('\n').filter(Boolean),
  workNames: (await setup(r1, 'diff', ...GIT_DIFF_FLAGS, '--name-only')).stdout.trim().split('\n').filter(Boolean),
};
assert.equal(census.staged, '25 files changed, 75 insertions(+), 75 deletions(-)', `git's own index census: ${census.staged}`);
assert.equal(census.work, '4 files changed, 4 insertions(+), 4 deletions(-)', `git's own worktree census: ${census.work}`);
assert.equal(census.showNum, `60\t0\t${pathOf(9)}`, `git's own census for the one path git.show reads: ${JSON.stringify(census.showNum)}`);
assert.equal(census.numstat.length, N, 'git names 25 staged paths in its own machine-readable form');
assert.deepEqual(census.numstat[0], ['3', '3', pathOf(1)], 'every staged file is +3 −3 (3 hunks of one line each)');
assert.deepEqual(census.nameOnly, Array.from({ length: N }, (_, k) => pathOf(k + 1)), 'and in the same order the doors parse them');

const whole = {
  staged: await door('staged', { callId: 'v66:§1:staged' }),
  stagedStat: await door('staged', { args: { stat: true }, callId: 'v66:§1:stagedstat' }),
  work: await door('work', { callId: 'v66:§1:work' }),
  workStat: await door('work', { args: { stat: true }, callId: 'v66:§1:workstat' }),
  show: await door('show', { args: { path: pathOf(9) }, callId: 'v66:§1:show' }),
};
assert.equal(whole.staged.detail, 'git.staged → exit 0: index holds 25 change(s): 25 modified · +75 −75 across 75 hunk(s)', 'a whole read still speaks the census — exactly the pre-v66 sentence');
assert.equal(whole.stagedStat.detail, 'git.staged --stat → exit 0: index holds 25 file(s) · +75 −75');
assert.equal(whole.work.detail, 'git.diff → exit 0: 4 files, +4 −4 (4 hunks)');
assert.equal(whole.workStat.detail, 'git.diff --stat → exit 0: 4 files, +4 −4');
assert.equal(whole.show.detail, `git.show → exit 0: HEAD changed ${pathOf(9)} · +60 −0 across 1 hunk(s)`);
for (const o of Object.values(whole)) {
  assert.equal(o.truncated, false, 'this section reads the whole pipe');
  assert.ok(!o.detail.includes('AT LEAST'), `a whole read may not hedge: ${o.detail}`);
  assert.ok(!WINDOW.test(o.detail), `a whole read may not claim a window: ${o.detail}`);
}
assert.equal(face.work.length, 2004, `the source comment calls this "a 4-section, ${face.work.length}-byte worktree diff" — the number is quoted, so it is measured here`);
console.log(`[cut-tally-proof] §1 git's census ${census.staged} / ${census.work} (${face.work.length} B) / ${JSON.stringify(census.showNum)}; five whole reads, five census sentences, zero window clauses`);

// --- §2 the SAME repository at a cut budget, through real git: the doors floor their own tallies ---
const atBoundary = sectionStart(face.staged, 8); // the cut lands BETWEEN two sections
const insideHunk = sectionStart(face.staged, 8) + 900; // …and here it lands INSIDE one
const cutBoundary = await door('staged', { budget: atBoundary, callId: 'v66:§2:boundary' });
const cutHunk = await door('staged', { budget: insideHunk, callId: 'v66:§2:hunk' });
for (const [o, want] of [[cutBoundary, 8], [cutHunk, 9]]) {
  const floor = /index holds AT LEAST (\d+) change\(s\)/.exec(o.detail);
  assert.ok(floor, `a cut read must floor its own count: ${o.detail}`);
  assert.equal(Number(floor[1]), want, 'the floor is the number of changes THIS read named');
  assert.equal(Number(floor[1]), o.files.length);
  assert.ok(want < N, `and ${want} is not git's census of ${N}`);
  assert.ok(o.detail.includes('the changes and lines that SURVIVED the output budget'), o.detail);
  assert.ok(o.detail.includes('git printed more on that pipe'), 'the door says what it KNOWS: the pipe carried more bytes');
  assert.ok(o.detail.includes(`WINDOW on the index — what a granted git.commit would record, NOT a census of it`), o.detail);
  assert.ok(o.detail.includes('output truncated at budget (stdout)'), 'v56 still names WHICH pipe was cut');
  assert.ok(!o.detail.includes('the cut landed inside'), `a multi-section door cannot see WHERE the cut fell: ${o.detail}`);
  assert.ok(o.detail.includes('whose numbers MAY stop where the read did'), o.detail);
}
// The doors' sharpest claim, graded against GIT rather than against the door's own arithmetic:
// "the changes named before the last one are WHOLE" — and the two budgets show why the last is MAY.
for (const [o, label] of [[cutBoundary, 'boundary'], [cutHunk, 'hunk']]) {
  const named = o.files.map((f) => f.path);
  assert.ok(o.detail.includes(`the ${named.length - 1} change(s) named before it are whole`), `${label}: ${o.detail}`);
  const gitRows = Object.fromEntries(census.numstat.map(([a, d, p]) => [p, [Number(a), Number(d)]]));
  for (const f of o.files.slice(0, -1)) assert.deepEqual([f.additions, f.deletions], gitRows[f.path], `${label}: ${f.path} claimed whole but git counts it ${JSON.stringify(gitRows[f.path])}`);
  const last = o.files.at(-1);
  const short = [last.additions, last.deletions].some((v, k) => v !== gitRows[last.path][k]);
  if (label === 'boundary') assert.equal(short, false, 'a cut at a section boundary leaves the LAST named change whole too — which is why the door may not say "landed inside"');
  else assert.equal(short, true, `a cut inside a hunk leaves it short (door +${last.additions} −${last.deletions}, git 3/3) — which is why the door may not stay silent`);
}
assert.match(cutHunk.detail, /the last change the read reached is src\/mod-09\/a-long-file-name-9\.ts \(\+2 −2\)/, 'the mid-hunk window names its own reachable end: ' + cutHunk.detail);
console.log(`[cut-tally-proof] §2 real git at ${atBoundary} B and ${insideHunk} B: "AT LEAST 8"/"AT LEAST 9" of an index git calls 25, and the whole-before-the-last claim holds against git's own --numstat`);
// The doc comment in `gitTools.ts` quotes the PRE-v66 sentence verbatim; print the post-v66 one with its own
// clauses removed, so the historical wording is a measurement in this file rather than a memory.
const preV66Wording = (detail) => detail.split(' · the counts above')[0].replace('AT LEAST ', '');
assert.match(preV66Wording(cutBoundary.detail), /^git\.staged → exit 0: index holds 8 change\(s\): 8 modified · \+\d+ −\d+ across \d+ hunk\(s\)( · .*)?$/, 'the door\'s own wording, minus v66\'s clauses, must be the sentence the comment quotes: ' + preV66Wording(cutBoundary.detail));
console.log(`[cut-tally-proof] §2 the sentence v66 replaced, rebuilt from the door's own bytes: ${JSON.stringify(preV66Wording(cutBoundary.detail))}`);

// --- §3 every property the sentence rests on, over EVERY line boundary of git's recorded bytes ---
const stagedBounds = boundariesOf(face.staged).filter((b) => b < face.staged.length);
assert.equal(face.staged.split('\n').length, 776, 'the header\'s denominator: git\'s staged diff has 776 line boundaries — the ADR and the source comment both quote it');
assert.equal(stagedBounds.length, 774, `that diff has ${face.staged.split('\n').length} line boundaries; ${stagedBounds.length} of them are cuts`);
let floored = 0, censusShaped = 0, prefixViolations = 0, wholeClaimsWrong = 0, invented = 0, refused = 0;
const knownNames = new Set(census.nameOnly);
for (const b of stagedBounds) {
  const o = await door('staged', { budget: b, replay: replayer(face.staged), callId: `v66:§3:${b}` });
  const saysFloor = o.detail.includes(`index holds AT LEAST ${o.files.length} change(s)`);
  const saysCensus = /index holds \d+ change\(s\)/.test(o.detail) && !o.detail.includes('AT LEAST');
  if (o.files.length === 0) refused += 1;
  else if (saysFloor) floored += 1;
  else if (saysCensus) censusShaped += 1; // the pre-v66 statement: a window counted as the index
  if (o.files.length > 0 && !saysFloor) continue;
  const named = o.files.map((f) => f.path);
  if (JSON.stringify(named) !== JSON.stringify(census.nameOnly.slice(0, named.length))) prefixViolations += 1;
  for (const p of named) if (!knownNames.has(p)) invented += 1;
  const gitRows = Object.fromEntries(census.numstat.map(([a, d, p]) => [p, [Number(a), Number(d)]]));
  for (const f of o.files.slice(0, -1)) if (f.additions !== gitRows[f.path][0] || f.deletions !== gitRows[f.path][1]) wholeClaimsWrong += 1;
}
assert.equal(censusShaped, 0, 'no window may be phrased as a census — that is the whole increment');
assert.equal(floored, 774 - refused, `every cut window that named a change floored it (${floored} floored, ${refused} named none)`);
assert.equal(prefixViolations, 0, 'a window never invents, drops or reorders: it reads a PREFIX of git\'s own name list');
assert.equal(invented, 0, 'and every name it speaks is one git printed');
assert.equal(wholeClaimsWrong, 0, 'and "the changes named before the last are whole" holds at EVERY one of the 774 windows');
const lastWindow = await door('staged', { budget: face.staged.length, replay: replayer(face.staged), callId: 'v66:§3:whole' });
assert.equal(lastWindow.detail, whole.staged.detail, 'the last boundary IS the whole read, and it is the census again');
console.log(`[cut-tally-proof] §3 774 cut windows: ${floored} floored, ${refused} naming no change, ${censusShaped} census-shaped, ${prefixViolations} prefix violations, ${wholeClaimsWrong} whole-claims wrong`);

// --- §3a the replay is not a second opinion about the door: it reproduces real git's answer ---
const checked = [];
for (const b of [...new Set([1, 40, atBoundary, insideHunk, 3074, 400, 2000, 9000, 14000, 20000, 27000, face.staged.length])]) {
  const real = await door('staged', { budget: b, callId: `v66:§3a:real:${b}` });
  const replay = await door('staged', { budget: b, replay: replayer(face.staged), callId: `v66:§3a:replay:${b}` });
  assert.equal(replay.detail, real.detail, `the replay at budget ${b} says something real git did not`);
  assert.deepEqual(replay.files, real.files, `and its record at budget ${b} differs from the real door's`);
  checked.push(b);
}
console.log(`[cut-tally-proof] §3a ${checked.length} budgets, real git and replay byte-identical — §3's sweep measures the shipped host, not a model of it`);

// --- §4 git.show: ONE path, so this door MAY say where the cut landed ---
const showBounds = boundariesOf(face.show);
const showCuts = showBounds.filter((b) => b < face.show.length);
assert.equal(showBounds.length, 67, `git.show's face is ${face.show.split('\n').length} lines`);
const shown600 = await door('show', { budget: 600, args: { path: pathOf(9) }, callId: 'v66:§4:600' });
assert.equal(shown600.additions, 12, 'a 600-byte read survives 12 of git\'s 60 added lines');
assert.ok(shown600.detail.includes('AT LEAST +12 −0'), shown600.detail);
assert.ok(shown600.detail.includes(`WINDOW on HEAD's change to ${pathOf(9)}`), shown600.detail);
assert.ok(shown600.detail.includes(`the cut landed inside ${pathOf(9)} (+12 −0)`), `this door diffs ONE path, so the cut has nowhere else: ${shown600.detail}`);
let showShort = 0, showFloored = 0, showCensus = 0, showRefused = 0;
for (const b of showCuts) {
  const o = await door('show', { budget: b, args: { path: pathOf(9) }, replay: replayer(face.show), callId: `v66:§4:${b}` });
  const censusPhrased = /HEAD changed \S+ · \+\d+ −\d+/.test(o.detail) && !o.detail.includes('AT LEAST');
  if (o.detail.includes('AT LEAST')) showFloored += 1;
  else if (censusPhrased) showCensus += 1;
  else if (o.detail.includes('no complete line survived')) showRefused += 1;
  if (o.additions > 0 && o.additions < 60) showShort += 1;
  if (o.detail.includes('AT LEAST')) assert.ok(o.detail.includes('the cut landed inside'), o.detail);
}
assert.equal(showShort + showFloored + showCensus + showRefused > 0, true, 'the sweep actually looked at windows');
assert.equal(showFloored + showRefused, showCuts.length, 'every cut window either floors its tally or refuses to state one — none states a census');
assert.equal(showShort, 59, 'the header\'s number: 59 of this door\'s windows short-count a file git counts at +60');
assert.equal(showCensus, 0, 'and none of them says so in census phrasing any more');
assert.equal(showFloored, 60, `${showFloored} windows floor their tally (one more than short-counting: a window that survives a hunk header counts +0)`);
const shownTight = await door('show', { budget: 60, args: { path: pathOf(9) }, callId: 'v66:§4:60' });
assert.ok(shownTight.detail.includes('no complete line survived the output budget — this is NOT a statement that HEAD touched'), shownTight.detail);
assert.ok(!shownTight.detail.includes('touches nothing at'), 'a cut is not an absence (v48) — and not a HEAD-tells-nothing either');
console.log(`[cut-tally-proof] §4 git.show over ${showCuts.length} cut windows: ${showShort} short-count git's +60, ${showFloored} floor it, ${showCensus} still call it a census`);

// --- §5 git.diff (the working tree): the same rule, and the zero it used to speak ---
const workCuts = boundariesOf(face.work).filter((b) => b < face.work.length);
const workAt = sectionStart(face.work, 2);
const work2 = await door('work', { budget: workAt, callId: 'v66:§5:2of4' });
assert.equal(work2.totals.files, 2, `a ${workAt}-byte read keeps 2 of git's 4 sections`);
assert.ok(work2.detail.includes(`AT LEAST ${work2.totals.files} files, +${work2.totals.additions} −${work2.totals.deletions}`), work2.detail);
assert.ok(work2.detail.includes('WINDOW on the working tree, NOT a census of it'), work2.detail);
assert.ok(work2.detail.includes('the 1 change(s) named before it are whole'), work2.detail);
const work120 = await door('work', { budget: 120, callId: 'v66:§5:120' });
assert.ok(work120.detail.includes('AT LEAST 1 files, +0 −0 (0 hunks)'), `the floor admits it saw no lines at all — but not that the tree has none: ${work120.detail}`);
const workTight = await door('work', { budget: 1, callId: 'v66:§5:1' });
assert.ok(workTight.detail.includes('no complete line survived the output budget — this is NOT a statement that the working tree has no changes'), workTight.detail);
assert.ok(!workTight.detail.includes('0 files, +0 −0'), 'v66 wired v48\'s rule into THIS door\'s zero branch: git.diff used to answer `0 files, +0 −0 (0 hunks)` for a 4-section diff');
let workFloored = 0, workCensus = 0, workPrefix = 0;
for (const b of workCuts) {
  const o = await door('work', { budget: b, replay: replayer(face.work), callId: `v66:§5:${b}` });
  const named = o.files.map((f) => f.path);
  if (JSON.stringify(named) !== JSON.stringify(census.workNames.slice(0, named.length))) workPrefix += 1;
  if (o.detail.includes('AT LEAST')) workFloored += 1;
  else if (/\d+ files, \+\d+ −\d+/.test(o.detail) && !o.detail.includes('no complete line')) workCensus += 1;
}
assert.equal(workCensus, 0, `of ${workCuts.length} cut windows over git's real worktree diff, ${workCensus} still phrase a window as the tree`);
assert.equal(workPrefix, 0, 'and every window reads a prefix of git\'s own name list');
console.log(`[cut-tally-proof] §5 git.diff: ${workFloored} of ${workCuts.length} windows floored, ${workCensus} census-shaped, ${workPrefix} order violations`);

// --- §6 the --stat faces are IMMUNE to short-counting, and this rule is therefore not applied there ---
for (const [label, text] of [['staged --stat', face.stagedStat], ['work --stat', face.workStat]]) {
  const bs = boundariesOf(text);
  let withFooter = 0, bodyless = 0;
  for (const b of bs) {
    const kept = text.slice(0, b).slice(0, text.slice(0, b).lastIndexOf('\n') + 1);
    if (parseDiffStat(kept) !== null) {
      withFooter += 1;
      if (kept.trimEnd() !== text.trimEnd()) bodyless += 1; // a footer without the whole list of files
    }
  }
  assert.equal(bodyless, 0, `${label}: git prints its footer LAST, so a window holding it holds the body — measured over every one of ${bs.length} boundaries`);
  assert.ok(withFooter > 0, `${label}: the scan found no footer window at all, which would make the assertion above vacuous`);
  console.log(`[cut-tally-proof] §6 ${label}: ${withFooter} of ${bs.length} windows parse git's footer, ${bodyless} of them without the whole body`);
}
const statCut = await door('staged', { budget: 506, args: { stat: true }, callId: 'v66:§6:506' });
assert.ok(statCut.detail.includes('git printed no stat footer — stated, not guessed'), statCut.detail);
const statTight = await door('staged', { budget: 1, args: { stat: true }, callId: 'v66:§6:1' });
assert.ok(statTight.detail.includes('no complete line survived the output budget — this is NOT a statement that the index holds nothing staged for the §28 ask'), statTight.detail);
assert.ok(!statTight.detail.includes('index holds 0 file(s)'), 'the stat face\'s real hole was the zero, not the tally');
assert.deepEqual(statTight.summary, { files: 0, insertions: 0, deletions: 0 }, 'the record still carries git\'s arithmetic; only the SENTENCE refuses it');

// --- §7 the false statement v66 removed, shown against a REAL commit: the index held 25, the window named 8 ---
const commitHost = createExecHost(gitCommitPolicy(r1), { spawnLike: counting });
const committed = await registerGitCommitTool(new ToolRegistry(), commitHost, { env: {} }).invoke({ callId: 'v66:§7:commit', tool: 'git.commit', args: { message: 'v66 cut-tally-proof: the 25 staged edits' } }, { checkpoint: () => true });
assert.equal(committed.output?.ok, true, 'the commit door ran: ' + JSON.stringify(committed.output ?? committed.error));
const recorded = (await setup(r1, 'show', '--format=', '--name-only', 'HEAD')).stdout.trim().split('\n').filter(Boolean);
assert.equal(recorded.length, N, `a granted commit records ${recorded.length} paths — git's census, not the window's 8`);
assert.equal(cutBoundary.files.length, 8, 'and the window §2 read named 8 of them');
for (const f of cutBoundary.files) assert.ok(recorded.includes(f.path), 'the window named a path the commit did not record');
// Before v66 this same window answered `index holds 8 change(s)` — which HEAD has just proved FALSE,
// because the index held 25. What the door may claim is the relation the record can support: its own
// count is a LOWER bound on the census. Checked as numbers, not as strings about strings.
assert.ok(cutBoundary.files.length < recorded.length, `the window named ${cutBoundary.files.length} of the ${recorded.length} paths a granted commit recorded`);
assert.ok(Number(/index holds AT LEAST (\d+) change\(s\)/.exec(cutBoundary.detail)[1]) <= recorded.length, 'and the floor it spoke holds against the repository the commit went on to reveal');
const afterCommit = await door('staged', { callId: 'v66:§7:after' });
assert.equal(afterCommit.detail, 'git.staged → exit 0: the index is EMPTY — nothing is staged, so a granted git.commit right now would have nothing to record', 'and an index that IS empty is still stated as empty — v66 only speaks where the pipe was cut');
console.log(`[cut-tally-proof] §7 HEAD records ${recorded.length} paths where the 8-change window said "AT LEAST 8"; the empty index after the commit is still stated truly`);

// --- §8 §9: this repository's HEAD is untouched, and every claim came through a door ---
const finalHead = (await raw('.', 'rev-parse', 'HEAD')).stdout.trim();
assert.equal(finalHead, homeHead, "this repository's HEAD was not touched");
assert.ok(spawns > 20, `${spawns} real door spawns — §§1,2,3a,4,5,6,7 all went through real git`);
console.log(`[cut-tally-proof] §8 HEAD ${homeHead.slice(0, 7)} unchanged, ${spawns} door spawns, all writes inside os.tmpdir`);
console.log('[cut-tally-proof] ALL GREEN');
