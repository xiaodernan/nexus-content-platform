// M2 v95 — a confession is worth its witness: every claim a row makes is graded, twice, by rules that can disagree.
//
// Amendment 94 opened a channel — `// sweep-asks-repository:` — and closed the list amendment 93 could not, but it
// left the channel's output at the status of a sentence: the runner could say WHO reaches git, and nothing could
// say whether what they said holds. This row spends its time on the two witnesses that exist. The first is the
// bytes the claim points at: a clause naming `sw.<helper>` is graded against that helper's body in the runner's
// own file, and a clause naming no helper against the row's bytes (amendment 93's code-position tokenizer, so a
// command inside a string or a comment cannot serve as a witness). The second is the failure the row predicted:
// when a declaring row goes red, its own cause line names a git command, and the confession either covers it or
// does not.
//
// The asymmetry between those two readings is the design. An OMITTED command is a defect — the row is the only
// reader of its own cause, so a confession that leaves out what it just printed is not finished. A SURPLUS is
// not: a row may reach five commands and fall on one of them. And a claim whose pointed-at bytes show nothing is
// not a lie caught either — it is a reach still hidden one frame up, and the finding this row reports is that the
// hiding place is the runner's own file, where a private helper literally named `git` takes an argv parameter.
import { execFileSync } from '../lib/syncproc.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sw from './sweep.mjs';

