// M2 v93 — the population's DEPENDENCE ON THE REPOSITORY becomes a row.
//
// Amendment 92 discovered, from a finished run, that 43 of 43 reds on the clean-checkout plane shared one
// cause: no `.git` there. v93 asks the same question of the ref's BYTES before any row runs (`gitReaches` in
// sweep.mjs), which turns the post-hoc sentence into a prediction the verdicts can be reconciled against.
// This proof is that prediction's witness: it grades the scanner's grammar on cases written to break it,
// censuses the population with two grammars and holds them to a stated relation, checks that the callee list
// is still the host's real spawn entries rather than folklore, and MOVES the census on purpose to prove the
// checker is capable of red. Amendment 89's rule runs through all of it: a quotation can wear a call's shape,
// so a word is not a reach.
//
// Like amendment 92's own row, it runs on two planes and says which one is grading it.
import { execFileSync } from '../lib/syncproc.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sw from './sweep.mjs';

const HERE = join(fileURLToPath(new URL('.', import.meta.url)));
const DIR = 'docs/evidence/agents';
const git = (...args) => execFileSync('git', args, { cwd: HERE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// ---------------------------------------------------------------- §0 which plane is grading this
const gitPlane = (() => {
  try {
    return git('rev-parse', '--show-toplevel').trim() ? 'GIT' : 'NO-GIT';
  } catch {
    return 'NO-GIT';
  }
})();
const norm = (s) => String(s).replace(/\r\n/g, '\n');

// The population, named by whichever authority this plane has: the commit's own tree listing, or the
// directory that IS the ref's materialisation. Both are asked the SAME question — every tracked `.mjs` here.
// A git PATHSPEC is read relative to the cwd, and this file's cwd is the directory being listed, so `.` is
// the spec that means what a reader would assume `docs/evidence/agents` means. Written as that longer path
// the listing came back EMPTY and every count below would have been a clean-looking zero. Once the spec
// pointed somewhere, `ls-tree` answered with names relative to the cwd — which `git show HEAD:<name>` then
// refused ("exists, but not 'agent-proof.mjs'") — so the names are put back into repo space here. And
// `--full-tree` is NOT the fix: measured, it honours the pathspec from the root instead and returned 80
// files from eight directories, which the assertion below caught by naming them.
const listing = () =>
  gitPlane === 'GIT'
    ? git('ls-tree', '-r', '--name-only', 'HEAD', '--', '.')
      .split('\n')
      .filter((n) => n.endsWith('.mjs'))
      .map((short) => ({ path: `${DIR}/${short}`, text: norm(git('show', `HEAD:${DIR}/${short}`)) }))
    : readdirSync(HERE).filter((n) => n.endsWith('.mjs')).map((n) => ({ path: `${DIR}/${n}`, text: norm(readFileSync(join(HERE, n), 'utf8')) }));

const population = listing();
console.log(`[§0] plane ${gitPlane} · population graded from ${gitPlane === 'GIT' ? "HEAD's tree (git ls-tree + git show, so a half-edited proof cannot be censused as if it were committed)" : 'the materialised ref tree (no .git answers here, and every file in it IS the commit\'s byte)'}: ${population.length} tracked .mjs, of which ${population.filter((p) => p.path.endsWith('-proof.mjs')).length} are scored rows`);
assert.ok(population.length >= 70, `the census needs the whole directory, not ${population.length} files`);
assert.ok(population.every((p) => p.path.startsWith(`${DIR}/`)), `the listing names files OUTSIDE ${DIR} (${population.filter((p) => !p.path.startsWith(`${DIR}/`)).map((p) => p.path).join(', ')}) — the pathspec is not pointing where this row thinks it is`);
if (gitPlane === 'GIT') {
  // The census reads every graded byte out of HEAD, so a half-edited PROOF cannot be censused as if it were
  // committed. What the whole-directory `git diff` would have protected is narrower than it looked, and it
  // would have made this row uneditable: the one imported thing that decides every number below is the
  // scanner's own file, so THAT is the byte this row demands be the committed one.
  const scannerHead = norm(git('show', `HEAD:${DIR}/sweep.mjs`));
  const scannerDisk = norm(readFileSync(join(HERE, 'sweep.mjs'), 'utf8'));
  assert.equal(scannerDisk, scannerHead, `${DIR}/sweep.mjs differs from HEAD — this census would be graded by a grammar no commit owns`);
  console.log(`[§0] the grammar used below is the committed one: ${DIR}/sweep.mjs matches HEAD byte-for-byte (${Buffer.byteLength(scannerHead)} B) · every graded file was read out of HEAD, not off disk`);
} else {
  console.log('[§0] no git to compare against on this plane — and the materialisation laid sweep.mjs down from the ref, so the grammar is the commit\'s by construction here, not by check');
}

// ---------------------------------------------------------------- §1 the grammar, on cases meant to break it
const cases = [
  ["// git show HEAD:f — a comment\nexecFileSync('node', []);\n", 0, 'a comment is not a reach'],
  ["/* spawnSync('git', ['status']) */\nconst q = 1;\n", 0, 'a block comment is not a reach'],
  ["console.log('git rev-parse HEAD');\n", 0, 'a printed mention is not a reach'],
  ["const msg = `graded by git show, no argv here`;\n", 0, 'a template that only SAYS git is not a reach'],
  ["execFileSync('git', ['status'], { cwd });\n", 1, 'R1: the program name in a spawn call'],
  ["const r = run('git', ['rev-parse', 'HEAD'], { cwd });\n", 1, 'R1: the same through the syncproc bridge'],
  ["const g = () => execSync(`git log -3`, { cwd });\n", 1, 'R1: a template whose static head is the command'],
  ["spawnSync(process.platform === 'win32' ? 'git.exe' : 'git', args);\n", 2, 'R1: both arms of a platform conditional'],
  ["host.run({ argv: ['git', 'status', '--short'] }, ctx);\n", 1, 'R2: argv shape, where the HOST forks and the proof does not'],
  ["for (const argv of [['git', 'diff'], ['git', 'push']]) policy(argv);\n", 2, 'R2: argv arrays in a table of cases'],
  ["parseGitStatus(text); gitReadOnlyPolicy(x); gitShowPolicy(y);\n", 0, 'a parser or a policy builder NAMED git is not a child process'],
  ["import git from './lib/git.mjs';\n", 0, 'a specifier is not a program name'],
  ["const git = (...a) => execFileSync('git', a, { cwd }); git('show', 'HEAD:x');\n", 1, 'the alias definition is the reach; its call site is a callee this scanner cannot resolve'],
  ["const sh = (cmd, argv) => new Promise((res) => execFile(cmd, argv, res)); sh('git', ['rev-parse', 'HEAD']);\n", 0, 'NAMED BLIND SPOT: a program name bound to a parameter is invisible to a call-site rule'],
  ["const p = 'git'; execFileSync(p, args);\n", 0, 'NAMED BLIND SPOT: the same, without the wrapper'],
];
let exact = 0;
for (const [src, want, why] of cases) {
  const got = sw.gitReaches(src).length;
  if (got === want) exact++;
  console.log(`  ${got === want ? 'ok  ' : 'MISS'} ${why} → ${got} (want ${want})`);
}
assert.equal(exact, cases.length, `the scanner's grammar answered ${cases.length - exact} of ${cases.length} cases differently than this row predicts`);
console.log(`[§1] grammar cases exact: ${exact}/${cases.length} — including ${cases.filter(([, w]) => w === 0).length} that must NOT count`);

// ---------------------------------------------------------------- §2 the census, by two grammars
const rows = population.filter((p) => p.path.endsWith('-proof.mjs'));
const reachOf = new Map(rows.map((r) => [basename(r.path), sw.gitReaches(r.text)]));
const predicted = rows.filter((r) => reachOf.get(basename(r.path)).length > 0).map((r) => basename(r.path));
const naive = rows.filter((r) => sw.mentionsGit(r.text)).map((r) => basename(r.path));
const via = {};
for (const r of rows) for (const h of reachOf.get(basename(r.path))) via[h.via] = (via[h.via] ?? 0) + 1;
const proseOnly = naive.filter((n) => !predicted.includes(n));
console.log(`[§2] census of the ${rows.length} scored rows: ${predicted.length} reach a git child process at code position (${Object.entries(via).map(([k, v]) => `${k}=${v}`).join(' ')} call sites) · the naive "the word appears anywhere" grammar calls ${naive.length}`);
assert.ok(predicted.every((n) => naive.includes(n)), 'a code-position reach necessarily mentions the word: a predicted asker the naive rule misses is a scanner bug, not a discovery');
console.log(`[§2] the ${proseOnly.length} rows only the naive rule names (prose and comments, which cannot spawn): ${proseOnly.join(', ') || '(none)'}`);

// ---------------------------------------------------------------- §3 the callee list is the host's, not folklore
// R1 trusts a list of names. If `docs/evidence/lib/syncproc.mjs` renames an export, or a proof starts using a
// child_process entry the list never heard of, the census silently SHRINKS — the most dangerous failure a
// checker has, because every number still looks plausible. So the bridge's own exports are read and required.
const bridge = gitPlane === 'GIT'
  ? norm(git('show', 'HEAD:docs/evidence/lib/syncproc.mjs'))
  : readFileSync(join(HERE, '..', 'lib', 'syncproc.mjs'), 'utf8');
const bridgeExports = [...bridge.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)|export\s*\{([^}]+)\}/g)].flatMap((m) => (m[1] ? [m[1]] : m[2].split(',').map((s) => s.trim().split(/\s+as\s+/).pop())));
const spawnish = bridgeExports.filter((n) => /^(exec|spawn|fork|run)/.test(n));
const missing = spawnish.filter((n) => !sw.SPAWN_FAMILY.has(n));
console.log(`[§3] the bridge exports ${spawnish.length} process entries (${spawnish.join(', ')}); ${missing.length ? `MISSING from SPAWN_FAMILY: ${missing.join(', ')}` : 'all of them are in the list the scanner trusts'} · node child_process names carried: execFileSync, execFile, spawnSync, spawn, execSync, exec, fork`);
assert.deepEqual(missing, [], `the scanner would silently under-count rows that spawn through ${missing.join(', ')} — update SPAWN_FAMILY in sweep.mjs and say so here`);

