// NEXUS M2 v57 (exec-host) — ONE CONFLICTED REPOSITORY, ONE WAY TO DESCRIBE IT
// (ADR 0016 amendment 57).
// v52 taught the DIFF-family doors to name an unmerged path instead of reporting zero changes. The
// status door was left out, and its table had a subtler hole: it matched a substring per row, so
// `UU`/`AU`/`UA`/`DU`/`UD` came out unmerged but `AA` fell through to the `A` row and `DD` to the
// `D` row. Measured on a real add/add merge: git prints `AA new.md`, and the door reported
// `1 added` — about a repository in which `git commit` is REFUSED outright. Two doors, one repo, two
// contradictory stories, and the more optimistic one was the door an agent reads first.
// This proof does not accept the door's new sentence on trust. It asserts the thing the sentence
// CLAIMS: that a granted commit would be refused — by asking git, through the SHIPPED commit door,
// in the SAME state, in every conflict shape the box can produce.
// §9 holds: throwaway repos under os.tmpdir, hooks/signing neutralized LOCALLY there, staging and
// merging performed by the harness as the human, and this repo's HEAD compared byte-wise at the end.
// Run after `npm run build`:  node docs/evidence/agents/conflict-proof.mjs
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
  NODE_SPAWN,
  UNMERGED_XY,
  createExecHost,
  gitCommitPolicy,
  gitEnv,
  gitReadOnlyPolicy,
  gitStagedPolicy,
  parseGitStatus,
  registerGitCommitTool,
  registerGitStagedTool,
  registerGitTools,
} = eh;

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workRoot = mkTmp('nexus-v57-proof');
const ENV = gitEnv(process.env);

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(`${base}${n}`)) n += 1;
  mkdirSync(`${base}${n}`, { recursive: true });
  return `${base}${n}`;
}
const raw = (dir, ...argv) => {
  try {
    return { code: 0, stdout: execFileSync('git', argv, { cwd: dir, encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }) ?? '', stderr: '' };
  } catch (e) {
    return { code: e.status ?? null, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
};
const commit = (dir, message) => {
  const registry = registerGitCommitTool(new ToolRegistry(), createExecHost(gitCommitPolicy(dir), { spawnLike: NODE_SPAWN }), { env: {} });
  return registry.invoke({ callId: 'v57:commit', tool: 'git.commit', args: { message } }, { checkpoint: () => true });
};
const statusDoor = (dir) => {
  const registry = registerGitTools(new ToolRegistry(), createExecHost(gitReadOnlyPolicy(dir), { spawnLike: NODE_SPAWN }), { env: {} });
  return registry.invoke({ callId: 'v57:status', tool: 'git.status', args: {} }, { checkpoint: () => true });
};
const stagedDoor = (dir) => {
  const registry = registerGitStagedTool(new ToolRegistry(), createExecHost(gitStagedPolicy(dir), { spawnLike: NODE_SPAWN }), { env: {} });
  return registry.invoke({ callId: 'v57:staged', tool: 'git.staged', args: {} }, { checkpoint: () => true });
};

/** A repo on `master` with a `side` branch, both having diverged from a shared base. */
function diverged(name, baseFiles, onSide, onMain) {
  const dir = `${workRoot}/${name}`;
  mkdirSync(dir, { recursive: true });
  raw(dir, 'init', '-q', '-b', 'master');
  raw(dir, 'config', 'user.email', 'v57@nexus.test');
  raw(dir, 'config', 'user.name', 'V57 Proof');
  raw(dir, 'config', 'commit.gpgsign', 'false');
  raw(dir, 'config', 'core.hooksPath', `${workRoot}/no-hooks-there-are-none`);
  for (const [f, body] of Object.entries(baseFiles)) writeFileSync(`${dir}/${f}`, body);
  raw(dir, 'add', '.');
  raw(dir, 'commit', '-q', '-m', 'base');
  raw(dir, 'checkout', '-q', '-b', 'side');
  onSide(dir);
  raw(dir, 'add', '-A', '.');
  raw(dir, 'commit', '-q', '-m', 'side');
  raw(dir, 'checkout', '-q', 'master');
  onMain(dir);
  raw(dir, 'add', '-A', '.');
  raw(dir, 'commit', '-q', '-m', 'main');
  raw(dir, 'merge', '--no-commit', '--no-ff', 'side'); // the human creating a conflict is the point
  return dir;
}

const SHAPES = {
  'both modified': [diverged('both-modified', { 'f.md': 'base\n' }, (d) => writeFileSync(`${d}/f.md`, 'side\n'), (d) => writeFileSync(`${d}/f.md`, 'main\n')), 'UU', 'f.md'],
  'both added': [diverged('both-added', { 'seed.md': 'seed\n' }, (d) => writeFileSync(`${d}/new.md`, 'side content\n'), (d) => writeFileSync(`${d}/new.md`, 'main content\n')), 'AA', 'new.md'],
  'deleted by us, modified by them': [diverged('delete-modify', { 'f.md': 'base\n' }, (d) => writeFileSync(`${d}/f.md`, 'side edited\n'), (d) => rmSync(`${d}/f.md`)), 'DU', 'f.md'],
};

try {
  // ---------- §1 the set is git's, not an invention ----------
  assert.deepEqual([...UNMERGED_XY].sort(), ['AA', 'AU', 'DD', 'DU', 'UA', 'UD', 'UU'], 'the seven codes git porcelain calls unmerged');
  assert.equal(parseGitStatus('AA x\n').files[0].status, 'unmerged', 'the pair that used to fall through to `added`');
  assert.equal(parseGitStatus('DD y\n').files[0].status, 'unmerged', 'and the pair that used to fall through to `deleted`');
  assert.equal(parseGitStatus('A  z\n').files[0].status, 'added', 'a genuine staged-add still reads as added (the set is narrow on purpose)');
  assert.equal(parseGitStatus('!! w\n').files[0].status, 'other', 'and an unknown code is STILL `other` — v32 honesty about junk is untouched');
  console.log(`[conflict-proof] §1 UNMERGED_XY = ${[...UNMERGED_XY].join(',')} · A / !! still added / other`);

  // ---------- §2 every shape the box can build, through the door and against a real commit ----------
  const rows = [];
  for (const [label, [dir, expectXy, expectPath]] of Object.entries(SHAPES)) {
    const control = raw(dir, 'status', '--short');
    assert.equal(control.code, 0, `${label}: git answers status with exit 0 — the conflict is CONTENT, not an error`);
    assert.ok(control.stdout.startsWith(`${expectXy} `), `control: git really prints ${expectXy} for ${label} (${JSON.stringify(control.stdout.split('\n')[0])})`);

    const out = (await statusDoor(dir)).output;
    assert.equal(out.ok, true, `${label}: the read succeeded`);
    assert.equal(out.exitCode, 0);
    const conflicted = out.files.filter((f) => f.status === 'unmerged');
    assert.deepEqual(conflicted.map((f) => f.xy), [expectXy], `${label}: the door classifies the pair as unmerged`);
    assert.equal(conflicted[0].path, expectPath, `${label}: and keeps git's path`);
    assert.ok(out.detail.includes(`git reported 1 UNMERGED path(s) (${expectPath})`), `${label}: the sentence names it`);
    assert.ok(out.detail.includes('a granted git.commit right now would be refused by git itself'), `${label}: and states the consequence`);
    assert.ok(!/(^|\D)1 added/.test(out.detail) || expectXy !== 'AA', 'the AA case no longer reads as a plain add');

    // the claim, tested rather than asserted: ask git for the commit the sentence says will fail
    const attempt = await commit(dir, 'v57: try to commit a conflicted tree');
    assert.equal(attempt.ok, true, 'the CALL succeeded — git answered, so the refusal is data');
    const refused = attempt.output;
    assert.equal(refused.ok, false, `${label}: git really does refuse the commit the door warned about`);
    assert.notEqual(refused.exitCode, 0, `${label}: nonzero exit (${refused.exitCode}) in every conflict shape`);
    assert.match(refused.detail, /unmerged|unresolved|error:/i, `${label}: and the door's failure sentence quotes git's own reason`);
    rows.push(`${expectXy}:${refused.exitCode}`);
  }
  console.log(`[conflict-proof] §2 ${Object.keys(SHAPES).length} real conflict shapes (${rows.join(' ')}) — every door warning was checked against a commit git refused`);

  // ---------- §3 the two doors now tell ONE story about one repository ----------
  const aa = SHAPES['both added'][0];
  const statusSide = (await statusDoor(aa)).output;
  const stagedSide = (await stagedDoor(aa)).output;
  assert.ok(statusSide.detail.includes('UNMERGED path(s) (new.md)'), 'status names it (v57)');
  assert.ok(stagedSide.detail.includes('UNMERGED path(s)'), 'and so does the staged read (v52)');
  assert.equal(stagedSide.files.length, 0, 'the staged parser still finds no per-file diff, which is EXACTLY why a bare zero used to be read as an empty index');
  assert.ok(!stagedSide.detail.includes('the index is EMPTY'), 'and it still refuses that inference');
  const statusCounts = statusSide.counts;
  assert.deepEqual(statusCounts, { unmerged: 1 }, `the census calls it one unmerged entry, not one added (${JSON.stringify(statusCounts)})`);
  console.log(`[conflict-proof] §3 one add/add repo, two doors, one word: status "${/exit 0: ([^·]+)/.exec(statusSide.detail)?.[1].trim()}" · staged "${/exit 0: ([^(]+)/.exec(stagedSide.detail)?.[1].trim()}"`);

  // ---------- §4 the clause cannot leak into an ordinary answer ----------
  const calm = `${workRoot}/calm`;
  mkdirSync(calm, { recursive: true });
  raw(calm, 'init', '-q', '-b', 'master');
  raw(calm, 'config', 'user.email', 'v57@nexus.test');
  raw(calm, 'config', 'user.name', 'V57 Proof');
  raw(calm, 'config', 'core.hooksPath', `${workRoot}/no-hooks-there-are-none`);
  writeFileSync(`${calm}/a.md`, 'one\n');
  raw(calm, 'add', '.');
  raw(calm, 'commit', '-q', '-m', 'base');
  writeFileSync(`${calm}/a.md`, 'two\n');
  raw(calm, 'add', 'a.md'); // the human stages it: §2's refusals were about the conflict, not about an empty index
  const cleanOut = (await statusDoor(calm)).output;
  assert.equal(cleanOut.counts.unmerged, undefined, 'a modified file is not a conflict');
  assert.ok(!cleanOut.detail.includes('UNMERGED'), `and the sentence carries no conflict clause (${cleanOut.detail})`);
  const okCommit = await commit(calm, 'v57: a normal commit, in a normal tree');
  assert.equal(okCommit.output.ok, true, 'the same commit door SUCCEEDS here — so §2 was about the conflict, not about the door');
  assert.match(okCommit.output.detail, /exit 0: master@/);
  console.log(`[conflict-proof] §4 clean tree: status "${cleanOut.detail}" · and the commit that §2 proved refused now lands (${okCommit.output.record.hash})`);

  // ---------- §5 the file the door reads is the file git wrote ----------
  const written = readFileSync(`${SHAPES['both modified'][0]}/.git/MERGE_HEAD`, 'utf8').trim();
  assert.match(written, /^[0-9a-f]{40}$/, 'the repo is genuinely mid-merge (MERGE_HEAD holds a real sha-1)');
  assert.equal(raw(SHAPES['both modified'][0], 'rev-parse', 'MERGE_HEAD').stdout.trim(), written, 'and git agrees with the file the way the door agrees with git');
  console.log(`[conflict-proof] §5 MERGE_HEAD ${written.slice(0, 7)} — the conflict is a fact on disk, not a parse artefact`);
} finally {
  rmSync(workRoot, { recursive: true, force: true });
  assert.ok(!existsSync(workRoot), 'every throwaway repo is gone');
}

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every commit here lived in os.tmpdir');
console.log('[conflict-proof] ALL ASSERTIONS PASSED (one conflicted repo, one story, and the warning is tested against the refusal it promises)');