const HERE = join(fileURLToPath(new URL('.', import.meta.url)));
const DIR = 'docs/evidence/agents';
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const git = (...args) => execFileSync('git', args, { cwd: HERE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// ---------------------------------------------------------------- §0 the plane, and whose bytes the rules read
const gitPlane = (() => {
  try {
    return git('rev-parse', '--show-toplevel').trim() ? 'GIT' : 'NO-GIT';
  } catch {
    return 'NO-GIT';
  }
})();
const population = (
  gitPlane === 'GIT'
    ? git('ls-tree', '-r', '--name-only', 'HEAD', '--', '.')
      .split('\n')
      .filter((n) => n.endsWith('.mjs'))
      .map((short) => ({ path: `${DIR}/${short}`, text: norm(git('show', `HEAD:${DIR}/${short}`)) }))
    : readdirSync(HERE).filter((n) => n.endsWith('.mjs')).map((n) => ({ path: `${DIR}/${n}`, text: norm(readFileSync(join(HERE, n), 'utf8')) }))
);
const rows = population.filter((p) => p.path.endsWith('-proof.mjs'));
// The source the BYTE arm reads: a `sw.proofCorpus` clause points at the runner, so the runner's own bytes are
// evidence here and not the file this row lives in. On the GIT plane they are HEAD's; on the other plane they are
// the materialised ref tree, which is the same thing when a sweep is what copied them.
const selfName = `${DIR}/sweep.mjs`;
const selfRow = population.find((p) => p.path === selfName);
assert.ok(selfRow, `${selfName} is not in the population this row reads — the sweep cannot grade rows it cannot see`);
const selfSrc = selfRow.text;
const ownProse = rows.map((r) => r.text).join('\n');
console.log(`[§0] plane ${gitPlane} · ${population.length} tracked .mjs, ${rows.length} scored rows · the byte arm reads ${selfName} from ${gitPlane === 'GIT' ? "HEAD" : 'disk (this plane has no index to corroborate it)'}`);
assert.ok(rows.length >= 72, `both arms need the whole population, not ${rows.length} rows`);
if (gitPlane === 'GIT') {
  const scannerHead = norm(git('show', `HEAD:${DIR}/sweep.mjs`));
  const scannerDisk = norm(readFileSync(join(HERE, 'sweep.mjs'), 'utf8'));
  assert.equal(scannerDisk, scannerHead, `${DIR}/sweep.mjs differs from HEAD — every rule below would be graded by a grammar no commit owns`);
  console.log(`[§0] the grammar used below is the committed one: docs/evidence/agents/sweep.mjs matches HEAD byte-for-byte (${Buffer.byteLength(scannerHead)} B)`);
} else {
  console.log('[§0] no index answers here, so these rules grade the bytes on disk WITHOUT checking them against a commit — the sweep\'s `[identity] ref …` line is what makes those bytes a ref\'s; read this row\'s numbers without that line they are a statement about a directory');
}

// ---------------------------------------------------------------- §1 the vocabulary is git's, not mine
// `gitCommandsNamed` refuses any token that is not in `GIT_SUBCOMMANDS`, so a hand-written list decides what counts
// as a command — and a list is exactly the kind of thing this directory keeps reddening for being stale. Both
// directions are therefore anchored on `git --list-cmds=main`, which answers OUTSIDE a repository and so runs on
// either plane: nothing shipped may be a name git does not have, and nothing the population actually says may be
// a name git has that was left out. The second is the load-bearing one: it is what makes an under-declared
// confession loud here instead of silent in the sweep log.
const UNSHELVED = /\bgit(?:\.exe)?[ \t]+((?:-{1,2}\S+[ \t]+)*)?([a-z][a-z0-9-]*)/g;
let main = null;
let mainNote = '';
try {
  main = new Set(git('--list-cmds=main').split('\n').map((s) => s.trim()).filter(Boolean));
  mainNote = `${main.size} names`;
} catch (e) {
  mainNote = `git itself did not answer (${String(e.message).slice(0, 40)})`;
}
const candidates = new Set();
for (const src of [ownProse, selfSrc]) {
  let m;
  while ((m = UNSHELVED.exec(src))) candidates.add(m[2]);
}
const declaredByGit = main ? [...candidates].filter((c) => main.has(c)) : null;
const gaps = declaredByGit ? declaredByGit.filter((c) => !sw.GIT_SUBCOMMANDS.has(c)) : null;
const phantoms = [...sw.GIT_SUBCOMMANDS].filter((c) => (main ? !main.has(c) : false));
const notCommands = [...candidates].filter((c) => (main ? !main.has(c) : !sw.GIT_SUBCOMMANDS.has(c)));
console.log(`[§1] vocabulary ${sw.GIT_SUBCOMMANDS.size} names, git's own main list: ${mainNote}`);
if (main) {
  console.log(`[§1] both ways: ${phantoms.length} shipped name git does not have (${phantoms.join(', ') || 'none'}) · ${gaps.length} name the population says that git DOES have and the list lacks (${gaps.join(', ') || 'none'}) · ${candidates.size} distinct tokens follow the word git in these ${rows.length + 1} files, ${notCommands.length} of them are prose ('repository', 'call', 'child process'), which is what the gate refuses and the free-text reader would have counted`);
  assert.deepEqual(phantoms, [], `a name in GIT_SUBCOMMANDS is not a git main command: ${phantoms.join(', ')} — the list would be inventing verbs`);
  assert.deepEqual(gaps, [], `the population names git commands the vocabulary does not carry (${gaps.join(', ')}) — add them to GIT_SUBCOMMANDS in sweep.mjs and say so in the ADR, or a confession that uses them will be silently missed`);
} else {
  console.log('[§1] NOT CHECKED against git: this host has no answerable git on PATH, so both vocabulary directions are unmeasured and the line above is a statement about a hand-written list. Do not read it as a pass (amendment 86).');
  assert.ok(candidates.size > 0, 'the population named no git-shaped token at all — the extractor or the population is broken');
}

// ---------------------------------------------------------------- §2 what names a command, in free text
// The same rule reads both sides of a confession, so its grammar needs cases in both directions. The MUST-NOT-COUNT
// arms are the ones that keep a cause line from being built out of a sentence about git.
const namedCases = [
  ['Error: git ls-tree -r --name-only HEAD -- docs/evidence/agents → exit 128', ['ls-tree'], 'the shape of a real cause line: one command, flags and a pathspec after it'],
  ['git archive HEAD → exit 128: fatal: not a git repository', ['archive'], 'a cause that ALSO contains the phrase "git repository" names one command, not two'],
  ['git diff --name-only', ['diff'], 'a long option does not become the command'],
  ['git -c x status --porcelain', [], 'MEASURED LIMIT, and it is a false negative rather than a false positive: an option that TAKES A VALUE is skipped only when it is written -k=v or --k=v, so `git -c x status` reads `x` as the verb and x is no verb. Not widened — a rule that scans forward for "the first word in my list" manufactures commands out of prose (amendment 91)'],
  ['git cat-file --batch (sw.proofCorpus)', ['cat-file'], 'a declaration clause in the exact shape four rows wrote'],
  ['git.exe show HEAD:README.md', ['show'], 'the .exe spelling names the same verb'],
  ['Git show HEAD', [], 'capitalised is not this grammar'],
  ['not a git repository (or any of the parent directories)', [], 'the words after git in git\'s own error are not commands'],
  ['a git call, the git child process, a git-less tree', [], 'prose about git names nothing, which is why this grammar is not the word-mention count'],
  ['console.log("git push --force")', ['push'], 'free text CANNOT tell a quotation from a claim — this arm is deliberately blind to that, and the byte arm (§3) is the one that is not'],
  ['git rev-parse HEAD (twice) · git show HEAD:x', ['rev-parse', 'show'], 'two clauses on one line, both counted'],
  ['git  ', [], 'nothing follows git'],
];
const namedBad = [];
for (const [text, want, why] of namedCases) {
  const got = [...new Set(sw.gitCommandsNamed(text))];
  if (got.join(' ') !== want.join(' ')) namedBad.push(`${JSON.stringify(text.slice(0, 46))} → ${got.join(' ') || '(nothing)'}, want ${want.join(' ') || '(nothing)'} — ${why.slice(0, 40)}`);
}
assert.deepEqual(namedBad, [], `the free-text command grammar disagreed with its own cases:\n  ${namedBad.join('\n  ')}`);
console.log(`[§2] naming grammar: ${namedCases.length - namedBad.length}/${namedCases.length} exact, ${namedCases.filter(([, w]) => w.length === 0).length} of which name NO command (including one this row states as a measured limit rather than fixing)`);

// ---------------------------------------------------------------- §3 the byte arm, and where it goes blind
// A clause that names `sw.<helper>` is graded against that helper's body. What makes this arm more than decoration
// is that it can return NOTHING for a helper that definitely reaches git — and the honest reading of that is not
// "the clause is false" but "the literal lives one frame further up".
const helperArms = [
  ['isolatedCheckout', ['archive'], 'the runner spawns `run(\'git\', [\'archive\',…])` with a literal argv, so the command is visible AT CODE POSITION'],
  ['catFileBatch', ['cat-file'], 'same shape, different verb'],
  ['proofCorpus', [], 'reaches git through TWO other helpers in this file and names no argv itself — amendment 93\'s blind spot, one frame up'],
  ['trackedProofs', [], 'the discovery: this body really does write `git([\'ls-tree\', …])`, a command literal at code position, and the arm still sees nothing, because the callee is a PRIVATE WRAPPER NAMED `git` rather than the program string. Amendment 94\'s parameter-bound shape again, with the parameter in the other position'],
  ['runSweep', [], 'calls proofs; names no git call at all'],
];
for (const [fn, want, why] of helperArms) {
  const got = sw.gitCommandsIn(selfSrc, fn);
  assert.deepEqual(got, want, `gitCommandsIn(sweep.mjs, '${fn}') → ${JSON.stringify(got)}, want ${JSON.stringify(want)} — ${why}`);
  assert.ok(sw.definitions(selfSrc).some((d) => d.name === fn), `${fn} is not a definition the walker can find in ${selfName}, so its empty result would be an accident of the index, not a measurement`);
}
// The arm must be able to move: a clause pointing at a helper that DOES name its argv has to report the verb, and
// pointing the same helper at a nameless body has to report nothing. Without these two the five cases above could
// be a lookup table over remembered strings.
const witnessMoves = sw.gitCommandsIn(`${selfSrc}\nfunction v95Probe() { return run('git', ['for-each-ref']); }\n`, 'v95Probe');
assert.deepEqual(witnessMoves, ['for-each-ref'], `appending a spawn with a literal argv must make the arm see a command (got ${JSON.stringify(witnessMoves)})`);
const witnessBlind = sw.gitCommandsIn(`function v95Probe2(argv) { return run('git', argv); }\n`, 'v95Probe2');
assert.deepEqual(witnessBlind, [], `a spawn whose argv is a PARAMETER must stay invisible to the arm (got ${JSON.stringify(witnessBlind)}) — this is the shape three rows confess to`);
const selfNamed = [...new Set(sw.gitCommandsIn(selfSrc))];
console.log(`[§3] byte arm over ${helperArms.length} helpers in ${selfName}: ${selfNamed.length} commands visible at code position in the runner's own file (${selfNamed.join(', ') || 'none'}) while the file spawns git through a wrapper named git — three of the five helpers return NOTHING, and two of those really do reach a repository`);

// ---------------------------------------------------------------- §4 the cause arm, and the one reading that is a crime
const closureClaim = ['git rev-parse HEAD (twice) · git show HEAD:docs/evidence/lib/syncproc.mjs · git ls-tree + git cat-file --batch via sw.proofCorpus'];
const lsTreeCause = 'Error: git ls-tree -r --name-only HEAD -- docs/evidence/agents → exit 128: fatal: not a git repository';
const full = sw.compareConfession(closureClaim, lsTreeCause);
assert.deepEqual([full.gradeable, full.omissions], [true, []], `a complete confession over a real cause line reported ${JSON.stringify(full)} — claim ${full.claim.join(' ')}`);
assert.deepEqual(full.surplus, ['rev-parse', 'show', 'cat-file'], `the surplus of that confession is the set of commands the row reaches and this run did not break on, got ${JSON.stringify(full.surplus)}`);
const narrowed = sw.compareConfession(['git show HEAD:docs/evidence/lib/syncproc.mjs'], lsTreeCause);
assert.deepEqual(narrowed.omissions, ['ls-tree'], `narrowing the confession until it drops the command the row DIED on must report an omission (got ${JSON.stringify(narrowed.omissions)}) — this is the mutation the whole increment exists to make possible`);
const widened = sw.compareConfession([...closureClaim, 'git push origin main'], lsTreeCause);
assert.deepEqual(widened.omissions, [], 'a surplus may never produce an omission');
assert.ok(widened.surplus.includes('push') && widened.surplus.length > full.surplus.length, `widening the claim must GROW the surplus it reports (${full.surplus.length} → ${widened.surplus.length}), because a surplus is stated and not scored`);
const silentCause = sw.compareConfession(closureClaim, 'Error: build failed in @nexus/studio#build');
assert.equal(silentCause.gradeable, false, 'a cause that names no command cannot confirm or refute a confession');
assert.deepEqual(silentCause.omissions, [], 'and it may not be counted as an omission either — it is UNCHECKED, which the runner prints as its own number');
const twoVerbs = sw.compareConfession(['git archive HEAD'], 'git ls-tree -r --name-only HEAD · git diff --name-only HEAD');
assert.deepEqual([twoVerbs.omissions, twoVerbs.surplus], [['ls-tree', 'diff'], ['archive']], 'one reading can hold an omission AND a surplus at once; the first is a defect, the second is a fact');
console.log(`[§4] cause arm, six gradings: complete claim → ${full.cause.length} verb in the cause, ${full.omissions.length} omissions, ${full.surplus.length} surplus · narrowed → ${narrowed.omissions.length} omission (${narrowed.omissions.join('')}) · widened → surplus ${widened.surplus.length} with ${widened.omissions.length} omissions · silent cause → gradeable ${String(silentCause.gradeable)} · mixed → omissions ${twoVerbs.omissions.length} + surplus ${twoVerbs.surplus.length}`);

// ---------------------------------------------------------------- §5 the population, clause by clause
const confessing = rows.map((r) => [basename(r.path), sw.asksRepository(r.text).filter((p) => p.trim() !== '')]).filter(([, a]) => a.length > 0);
assert.ok(confessing.length >= 1, 'no row declares what it asks — then the byte arm has nothing to grade and this section is measuring an empty channel (say so in the ADR before shipping it again)');
const clauses = confessing.flatMap(([n, payloads]) => sw.gradeConfession(payloads, rows.find((r) => basename(r.path) === n).text, selfSrc).map((c) => ({ ...c, row: n })));
const byState = (st) => clauses.filter((c) => c.state === st);
const pointAtRunner = clauses.filter((c) => c.helpers.length > 0);
console.log(`[§5] census: ${confessing.length} declaring rows, ${clauses.length} clauses — supported ${byState('supported').length} · partial ${byState('partial').length} · invisible ${byState('invisible').length} · no-command ${byState('no-command').length} · ${pointAtRunner.length} clauses point at ${[...new Set(pointAtRunner.flatMap((c) => c.helpers))].join(', ')}`);
for (const c of clauses) console.log(`  ${c.state.padEnd(9)} ${c.row} :: ${c.clause}${c.missing.length ? ` (bytes show no ${c.missing.join(', ')})` : ''}`);
// Both ends have to be inhabited, or the arm is not discriminating. `supported` proves the arm can reach a real
// argv and agree with a row; `invisible` proves it can disagree, which is the whole value of the channel.
assert.ok(byState('supported').length > 0, 'the byte arm agreed with nobody — either the helper bodies changed shape or the arm cannot see an argv literal any more');
assert.ok(byState('invisible').length > 0, 'the byte arm found every confession corroborated — amendment 94 measured reaches that hide one frame up, and a census that now sees them all means the arm was widened until it flatters (or the blind spots were removed, which belongs in the ADR)');
const renamed = selfSrc.replace(/export async function isolatedCheckout/g, 'export async function notIsolatedCheckout');
assert.notEqual(renamed, selfSrc, 'the rename found no declaration to rename — the mutation below would be checking nothing');
const flipped = sw.gradeConfession(['git archive HEAD once per sw.isolatedCheckout call'], selfSrc, renamed);
console.log(`[§5] the arm reads code, not names: pointing the same clause at a helper that does not exist returns ${flipped.map((c) => `${c.state}(${c.missing.join('+')})`).join(', ')} where the real one is supported`);
assert.ok(flipped.every((c) => c.state === 'invisible'), 'renaming the helper the clause points at must break the corroboration — a clause that graded a NAME rather than a BODY would survive the edit');
console.log(`\n[summary] two witnesses for ${clauses.length} confessions: ${selfNamed.length} commands the runner can name in its own file, ${byState('supported').length} clauses corroborated by a body and ${byState('invisible').length} that hide one frame up, ${namedCases.length} naming cases held the free-text grammar (one of them recorded as a false negative rather than fixed), and the cause arm reddened under exactly one of the mutations it was shown — the omission. A surplus is stated, never scored. The gate the sweep prints after the rows is omissions + silent blind spots at zero`);
