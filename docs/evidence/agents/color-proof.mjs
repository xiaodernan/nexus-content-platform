// NEXUS M2 v67 (exec-host) — A REPOSITORY'S COLORS AND DECORATIONS ARE WRITTEN INTO THE FIELDS THE
// DOORS NAME (ADR 0016 amendment 67).
// v46 confined what a git command may DO and v65 what it may PRINT about a path's PREFIX. Both stopped at the
// same line: neither asked whether the BYTES every parser reads could be painted by the repository being read.
// They can, and every false answer below arrived at exit 0. Measured on this box (git 2.52) in a throwaway repo
// with `[color] ui/status/diff = always` and `[log] decorate = short`, holding 3 commits, 1 staged change and 1
// unstaged edit — escape sequences per face with the pin removed: `git status --short` 4, `git diff --cached`
// 19, its `--stat` face 2, `git log --oneline` 26 across 3 lines, `git show --format=` 19; with v67's pins: 0
// on all five. What those bytes did to the shipped parsers: `git.staged` parsed an index holding ONE change as
// ZERO files, which is the sentence `the index is EMPTY — nothing is staged, so a granted git.commit right now
// would have nothing to record`; `git.log` lost the hash pattern on all three lines and answered `0 commit(s)`;
// `git.status` classified both dirty files `other` with PATHS beginning `[31mM`; `git.show` read HEAD's painted
// `+export const staged = 3;` as not-an-addition and handed back no content at all.
// This proof does not take the fix on trust. §1 measures git's own bytes with the pin removed and re-applied,
// plus WHICH LAYER can reach which command: `git status` and `git commit` refuse BOTH `--no-color` and
// `--color=never` with exit 129 (so only an env slot can pin them), `diff`/`log`/`show` accept `--no-color`
// (so the argv owns theirs), and an env `color.ui=false` does not beat a repo that set `color.status=always`.
// §2 drives the shipped doors over that repository and grades every sentence they may say. §3 replays §1's
// recorded unpinned bytes through the SHIPPED parsers, calibrates the 0-file count against the door reading an
// index that really IS empty, and reports the face paint does NOT break: `parseDiffStat` reads git's number
// column, not its colored bar, so that tally survives and says so. §4 separates the two colorspaces —
// `--no-color` removes all 26 escapes and leaves `(HEAD -> main, tag: v1.0, feature)` inside the subject, while
// `--no-decorate` removes the refs — and checks each subject against git's own `--format=%s`, on a fixture
// commit whose real title IS `(HEAD -> main) …`, so both directions are measured. §5 measures the write door's
// advice face. §6 removes the config and shows the pins move ZERO bytes on all five faces. §7 pins the shapes
// and the table. §9 holds: throwaway repos under os.tmpdir, hooks and signing neutralized LOCALLY there,
// staging done by plain git as the human, this repository's HEAD compared byte-wise at the end.
// Run after `npm run build`:  node docs/evidence/agents/color-proof.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec } = rt;
const {
  GIT_DIFF_FLAGS, GIT_FORCED_CONFIG, GIT_LOG_FLAGS, NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv,
  gitLogPolicy, gitReadOnlyPolicy, gitShowPolicy, gitStagedPolicy, parseDiffStat, parseGitDiff,
  parseGitLog, parseGitStatus, parseShowDiff, registerGitCommitTool, registerGitLogTool, registerGitShowTool,
  registerGitStagedTool, registerGitTools,
} = eh;

