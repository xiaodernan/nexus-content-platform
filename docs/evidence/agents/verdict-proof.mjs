// NEXUS M2 v52 (exec-host) — WHAT A DOOR MAY SAY WHEN GIT SAYS NOTHING USEFUL (ADR 0016 amendment 52).
// Measured with throwaway probes before any code moved, against real git 2.52 running the EXACT argv
// the shipped doors run. Eleven failure states, and they sorted themselves into three complaints:
//   1. a refusal's REASON is the line git prefixed (`fatal:`/`error:`/`warning:`), but every door
//      quoted LINE 1 of stderr-or-stdout — and for the single most common refusal there is no prefix
//      at all: `git commit` over an unchanged tree answers `On branch master` / `nothing to commit,
//      working tree clean`. A human at the §28 gate was reading the banner, not the verdict;
//   2. the two READ doors (v32) quoted NOTHING on a nonzero exit — they returned a parsed tally of
//      the empty stdout, so a corrupt index answered `git.status → exit 128: 0 entries`, which reads
//      as "clean";
//   3. git can exit 0 and still not ANSWER: in a conflicted index `git diff --cached` prints
//      `* Unmerged path file.md` and no diff, and plain `git diff` prints a combined `diff --cc` body
//      the v32 parser finds no header for. Both parse to zero, and git.staged then said "the index is
//      EMPTY" — the opposite of the truth, one step before a commit ask.
// This proof drives the SHIPPED doors against those real states and refuses to let the runtime grade
// its own homework: for every case the same argv is also run RAW, outside the sandbox, by the harness
// (which plays the human that builds each repo), so the quote is checked against git's own bytes.
// §9 holds: every repository here is a throwaway under os.tmpdir, hooks/signing neutralized LOCALLY,
// staging and merging are HUMAN acts run raw, and this repo's HEAD is compared byte-wise at the end.
// Run after `npm run build`:  node docs/evidence/agents/verdict-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const {
  GIT_DIFF_FLAGS,
  NODE_SPAWN,
  createExecHost,
  gitCommitPolicy,
  gitReadOnlyPolicy,
  gitStagedPolicy,
  loadExecAudits,
  registerGitCommitTool,
  registerGitStagedTool,
  registerGitTools,
} = eh;

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workRoot = mkTmp('nexus-v52-proof');
const REFUSAL = 'git REFUSED this command';
const UNMERGED = 'instead of a diff — a conflicted index';
const grant = { checkpoint: () => true };
const deny = { checkpoint: () => false };

/** Which door, and its OWN keyed policy: a door cannot borrow another door's power. */
const DOORS = {
  commit: { policy: gitCommitPolicy, register: registerGitCommitTool, tool: 'git.commit' },
  readOnly: { policy: gitReadOnlyPolicy, register: registerGitTools, tool: 'git.status' },
  diff: { policy: gitReadOnlyPolicy, register: registerGitTools, tool: 'git.diff' },
  diffStat: { policy: gitReadOnlyPolicy, register: registerGitTools, tool: 'git.diff', args: { stat: true } },
  staged: { policy: gitStagedPolicy, register: registerGitStagedTool, tool: 'git.staged' },
  stagedStat: { policy: gitStagedPolicy, register: registerGitStagedTool, tool: 'git.staged', args: { stat: true } },
};

/**
 * One door, one host, one spawn counter. `journalFile` (v51) lets §7 put the door's sentence and the
 * host's verbatim record of the SAME run side by side.
 */
function door(which, root, { journalFile } = {}) {
  const spec = DOORS[which];
  const spawns = [];
  const spawnLike = (command, args, opts) => {
    spawns.push([command, ...args].join(' '));
    const child = NODE_SPAWN(command, args, opts);
    return {
      onData: (l) => child.onData((s, c) => l(s, c)),
      onEnd: (l) => child.onEnd(l),
      kill: () => child.kill(),
    };
  };
  const options = { spawnLike };
  if (journalFile) options.journal = { disk: fsDisk, file: journalFile };
  const registry = spec.register(new ToolRegistry(), createExecHost(spec.policy(root), options), { env: {} });
  return {
    spawns,
    async call(args = {}) {
      const res = await registry.invoke({ callId: `v52:${which}`, tool: spec.tool, args: { ...spec.args, ...args } }, grant);
      if (!res.ok) throw new Error(`${which} errored: ${res.error}`);
      return res.output;
    },
    async denied(args = {}) {
      return registry.invoke({ callId: `v52:${which}:deny`, tool: spec.tool, args: { ...spec.args, ...args } }, deny);
    },
  };
}

