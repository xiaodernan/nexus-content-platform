// NEXUS M2 v46 (exec-host) — the ENVIRONMENT is part of the policy (ADR 0016 amendment 46).
// v29–v43 confined the argv: exact tokens, one floating argument, jailed cwd, scrubbed
// env, clamped budgets. Every one of those confines what a command may SAY. None of them
// confines what git DECIDES TO DO with a perfectly-shaped argv, because git consults config
// it chose to read on its own. Measured against real git 2.52, exit code 0 throughout:
//
//   [diff] external = <program>          `git diff` / `git diff --cached` run that program
//                                        INSTEAD of diffing: the door executes AND hands back
//                                        an empty answer, so git.diff says "0 files" about a
//                                        dirty tree. (`git show` does NOT consult it: measured
//                                        on both an added and a modified path.)
//   [core] fsmonitor = <command>         `git status` runs it while scanning the tree
//   [core] excludesFile=<file of *>      untracked files vanish from the answer
//   [status] showUntrackedFiles = no     the same blind, one level up
//   .gitattributes `*.dat diff=drv` +
//   [diff "drv"] textconv = <command>    EVERY door that diffs runs the command — including
//                                        `git show`, on a path HEAD actually changed. Both
//                                        sides convert to the same text, so git reports
//                                        NO CHANGE about a real one.
//
// Two layers close it, because they cover two different sources: pinned env (the machine's
// own config, plus four repo values forced through git's counted override) and pinned argv
// (`--no-ext-diff --no-textconv`, the only thing that reaches repo DATA, which §9 puts
// off-limits: we will not rewrite a human's repository to make our read safe).
// Run after `npm run build`:  node docs/evidence/agents/config-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec } = rt;
const {
  GIT_DIFF_FLAGS, GIT_ENV_NAMES, NODE_SPAWN, createExecHost, gitEnv, gitReadOnlyPolicy, gitShowPolicy, gitStagedPolicy,
  parseGitDiff, registerGitTools, registerGitShowTool, registerGitStagedTool, forcedConfigEnv, GIT_FORCED_CONFIG, GIT_ISOLATION_ENV, GIT_ABSENT_CONFIG,
} = eh;

const FLAGS = ['--no-ext-diff', '--no-textconv'];
assert.deepEqual(GIT_DIFF_FLAGS, FLAGS, 'the two flags that keep a READ from EXECUTING');
const BS = String.fromCharCode(92);
const posix = (s) => s.split(BS).join('/');

// 1) PURE DATA: the shapes we ship, and the shapes we used to ship.
const readOnly = gitReadOnlyPolicy('X:/repo');
const staged = gitStagedPolicy('X:/repo');
const show = gitShowPolicy('X:/repo');
for (const [argv, policy] of [
  [['git', 'status', '--short'], readOnly],
  [['git', 'diff', ...FLAGS], readOnly],
  [['git', 'diff', ...FLAGS, '--stat'], readOnly],
  [['git', 'diff', ...FLAGS, '--cached'], staged],
  [['git', 'diff', ...FLAGS, '--cached', '--stat'], staged],
  [['git', 'show', ...FLAGS, '--format=', '--', 'a.md'], show],
]) {
  assert.equal(planExec({ argv }, policy).ok, true, `${argv.join(' ')} is a shape we ship`);
}
for (const [argv, policy, why] of [
  [['git', 'diff'], readOnly, 'v32–v45 shipped this: no --no-ext-diff, so repo config could point git at a helper'],
  [['git', 'diff', '--stat'], readOnly, 'same, in stat mode'],
  [['git', 'diff', '--cached'], staged, 'v43 shipped this'],
  [['git', 'diff', '--cached', '--stat'], staged, 'v43 shipped this'],
  [['git', 'show', '--format=', '--', 'a.md'], show, 'v42 shipped this'],
  [['git', 'diff', ...FLAGS, '--ext-diff'], readOnly, 'an escalation flag cancels the pin'],
  [['git', 'diff', ...FLAGS, '--textconv'], readOnly, 'same, through gitattributes filters'],
  [['git', 'diff', ...FLAGS, '--output=X:/repo/pwn.txt'], readOnly, 'a "read" that WRITES'],
  [['git', 'diff', ...FLAGS, '--', 'a.md'], readOnly, 'a path is a different question'],
  [['git', 'show', ...FLAGS, '--format=', '--', 'a.md', 'b.md'], show, 'two paths = a wider question'],
  [['git', '-c', 'diff.external=evil', 'diff'], readOnly, 'config is never settable from our argv, only forceable from env'],
  [['git', 'status', '--short', '--ignored'], readOnly, 'not on the menu'],
]) {
  const d = planExec({ argv }, policy);
  assert.equal(d.ok, false, `${argv.join(' ')} must be default-denied — ${why}`);
  assert.match(d.reason, /default-deny/);
}
console.log(`[config-proof] policy data: 6 shipped shapes, 12 refused (${['the four pre-v46 shapes', '3 escalation flags', '2 widenings', 'a -c injection', 'an off-menu flag'].join(', ')})`);