// ---------------------------------------------------------------- §4 the blind spots, kept as data
// Three shapes reach git that a call-site rule cannot see. They are named rather than quietly wrong, and the
// runner's own reconciliation reports them as "red without being predicted" until the row declares itself.
const blind = {
  'parameter-bound program': rows.filter((r) => /\b(?:sh|exec|go|call|via)\(\s*['"`]git['"`]\s*,/.test(r.text)).map((r) => basename(r.path)),
  'reaches through sweep.mjs itself': rows.filter((r) => /\bsw\.(proofCorpus|closureOf|isolatedCheckout|runSweep|identityBlock|gitReaches)\(/.test(r.text) && reachOf.get(basename(r.path)).length === 0).map((r) => basename(r.path)),
};
for (const [shape, files] of Object.entries(blind)) console.log(`[§4] blind spot · ${shape}: ${files.length} (${files.join(', ') || 'none'})`);
assert.ok(blind['parameter-bound program'].length > 0, 'amendment 93 measured at least one row reaching git through a parameter-bound program name; if that is now zero, say so in the ADR rather than leaving the claim standing');

// ---------------------------------------------------------------- §5 the census must MOVE
const sample = rows.find((r) => reachOf.get(basename(r.path)).length === 0) ?? rows[0];
const base = reachOf.get(basename(sample.path)).length;
const added = sw.gitReaches(sample.text + "\nexecFileSync('git', ['rev-parse', 'HEAD']);\n").length;
assert.equal(added, base + 1, `appending a git call site to ${basename(sample.path)} must move the census by exactly one (${base} → ${added})`);
const quoted = sw.gitReaches(sample.text + "\n// a comment: git show HEAD:x\nconsole.log('git rev-parse HEAD');\n").length;
assert.equal(quoted, base, `appending only PROSE about git to ${basename(sample.path)} must NOT move the census (${base} → ${quoted}) — this row exists to catch exactly that`);
const asker = rows.find((r) => reachOf.get(basename(r.path)).length > 0);
const neutered = sw.gitReaches(asker.text.replaceAll(/(['"`])git\1/g, "'node'").replaceAll("['git',", "['node',")).length;
assert.ok(neutered < reachOf.get(basename(asker.path)).length, `renaming every git program literal in ${basename(asker.path)} must REDUCE its reaches (${reachOf.get(basename(asker.path)).length} → ${neutered})`);
console.log(`[§5] census moves: +1 call site on ${basename(sample.path)} → ${base + 1} · prose-only append → ${base} (unchanged, as required) · every program literal renamed in ${basename(asker.path)} → ${neutered} from ${reachOf.get(basename(asker.path)).length}`);

// ---------------------------------------------------------------- §6 the population number the runner will print
const notScanned = rows.filter((r) => /(?:^|\n)\s*(?:const|let)\s+\w+\s*=\s*['"`]git['"`]/.test(r.text));
console.log(`[§6] summary over ${rows.length} scored rows: ${predicted.length} predicted askers, ${proseOnly.length} prose-only mentions, ${blind['parameter-bound program'].length + blind['reaches through sweep.mjs itself'].length} named blind-spot rows, ${notScanned.length} rows binding the program name to a variable`);