/** git, run by the HARNESS — the human side, and the independent witness for every quote below. */
function raw(dir, ...argv) {
  try {
    const stdout = execFileSync('git', argv, { cwd: dir, encoding: 'utf8', env: gitTestEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? null, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}
function gitTestEnv() {
  // the doors run under gitEnv(); the harness uses the same isolation so both witness the same git
  return eh.gitEnv(process.env);
}
const lines = (s) => s.split('\n').map((l) => l.trim()).filter((l) => l !== '');
const commitArgv = ['git', 'commit', '-m', 'v52 says hi'].join(' ');

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(`${base}${n}`)) n += 1;
  mkdirSync(`${base}${n}`, { recursive: true });
  return `${base}${n}`;
}
const fsDisk = {
  readFileSync: (file, encoding) => readFileSync(file, encoding),
  mkdirSync: (dir) => mkdirSync(dir, { recursive: true }),
  writeFileSync: (file, data, encoding) => writeFileSync(file, data, encoding),
};

/** A repo with ONE commit, so `git commit` has a HEAD to talk about and nothing to record. */
function seededRepo(name, extra) {
  const dir = `${workRoot}/${name}`;
  mkdirSync(dir, { recursive: true });
  raw(dir, 'init', '-q', '-b', 'master');
  raw(dir, 'config', 'user.email', 'v52@nexus.test');
  raw(dir, 'config', 'user.name', 'V52 Proof');
  raw(dir, 'config', 'commit.gpgsign', 'false');
  raw(dir, 'config', 'core.hooksPath', `${workRoot}/no-hooks-there-are-none`);
  writeFileSync(`${dir}/seed.md`, 'seed line\n');
  if (extra) writeFileSync(`${dir}/file.md`, 'base version\n');
  raw(dir, 'add', '.');
  raw(dir, 'commit', '-q', '-m', 'seed');
  return dir;
}

try {
  // ---------- §1 the banner case: the verdict is git's LAST line, and the quote is git's own ----------
  const clean = seededRepo('clean');
  const control = raw(clean, 'commit', '-m', 'v52 says hi'); // same argv, same state, outside the sandbox
  assert.equal(control.code, 1, 'control: git itself refuses a commit over an unchanged tree with exit 1');
  assert.equal(lines(control.stdout)[0], 'On branch master', 'control: what git prints FIRST is a banner, not a reason');
  assert.equal(lines(control.stdout).at(-1), 'nothing to commit, working tree clean', 'control: what git prints LAST is the verdict');
  assert.equal(control.stderr, '', 'control: this refusal never touches stderr at all — the old stderr-first rule had nothing to read');

  const c1 = door('commit', clean);
  const refused = await c1.call({ message: 'v52 says hi' });
  assert.equal(refused.ok, false, 'the door reports the refusal as data, never as a success');
  assert.equal(refused.exitCode, control.code, 'the exit code the door states IS the exit code git returned');
  assert.ok(refused.detail.includes('nothing to commit, working tree clean'), 'the door quotes the verdict line');
  assert.ok(!refused.detail.includes('On branch master'), 'and does NOT quote the banner a pre-v52 reviewer read');
  assert.ok(refused.detail.includes("git's last line of the 2 it printed"), 'the sentence says how much of git it left out');
  assert.ok(lines(control.stdout).some((l) => refused.detail.includes(l)), 'the quote is a verbatim line of git, not authored prose');
  assert.deepEqual(c1.spawns, [commitArgv], 'exactly one process, the allowlisted one');
  assert.equal(raw(clean, 'rev-parse', 'HEAD').code, 0, 'and the repo still has its one commit: the refusal changed nothing');
  console.log(`[verdict-proof] §1 exit ${refused.exitCode} over an unchanged tree → door says "${lines(refused.detail)[0]}" · git's real first line was "${lines(control.stdout)[0]}"`);

  // ---------- §2 the six-line refusal a §28 reviewer actually weighs ----------
  const dirty = seededRepo('dirty');
  writeFileSync(`${dirty}/seed.md`, 'seed line, edited and NOT staged\n');
  const dirtyControl = raw(dirty, 'commit', '-m', 'v52 says hi');
  assert.equal(dirtyControl.code, 1);
  assert.equal(lines(dirtyControl.stdout).length, 6, 'control: git spends six lines on this refusal');
  const c2 = door('commit', dirty);
  const dirtyRefused = await c2.call({ message: 'v52 says hi' });
  assert.ok(dirtyRefused.detail.includes('no changes added to commit'), 'the door quotes what to DO, which is git last line');
  assert.ok(dirtyRefused.detail.includes('git\'s last line of the 6 it printed'), 'and admits it quoted one of six');
  assert.ok(!dirtyRefused.detail.includes('On branch master'), 'still no banner');
  assert.equal(c2.spawns.length, 1, 'one process for one refusal');
  // a §28 DENY costs no process and no words: the door never runs, so there is nothing to quote
  const denied = await c2.denied({ message: 'v52 says hi' });
  assert.equal(denied.ok, false, 'the registry refused');
  assert.match(denied.error, /checkpoint/i, 'with the §28 reason');
  assert.equal(c2.spawns.length, 1, 'a human veto costs no process, so it can cost no verdict either');
  console.log(`[verdict-proof] §2 six lines of git → door quotes "${/exit 1: ([^·]+) ·/.exec(dirtyRefused.detail)?.[1].trim()}" and states it left five behind · a veto adds 0 processes`);

  // ---------- §3 a prefixed refusal: the reason is line 1 of stderr, and it names a real file ----------
  const locked = seededRepo('locked');
  writeFileSync(`${locked}/staged.md`, 'staged for a commit that cannot land\n');
  raw(locked, 'add', 'staged.md'); // the human stages; then a lock appears
  writeFileSync(`${locked}/.git/index.lock`, '');
  const lockControl = raw(locked, 'commit', '-m', 'v52 says hi');
  assert.equal(lockControl.code, 128, 'control: a lock is a fatal, not a warning');
  assert.match(lockControl.stderr, /^fatal: Unable to create .*index\.lock': File exists\.$/m, 'control: git names the lock file');
  const c3 = door('commit', locked);
  const lockRefused = await c3.call({ message: 'v52 says hi' });
  assert.ok(lockRefused.detail.includes('fatal: Unable to create'), 'the door quotes the fatal line');
  assert.ok(lockRefused.detail.includes('index.lock'), 'including the file git blames, which is the actionable part');
  // The count is derived, not hardcoded. It used to say `6` because the git of the day printed a
  // brace of `hint:` lines on a lock conflict; git 2.55 prints two non-empty lines here, so a
  // literal would have been an assertion about a git VERSION rather than about the door. The rule
  // being checked is the door's own: non-empty lines across BOTH streams.
  const lockControlLines = [...lockControl.stderr.split('\n'), ...lockControl.stdout.split('\n')]
    .filter((l) => l.trim() !== '').length;
  assert.ok(
    lockRefused.detail.includes(`git's prefixed line of the ${lockControlLines} it printed`),
    `the door states its quote is ONE of git's ${lockControlLines} non-empty lines, counted by its own rule`,
  );
  assert.ok(existsSync(`${locked}/.git/index.lock`), 'the door only spoke: it left the lock exactly where it found it');
  rmSync(`${locked}/.git/index.lock`);
  const afterUnlock = await c3.call({ message: 'v52 says hi' });
  assert.equal(afterUnlock.ok, true, 'the SAME door over the SAME index succeeds once the reason is gone');
  assert.match(afterUnlock.detail, /exit 0: master@/, 'and says what git recorded, in git\'s own summary');
  assert.equal(afterUnlock.record?.stat?.files, 1, 'the commit that the lock refused is now one commit ahead');
  assert.equal(c3.spawns.length, 2, 'two processes, two verdicts, one human-staged file recorded exactly once');
  console.log(`[verdict-proof] §3 lock → "${/exit 128: ([^·]+)/.exec(lockRefused.detail)?.[1].trim()}" · unlock → ${afterUnlock.detail.slice(0, 46)}`);

  // ---------- §4 FOUR read doors on ONE broken repo: a refusal is never a tally ----------
  const broken = seededRepo('broken');
  writeFileSync(`${broken}/.git/index`, 'garbage-not-an-index-file');
  const brokenControl = raw(broken, 'status', '--short');
  assert.equal(brokenControl.code, 128);
  assert.equal(brokenControl.stdout, '', 'control: git prints NOTHING on stdout — every tally below is a count of nothing');
  const fatal = brokenControl.stderr.trim();
  const seen = [];
  for (const which of ['readOnly', 'diff', 'diffStat', 'staged']) {
    const d = door(which, broken);
    const out = await d.call();
    seen.push(`${which}=${out.exitCode}`);
    assert.equal(out.ok, false, `${which}: a refused read is not an answer`);
    assert.equal(out.exitCode, 128, `${which}: relays git's exit code`);
    assert.ok(out.detail.includes(fatal), `${which}: quotes git's own fatal line "${fatal}"`);
    assert.ok(out.detail.includes(REFUSAL), `${which}: says it was REFUSED, not that it measured`);
    assert.ok(out.detail.includes('NOT a statement that'), `${which}: names what the reader must not conclude`);
    assert.equal(d.spawns.length, 1, `${which}: one process for one question`);
    // the sharpest part: with the disclaimer removed, no sentence may still claim an absence
    assert.ok(!out.detail.replace(/git REFUSED this command — this is NOT a statement that [^·]+/, '').match(/\b(is EMPTY|clean)\b/), `${which}: no bare absence claim survives outside the disclaimer`);
  }
  const stillBroken = raw(broken, 'status', '--short');
  assert.equal(stillBroken.code, 128, 'four doors read the broken repo and repaired nothing (they could not, and did not pretend to)');
  console.log(`[verdict-proof] §4 four read doors, one corrupt index (${seen.join(' ')}) · all four quote "${fatal}" and none of them claims an empty tree`);

  // ---------- §5 exit 0 is not an answer either: the unmerged NOTICE ----------
  const conflict = seededRepo('conflict', true);
  raw(conflict, 'checkout', '-q', '-b', 'side');
  writeFileSync(`${conflict}/file.md`, 'side version\n');
  raw(conflict, 'add', '.');
  raw(conflict, 'commit', '-q', '-m', 'side');
  raw(conflict, 'checkout', '-q', 'master');
  writeFileSync(`${conflict}/file.md`, 'main version\n');
  raw(conflict, 'add', '.');
  raw(conflict, 'commit', '-q', '-m', 'main');
  raw(conflict, 'merge', '--no-commit', '--no-ff', 'side');
  const noticeControl = raw(conflict, 'diff', ...GIT_DIFF_FLAGS, '--cached');
  assert.equal(noticeControl.code, 0, 'control: git REFUSES to fail here — it exits 0 and prints a notice instead of a diff');
  assert.deepEqual(lines(noticeControl.stdout), ['* Unmerged path file.md'], 'control: the whole answer is one notice line');
  const s5 = door('staged', conflict);
  const noticed = await s5.call();
  assert.equal(noticed.ok, true, 'the door relays the exit-0 verdict');
  assert.deepEqual(noticed.files, [], 'and its parser really does see zero per-file changes');
  assert.ok(noticed.detail.includes('git reported 1 UNMERGED path(s) (file.md)'), 'so it names the notice instead');
  assert.ok(noticed.detail.includes(UNMERGED), 'and says a zero tally is not an absence');
  assert.ok(!noticed.detail.includes('the index is EMPTY'), 'pre-v52 this door said the index was EMPTY, one step before a commit ask — the opposite of the truth');
  const statNoticed = await s5.call({ stat: true });
  assert.ok(statNoticed.detail.includes('index holds 0 file(s)'), 'the --stat shape relays its own footer');
  assert.ok(statNoticed.detail.includes('UNMERGED path(s) (file.md)'), 'and the same notice, from a DIFFERENT git shape (` file.md | Unmerged`)');
  const combined = await door('diff', conflict).call();
  assert.ok(combined.detail.includes('0 files, +0 −0 (0 hunks)'), 'control: a combined `diff --cc` body has no v32 header to parse');
  assert.ok(combined.detail.includes('UNMERGED path(s) (file.md)'), 'and this door names it too, from the third shape');
  assert.ok(raw(conflict, 'status', '--short').stdout.includes('UU'), 'the conflict survived every read: the doors resolved nothing');
  console.log(`[verdict-proof] §5 exit 0, three notice shapes, zero parsed files → all three doors say UNMERGED and none says EMPTY · git.staged --stat: "${/exit 0: ([^(]+)\(/.exec(statNoticed.detail)?.[1].trim()}"`);

  // ---------- §6 the rule relays, it does NOT diagnose ----------
  const notARepo = `${workRoot}/plain`;
  mkdirSync(notARepo, { recursive: true });
  const statusHere = await door('readOnly', notARepo).call();
  assert.ok(statusHere.detail.includes('fatal: not a git repository'), 'git itself says the repo is missing, so the door may too');
  const stagedHere = door('staged', notARepo);
  const usage = await stagedHere.call();
  assert.equal(usage.exitCode, 129, 'control: outside a repo `git diff --cached` degrades to --no-index mode and fails on the FLAG');
  assert.ok(usage.detail.includes("error: unknown option `cached'"), 'the door quotes what git said — even when the deeper cause is the missing repo');
  assert.ok(/git's prefixed line of the (\d+) it printed/.test(usage.detail), 'and states how many lines it left behind');
  assert.ok(!usage.detail.includes('not a git repository'), 'it does NOT upgrade a relay into a diagnosis git did not offer (§60)');
  assert.equal(stagedHere.spawns.length, 1, 'one process, one 132-line usage dump, one quoted line');
  console.log(`[verdict-proof] §6 same directory, two commands, two different git complaints, each quoted as git spoke it · door left ${/of the (\d+) it printed/.exec(usage.detail)?.[1]} lines unquoted`);

  // ---------- §7 v51 × v52: two records of one refusal, in the two shapes each owns ----------
  const journalFile = `${workRoot}/journal/verdict.jsonl`;
  const c7 = door('commit', clean, { journalFile });
  const joined = await c7.call({ message: 'v52 says hi' });
  const { records, malformed } = loadExecAudits(fsDisk, journalFile);
  assert.equal(malformed, 0, 'the host record loads clean');
  assert.equal(records.length, 1, 'one process, one record');
  assert.ok(records[0].stdout.includes('On branch master'), 'the v51 record keeps git\'s BANNER, because it keeps everything');
  assert.ok(joined.detail.includes('nothing to commit, working tree clean'), 'the v52 sentence carries the VERDICT');
  assert.ok(!joined.detail.includes('On branch master'), 'and the two records are deliberately different shapes of one fact');
  assert.equal(lines(records[0].stdout).length, lines(control.stdout).length, 'byte-for-byte, the record holds all of what the control saw');
  console.log(`[verdict-proof] §7 one refusal, two memories: host record ${lines(records[0].stdout).length} lines verbatim · door sentence 1 verdict line, banner deliberately dropped`);
} finally {
  rmSync(workRoot, { recursive: true, force: true });
  assert.ok(!existsSync(workRoot), 'every throwaway repo, index.lock and journal is gone');
}

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — nothing here wrote outside os.tmpdir');
console.log('[verdict-proof] ALL ASSERTIONS PASSED (a door now quotes what git MEANT, and says how much of it it left out)');
