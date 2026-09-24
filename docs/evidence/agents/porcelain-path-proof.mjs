// NEXUS M2 v61 (exec-host) — A DOOR HANDS ON PATHS, AND A PICTURE OF A PATH IS NOT ONE (ADR 0016 amendment 61).
// Every git door ends by pointing at a file: `git.status` names entries, `git.staged` names the intent,
// `git.show` takes a path back and reads HEAD's answer for it. v32–v43 built all three on the assumption
// that the string between a porcelain line's columns IS the file. Measured against real git 2.52 on this
// box, it is not, in two separate ways:
//   • a rename is ONE change with TWO names (`R  old -> new`), and v32 kept the right-hand one and threw
//     the left away. The half it kept is the half HEAD has never heard of: `git.show HEAD -- <new>` exits 0
//     with an EMPTY diff — v44 had already measured that git answers that question with silence rather than
//     a refusal — so the door that confirms content reports absence about a file that was merely renamed.
//     That is the reverse of what §60 allows;
//   • `core.quotePath` defaults to `true`, which is git's permission to render any name it will not print
//     raw as a C-quoted, octal-escaped STRING. That string is not openable, does not match a pathspec, and
//     in a diff header wraps the `a/`/`b/` prefix too — so `diff --git "a/…" "b/…"` matched nothing, the
//     file vanished from the parse, and a door with no files said the one thing a door must never say about
//     a non-empty index: `the index is EMPTY`.
// And measuring the fix turned up two more, both about the same assumption:
//   • quoting is NOT only about exotic characters: with `core.quotePath=false` pinned, a name containing an
//     ordinary space still arrives as `"docs/a file with spaces.md"`. So the pin alone would have left
//     every spaced filename in a repo unopenable through the doors — the parsers now undo a rendering that
//     escaped nothing, and announce one that escaped something instead of guessing at it;
//   • a diff HEADER is split by POSITION, and a directory whose name ends in a space (`m b/n.md`, legal on
//     NTFS) puts a second ` b/` inside the path and steals that split, producing ONE name out of TWO paths.
//     git prints the same change's name unambiguously on its own lines (`+++ b/…`, `rename to`), so those
//     win wherever they exist.
// Two layers, because the two bugs live in different layers: v46's counted table gains
// `core.quotePath=false` (the argv is untouched — this pin confines what git SAYS, not what it DOES), and
// the parsers keep both halves of a pair, undo what git merely quoted, and MARK what git escaped.
// Rules this file holds itself to: the damage is SHOWN, not asserted — the counterfactual bytes come from
// real git running with the pin removed, then go through the SHIPPED parsers; the shipped doors run for
// real over the pinned environment in the same repositories; and where a claim cannot be reproduced on
// NTFS, the attempt and its error are the evidence and the rule is stated as a bound (§3).
//   §0 the pin is wired: a named slot, kept by the policy scrubber, on every git door's allowlist;
//   §1 a staged rename read by BOTH index-facing doors as a pair, its two names living in two places
//      (disk / HEAD), the content read-back through the wrong name answering 0 bytes and through the right
//      one answering every byte of it — and status having no pair left to speak once the commit lands;
//   §2 a non-ASCII name: real git with the pin removed vs the same command with it, v43's header matcher
//      (copied out of the previous commit and pinned here) seeing ZERO headers in those bytes, and the
//      sentence the door would have spoken copied byte-for-byte off the same door run over a genuinely
//      empty index — so the lie is attributed to the rendering, not to this file;
//   §3 the separator and the quote: a spaced pair that git quotes and the door unwraps, a `" b/"`
//      directory that steals the header's positional split and loses to git's own per-line name, an
//      escaped rendering that stays verbatim and announced — and the names that make escaping necessary
//      shown NOT creatable on this filesystem, which is the bound of the unwrap rule;
//   §4 the candidate v61 REFUTED: an untracked directory counts as ONE entry only when
//      `status.showUntrackedFiles` is not pinned — measured both ways, so v46's pin has a witness;
//   §5 the content door refuses to ask git about a rendering, at zero spawns;
//   §6 §9: every byte written here lived in os.tmpdir, the spawn total is stated, and this repo's HEAD is
//      compared byte-wise.
// It pays no rent in v59's synchronous-spawn wall: its only shell-out is ASYNC execFile('git', …).
// Run after `npm run build`:  node docs/evidence/agents/porcelain-path-proof.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process'; // ASYNC on purpose: v59 measured that every SYNC spawn is EBUSY on this host
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec } = rt;
const {
  NODE_SPAWN,
  createExecHost,
  forcedConfigEnv,
  gitCommitPolicy,
  gitEnv,
  gitReadOnlyPolicy,
  gitShowPolicy,
  gitStagedPolicy,
  parseDiffHeader,
  parseFileLine,
  parseGitStatus,
  parseStagedDiff,
  pathShapeNotices,
  registerGitCommitTool,
  registerGitShowTool,
  registerGitStagedTool,
  registerGitTools,
  unwrapRendering,
} = eh;