// 1b) THE ENV IS ALLOWLISTED OR IT DOES NOT EXIST: a pinned name the policy forgets is a
//     door that silently un-pins itself at runtime.
const emitted = gitEnv({ PATH: '/bin', SYSTEMROOT: 'C:/w', HOME: '/h', USERPROFILE: 'P' });
assert.deepEqual(GIT_ISOLATION_ENV.GIT_CONFIG_GLOBAL, GIT_ABSENT_CONFIG, 'config discovery is aimed at a file that must not exist');
assert.equal(emitted.GIT_CONFIG_COUNT, String(Object.keys(GIT_FORCED_CONFIG).length), 'the forced table is counted, and the count IS its length');
assert.deepEqual(Object.keys(forcedConfigEnv()).filter((k) => k.startsWith('GIT_CONFIG_KEY_')).map((k) => forcedConfigEnv()[k]), Object.keys(GIT_FORCED_CONFIG).sort(), 'slots numbered from zero in sorted order');
assert.ok(!Object.keys(forcedConfigEnv()).some((k) => k.endsWith('_4')), 'COUNT and slots agree: no orphan slot');
assert.ok(!Object.keys(GIT_FORCED_CONFIG).includes('diff.external'), 'diff.external is confined by the SHAPE, not the env (measured: no value of it is inert)');
for (const [argv, policy] of [[['git', 'status', '--short'], readOnly], [['git', 'diff', ...FLAGS, '--cached'], staged], [['git', 'show', ...FLAGS, '--format=', '--', 'a.md'], show]]) {
  const planned = planExec({ argv, env: { ...emitted, GITHUB_TOKEN: 'leak' } }, policy);
  assert.ok(planned.ok);
  assert.deepEqual(planned.plan.droppedEnv, ['GITHUB_TOKEN'], `${argv.join(' ')}: the secret is dropped and NOTHING we pin is`);
  assert.deepEqual(planned.plan.env, emitted, `${argv.join(' ')}: every pinned name survives the scrubber, byte-identical`);
}
console.log(`[config-proof] env data: ${GIT_ENV_NAMES.length} names on every git door's allowlist, ${Object.keys(GIT_FORCED_CONFIG).length} of them forced config, 3 doors cross-checked`);

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-config-'));
const jail = posix(dir);
const tripwire = join(dir, 'pwned');
const posixTrip = posix(tripwire);
const cleanTrip = () => rmSync(tripwire, { force: true });
const tripRan = () => {
  const ran = existsSync(tripwire);
  const line = ran ? readFileSync(tripwire, 'utf8').trim().split('\n')[0] ?? '' : '';
  if (ran) cleanTrip();
  return { ran, line };
};
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Config Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // neutralized INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false'); // the bytes we stage are the bytes git records
  writeFileSync(join(dir, 'a.txt'), 'l1\nl2\nl3\n');
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'chore: human seed commit');
  writeFileSync(join(dir, 'evil.sh'), '#!/bin/sh\necho "git ran the configured helper" >> ' + posixTrip + '\n');
  writeFileSync(join(dir, 'ignore-all'), '*\n');

  // A tree with BOTH a staged and an unstaged change, plus an untracked file to hide.
  writeFileSync(join(dir, 'b.txt'), 'untracked evidence of a working tree\n');
  writeFileSync(join(dir, 'a.txt'), 'l1\nl2 touched by the human\nl3\n');
  git('add', 'a.txt');
  writeFileSync(join(dir, 'a.txt'), 'l1\nl2 touched by the human\nl3\nl4 not staged\n');
  const cleanDiff = git('diff'); // no hostile config exists yet: git's own builtin answer
  const cleanCached = git('diff', '--cached');
  const cleanStat = git('diff', '--stat');
  assert.ok(cleanDiff.includes('@@') && cleanCached.includes('@@'), 'the control: git does have diffs to show');

  // 2) HOSTILE `.git/config` — four settings invisible to any argv shape.
  git('config', '--local', 'diff.external', posix(join(dir, 'evil.sh')));
  git('config', '--local', 'core.fsmonitor', posix(join(dir, 'evil.sh')));
  git('config', '--local', 'core.excludesFile', posix(join(dir, 'ignore-all')));
  git('config', '--local', 'status.showUntrackedFiles', 'no');

  // 2a) THE CONTROL THAT SHOWS THE HOLE WAS REAL: v43's exact shapes and v43's exact env.
  const legacyPolicy = {
    root: jail,
    allow: [
      { argv: ['git', 'status', '--short'], timeoutMs: 20_000, maxOutputBytes: 65_536 },
      { argv: ['git', 'diff'], timeoutMs: 20_000, maxOutputBytes: 65_536 },
      { argv: ['git', 'diff', '--cached'], timeoutMs: 20_000, maxOutputBytes: 65_536 },
    ],
    envAllow: ['PATH', 'SYSTEMROOT', 'HOME', 'USERPROFILE'],
    maxTimeoutMs: 20_000,
    maxOutputBytes: 65_536,
  };
  const bareEnv = { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, HOME: process.env.HOME || process.env.USERPROFILE };
  const legacy = createExecHost(legacyPolicy, { spawnLike: (c, a, o) => NODE_SPAWN(c, a, o) });
  const legacyDiff = await legacy.run({ argv: ['git', 'diff'], env: bareEnv }, { preApproved: true });
  assert.equal(legacyDiff.ran, true, 'git accepted the shape v43 shipped');
  assert.equal(legacyDiff.exitCode, 0, 'and exited 0 — a policy-shaped door, a clean exit code');
  assert.equal(legacyDiff.stdout, '', 'THE DOOR WENT BLIND: the configured helper produced the answer, git handed back NOTHING');
  assert.deepEqual(parseGitDiff(legacyDiff.stdout).totals, { files: 0, hunks: 0, additions: 0, deletions: 0 }, 'so git.diff reports "0 files" about a tree with changes in it');
  assert.deepEqual(tripRan(), { ran: true, line: 'git ran the configured helper' }, "the repo's own config made git EXECUTE a program");
  const legacyStatus = await legacy.run({ argv: ['git', 'status', '--short'], env: bareEnv }, { preApproved: true });
  assert.ok(tripRan().ran, 'a second program, this time from git.status (core.fsmonitor)');
  assert.ok(!legacyStatus.stdout.includes('b.txt'), 'and the untracked evidence vanished from the answer with no error anywhere');
  console.log('[config-proof] CONTROL  .git/config hostile → v43 shapes: exit 0, git.diff EMPTY, 2 programs executed, untracked file hidden');

  // 2b) THE SHIPPED DOORS: same repository, same hostile config, one counting wrapper.
  const spawns = [];
  const counting = (command, args, opts) => {
    spawns.push(args.join(' '));
    return NODE_SPAWN(command, args, opts);
  };
  let registry = new ToolRegistry();
  registry = registerGitTools(registry, createExecHost(gitReadOnlyPolicy(jail, { timeoutMs: 20_000 }), { spawnLike: counting }), { env: gitEnv() });
  registry = registerGitStagedTool(registry, createExecHost(gitStagedPolicy(jail, { timeoutMs: 20_000 }), { spawnLike: counting }), { env: gitEnv() });
  registry = registerGitShowTool(registry, createExecHost(gitShowPolicy(jail, { timeoutMs: 20_000 }), { spawnLike: counting }), { env: gitEnv() });
  const human = { checkpoint: () => true };
  const before = spawns.length;

  const status = await registry.invoke({ callId: 'k1', tool: 'git.status', args: {} }, human);
  assert.equal(status.ok, true, status.error);
  assert.ok(status.output.files.some((f) => f.path === 'b.txt' && f.status === 'untracked'), 'the untracked file is back: showUntrackedFiles=all and excludesFile= are FORCED past the repo config');
  assert.equal(tripRan().ran, false, 'and git.status ran no fsmonitor program to do it');

  const diff = await registry.invoke({ callId: 'k2', tool: 'git.diff', args: {} }, human);
  assert.equal(diff.ok, true, diff.error);
  assert.deepEqual(diff.output.files, parseGitDiff(cleanDiff).files, 'the same change git showed its own way, byte for byte through the parser');
  assert.deepEqual(diff.output.totals, { files: 1, hunks: 1, additions: 1, deletions: 0 }, 'the change is REPORTED, not silently 0');
  assert.equal(tripRan().ran, false, 'no helper ran to produce it');
  const cached = await registry.invoke({ callId: 'k3', tool: 'git.staged', args: {} }, human);
  assert.equal(cached.ok, true, cached.error);
  assert.equal(cached.output.text, cleanCached, 'the index window is BYTE-IDENTICAL to git\'s builtin answer — the flag pin costs nothing when nothing is hostile');
  assert.deepEqual([cached.output.files[0].path, cached.output.files[0].change, cached.output.files[0].addedLines], ['a.txt', 'modified', ['l2 touched by the human']], 'kinds and content lines come from git\'s own metadata, not from a helper');
  const shown = await registry.invoke({ callId: 'k4', tool: 'git.show', args: { path: 'a.txt' } }, human);
  assert.deepEqual(shown.output.addedLines, ['l1', 'l2', 'l3'], "v42's content door still reads HEAD's own added lines in a hostile repo");
  const statText = await registry.invoke({ callId: 'k5', tool: 'git.diff', args: { stat: true } }, human);
  assert.equal(statText.output.text, cleanStat, 'stat mode agrees with git to the byte');

  assert.equal(spawns.length - before, 5, 'five reads, five processes, none of them a third-party helper');
  assert.ok(spawns.every((s) => s.includes(FLAGS[0]) || s.startsWith('status --short')), `every process was a pinned shape: ${JSON.stringify(spawns)}`);
  assert.equal(tripRan().ran, false, 'NOT ONE program beyond git itself');
  console.log(`[config-proof] SHIPPED  same hostile .git/config → ${spawns.length - before} pinned processes, 0 programs, diffs byte-equal to git's builtin answer`);

  // 3) HOSTILE REPO DATA — a `.gitattributes` naming a diff driver whose textconv is a
  //    command. No env pin reaches it: `core.attributesFile` is the GLOBAL attributes file,
  //    and this one is committed in the tree. Measured: it is the ONLY vector that reaches
  //    `git show`, which ignores [diff] external.
  git('config', '--local', '--unset', 'diff.external'); // so any program from here on is textconv's doing
  git('config', '--local', 'diff.mdriver.textconv', 'sh evil.sh');
  // `-f` because the repo's OWN excludesFile (armed in §2) still ignores every new path —
  // an unpinned git really is that blind; the shipped doors undo it with forced config.
  writeFileSync(join(dir, '.gitattributes'), '*.dat diff=mdriver\n');
  writeFileSync(join(dir, 'blob.dat'), Buffer.from('AA\0BB\0CC\n'));
  git('add', '-f', '.gitattributes', 'blob.dat');
  git('commit', '-q', '-m', 'chore: human commits a binary path with a textconv driver');
  assert.equal(git('check-attr', 'diff', '--', 'blob.dat').trim(), 'blob.dat: diff: mdriver', 'the attribute really is live');
  writeFileSync(join(dir, 'blob.dat'), Buffer.from('AA\0BB\0CC\0DD-real-change\n'));
  git('add', 'blob.dat');
  git('commit', '-q', '-m', 'feat: human modifies blob.dat'); // HEAD now MODIFIES the binary path

  // 3a) v42's shape, the SHIPPED env, the hostile attribute: which layer is doing the work?
  //     Cleared immediately before the run: the human commits above ran with an ambient env
  //     and an armed fsmonitor, so a leftover tripwire would credit the wrong command.
  const unpinned = createExecHost({ ...gitShowPolicy(jail, { timeoutMs: 20_000 }), allow: [{ argv: ['git', 'show', '--format=', '--', '*'], timeoutMs: 20_000, maxOutputBytes: 65_536 }] }, { spawnLike: counting });
  cleanTrip();
  const legacyShow = await unpinned.run({ argv: ['git', 'show', '--format=', '--', 'blob.dat'], env: gitEnv() }, { preApproved: true });
  assert.equal(legacyShow.ran, true, `the v42 shape must still be runnable in isolation: ${legacyShow.reason}`);
  assert.equal(legacyShow.exitCode, 0, 'exit 0, as always');
  assert.equal(legacyShow.stdout, '', 'and NOTHING to say about a commit that changed the file');
  assert.ok(tripRan().ran, 'THE ENV LAYER ALONE COULD NOT STOP IT: git ran the attribute\'s textconv command anyway');
  console.log('[config-proof] LAYERS   shipped env + v42 shape → textconv STILL executed, answer EMPTY ⇒ repo DATA needs the SHAPE, not the env');

  // 3b) The door as shipped: same repository, same attribute, pinned argv.
  const pinnedShow = await registry.invoke({ callId: 'k8', tool: 'git.show', args: { path: 'blob.dat' } }, human);
  assert.equal(pinnedShow.ok, true, pinnedShow.error);
  assert.equal(tripRan().ran, false, 'the flag pin is what silenced the command');
  assert.equal(pinnedShow.output.binary, true, 'git says BINARY, so the tool says BINARY (§60)');
  assert.deepEqual(pinnedShow.output.addedLines, [], 'and claims no lines it did not read');
  assert.match(pinnedShow.output.detail, /BINARY change/, "the honest sentence, not the empty-diff lie the unpinned shape told");
  assert.equal(spawns[spawns.length - 1], 'show --no-ext-diff --no-textconv --format= -- blob.dat', 'one pinned argv, path last, nothing else');
  console.log('[config-proof] SHIPPED  same .gitattributes → 0 programs, and the change read back as a binary change with no lines claimed');

  // 4) THE ENV PINS ARE THE OTHER LAYER: a hostile GLOBAL config reached through the
  //    allowlisted HOME (git needs a home to run, so HOME is passed through by design).
  //    Measured on git 2.52 for Windows: HOME selects `$HOME/.gitconfig`; USERPROFILE alone does not.
  const homeDir = join(dir, 'home');
  mkdirSync(homeDir);
  writeFileSync(join(homeDir, '.gitconfig'), '[status]\n\tshowUntrackedFiles = no\n[core]\n\texcludesFile = ' + posix(join(dir, 'ignore-all')) + '\n');
  const viaHome = { ...bareEnv, HOME: posix(homeDir), USERPROFILE: posix(homeDir) };
  const blindHost = createExecHost(gitReadOnlyPolicy(jail, { timeoutMs: 20_000 }), { spawnLike: counting });
  cleanTrip();
  const blindRun = await blindHost.run({ argv: ['git', 'status', '--short'], env: viaHome }, { preApproved: true });
  assert.ok(!blindRun.stdout.includes('b.txt'), 'a ~/.gitconfig this process never chose to read hid the untracked file');
  assert.equal(tripRan().ran, true, 'and the same unpinned run paid for it: the repo fsmonitor command executed');
  const isolatedRun = await blindHost.run({ argv: ['git', 'status', '--short'], env: gitEnv(viaHome) }, { preApproved: true });
  assert.ok(isolatedRun.stdout.includes('b.txt'), 'gitEnv() aimed config discovery at a file that does not exist, so the same HOME is inert');
  assert.equal(tripRan().ran, false, 'and forced core.fsmonitor= kept the pinned run program-free');
  assert.equal(existsSync(GIT_ABSENT_CONFIG), false, 'and pinning it created NOTHING — a read that writes a config file would be its own bug');
  console.log('[config-proof] ENV      same argv, same hostile HOME → pinning the config SOURCE is what hid/returned the file');

  // 5) §9: the reads left the repository alone.
  const idx = statSync(join(dir, '.git', 'index'));
  const aBytes = readFileSync(join(dir, 'a.txt'), 'utf8');
  await registry.invoke({ callId: 'k9', tool: 'git.status', args: {} }, human);
  await registry.invoke({ callId: 'k10', tool: 'git.diff', args: { stat: true } }, human);
  await registry.invoke({ callId: 'k11', tool: 'git.staged', args: { stat: true } }, human);
  const after = statSync(join(dir, '.git', 'index'));
  assert.equal(after.mtimeMs, idx.mtimeMs, 'GIT_OPTIONAL_LOCKS=0: three more reads, and git did not refresh (write) the index underneath us');
  assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), aBytes, '§9: a read read');
  assert.equal(git('rev-list', '--count', 'HEAD').trim(), '3', 'the human commits are exactly three: reads never write history');
  assert.equal(tripRan().ran, false, 'and the three closing reads ran no program beyond git itself');
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — all of this lived in os.tmpdir');
console.log('[config-proof] ALL ASSERTIONS PASSED (a policy that only shapes argv governs what git may SAY; this one governs what it may DO)');