const PIN = gitEnv({}); // what every door actually runs with
/** argv either spread or as one array; a trailing env OBJECT is the env to run under, else the door's own PIN. */
const raw = (dir, ...rest) => {
  const last = rest[rest.length - 1];
  const env = last && typeof last === 'object' && !Array.isArray(last) ? rest.pop() : PIN;
  const argv = rest.flat(Infinity).map(String);
  assert.ok(argv.length > 0, 'a git call with no argv would print usage and "succeed" — every fixture call must name its command');
  return new Promise((resolve) => {
    execFile('git', argv, { cwd: dir, env, encoding: 'utf8', maxBuffer: 1 << 23 }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: stdout ?? '', stderr: stderr ?? '' }));
  });
};
const setup = async (dir, ...argv) => {
  const r = await raw(dir, ...argv);
  if (r.code !== 0) throw new Error(`setup ${argv.flat().join(' ')} → ${r.code}: ${r.stderr}`);
  return r;
};
function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}
const esc = (s) => (s.match(/\x1b\[[0-9;]*m/g) ?? []).length;
const show = (s) => JSON.stringify(s).replace(/\\u001b/g, 'ESC');
/** git's counted config minus the color slots, renumbered — i.e. v46's isolation without v67's half of it. */
const withoutForced = (drop) => {
  const held = Object.keys(PIN).filter((k) => /^GIT_CONFIG_KEY_\d+$/.test(k)).map((k) => PIN[k]).filter((k) => !drop.includes(k));
  const env = {};
  for (const [k, v] of Object.entries(PIN)) if (!/^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(k) && k !== 'GIT_CONFIG_COUNT') env[k] = v;
  env.GIT_CONFIG_COUNT = String(held.length);
  held.forEach((key, i) => {
    const slot = Object.keys(PIN).find((k) => /^GIT_CONFIG_KEY_\d+$/.test(k) && PIN[k] === key);
    env[`GIT_CONFIG_KEY_${i}`] = key;
    env[`GIT_CONFIG_VALUE_${i}`] = PIN[slot.replace('KEY_', 'VALUE_')];
  });
  return env;
};
const NO_COLOR_PIN = withoutForced(['color.status', 'color.ui']);
const ONLY_UI_PIN = withoutForced(['color.status']);

const homeHead = (await raw('.', 'rev-parse', 'HEAD')).stdout.trim();
const workRoot = mkTmp('nexus-v67-proof');
let spawns = 0;
let doorReads = 0;
const counting = (cmd, args, opts) => {
  spawns += 1;
  return NODE_SPAWN(cmd, args, opts);
};
const door = async (policy, register, tool, args, callId) => {
  doorReads += 1;
  const host = createExecHost(policy, { spawnLike: counting });
  const r = await register(new ToolRegistry(), host, { env: {} }).invoke({ callId: `v67:${callId}`, tool, args }, { checkpoint: () => true });
  if (!r.ok) throw new Error(`${callId} failed: ${r.error}`);
  return r.output;
};

// --- the fixture: 3 commits (one titled like a decoration on purpose), 1 staged change, 1 unstaged edit ---
const r1 = join(workRoot, 'r1');
mkdirSync(r1, { recursive: true });
const w = (p, s) => {
  mkdirSync(join(r1, p.split('/').slice(0, -1).join('/')), { recursive: true });
  writeFileSync(join(r1, p), s, 'utf8');
};
const L = (tag, n) => Array.from({ length: n }, (_, i) => `${tag} line ${i} ${'x'.repeat(24)}`).join('\n') + '\n';
await setup(r1, 'init', '-q', '-b', 'main');
for (const [k, v] of Object.entries({ 'core.hooksPath': join(r1, '.git', 'no-hooks'), 'user.email': 'proof@invalid', 'user.name': 'proof', 'commit.gpgsign': 'false', 'core.autocrlf': 'false' })) {
  await setup(r1, 'config', '--local', k, v);
}
w('src/base.ts', L('seed', 4));
w('notes/plain.md', L('note', 3));
await setup(r1, 'add', '-A');
await setup(r1, 'commit', '-qm', 'seed: two files');
w('src/base.ts', L('seed', 4) + 'export const added = 1;\n');
await setup(r1, 'add', 'src/base.ts');
await setup(r1, 'commit', '-qm', 'feat: add a line to base');
// the third commit stages its OWN edit first: `git commit` without -a records the index, and an index that
// happens to be clean makes a fixture commit fail silently — which would move every count below.
w('src/base.ts', L('seed', 4) + 'export const added = 1;\nexport const again = 2;\n');
w('notes/plain.md', L('note', 3) + 'and a committed edit\n');
await setup(r1, 'add', 'src/base.ts', 'notes/plain.md');
await setup(r1, 'commit', '-qm', '(HEAD -> main) I titled myself like a decoration');
// ...then the human stages ONE more base edit and leaves a notes edit UNSTAGED: the index holds exactly one
// +1 change, and status has one row per tree. Every door below reads that pair.
w('src/base.ts', L('seed', 4) + 'export const added = 1;\nexport const again = 2;\nexport const staged = 3;\n');
await setup(r1, 'add', 'src/base.ts');
w('notes/plain.md', L('note', 3) + 'and a committed edit\nplus a worktree-only one\n');
await setup(r1, 'branch', 'feature');
await setup(r1, 'tag', 'v1.0');
const cfgPath = join(r1, '.git', 'config');
const cfgClean = readFileSync(cfgPath, 'utf8');
writeFileSync(cfgPath, cfgClean + '[color]\n\tui = always\nstatus = always\ndiff = always\n[log]\n\tdecorate = short\n', 'utf8');

// --- §1 git's own bytes: the same command with v67's pin removed, and re-applied ---
console.log('§1 git 自己的字节：去掉 v67 的钉与钉回去（同一仓库、同一条命令）');
const faces = [
  ['git.status argv', ['status', '--short'], ['status', '--short'], ['color.status=false (env) is the ONLY route: `git status` rejects --no-color with exit 129'], 2],
  ['git.staged argv', ['diff', '--cached'], ['diff', ...GIT_DIFF_FLAGS, '--cached'], 'the shape carries --no-color', 1],
  ['git.staged --stat', ['diff', '--cached', '--stat'], ['diff', ...GIT_DIFF_FLAGS, '--cached', '--stat'], 'the same shape plus --stat', 1],
  ['git.log argv', ['log', '--oneline', '-n', '3'], ['log', '--oneline', ...GIT_LOG_FLAGS, '-n', '3'], 'the shape carries --no-decorate AND --no-color', 3],
  ['git.show argv', ['show', '--format=', '--', 'src/base.ts'], ['show', ...GIT_DIFF_FLAGS, '--format=', '--', 'src/base.ts'], 'the content door: the color pin rides on GIT_DIFF_FLAGS, and §1 measures whether decoration reaches it at all', 2],
];
const unpinnedBytes = {};
for (const [label, bareArgv, pinnedArgv, , lines] of faces) {
  const bare = await raw(r1, bareArgv, NO_COLOR_PIN);
  const pinned = await raw(r1, pinnedArgv, PIN);
  unpinnedBytes[label] = bare.stdout;
  const bareHead = bare.stdout.split('\n').filter((l) => l !== '').slice(0, lines).join(' | ');
  console.log(`  ${label.padEnd(18)} 无钉: ${esc(bare.stdout)} 个 ANSI 序列 / 有钉: ${esc(pinned.stdout)} 个`);
  console.log(`      无钉第一行 ${show(bareHead)}`);
  assert.ok(esc(bare.stdout) > 0, `${label}: the premise of this whole increment is that git PAINTS these bytes — a clean run would make §1 vacuous`);
  assert.equal(esc(pinned.stdout), 0, `${label}: the pinned read must carry no escape byte at all, or a parser is reading a rendering`);
  assert.notEqual(pinned.stdout, '', `${label}: a pinned read that answered nothing would make the zero a vacuity, not a fix`);
}
// status is the one face where the argv cannot help at all: same repo, the best flag git accepts there.
{
  const best = await raw(r1, ['status', '--short'], NO_COLOR_PIN);
  const rejected = await raw(r1, ['status', '--short', '--no-color'], NO_COLOR_PIN);
  const viaEnv = await raw(r1, ['status', '--short'], PIN);
  console.log(`  status 的 argv 路线  --no-color → exit ${rejected.code}: ${show(rejected.stderr.split('\n')[0] ?? '')}`);
  assert.equal(rejected.code, 129, 'git must still refuse a color flag on `git status` — that refusal is the reason a key of GIT_FORCED_CONFIG exists');
  assert.equal(esc(best.stdout), esc(unpinnedBytes['git.status argv']), 'and with the flag refused, the unpinned status is still painted');
  assert.equal(esc(viaEnv.stdout), 0, 'so the ONLY thing that silences it is the env slot');
}
// an env `color.ui=false` alone does NOT beat a repository that named the colorspace itself
{
  const uiOnly = await raw(r1, ['status', '--short'], ONLY_UI_PIN);
  console.log(`  只钉 color.ui=false · 仓库 color.status=always → ${esc(uiOnly.stdout)} 个 ANSI 序列`);
  assert.ok(esc(uiOnly.stdout) > 0, 'color.status must be load-bearing: if color.ui=false covered it too, the second key would be a claim, not a pin');
}
// WHICH layer can reach which command — the measurement behind the rule "a colorspace with a flag is
// pinned by the argv; a colorspace without one is pinned by the env". Both spellings are tried, because a
// repository could set either and a door that guesses which one git accepts is guessing.
{
  const refused = [];
  for (const argv of [['status', '--short', '--no-color'], ['status', '--short', '--color=never'], ['commit', '--no-color', '-m', 'v67 never runs this'], ['commit', '--color=never', '-m', 'v67 never runs this']]) {
    const r = await raw(r1, argv, NO_COLOR_PIN);
    refused.push([argv[0] + ' ' + argv[2], r.code]);
    assert.equal(r.code, 129, `${argv.join(' ')}: the two commands with no color flag are the reason GIT_FORCED_CONFIG has color keys — if git ever accepts one, this rule moves layers and must say so loudly`);
  }
  for (const argv of [['diff', '--no-color'], ['log', '--oneline', '--no-color', '-n', '1'], ['show', '--no-color', '--format=', '--', 'src/base.ts']]) {
    const r = await raw(r1, argv, NO_COLOR_PIN);
    assert.equal(r.code, 0, `${argv.join(' ')}: these three DO have the flag, so the argv owns their colorspace`);
  }
  console.log(`  无 color 旗标的命令: ${refused.map(([c, code]) => `${c}→${code}`).join(' ')} · diff/log/show 接受 --no-color (exit 0)`);
}

// --- §2 the SHIPPED doors over that same repository ---
console.log('\n§2 出货的门：同一个仓库，逐扇读');
const st = await door(gitReadOnlyPolicy(r1), registerGitTools, 'git.status', {}, '§2:status');
assert.equal(st.detail, 'git.status → exit 0: 2 entries (2 modified) · git.commit records the INDEX: 1/2 entries differ from HEAD there · 1 worktree-side/untracked (notes/plain.md) a granted commit records NONE of', `the status door must count the two files, not git's paint: ${show(st.detail)}`);
assert.deepEqual(st.files.map((f) => [f.xy, f.path]), [[' M', 'notes/plain.md'], ['M ', 'src/base.ts']], 'both XY columns are git\'s two characters, not an escape sequence wearing them');
const staged = await door(gitStagedPolicy(r1), registerGitStagedTool, 'git.staged', {}, '§2:staged');
assert.equal(staged.files.length, 1, `the index holds ONE change; the door named ${staged.files.length}: ${show(staged.detail)}`);
assert.equal(staged.files[0].path, 'src/base.ts', 'and named it by its path, not by a colored rendering of one');
assert.ok(!/EMPTY/.test(staged.detail), `a 1-change index must never be called empty: ${show(staged.detail)}`);
const stagedStat = await door(gitStagedPolicy(r1), registerGitStagedTool, 'git.staged', { stat: true }, '§2:stagedStat');
assert.equal(stagedStat.detail, 'git.staged --stat → exit 0: index holds 1 file(s) · +1 −0', show(stagedStat.detail));
const log = await door(gitLogPolicy(r1), registerGitLogTool, 'git.log', { count: 3 }, '§2:log');
assert.equal(log.commits.length, 3, `3 commits exist; the door read ${log.commits.length}: ${show(log.detail)}`);
assert.ok(!/empty log/.test(log.detail), `a repository with 3 commits must never be read as an empty log: ${show(log.detail)}`);
assert.ok(!/\x1b/.test(JSON.stringify(log.commits)), 'and no commit field carries a paint byte');
const shown = await door(gitShowPolicy(r1), registerGitShowTool, 'git.show', { path: 'src/base.ts' }, '§2:show');
assert.ok(shown.detail.includes('HEAD changed src/base.ts'), show(shown.detail));
assert.ok(!/\x1b/.test(JSON.stringify(shown.addedLines ?? [])), `git.show's content lines must be the file's bytes, not git's: ${show(JSON.stringify(shown.addedLines))}`);
for (const [name, o] of Object.entries({ status: st, staged, stagedStat, log, show: shown })) {
  assert.equal(JSON.stringify(o).includes('\\u001b'), false, `${name}: a door record may not hold an escape byte`);
}

// --- §3 the harm, located: git's §1 bytes replayed through the SHIPPED parsers, calibrated against the
//     door reading that says the false absence when it is TRUE ---
console.log('\n§3 伤害定位：把 §1 记录的字节喂回出货的解析器');
const coloredStatus = parseGitStatus(unpinnedBytes['git.status argv']);
assert.equal(coloredStatus.files.filter((f) => f.status === 'modified').length, 0, 'measured: a painted XY column is no longer an XY column — `M ` became `[` and ` M` became ` \\u001b`');
assert.deepEqual(Object.keys(coloredStatus.counts), ['other'], `the door would have counted ${JSON.stringify(coloredStatus.counts)} — two files it cannot classify: ${show(JSON.stringify(coloredStatus.files.map((f) => f.path)))}`);
const coloredLog = parseGitLog(unpinnedBytes['git.log argv']);
assert.deepEqual(coloredLog, { commits: [], skipped: 3 }, 'measured: 26 escapes ate the hash pattern on all three lines — 0 commits, 3 lines "without a hash"');
const coloredDiff = parseGitDiff(unpinnedBytes['git.staged argv']);
assert.equal(coloredDiff.files.length, 0, 'measured: the `diff --git` line starts with an escape, so the reader sees no sections at all');
// The content door's own replay: an added line that git painted no longer STARTS with `+`, so the door that
// confirms WHAT the commit recorded reads it as nothing. Decoration, on the other hand, cannot reach a read
// whose format is empty — measured, which is why this door gained one flag and not two.
const coloredShow = parseShowDiff(unpinnedBytes['git.show argv'], 'src/base.ts');
assert.equal(coloredShow.additions, 0, `measured: HEAD's painted \`+export const staged = 3;\` is not a line starting with + — the content door read ${JSON.stringify(coloredShow.addedLines)}`);
assert.equal(shown.addedLines.length, 1, 'the same door with the pin on reads the one line HEAD added');
assert.ok(!/\(HEAD -> main, tag:/.test(unpinnedBytes['git.show argv']), 'and no ref decoration sits in these bytes at all — `--format=` leaves no subject for `log.decorate` to paint, so this face needed the color pin only');
// a measured NEGATIVE row, and the reason it is in this proof: the --stat bar IS painted
// (`1 ESC[32m+ESC[m`), yet `parseDiffStat` reads git's NUMBER column, not the bar — so this face's answer
// survives the paint. It is the one door read that needed no parser change, and the pin it does need is the
// one GIT_DIFF_FLAGS already carries. Asserted as equality, so the day the bar becomes load-bearing this row
// goes red instead of quietly describing a bug that no longer exists.
const statPainted = parseDiffStat(unpinnedBytes['git.staged --stat']);
const statPinned = await raw(r1, ['diff', ...GIT_DIFF_FLAGS, '--cached', '--stat'], PIN).then((r) => parseDiffStat(r.stdout));
assert.deepEqual(statPainted, statPinned, `painted vs pinned --stat footer must agree if the reader is reading git's arithmetic: ${JSON.stringify(statPainted)} vs ${JSON.stringify(statPinned)}`);
assert.ok(unpinnedBytes['git.staged --stat'].includes('\x1b'), 'and the footer really was painted — the equality above is not a vacuous one');
console.log(`  --stat 被涂色后仍解析为 ${JSON.stringify(statPainted)}（读的是数字列，不是彩条）`);
// calibrate: 0 parsed files is exactly the count that makes the door say the index is EMPTY — measured on
// an index that really is empty, so the sentence below is a door's own words, not this proof's. The human
// unstages (`git reset`) rather than committing: the fixture's HEAD must stay the self-titled commit §4 reads.
await setup(r1, 'reset', '-q');
const emptyIndex = await door(gitStagedPolicy(r1), registerGitStagedTool, 'git.staged', {}, '§3:empty');
assert.equal(emptyIndex.detail, 'git.staged → exit 0: the index is EMPTY — nothing is staged, so a granted git.commit right now would have nothing to record', `calibration read of a genuinely empty index: ${show(emptyIndex.detail)}`);
assert.equal(coloredDiff.files.length, 0, 'which is the number a painted index ALSO yields — that is the false absence, in a door sentence this proof just measured');
const coloredLogDoorSentence = `${coloredLog.commits.length} commit(s)`;
assert.equal(coloredLogDoorSentence, '0 commit(s)', 'and the log door would have printed that count, then "(empty log)" or the cut notice — for a history it had just been handed');

// --- §4 the two fields are TWO colorspaces: `--no-color` silences the paint and leaves the refs in place,
//     so only `--no-decorate` answers what git.log's `subject` field is asked to hold. Checked commit by
//     commit against git's own `%s`, a format that has never had room for a ref. ---
console.log('\n§4 装饰：--no-color 去不掉它；门报的 subject 逐条对 git --format=%s');
const COMMIT_COUNT = 3;
const truth = await raw(r1, ['log', '--format=%s', '-n', String(COMMIT_COUNT)], NO_COLOR_PIN);
const realSubjects = truth.stdout.split('\n').filter((l) => l !== '');
const painted = await raw(r1, ['log', '--oneline', '-n', String(COMMIT_COUNT)], NO_COLOR_PIN);
const plainPaint = await raw(r1, ['log', '--oneline', '--no-color', '-n', String(COMMIT_COUNT)], NO_COLOR_PIN);
const plainBoth = await raw(r1, ['log', '--oneline', ...GIT_LOG_FLAGS, '-n', String(COMMIT_COUNT)], NO_COLOR_PIN);
assert.ok(esc(painted.stdout) > 0, 'the painted face is the premise');
assert.equal(esc(plainPaint.stdout), 0, 'measured: --no-color does silence the paint');
assert.ok(plainPaint.stdout.includes('(HEAD -> main, tag: v1.0, feature)'), 'and measured: the SAME flag leaves every ref in the subject field — color and decoration are two colorspaces, one flag each');
assert.equal(esc(plainBoth.stdout), 0, 'the door shape silences the paint');
// the gift this row nearly missed: with BOTH flags on, the pinned face STILL contains the string
// `(HEAD -> main)` — as the committed TITLE of the self-titled commit. So a reader that "stripped anything
// that looks like a decoration" would delete a real subject, and a reader that guessed where git's refs end
// would have guessed wrong here. `--no-decorate` is the only thing that can be asserted about this face.
assert.ok(plainBoth.stdout.includes('(HEAD -> main)'), 'measured: the pinned face still says `(HEAD -> main)` — as a title git was handed, not a ref it added');
assert.ok(!plainBoth.stdout.includes('tag:'), 'while every REF git decorated with is gone — `tag: v1.0` appears in no commit title');
const door4 = await door(gitLogPolicy(r1), registerGitLogTool, 'git.log', { count: COMMIT_COUNT }, '§4:log');
assert.equal(door4.commits.length, realSubjects.length, `git echoed ${realSubjects.length} subjects and the door read ${door4.commits.length}`);
door4.commits.forEach((c, i) => {
  assert.equal(c.subject, realSubjects[i], `commit ${i}: the door's subject must be git's %s, byte for byte`);
  console.log(`  ${c.hash} 门说 ${show(c.subject)}  · git %s ${show(realSubjects[i])}`);
});
const selfTitled = door4.commits.find((c) => c.subject.startsWith('(HEAD -> main)'));
assert.ok(selfTitled, 'the fixture commit is titled with what a decoration looks like, so §4 tests both directions');
const decoratedLine = plainPaint.stdout.split('\n').find((l) => l.includes('I titled myself'));
assert.ok(decoratedLine.includes('(HEAD -> main, tag: v1.0, feature) (HEAD -> main) I titled myself'), `measured: git's decoration plus the real title in one field — ${show(decoratedLine)} — which is why no parser may guess at this`);
assert.equal(selfTitled.subject, '(HEAD -> main) I titled myself like a decoration', 'the door keeps only the title git committed, and keeps it whole');
console.log(`  --no-color 无 --no-decorate 那一行: ${show(decoratedLine)}`);

// --- §5 why the fix has two layers, on the one WRITE door that reads nothing colored by design ---
console.log('\n§5 两层的理由：git.commit 的失败建议');
{
  const failBare = await raw(r1, ['commit', '-m', 'v67 proof: nothing staged'], NO_COLOR_PIN);
  const failPinned = await raw(r1, ['commit', '-m', 'v67 proof: nothing staged'], PIN);
  assert.notEqual(failBare.code, 0, 'the fixture must be clean at this point or the advice face never appears');
  const bareLines = `${failBare.stdout}${failBare.stderr}`.split('\n').filter((l) => l !== '');
  const pinLines = `${failPinned.stdout}${failPinned.stderr}`.split('\n').filter((l) => l !== '');
  assert.equal(bareLines.length, pinLines.length, 'the pin removes the paint, not the answer — same lines in, same lines out');
  assert.ok(esc(`${failBare.stdout}${failBare.stderr}`) > 0, `git colored ${esc(failBare.stdout + failBare.stderr)} places in that advice block`);
  assert.equal(esc(`${failPinned.stdout}${failPinned.stderr}`), 0, 'and the env pins clear the whole block');
  const commitDoor = await door(gitCommitPolicy(r1), registerGitCommitTool, 'git.commit', { message: 'v67 proof: nothing staged' }, '§5:commit');
  const quoted = commitDoor.detail.split('\n')[0];
  assert.ok(!/\x1b/.test(quoted), `what the commit door quotes today was already plain (git prints its verdict line unpainted): ${show(quoted)}`);
  assert.equal(esc(bareLines[bareLines.length - 1]) , 0, 'measured: the LAST line — the one gitVerdict reads — is plain in BOTH faces, so this pin is the block, not that line');
  console.log(`  无钉失败建议 ${esc(failBare.stdout + failBare.stderr)} 个 ANSI / 有钉 ${esc(failPinned.stdout + failPinned.stderr)} 个 · 门引的那行两面皆净: ${show(quoted)}`);
}
writeFileSync(cfgPath, cfgClean, 'utf8'); // back to a plain repo for §6
// §3's calibration UNSTAGED the human's edit, and an empty index would make §6's diff equality byte-for-byte
// TRUE OF NOTHING. Re-stage it — this is the same content the doors read in §2.
await setup(r1, 'add', 'src/base.ts');

// --- §6 the pins cost nothing where nothing is configured: byte-for-byte, all four faces ---
console.log('\n§6 代价为零：未配置的仓库里，钉过的 argv 与旧 argv 逐字节相同');
for (const [label, bareArgv, pinnedArgv] of faces) {
  const bare = await raw(r1, bareArgv, PIN);
  const pinned = await raw(r1, pinnedArgv, PIN);
  assert.equal(pinned.stdout, bare.stdout, `${label}: in a repo that asks for no color and no decoration, the pinned shape must move ZERO bytes (${show(bare.stdout.slice(0, 60))} vs ${show(pinned.stdout.slice(0, 60))})`);
  console.log(`  ${label.padEnd(18)} ${bare.stdout.length} 字节相同`);
  assert.ok(bare.stdout.length > 0, `${label}: an empty face would make that equality vacuous`);
}
{
  const after = await door(gitLogPolicy(r1), registerGitLogTool, 'git.log', { count: COMMIT_COUNT }, '§6:log');
  assert.equal(after.commits.length, COMMIT_COUNT, `the same door over the same history, config removed: still ${COMMIT_COUNT} commits`);
  assert.equal(after.commits[0].subject, '(HEAD -> main) I titled myself like a decoration', 'and the newest subject is still the title git was handed — nothing prepended, with or without the repo asking for either');
}

// --- §7 the shapes and the table, as data ---
console.log('\n§7 形状与表：钉在哪里，写在数据里');
assert.deepEqual(GIT_DIFF_FLAGS, ['--no-ext-diff', '--no-textconv', '--no-color', '--src-prefix=a/', '--dst-prefix=b/'], 'three diff doors read git through this one list');
assert.deepEqual(GIT_LOG_FLAGS, ['--no-decorate', '--no-color'], 'and the log door through this one');
assert.deepEqual(Object.keys(GIT_FORCED_CONFIG).filter((k) => k.startsWith('color.')).sort(), ['color.status', 'color.ui'], 'exactly the colorspaces no flag can reach: status is the door, and the commit advice');
assert.equal(GIT_FORCED_CONFIG['color.diff'], undefined, 'color.diff is NOT here — measured, it reaches only diff/show/log, and all three say --no-color on the argv');
for (const argv of [['git', 'log', '--oneline', ...GIT_LOG_FLAGS, '-n', '5'], ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached'], ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached', '--stat'], ['git', 'status', '--short'], ['git', 'show', ...GIT_DIFF_FLAGS, '--format=', '--', 'src/base.ts']]) {
  const policy = argv[1] === 'log' ? gitLogPolicy(r1) : argv[1] === 'status' ? gitReadOnlyPolicy(r1) : argv[1] === 'show' ? gitShowPolicy(r1) : gitStagedPolicy(r1);
  assert.equal(planExec({ argv }, policy).ok, true, `the pinned shape must stay allowed: ${argv.join(' ')}`);
}
for (const argv of [['git', 'log', '--oneline', '-n', '5'], ['git', 'log', '--oneline', '--no-color', '-n', '5'], ['git', 'log', '--oneline', '--decorate', '--no-color', '-n', '5'], ['git', 'diff', '--cached'], ['git', 'diff', '--no-color', '--cached'], ['git', 'show', '--no-ext-diff', '--no-textconv', '--format=', '--', 'src/base.ts']]) {
  const policy = argv[1] === 'log' ? gitLogPolicy(r1) : argv[1] === 'show' ? gitShowPolicy(r1) : gitStagedPolicy(r1);
  const d = planExec({ argv }, policy);
  assert.equal(d.ok, false, `v37's/v32's/v42's own shape is now a widening — it lets the repository paint the fields: ${argv.join(' ')}`);
  assert.match(d.reason, /default-deny/);
}
console.log(`  6 个旧形状已被拒 · 5 个钉过形状仍被允 · GIT_FORCED_CONFIG ${Object.keys(GIT_FORCED_CONFIG).length} 键，其中 color 2 键`);

// --- §8 §9 holds, and the counters add up ---
const finalHead = (await raw('.', 'rev-parse', 'HEAD')).stdout.trim();
assert.equal(finalHead, homeHead, 'the home repository\'s HEAD is byte-identical: this proof never wrote outside os.tmpdir');
assert.equal(spawns, doorReads, `${spawns} door-spawned processes went through the confined host, one per door read above — a read that spawned nothing would not have been a door`);
console.log(`\n[summary] faces measured: ${faces.length} · door reads: ${doorReads} over 5 distinct doors · commits whose subject matched git's own %s: ${realSubjects.length}/${realSubjects.length} · unpinned ANSI sequences replayed through the shipped parsers: ${Object.values(unpinnedBytes).reduce((n, s) => n + esc(s), 0)} · false answers those bytes produced: index EMPTY + empty log + 2 unclassifiable paths + a content door reading nothing added · face paint did NOT break: the --stat tally · door-spawned processes: ${spawns}`);
rmSync(workRoot, { recursive: true, force: true });
console.log('[cleanup] throwaway repos removed');