const B = (s) => Buffer.byteLength(s ?? '', 'utf8');
const PIN = gitEnv(process.env); // exactly what the shipped doors hand git
let spawns = 0;
const counting = (command, args, opts) => {
  spawns += 1;
  return NODE_SPAWN(command, args, opts);
};

/** real git, real environment, no door in between — this file's witness stand */
function gitRaw(dir, env, ...argv) {
  return new Promise((resolve) => {
    execFile('git', argv, { cwd: dir, env, encoding: 'utf8', maxBuffer: 1 << 23 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}

const workRoot = mkTmp('nexus-v61-proof');
const homeHead = (await gitRaw('.', PIN, 'rev-parse', 'HEAD')).stdout.trim();

/** A repository whose only oddity is its filenames: hooks and signing neutralized LOCALLY, CRLF off. */
async function repo(name) {
  const dir = workRoot + '/' + name;
  mkdirSync(dir, { recursive: true });
  for (const argv of [['init', '-q', '-b', 'master'], ['config', 'user.email', 'v61@nexus.test'], ['config', 'user.name', 'V61 Proof'], ['config', 'commit.gpgsign', 'false'], ['config', 'core.hooksPath', workRoot + '/no-hooks-there-are-none'], ['config', 'core.autocrlf', 'false']]) {
    const r = await gitRaw(dir, PIN, ...argv);
    assert.equal(r.code, 0, 'git ' + argv.join(' ') + ' failed: ' + r.stderr);
  }
  return dir;
}
/** the HUMAN's acts, never a door's: write files, stage them, record one commit */
async function write(dir, rel, body) {
  mkdirSync(dir + '/' + rel.split('/').slice(0, -1).join('/'), { recursive: true });
  writeFileSync(dir + '/' + rel, body);
  return body;
}
async function human(dir, ...argv) {
  const r = await gitRaw(dir, PIN, ...argv);
  assert.equal(r.code, 0, 'human git ' + argv.join(' ') + ' failed: ' + r.stderr);
  return r;
}
const seed = (dir) => human(dir, 'add', '.').then(() => human(dir, 'commit', '-q', '-m', 'human seed (v61)'));

const statusDoor = (dir, callId) => registerGitTools(new ToolRegistry(), createExecHost(gitReadOnlyPolicy(dir), { spawnLike: counting }), { env: {} }).invoke({ callId: callId ?? 'v61:status', tool: 'git.status', args: {} }, { checkpoint: () => true });
const diffDoor = (dir, stat = false) => registerGitTools(new ToolRegistry(), createExecHost(gitReadOnlyPolicy(dir), { spawnLike: counting }), { env: {} }).invoke({ callId: 'v61:diff', tool: 'git.diff', args: { stat } }, { checkpoint: () => true });
const stagedDoor = (dir, stat = false) => registerGitStagedTool(new ToolRegistry(), createExecHost(gitStagedPolicy(dir), { spawnLike: counting }), { env: {} }).invoke({ callId: 'v61:staged', tool: 'git.staged', args: { stat } }, { checkpoint: () => true });
const showDoor = (dir, path, callId) => registerGitShowTool(new ToolRegistry(), createExecHost(gitShowPolicy(dir), { spawnLike: counting }), { env: {} }).invoke({ callId: callId ?? 'v61:show', tool: 'git.show', args: { path } }, { checkpoint: () => true });
const commitDoor = (dir, message) => registerGitCommitTool(new ToolRegistry(), createExecHost(gitCommitPolicy(dir), { spawnLike: counting }), { env: {} }).invoke({ callId: 'v61:commit', tool: 'git.commit', args: { message } }, { checkpoint: () => true });
const out = (res) => res.output;
const SHOW_ARGV = ['show', '--no-ext-diff', '--no-textconv', '--format=', '--'];

// ─────────────────────────────────────────────────────────────────────────────────────────── §0
// The pin is not a comment about a policy; it is a numbered slot the policy has to carry.
const slots = forcedConfigEnv();
assert.equal(slots.GIT_CONFIG_COUNT, '5', 'v46 forced four values, v61 forces five');
assert.equal(slots.GIT_CONFIG_KEY_3, 'core.quotePath', 'slots are numbered in SORTED key order, so a new pin shifts its neighbours — this is that shift, pinned');
assert.equal(slots.GIT_CONFIG_VALUE_3, 'false');
assert.equal(slots.GIT_CONFIG_KEY_4, 'status.showUntrackedFiles', 'the v46 pins still ride along, one slot later');
assert.equal(slots.GIT_CONFIG_KEY_5, undefined, 'COUNT and slots agree: no orphan slot past the table');
const planned = planExec({ argv: ['git', 'status', '--short'], env: PIN }, gitReadOnlyPolicy('X:/repo'));
assert.ok(planned.ok, 'the shipped read shape stays allowed');
assert.deepEqual(planned.plan.droppedEnv, [], 'every name the pinned env emits is on the door allowlist, or the scrubber would be dropping the isolation itself');
assert.equal(planned.plan.env.GIT_CONFIG_VALUE_3, 'false', 'and the value survives planning, on the exact slot git reads it from');
console.log('[porcelain-path-proof] §0 the pin is wired: ' + slots.GIT_CONFIG_COUNT + ' forced slots, quotePath at KEY_3, nothing dropped');

// ─────────────────────────────────────────────────────────────────────────────────────────── §1
// A rename, live: what the doors say, and what the two names are actually good for.
const ALPHA = 'docs/alpha-long-name.md';
const BETA = 'docs/beta-long-name.md';
const ALPHA_BODY = 'the first name\nit carried content\nnot just a label\n';
const r1 = await repo('rename');
await write(r1, ALPHA, ALPHA_BODY);
await seed(r1);
await human(r1, 'mv', ALPHA, BETA); // the HUMAN stages the rename; no door may touch the index

const st1 = out(await statusDoor(r1));
assert.equal(st1.files.length, 1, 'one staged rename, one entry');
assert.deepEqual({ ...st1.files[0] }, { xy: 'R ', status: 'renamed', path: BETA, fromPath: ALPHA }, 'the entry keeps BOTH names, and `path` is the one on disk');
assert.ok(st1.detail.includes('1 rename/copy PAIR(s): ' + ALPHA + ' -> ' + BETA), 'the door SAYS the pair: ' + st1.detail);
assert.ok(st1.detail.includes('the left name is what HEAD knows'), 'and says which half lives where');

const sg1 = out(await stagedDoor(r1));
assert.deepEqual(sg1.files.map((f) => [f.path, f.change, f.fromPath]), [[BETA, 'renamed', ALPHA]], "the index door reads git's own rename-from line and keeps the pre-image too");
assert.ok(sg1.detail.includes('rename/copy PAIR(s)'), 'and speaks the same sentence about it — one rule, both doors');

// the consequence the pair sentence names, measured rather than asserted:
const rawNew = await gitRaw(r1, PIN, ...SHOW_ARGV, BETA);
const rawOld = await gitRaw(r1, PIN, ...SHOW_ARGV, ALPHA);
assert.equal(rawNew.code, 0, 'git does NOT refuse an unknown pathspec (v44 measured this)');
assert.ok(B(rawNew.stdout) === 0 && B(rawOld.stdout) > 0, 'bytes on the record: ' + B(rawNew.stdout) + ' B through the new name vs ' + B(rawOld.stdout) + ' B through the old');
const viaNew = out(await showDoor(r1, BETA, 'v61:show:new'));
const viaOld = out(await showDoor(r1, ALPHA, 'v61:show:old'));
assert.deepEqual(viaNew.addedLines, [], 'and the door reads that silence as an empty answer for that path');
assert.ok(viaNew.detail.includes('HEAD touches nothing at ' + BETA), 'so it says "touches nothing" — true of the path, false of the change: ' + viaNew.detail);
assert.equal(viaOld.addedLines.join('\n'), ALPHA_BODY.trimEnd(), 'the SAME content is readable through the name the parser used to drop');
assert.ok(existsSync(r1 + '/' + BETA) && !existsSync(r1 + '/' + ALPHA), 'the two names are not interchangeable: the left one is in HEAD, the right one is on disk');
console.log('[porcelain-path-proof] §1 a staged rename is a PAIR in both index-facing doors; HEAD answers ' + B(rawOld.stdout) + ' B for the old name and ' + B(rawNew.stdout) + ' B for the new one');

// and the pair does not linger once the commit records it: after it, the right-hand name IS HEAD's name.
const cm1 = out(await commitDoor(r1, 'chore(v61): record the rename the human staged'));
assert.equal(cm1.exitCode, 0, 'the commit door records exactly the staged rename: ' + cm1.detail);
const stAfter = out(await statusDoor(r1, 'v61:status:after'));
assert.equal(stAfter.files.length, 0, 'a clean tree reads as zero entries, pair and all');
assert.equal((await gitRaw(r1, PIN, 'show', '--format=', '--name-only', '--')).stdout.trim(), BETA, 'and HEAD now knows the change by the name on disk');
console.log('[porcelain-path-proof] §1b after the commit, status has no pair left to speak');

// ─────────────────────────────────────────────────────────────────────────────────────────── §2
// The rendering. The counterfactual env is the SHIPPED table with v61's slot removed, so git's own
// default (`core.quotePath=true`) speaks: these are its bytes, not a fixture's.
const PRE_V61 = (() => {
  const four = forcedConfigEnv({ 'core.attributesFile': '', 'core.excludesFile': '', 'core.fsmonitor': '', 'status.showUntrackedFiles': 'all' });
  const env = { ...PIN, ...four };
  delete env.GIT_CONFIG_KEY_4;
  delete env.GIT_CONFIG_VALUE_4;
  return env;
})();
assert.equal(PRE_V61.GIT_CONFIG_COUNT, '4');
assert.ok(!Object.values(PRE_V61).includes('core.quotePath'), 'the counterfactual really is "before v61", not a different pin');

const CAFE = 'docs/café-note.md'; // a name NTFS accepts and unpinned git renders
const CAFE_OLD = 'cafe without the accent\n';
const CAFE_NEW = 'café with the accent, staged by a human\nand a second line\n';
const r2 = await repo('quoted');
await write(r2, CAFE, CAFE_OLD);
await seed(r2);
await write(r2, CAFE, CAFE_NEW);
await human(r2, 'add', '--', CAFE); // staged, never committed — the §28 window is open

const oldStatus = await gitRaw(r2, PRE_V61, 'status', '--short');
const newStatus = await gitRaw(r2, PIN, 'status', '--short');
assert.ok(oldStatus.stdout.includes('"docs/caf\\303\\251-note.md"'), 'git renders the non-ASCII name as an escaped STRING: ' + JSON.stringify(oldStatus.stdout));
assert.ok(!newStatus.stdout.includes('"'), 'with the pin forced, no quote appears anywhere in the same line');
assert.equal(newStatus.stdout, oldStatus.stdout.replace('"docs/caf\\303\\251-note.md"', CAFE), 'one thing changed in the answer: the rendering, and not a byte more');

const parsedOld = parseGitStatus(oldStatus.stdout);
const parsedNew = parseGitStatus(newStatus.stdout);
assert.deepEqual(parsedNew.files.map((f) => [f.path, f.quoted ?? false]), [[CAFE, false]], 'the pinned parse carries the name on disk and needs no warning');
assert.ok(existsSync(r2 + '/' + parsedNew.files[0].path), 'and that name opens');
assert.equal(parsedOld.files[0].quoted, true, 'the unpinned parse is MARKED: a rendering the door announces instead of trusting');
assert.ok(!existsSync(r2 + '/' + parsedOld.files[0].path), 'because it does not open: ' + JSON.stringify(parsedOld.files[0].path));
assert.deepEqual(parsedOld.counts, parsedNew.counts, 'the tally was never the casualty — the PATH was, which is why a count cannot excuse one');
const oldNotice = pathShapeNotices(parsedOld.files);
assert.match(oldNotice, /C-QUOTED RENDERING/, 'the shipped sentence for these entries: ' + oldNotice);
assert.ok(oldNotice.includes(parsedOld.files[0].path), 'and it quotes the exact string it refuses to pass on as a path');
assert.equal(pathShapeNotices(parsedNew.files), '', 'under the pin the same door says nothing extra — a marked warning that never fires is a warning nobody reads');

const oldStaged = await gitRaw(r2, PRE_V61, 'diff', '--no-ext-diff', '--no-textconv', '--cached');
const newStaged = await gitRaw(r2, PIN, 'diff', '--no-ext-diff', '--no-textconv', '--cached');
assert.ok(oldStaged.stdout.startsWith('diff --git "a/'), 'git quotes the WHOLE header, the a/ prefix included: ' + JSON.stringify(oldStaged.stdout.slice(0, 44)));
// v43's header matcher, copied VERBATIM from `git show HEAD:agents/exec-host/src/gitStagedTool.ts`
// (line 73) and pinned here so the claim below is about a regex, not about a memory.
const V43_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const v43Headers = (t) => t.split('\n').filter((l) => V43_HEADER.test(l)).length;
assert.equal(v43Headers(oldStaged.stdout), 0, "run over the rendered bytes, v43's matcher found NO file in a one-file staged diff");
assert.equal(v43Headers(newStaged.stdout), 1, 'the same regex over the pinned bytes is fine: the rendering was the blindfold, not the matcher');
const unpinnedParse = parseStagedDiff(oldStaged.stdout);
assert.equal(unpinnedParse.files.length, 1, 'the shipped shared matcher reads BOTH header forms, so the change is named again');
assert.equal(unpinnedParse.files[0].quoted, true, 'and it says which of the two names is only a picture of one');
assert.equal(parseStagedDiff(newStaged.stdout).files[0].quoted, undefined, 'under the pin the entry carries no warning field at all — a flag that is always present is a flag nobody checks');
assert.ok(!existsSync(r2 + '/' + unpinnedParse.files[0].path), 'the name the old bytes carry will not open: ' + JSON.stringify(unpinnedParse.files[0].path));
assert.deepEqual(parseStagedDiff(newStaged.stdout).files[0].addedLines, CAFE_NEW.split('\n').slice(0, -1), "with the human's intent byte-for-byte, under the name on disk");
const oldStat = await gitRaw(r2, PRE_V61, 'diff', '--no-ext-diff', '--no-textconv', '--cached', '--stat');
assert.ok(oldStat.stdout.includes('1 file changed'), 'git itself disagrees with the parse it handed the door: ' + JSON.stringify(oldStat.stdout.split('\n').at(-2)));

// what the door would have SAID. Not invented: the same door, run for real over a genuinely empty index,
// emitting the sentence verbatim — so the lie below is attributable to the rendering, not to this file.
const r2empty = await repo('quoted-empty');
await write(r2empty, 'seed.md', 'a seed\n');
await seed(r2empty);
const trulyEmpty = out(await stagedDoor(r2empty));
assert.ok(trulyEmpty.detail.includes('the index is EMPTY'), 'the clean-index sentence, from the clean-index door: ' + trulyEmpty.detail);
assert.equal(v43Headers(oldStaged.stdout), trulyEmpty.files.length, 'a staged change under the rendering and a genuinely empty index handed v43 the SAME empty array — that is the whole bug, and it is a count away, not a guess');
assert.ok(!trulyEmpty.detail.includes('rendering'), 'the emitted sentence names neither case, because the door never saw a header to doubt');
console.log('[porcelain-path-proof] §2 unpinned git quotes a non-ASCII name: the status entry stops opening and ' + B(oldStaged.stdout) + " B of staged diff give v43's matcher 0 headers, while git's own --stat says \"1 file changed\"");

// ─────────────────────────────────────────────────────────────────────────────────────────── §3
// The separator, the quoting of ORDINARY names, and the one split git leaves ambiguous. Real bytes only.
const SPACED = 'docs/a file with spaces.md';
const SPACED_TO = 'docs/a file with spaces, renamed.md';
const r3 = await repo('spaces');
await write(r3, SPACED, 'spaces are ordinary bytes\n');
await seed(r3);
await human(r3, 'mv', SPACED, SPACED_TO);
const raw3 = await gitRaw(r3, PIN, 'status', '--short');
assert.ok(raw3.stdout.startsWith('R  "'), 'measured: git quotes BOTH halves of a spaced pair even with core.quotePath=false — what it is disambiguating is the arrow: ' + JSON.stringify(raw3.stdout));
const st3 = out(await statusDoor(r3, 'v61:status:spaces'));
assert.deepEqual(st3.files.map((f) => [f.path, f.fromPath, f.quoted ?? false]), [[SPACED_TO, SPACED, false]], 'the door hands back names that OPEN, not the picture git printed');
assert.ok(existsSync(r3 + '/' + st3.files[0].path), 'the name the door speaks for the disk IS the disk');
assert.ok(!existsSync(r3 + '/' + st3.files[0].fromPath), "and the other half is NOT on disk — it lives in HEAD, which is exactly why one name cannot carry this change");
assert.equal((await gitRaw(r3, PIN, 'show', 'HEAD:' + SPACED)).code, 0, 'HEAD answers for the old name under that name, unwrapped and unrefused');
assert.ok(st3.detail.includes('rename/copy PAIR(s)'), 'and the door says out loud that this entry is a pair: ' + st3.detail);
const mixedForm = parseGitStatus('R  x.md -> "m b/n.md"\n');
assert.deepEqual([mixedForm.files[0].path, mixedForm.files[0].fromPath, mixedForm.files[0].quoted ?? false], ['m b/n.md', 'x.md', false], 'a one-sided quote does not shift the split');
assert.deepEqual(parseGitStatus('?? "plain name.md"\n').files[0], { xy: '??', status: 'untracked', path: 'plain name.md' }, 'an unquoted-by-the-pin, quoted-by-git name is returned as the file');
const df3 = out(await diffDoor(r3, false));
assert.deepEqual(df3.files, [], 'the worktree door sees nothing of a STAGED rename — which is why only the two index-facing doors carry a pre-image');

// A diff HEADER is split by position, and a directory whose name ends in a space puts a second ` b/`
// inside the path and steals that split. NTFS allows `m b/`, so this is creatable, and git prints it raw.
const BSLASH = 'm b/n.md';
const r3b = await repo('bslash');
await write(r3b, 'x.md', 'one line, then renamed into a space-ended directory\n');
await seed(r3b);
mkdirSync(r3b + '/m b', { recursive: true }); // git mv will not create a destination directory, least of all one whose name ends in a space
await human(r3b, 'mv', 'x.md', BSLASH);
const raw3b = await gitRaw(r3b, PIN, 'diff', '--no-ext-diff', '--no-textconv', '--cached');
assert.ok(raw3b.stdout.startsWith('diff --git a/x.md b/m b/n.md\n'), 'git prints the ambiguous header itself, unquoted: ' + JSON.stringify(raw3b.stdout.split('\n')[0]));
assert.deepEqual(parseDiffHeader('diff --git a/x.md b/m b/n.md'), { from: 'x.md b/m', to: 'n.md', quoted: false }, 'the stolen split, measured: one name that is two paths glued together');
assert.deepEqual(parseFileLine('+++ b/m b/n.md'), { path: 'm b/n.md', quoted: false }, "git's own per-line name is unambiguous — it is the whole rest of the line");
const st3b = out(await stagedDoor(r3b));
assert.deepEqual([st3b.files[0].path, st3b.files[0].fromPath], [BSLASH, 'x.md'], 'so the door reports the PAIR git named in its `rename from`/`rename to` lines, not the header it had to split');
assert.ok(existsSync(r3b + '/' + st3b.files[0].path), 'and that name opens');

let arrowBound;
try {
  writeFileSync(r3 + '/docs/weird -> name.md', 'if this exists, the box allows it\n');
  arrowBound = 'created (this filesystem allows ">" in a name)';
  const weird = await gitRaw(r3, PIN, 'status', '--short', '--', 'docs/weird -> name.md');
  assert.ok(weird.stdout.startsWith('?? "docs/weird -> name.md"'), 'git renders it quoted, and an untracked entry keeps the WHOLE name: ' + JSON.stringify(weird.stdout));
  assert.equal(parseGitStatus('M  docs/weird -> name.md\n').files[0].fromPath, undefined, 'an M entry is not a pair, arrow or no arrow');
} catch (e) {
  arrowBound = 'NOT creatable on this filesystem (' + e.code + ')';
  assert.match(String(e.code), /EPERM|EINVAL|ENOENT/, 'the attempt fails with a name-illegal error, which is the evidence for the bound');
}
// The bound that keeps `unwrapRendering` from unwrapping everything: a name containing a quote or a tab
// would make git ESCAPE inside the quotes, and NTFS will not hold either character. Both attempts are
// the measurement; the escaped branch above is exercised by fixture because it cannot be exercised here.
const illegal = [];
for (const name of ['docs/weird "quote.md', 'docs/tab\tname.md']) {
  try {
    writeFileSync(r3 + '/' + name, 'x\n');
    illegal.push(name + ' → CREATED (this box allows it; the bound below is void here)');
  } catch (e) {
    illegal.push(name.replace('\t', '\\t') + ' → ' + e.code);
  }
}
const escaped = parseGitStatus('?? "a\\"b.md"\n');
assert.deepEqual([escaped.files[0].path, escaped.files[0].quoted], ['"a\\"b.md"', true], 'a rendering with an escape inside stays VERBATIM and marked: the door will not guess which character it is standing for');
const arrowKept = parseGitStatus('M  notes -> draft.md\n');
assert.equal(arrowKept.files[0].path, 'notes -> draft.md', 'for a family with no separator, an arrow is DATA');
assert.equal(arrowKept.files[0].fromPath, undefined, 'and no half of a phantom rename is invented');
assert.deepEqual(parseDiffHeader('diff --git "a/notes/x\\303\\251.md" "b/notes/y\\303\\251.md"'), { from: '"notes/x\\303\\251.md"', to: '"notes/y\\303\\251.md"', quoted: true }, 'a QUOTED header still yields both names, marked as renderings');
assert.deepEqual(parseDiffHeader('diff --git a/x.md b/x.md'), { from: 'x.md', to: 'x.md', quoted: false }, 'the plain form is unchanged');
assert.equal(parseDiffHeader('diff --git a/only-one-side'), null, 'a half-header names nothing, so it is not an entry');
console.log('[porcelain-path-proof] §3 the arrow separates R/C only; git quotes an ordinary spaced name and the door unwraps it; a " b/" directory steals the header split and loses to git\'s own per-line name; a filename containing " -> " is ' + arrowBound + '; names git would escape are ' + illegal.join(' · '));

// ─────────────────────────────────────────────────────────────────────────────────────────── §4
// The candidate v61 set out to fix and could not: an untracked directory is NOT collapsed here, and the
// reason is v46's pin. Measured both ways so the claim has a witness rather than a memory.
const r4 = await repo('untracked');
await write(r4, 'keep.md', 'tracked\n');
await seed(r4);
for (const n of ['a.md', 'b.md', 'nested/c.md']) await write(r4, 'dropzone/' + n, 'untracked ' + n + '\n');
const shipped4 = parseGitStatus((await gitRaw(r4, PIN, 'status', '--short')).stdout);
assert.equal(shipped4.counts.untracked, 3, 'pinned: three untracked files, three entries');
assert.ok(shipped4.files.every((f) => existsSync(r4 + '/' + f.path)), 'every one of them a path that opens');
const NORMAL = { ...PIN, ...forcedConfigEnv({ 'core.attributesFile': '', 'core.excludesFile': '', 'core.fsmonitor': '', 'core.quotePath': 'false', 'status.showUntrackedFiles': 'normal' }) };
const normal4 = parseGitStatus((await gitRaw(r4, NORMAL, 'status', '--short')).stdout);
assert.equal(normal4.counts.untracked, 1, 'unpinned-but-otherwise-shipped: ONE entry, because git collapsed the directory');
assert.equal(normal4.files.find((f) => f.status === 'untracked').path, 'dropzone/', 'and that entry is a directory PREFIX, not any of the three files');
console.log('[porcelain-path-proof] §4 the "a directory counts as one entry" candidate is FALSE for the shipped doors: ' + shipped4.counts.untracked + ' entries pinned vs ' + normal4.counts.untracked + ' with showUntrackedFiles=normal');

// ─────────────────────────────────────────────────────────────────────────────────────────── §5
// The content door will not ask git about a picture of a path.
const before = spawns;
const refused = await showDoor(r2, '"docs/caf\\303\\251-note.md"', 'v61:show:rendering');
assert.equal(refused.ok, false, 'the CALL answers, and what it answers with is a stated refusal');
assert.match(String(refused.error), /C-QUOTED RENDERING/, String(refused.error));
assert.equal(spawns - before, 0, 'at zero spawns — git never saw a question, so it cannot hand back silence about a file nobody named');
const opened = out(await showDoor(r2, CAFE, 'v61:show:raw'));
assert.equal(opened.exitCode, 0, 'the pinned name does reach git, and git answers for it');
assert.deepEqual(opened.addedLines, CAFE_OLD.split('\n').slice(0, -1), "the content read-back is HEAD's bytes for that name — the NEW bytes are in the index, which §2 read through `git.staged`: one name, two places, and a door for each");
console.log('[porcelain-path-proof] §5 git.show refuses a rendering (' + refused.error + '), and reads HEAD\'s ' + B(CAFE_OLD) + ' B for that name through the real one');

// ─────────────────────────────────────────────────────────────────────────────────────────── §6
const headNow = (await gitRaw('.', PIN, 'rev-parse', 'HEAD')).stdout.trim();
assert.equal(headNow, homeHead, "this repo's HEAD is byte-identical: no commit of this proof landed outside os.tmpdir");
assert.ok(/^[0-9a-f]{40}$/.test(homeHead), 'and the comparison is against a real SHA, not an empty string (' + JSON.stringify(homeHead) + ')');
rmSync(workRoot, { recursive: true, force: true });
assert.ok(!existsSync(workRoot), 'the throwaway repos are gone');
console.log('[porcelain-path-proof] ' + spawns + ' git processes through the doors in total, all of them inside os.tmpdir · M2 v61 ADR 0016 amendment 61 OK');
