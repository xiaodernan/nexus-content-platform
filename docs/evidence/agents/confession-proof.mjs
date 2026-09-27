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
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
// The source the BYTE arm reads: a clause that cites `sw.<helper>` is graded against that helper's body in the
// runner, so the runner's own bytes are evidence here and not the file this row lives in. On the GIT plane they are HEAD's; on the other plane they are
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

// Amendment 96: `invisible` covered two residuals that need opposite responses, so every clause now also reports
// whether a frame the arm is ALLOWED to read — the runner's definitions or this row's own bytes — holds the verb
// it is missing. A MIS-CITED clause is the author's, one edit to a comment away; an UNREADABLE one is the arm's
// ceiling, and the only thing that would lift it is code that names its verbs at call sites, which the arm must
// not demand. The split is inhabited on both sides below, by clauses that differ in nothing but the verb.
const NO_BYTES = 'const x = 1;\n';
const partitionCases = [
  ['the clause cites the frame that names its verb', ['git cat-file --batch via sw.catFileBatch'], 'supported', [], []],
  ['the verb IS readable, in a frame this clause did not cite', ['git archive HEAD via sw.runSweep'], 'invisible', ['archive'], []],
  ['no readable frame anywhere names this verb, so no wording grades it', ['git ls-tree via sw.runSweep'], 'invisible', [], ['ls-tree']],
  ['one clause, two verbs, citable and not, through a frame that shows neither', ['git cat-file --batch + git ls-tree via sw.proofCorpus'], 'invisible', ['cat-file'], ['ls-tree']],
  ['a clause naming no command has nothing to grade either way', ['a nested sweep (sw.runSweep)'], 'no-command', [], []],
];
const partitionBad = [];
for (const [why, payloads, wantState, wantFix, wantDead] of partitionCases) {
  const [c] = sw.gradeConfession(payloads, NO_BYTES, selfSrc);
  if (c.state !== wantState || c.fixable.join() !== wantFix.join() || c.dead.join() !== wantDead.join())
    partitionBad.push(`${why} → ${c.state} fixable=[${c.fixable}] dead=[${c.dead}], want ${wantState} [${wantFix}] [${wantDead}]`);
}
assert.deepEqual(partitionBad, [], `the mis-cited/unreadable split disagreed with its own cases:\n  ${partitionBad.join('\n  ')}`);
// And the fix has to be able to land: the same verb, pointed at its own frame, stops being missing at all.
const citedRight = sw.gradeConfession(['git archive HEAD via sw.runSweep'], NO_BYTES, selfSrc)[0];
const citedBetter = sw.gradeConfession(['git archive HEAD via sw.isolatedCheckout'], NO_BYTES, selfSrc)[0];
assert.deepEqual([citedRight.state, citedRight.fixable, citedBetter.state, citedBetter.fixable.length, citedBetter.dead.length],
  ['invisible', ['archive'], 'supported', 0, 0], `pointing a clause at the frame where its literal lives must move it from mis-cited to supported (${JSON.stringify([citedRight.state, citedBetter.state])})`);
console.log(`[§3] the split is graded on ${partitionCases.length} cases that differ only in which verb and which frame they name, and the repair is graded too: 'archive via sw.runSweep' is mis-cited while 'archive via sw.isolatedCheckout' is supported`);

// ---------------------------------------------------------------- §4 the cause arm, and the one reading that is a crime
// The claim under test is READ out of the row's own bytes, not retyped here: amendment 95 left a quotation of
// closure's declaration in this file, and amendment 96 changed that declaration, so a retyped copy would have
// graded a sentence no commit owns — the shape amendment 89 named for imports and amendment 88 for staged files.
const closureRow = rows.find((r) => basename(r.path) === 'closure-proof.mjs');
const closureClaim = closureRow ? sw.asksRepository(closureRow.text).filter((p) => p.trim() !== '') : [];
assert.ok(closureClaim.length > 0, 'closure-proof.mjs declares nothing at this ref, so §4 has no real confession to grade and would be grading its own leftovers');
assert.deepEqual([...new Set(closureClaim.flatMap((p) => sw.gitCommandsNamed(p)))].sort(), ['cat-file', 'ls-tree', 'rev-parse', 'show'], `closure's declaration must keep naming all four commands for §4's gradings to mean what they say (got ${JSON.stringify([...new Set(closureClaim.flatMap((p) => sw.gitCommandsNamed(p)))].sort())})`);
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
const misCited = clauses.filter((c) => c.fixable.length > 0);
const unreadable = clauses.filter((c) => c.dead.length > 0);
const deadVerbs = [...new Set(unreadable.flatMap((c) => c.dead))].sort();
console.log(`[§5] census: ${confessing.length} declaring rows, ${clauses.length} clauses — supported ${byState('supported').length} · partial ${byState('partial').length} · invisible ${byState('invisible').length} · no-command ${byState('no-command').length} · ${pointAtRunner.length} clauses point at ${[...new Set(pointAtRunner.flatMap((c) => c.helpers))].join(', ')}`);
console.log(`[§5] the invisible clauses split: ${misCited.length} MIS-CITED (${misCited.map((c) => `${c.row} names ${c.fixable.join(',')} where a readable frame holds it`).join(' · ') || 'none'}) · ${unreadable.length} name a verb no readable frame holds, over the ${deadVerbs.length} verbs ${JSON.stringify(deadVerbs)} — that is the arm's CEILING over this population, because the only way to lift it is code that names its literals at a call site, and an arm that requires that is a checker pressuring the population to flatter it (amendment 91's lesson, applied to the arm's own appetite)`);
for (const c of clauses) console.log(`  ${c.state.padEnd(9)} ${c.row} :: ${c.clause}${c.missing.length ? ` (bytes show no ${c.missing.join(', ')}${c.fixable.length ? `, WHICH IS CITABLE: ${c.fixable.join(',')} — one edit to this comment grades it` : ''})` : ''}`);
// The gate the split exists to make: an invisible clause whose verb IS readable somewhere is a defect of the
// sentence, not of the scanner, and amendment 96 leaves the population with none of them. This is the number that
// has to be able to redden, so §3's `archive via sw.runSweep` case is its live counterexample.
assert.deepEqual(misCited.map((c) => `${c.row} ${c.fixable.join(',')}`), [], `a declaration cited a frame that hides a command another readable frame names: ${JSON.stringify(misCited.map((c) => [c.row, c.clause, c.fixable]))}`);
// Both ends have to be inhabited, or the arm is not discriminating. `supported` proves the arm can reach a real
// argv and agree with a row; `invisible` proves it can disagree, which is the whole value of the channel.
assert.ok(byState('supported').length > 0, 'the byte arm agreed with nobody — either the helper bodies changed shape or the arm cannot see an argv literal any more');
assert.ok(byState('invisible').length > 0, 'the byte arm found every confession corroborated — amendment 94 measured reaches that hide one frame up, and a census that now sees them all means the arm was widened until it flatters (or the blind spots were removed, which belongs in the ADR)');
const renamed = selfSrc.replace(/export async function isolatedCheckout/g, 'export async function notIsolatedCheckout');
assert.notEqual(renamed, selfSrc, 'the rename found no declaration to rename — the mutation below would be checking nothing');
const flipped = sw.gradeConfession(['git archive HEAD once per sw.isolatedCheckout call'], selfSrc, renamed);
console.log(`[§5] the arm reads code, not names: pointing the same clause at a helper that does not exist returns ${flipped.map((c) => `${c.state}(${c.missing.join('+')})`).join(', ')} where the real one is supported`);
assert.ok(flipped.every((c) => c.state === 'invisible'), 'renaming the helper the clause points at must break the corroboration — a clause that graded a NAME rather than a BODY would survive the edit');
// ---------------------------------------------------------------- §6 the wiring, which died once on a key
// §§1-5 grade the RULES. This section grades the CALL SITE, because the rule that broke was never a rule: on
// 6807ba1 the isolation sweep ran all 73 rows, printed `[plane axis]` and `[asks axis]`, and then threw
// `Cannot read properties of undefined (reading 'gradeable')` in the last line of a seven-minute run. Two map
// lookups had been written `declared.get(row)` and `cmp.get(row)` where both maps are keyed by `row.name`. The
// first throw was survivable; the second was not — `declared.get(row)` returns `undefined` just as cheerfully as
// it would for a row that declares nothing, so the population would have been graded against an EMPTY confession
// and every verb in every cause line would have been reported as an OMISSION. That is amendment 91's failure
// shape wearing a variable name, and it is why these six lines now live in one exported function that a row can
// feed cases.
//
// Row shapes are the runner's, not my convenience: `name` is a repo-relative path (that is what `git ls-tree
// --name-only` answers), and `reason` is the first stderr line the row printed.
const d = (n) => `${DIR}/${n}`;
const failedRows = [
  { name: d('syn-omit.mjs'), reason: 'Error: git archive HEAD → exit 128: fatal: not a git repository' },
  { name: d('syn-ok.mjs'), reason: 'Error: git ls-tree -r --name-only HEAD -- docs/evidence/agents → exit 128' },
  { name: d('syn-matched.mjs'), reason: 'Error: git status --porcelain → exit 128' },
  { name: d('syn-silent.mjs'), reason: 'Error: git status --porcelain → exit 128' },
  { name: d('syn-foreseen.mjs'), reason: 'Error: git diff --name-only HEAD → exit 128' },
  { name: d('syn-nocause.mjs'), reason: 'Error: nothing in this sentence names a verb' },
];
// Every arm of the axis gets exactly one inhabitant, because a count of zero would otherwise be satisfiable by
// the wiring being dead. `syn-matched` is the regression witness: its confession names the verb its cause names,
// so the truth is ZERO omissions — and under the old lookup it produced one out of nothing.
const heard = new Map([
  [d('syn-omit.mjs'), ['git ls-tree -r --name-only HEAD']],
  [d('syn-ok.mjs'), ['git ls-tree -r HEAD · git archive HEAD']],
  [d('syn-matched.mjs'), ['git status --porcelain']],
  [d('syn-nocause.mjs'), ['git rev-parse HEAD']],
]);
const foreseen = new Set([d('syn-foreseen.mjs')]);
const arm = (declaredMap, predicted) => sw.gradeCauseArm({ declared: declaredMap, failed: failedRows, predicted: (n) => predicted.has(n) });
const six = arm(heard, foreseen);
assert.deepEqual(six.declaring, ['syn-omit.mjs', 'syn-ok.mjs', 'syn-matched.mjs', 'syn-nocause.mjs'], `which reds were heard: ${six.declaring.join(', ')}`);
assert.deepEqual([six.gradeable, six.unchecked], [['syn-omit.mjs', 'syn-ok.mjs', 'syn-matched.mjs'], ['syn-nocause.mjs']], `a declaring red is UNCHECKED, never passed, when its cause names no command (gradeable ${six.gradeable.join(', ')} · unchecked ${six.unchecked.join(', ')})`);
assert.deepEqual(six.omissions, ['syn-omit.mjs reached archive and does not declare it'], `omissions, and syn-matched must not be among them: ${JSON.stringify(six.omissions)}`);
assert.deepEqual(six.surplus, ['syn-omit.mjs declares ls-tree', 'syn-ok.mjs declares archive'], `a surplus is stated on BOTH sides of a partial overlap: ${JSON.stringify(six.surplus)}`);
assert.deepEqual(six.silentBlind, ['syn-silent.mjs'], `silent blind spots exclude the row the scanner foresaw and the row whose cause names nothing: ${six.silentBlind.join(', ')}`);
// The defect itself, in the one line that reproduces it. `undefined` is what `declared.get(row)` returned for a
// row the map holds under `row.name`; a grader that cannot tell "no entry" from "declared nothing" turns a
// complete confession into three omissions.
const brokenKey = sw.compareConfession(undefined, failedRows[2].reason);
assert.deepEqual([brokenKey.gradeable, brokenKey.omissions, brokenKey.surplus], [true, ['status'], []], `an empty claim read off a wrong key must reproduce the 6807ba1 defect (got ${JSON.stringify(brokenKey)}) — this assertion FAILS only if the grader learns to refuse an absent claim, which would be a different design and belongs in the ADR`);
// And the adjacent failure: a reader keyed by the WRONG ENDING of the same path. Every lookup misses, so the
// axis reports zero confessions and zero omissions — which looks clean until the blind-spot arm speaks, because
// a row the reader stopped hearing is indistinguishable from a row that never said anything.
const miskeyed = arm(new Map([...heard].map(([k, v]) => [basename(k), v])), foreseen);
assert.deepEqual([miskeyed.declaring.length, miskeyed.omissions.length], [0, 0], `a basename-keyed reader over path-named rows must hear nothing, got ${JSON.stringify(miskeyed)}`);
assert.deepEqual(miskeyed.silentBlind, ['syn-omit.mjs', 'syn-ok.mjs', 'syn-matched.mjs', 'syn-silent.mjs'], `and the gate must see the loss: ${miskeyed.silentBlind.join(', ')} — a broken reader cannot hide behind a zero, because the rows it drops reappear as blind spots, which is why the gate counts BOTH`);
// Interlock: unheard ≠ blind by choice. Drop one row's declaration from a correctly-keyed map and it must move
// across, changing neither the other rows' numbers nor the count of omissions it caused.
const deafened = arm(new Map([...heard].filter(([k]) => k !== d('syn-matched.mjs'))), foreseen);
assert.deepEqual(deafened.omissions, six.omissions, 'removing a confession that had no omissions may not invent one');
assert.ok(!deafened.declaring.includes('syn-matched.mjs') && deafened.silentBlind.includes('syn-matched.mjs'), `a row the reader no longer reads must leave \`declaring\` and enter \`silentBlind\` (got ${JSON.stringify([deafened.declaring, deafened.silentBlind])})`);
// The partition the runner's own sentence relies on: every red declaring row is gradeable or unchecked, and no
// row is both heard and blind.
assert.deepEqual([...six.gradeable, ...six.unchecked].sort(), six.declaring.slice().sort(), 'declaring must partition into gradeable + unchecked');
assert.deepEqual(six.declaring.filter((n) => six.silentBlind.includes(n)), [], 'a row cannot be both heard and a silent blind spot');
console.log(`[§6] wiring: ${failedRows.length} synthetic reds → declaring ${six.declaring.length} · gradeable ${six.gradeable.length} · unchecked ${six.unchecked.length} · omissions ${six.omissions.length} · surplus ${six.surplus.length} · blind ${six.silentBlind.length}. The 6807ba1 defect reproduces in one line (an object used as a name-keyed map's key yields an empty claim, and an empty claim made ${brokenKey.omissions.length} omission out of a row that declared ${failedRows[2].reason.match(/git (\S+)/)[1]}), and the wrong-ENDING key is caught too: ${miskeyed.declaring.length} heard with ${miskeyed.silentBlind.length} blind, because a dropped row reappears in the arm the gate reads`);

// ---------------------------------------------------------------- §7 the reading rule UNDERNEATH the arm
// §§1-6 grade what the byte arm can see. This section grades the walk that decides what is seeable at all: on
// `5551327` the tokenizer knew comments, it knew strings, and it knew no third way a character can hide — so a
// `/…/` literal carrying a quote opened a phantom string and inverted every pairing after it in that file. 13 of
// the 78 tracked `.mjs` hold one. The two directions it produced are BOTH in this population, so both are pinned.
{
  const bs = String.fromCharCode(92);
  const CALL = "execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });";
  const subs = (src) => sw.gitReaches(src).map((h) => `${h.via}:${h.callee ?? ''}:${h.sub ?? ''}`);
  // (a) HID. A door's own sentence, quoted in a pattern apostrophe and all, as at `intent-proof.mjs:191`. Before
  // the arm that row reported three reaches and its real `execFileSync('git', ['rev-parse', 'HEAD'], …)` on line
  // 227 was not one of them — the reason a `dead` verdict about a desynced row's bytes could not be checked.
  const HID = "const MSG = /^git's last line$/;" + '\n' + CALL;
  assert.deepEqual(subs(HID), subs(CALL), '(a) a quote inside a regex may not change what the call after it reports');
  assert.ok(subs(HID).includes('program:execFileSync:rev-parse'), `(a) the hidden reach must be there at all: ${JSON.stringify(subs(HID))}`);
  // (b) INVENTED. `spawnlog-proof.mjs:187` asserts that a REFUSED command survives inside its own reason line,
  // JSON-quoted. Its pattern is /…["git","push"]…/ with the brackets escaped, and the arm-less walk read that
  // escape as an OPEN ARRAY BRACKET, so the next quote opened a string whose body was exactly `git` — and a row
  // proving that a refusal record is not an order to run contributed an order to run.
  const INVENTED = "assert.match(line.reason, /" + bs + '["git","push"' + bs + "]/, 'the stated refusal names what was asked');";
  assert.deepEqual(sw.gitReaches(INVENTED), [], '(b) a regex body is not an argv: the reach grammar may invent nothing');
  assert.ok(sw.mentionsGit(INVENTED), '(b) the naive grammar still hears the word — two grammars, one question (amendment 89), so the disagreement is stated rather than hidden');
  // (c) DIVISION may not be swallowed. Same-line termination is what bounds a wrong guess: `a / b` never closes,
  // so the walk falls back to arithmetic and the call after it — same line or next — keeps its reach.
  assert.equal(sw.gitReaches('const half = total / 2; ' + CALL).length, 1, '(c) arithmetic before a call may not cost the call its reach');
  assert.equal(sw.gitReaches('const ratio = width / height\n' + CALL).length, 1, '(c) a slash that never closes may not eat the next line');
  // (d) A character class may not steal the frame that decides which callee a literal belongs to.
  const CLASS = 'const OPEN = /[(]/;\n' + "execFileSync('git', ['status', '--porcelain']);";
  const cl = sw.gitReaches(CLASS);
  assert.equal(cl.length, 1, `(d) the class case found ${JSON.stringify(cl.map((h) => h.via))}`);
  assert.equal(cl[0].callee, 'execFileSync', '(d) a bracket inside a pattern must not reorder the frame stack');
  // (e) A comment is still a comment: `//` may not read as an empty regex, and its payload must still reach the
  // declaration channel — the arm sits in the same walk that feeds it.
  const COMMENT = '// sweep-asks-repository: git status is said here and asked nowhere\n' + CALL;
  assert.equal(sw.gitReaches(COMMENT).length, 1, '(e) a double slash is not an empty regex');
  assert.deepEqual(sw.asksRepository(COMMENT), ['git status is said here and asked nowhere'], '(e) and the marker inside it is still read');
  // (f) THE LIVE ROWS, pinned by content rather than by a total any unrelated edit could move.
  const live = (n) => rows.find((r) => r.path.endsWith('/' + n));
  const intent = live('intent-proof.mjs');
  const spawnlog = live('spawnlog-proof.mjs');
  assert.ok(intent && spawnlog, '(f) neither witness this section exists for is in the population');
  const ip = sw.gitCommandsIn(intent.text).filter((c) => c === 'rev-parse').length;
  assert.ok(ip >= 2, `(f) intent-proof still names rev-parse only ${ip} time — its line-227 call is being read as string body`);
  const sl = spawnlog.text.indexOf('assert.match(line.reason, ');
  assert.ok(sl >= 0, '(f) the JSON-quoted refusal assertion has left spawnlog-proof, so this case checks nothing');
  const from = spawnlog.text.lastIndexOf('\n', sl) + 1;
  const to = spawnlog.text.indexOf('\n', sl);
  assert.ok(!sw.gitReaches(spawnlog.text).some((h) => h.at > from && h.at <= to), '(f) that line names a refusal RECORD, not a command, and must contribute no reach');
  let replay = 'skipped: this plane has no index to ask';
  if (gitPlane === 'GIT') {
    // (g) THE PIN BITES. `5551327` is the last ref whose runner has no regex arm, so its own bytes are sliced and
    // asked the two questions above. If either answer flips, cases (a) and (b) are testing a rule that was never
    // broken — which is how a witness passes while proving nothing.
    const pre = norm(git('show', '5551327:docs/evidence/agents/sweep.mjs'));
    const a0 = pre.indexOf('export const SPAWN_FAMILY');
    const a1 = pre.indexOf('/** The naive second grammar');
    assert.ok(a0 >= 0 && a1 > a0, '(g) the pre-v97 slice anchors have moved');
    const dir = mkdtempSync(join(tmpdir(), 'nexus-v97-'));
    writeFileSync(join(dir, 'pre-v97-grammar.mjs'), pre.slice(a0, a1) + '\n');
    const old = await import(pathToFileURL(join(dir, 'pre-v97-grammar.mjs')).href);
    assert.ok(!old.gitReaches(HID).some((h) => h.sub === 'rev-parse'), '(g) the arm-less grammar no longer HIDES the call, so case (a) tests nothing');
    assert.ok(old.gitReaches(INVENTED).some((h) => h.via === 'argv'), '(g) the arm-less grammar no longer INVENTS the argv hit, so case (b) tests nothing');
    rmSync(dir, { recursive: true, force: true });
    replay = 'the arm-less grammar at 5551327 hides (a) and invents (b), both reproduced here';
  }
  console.log(`[§7] regex arm: (a) hidden reach recovered · (b) invented argv refused · (c) division untouched · (d) class brackets harmless · (e) \`//\` still a comment · (f) 2 live rows pinned by content · (g) ${replay}`);
}

// ---------------------------------------------------------------- §8 the alias arm: which helper's call site may be read, and which may not
//
// Amendment 96 named the ceiling as "a reach whose argv is a parameter" and stopped there. Every one of those
// parameters is filled at a CALL SITE with a verb literal, so the verb is in the source — the arm simply was not
// looking one frame away. It looks now, and the whole design is the refusal: a helper's NAME says nothing about
// WHICH repository it asks, and a row may ask a throwaway one three different ways. So the rule reads an alias only
// when its own bytes make a redirect impossible, and these cases are the three doors plus the two that were never
// aliases at all. A must-count case with no must-not-count twin is a rule that only ever adds.
{
  const REST = "const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });\ngit('rev-parse', 'HEAD');\n";
  const FLAG = "const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });\ngit('rev-parse', 'HEAD');\n";
  const LIT_CWD = "const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });\ngit('rev-parse', 'HEAD');\n";
  const PARAM_CWD = "const git = (argv, cwd) => execFileSync('git', argv, { cwd, encoding: 'utf8' });\ngit(['rev-parse', 'HEAD'], '.');\n";
  const VIA_VAR = "const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });\nconst cmd = 'rev-parse';\ngit(cmd, 'HEAD');\n";
  const PROG_PARAM = "const sh = (program, args) => execFile(program, args, () => {});\nsh('git', ['status', '--porcelain']);\n";
  const cases = [
    ['a rest-forwarding alias with no location anywhere', REST, ['rev-parse'], 'the door #152 exists to open'],
    ['-C in the argv: the alias asks ANOTHER repository', FLAG, [], 'refused, and the verb stays unreadable'],
    ['a literal cwd: in the options, naming a file-level scratch dir', LIT_CWD, [], 'refused — this is the shape 8 rows in the population use'],
    ['the runner itself: a parameter arrives in the options position', PARAM_CWD, [], 'refused, which is why closure/cwd-axis still have no reader'],
    ['a call site that passes a VARIABLE, not a literal', VIA_VAR, [], 'no verb is in the source to read'],
    ['the program name is the parameter: not a git alias at all', PROG_PARAM, [], 'no program literal, so no alias and no verb'],
  ];
  for (const [what, src, want, why] of cases) {
    const got = sw.aliasGitCommands(src).verbs;
    assert.deepEqual(got, want, `(a) ${what} → ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}: ${why}`);
    console.log(`[§8] ${want.length ? 'READS' : 'refuses'} ${JSON.stringify(got).padEnd(13)} ${what}`);
  }
  // (b) THE LIVE ROWS, pinned by content. Two of the population carry an alias the arm may read, and both are
  // rest-parameter wrappers with no location ANYWHERE in their bytes (`const git = (...args) => execFileSync('git',
  // args, { encoding })` in table-recount-proof.mjs, and the same shape under `execFile` as `gitText` in
  // bridge-report-proof.mjs), so every verb their call sites pass sits one frame from the spawn.
  const live = (n) => rows.find((r) => r.path.endsWith('/' + n));
  const readable = rows.filter((r) => sw.aliasGitCommands(r.text).verbs.length > 0).map((r) => basename(r.path)).sort();
  assert.deepEqual(readable, ['bridge-report-proof.mjs', 'table-recount-proof.mjs'], `(b) the arm reads an alias in ${readable.join(', ')} — a THIRD name here is a new helper taking the verb-parameter shape: look at whether it can redirect, then add it, do not board the assertion up`);
  const tr = live('table-recount-proof.mjs');
  assert.ok(tr, '(b) table-recount-proof has left the population');
  const trPay = sw.asksRepository(tr.text).filter((p) => p.trim() !== '');
  const trVerbs = [...new Set(trPay.flatMap((p) => sw.gitCommandsNamed(p)))].sort();
  assert.deepEqual(trVerbs, ['diff', 'ls-tree', 'rev-parse', 'show', 'status'], `(b) the row's confession no longer names the five verbs (${JSON.stringify(trVerbs)}), so the pin below grades a different claim`);
  assert.deepEqual([...new Set(sw.gitCommandsIn(tr.text))], [], `(b) table-recount names NO verb at a direct spawn frame — every supported clause is supported by the alias arm ALONE, and if a future edit adds a literal call here this is the line that says so`);
  const trGraded = sw.gradeConfession(trPay, tr.text, selfSrc);
  assert.equal(trGraded.length, trVerbs.length, `(b) the row declares ${trVerbs.length} verbs and the arm graded ${trGraded.length} clauses — the payload is one line whose clauses are split by '·'`);
  assert.deepEqual([...new Set(trGraded.map((c) => c.state))], ['supported'], `(b) its ${trGraded.length} clauses came out ${JSON.stringify(trGraded.map((c) => c.state))} — before v98 all five were invisible, which is the whole +5 of the census move`);
  // The runner's own file is WHY the residual is three verbs deep, and the two faces of the ceiling differ:
  sw.aliasVerdicts(selfSrc);
  assert.deepEqual(sw.aliasGitCommands(selfSrc), { aliases: [], verbs: [] }, `(b) the runner now reads a verb through its own git(argv, cwd) — the parameter-in-options door has gone, so the dead verbs above were lifted by widening the arm that exists to report a CEILING`);
  const selfRefused = sw.aliasVerdicts(selfSrc).refused;
  assert.deepEqual([...new Set(selfRefused.filter((x) => x.why === 'param-in-options').map((x) => x.name))].sort(), ['catFileBatchOptional', 'committedBlob', 'git'], `(b) the door that refuses this file's own git(argv, cwd) now SPEAKS its reason. Amendment 99 recorded the ceiling as having an uncensused face precisely because only the \`cwd\`-key door reported anything, and a census that cannot enumerate what it declined is a census of its own blind spots — this line is the record of that being closed, and it names the two other helpers the same door drops`);
  // (c) THE MUTATIONS MUST BITE. Each refusal above is real only if editing away its reason makes the arm read.
  const noFlag = FLAG.replace("['-C', dir, ...args]", '[...args]');
  const noLitCwd = LIT_CWD.replace('{ cwd: root, encoding', '{ encoding');
  const noParamCwd = PARAM_CWD.replace('{ cwd, encoding', '{ encoding');
  assert.notEqual(noFlag, FLAG, '(c) the -C mutation found nothing to delete');
  assert.notEqual(noLitCwd, LIT_CWD, '(c) the cwd: mutation found nothing to delete');
  assert.notEqual(noParamCwd, PARAM_CWD, '(c) the shorthand-cwd mutation found nothing to delete');
  const DECL = ["git rev-parse HEAD through this row's own git() alias"];
  const grade = (src) => sw.gradeConfession(DECL, src, '')[0];
  assert.deepEqual([grade(FLAG).state, grade(FLAG).dead], ['invisible', ['rev-parse']], '(c) the -C case is genuinely unreadable BEFORE the mutation, or the pair below checks nothing');
  assert.equal(grade(noFlag).state, 'supported', '(c) deleting only the -C element makes the SAME clause supported: the flag hid the verb, not the arrow shape');
  assert.deepEqual([grade(LIT_CWD).state, grade(noLitCwd).state], ['invisible', 'supported'], '(c) the same for a literal cwd: — one key is the whole door');
  assert.equal(grade(noParamCwd).state, 'invisible', "(c) and NOT so for the runner's shape: with cwd gone from the options the helper stops being an alias at all (its second parameter is then used nowhere), so no edit to a comment lifts it — only CODE naming its literal at a call site does, which amendment 91 forbids an arm from demanding of the population");
  console.log(`[§8] alias arm: ${readable.length} of ${rows.length} rows carry a readable one (${readable.join(', ')}), and table-recount's ${trGraded.length} clauses are supported by it ALONE; the runner's git(argv, cwd) is refused by a SILENT door, so the ceiling of ${deadVerbs.length} verbs (${JSON.stringify(deadVerbs)}) has one face the census cannot see; 3 redirect doors × the edit that opens each, plus the edit that opens none`);
}

// ---------------------------------------------------------------- §9 the axis's own explanation is computed, not remembered
// Amendment 98 refuted the sentence the confession axis printed for its invisible clauses — "every one of those
// reaches carries its verb through a wrapper that takes a PARAMETER, so only the CODE could name it" — because a
// parameter wrapper IS named by code at its call sites, which is how four clauses became readable. The runner now
// interpolates `aliasCeiling` instead of reciting a reason, so this grades the EXPLANATION the way §4 grades a
// confession: the two faces have to move when the grammar's verdict on the same bytes moves, or the line is a
// paragraph somebody wrote rather than a reading of the population.
{
  const CEIL = ["git ls-tree -r --name-only HEAD through this row's own git()"];
  const OWNER = "const git = (args) => run('git', args, { cwd: root });\ngit(['ls-tree']);\n";
  const PARTIAL = "const git = (args) => run('git', args);\ngit(['status']);\n";
  const BORROWED = "const out = sw.runSweep('git', ['ls-tree'], { cwd: root });\n";
  const noLocation = (s) => s.replace(', { cwd: root }', '');
  assert.notEqual(noLocation(OWNER), OWNER, '(§9) the mutation found nothing to delete in the row-owned helper');
  assert.notEqual(noLocation(BORROWED), BORROWED, '(§9) the mutation found nothing to delete in the borrowed frame');
  const face = (src) => {
    const c = sw.gradeConfession(CEIL, src, '')[0];
    const f = sw.aliasCeiling([['fixture', src]]);
    return [c.state, ...['declined', 'readable', 'silent'].map((k) => f[k].map((x) => x.refusals.length ? x.refusals.join(',') : x.verbs.join(',')).filter(Boolean))];
  };
  assert.deepEqual(face(OWNER), ['invisible', ['git:cwd'], [], []], '(§9) a row whose OWN helper names a location is declined out loud, and the axis must say so by name');
  assert.deepEqual(face(noLocation(OWNER)), ['supported', [], ['ls-tree'], []], '(§9) one edit by that row lifts the clause AND moves it off the declined face: the ceiling is gone because the row stopped asking somewhere else');
  assert.deepEqual(face(PARTIAL), ['partial', [], ['status'], []], '(§9) the second face is a row that owns a working alias which simply does not reach THIS verb: the clause is PARTIAL, not invisible, because the arm can see one command and not the other — and the edit that closes it is the row naming a second literal at a call site, which is a different problem from a refused helper and a different problem again from a frame the row does not own');
  assert.deepEqual(face(BORROWED), ['invisible', [], [], []], "(§9) a verb that reaches the child through another file's call has no verdict on record — the silent face, which is where the runner's own wrapper lives");
  assert.deepEqual(face(noLocation(BORROWED)), ['invisible', [], [], []], "(§9) and the SAME edit that lifts the first face changes NOTHING here, because the frame is not the row's to open — that difference in who holds the edit is the whole content of the axis sentence");
  const axisLine = selfSrc.split('\n').find((l) => l.includes('[identity] confession axis (bytes)'));
  assert.ok(axisLine, 'the confession axis line is not in the runner at all — §9 would be grading an absent channel');
  assert.ok(axisLine.includes('only the CODE could name it'), 'the refuted sentence is no longer cited anywhere in the axis line, so the strip below has nothing to tell apart from an assertion and this check would be vacuous');
  const asserted = axisLine.replace(/"[^"\n]*"/g, '');
  assert.ok(!/only the CODE could name it/.test(asserted), 'the axis ASSERTS the reason amendment 98 refuted rather than citing it: an explanation of a residual must be read out of the same grammar that produced the residual — and amendment 89 already settled that a quotation is not a use, which is why the strip above removes the cited sentence and keeps the check');
  assert.deepEqual(['ceiling.declined.length', 'ceiling.readable.length', 'ceiling.silent.length'].filter((v) => !axisLine.includes(v)), [], 'the axis sentence names a face that did not come from aliasCeiling, so a row edit can no longer move it');
  const deadNames = [...new Set(unreadable.map((c) => c.row))].sort();
  const live = sw.aliasCeiling(deadNames.map((n) => [n, rows.find((r) => basename(r.path) === n).text]));
  assert.deepEqual([live.declined, live.readable, live.silent.map((s) => s.row)], [[], [], ['closure-proof.mjs', 'cwd-axis-proof.mjs']], `(§9) over the LIVE population every invisible clause sits on the silent face, so the sentence's first two branches print zero this cycle — if a row ever moves one onto a face its own edit can close, this is the check that says the axis will name it`);
  console.log(`[§9] the axis's ceiling, three faces computed: declined → ${JSON.stringify(face(OWNER))}, the row's own edit → ${JSON.stringify(face(noLocation(OWNER)))}; a readable alias that misses the verb → ${JSON.stringify(face(PARTIAL))}; borrowed frame → ${JSON.stringify(face(BORROWED))} and its same edit → ${JSON.stringify(face(noLocation(BORROWED)))} · live: ${deadNames.length} dead rows, ${live.declined.length}/${live.readable.length}/${live.silent.length} by face (${live.silent.map((s) => s.row).join(', ')})`);
}

// ---------------------------------------------------------------- §10 every drop has a name, and the census cannot be silent
// Amendment 99 could say WHICH face a dead row sits on because one door — the `cwd` key — reported itself. The other
// five filters returned nothing, so the arm's refusal census counted 8 helpers in the population while its own file
// held a wrapper it declined in silence. `aliasVerdicts` now returns three buckets and every definition lands in
// exactly one of them, which turns "the arm has no verdict" from a fact about the code into an arithmetic
// contradiction. Each reason gets a fixture, and the invariant is graded over the whole population rather than
// asserted about it.
{
  const ONE = (s) => { const v = sw.aliasVerdicts(s); return [[...v.readable.map((x) => 'h'), ...v.refused.map((x) => `h:${x.why}`), ...v.notAlias.map((x) => `h:${x.why}`)].sort(), v.readable.length + v.refused.length + v.notAlias.length]; };
  const cases = [
    ["const h = (...args) => execFileSync('git', args);\n", [['h'], 1], 'readable: a rest-forwarder with no location anywhere'],
    ["const h = (...args) => execFileSync('git', ['-C', dir, ...args]);\n", [['h:redirect-flag'], 1], 'refused for naming a repository-redirect flag in its argv'],
    ["const h = (argv) => execFileSync('git', argv, { cwd: root });\n", [['h:cwd'], 1], 'refused because its spawn options name a location, whoever the value is'],
    ["const h = (argv, cwd) => execFileSync('git', argv, { cwd });\n", [['h:param-in-options'], 1], "refused because a PARAMETER arrives in the options position — the runner's own shape, and the face that used to be silent"],
    ["const h = () => execFileSync('git', ['status']);\n", [['h:no-params'], 1], 'not an alias at all: it takes nothing, so its verbs are already visible at the spawn frame'],
    ["const h = (tag, argv) => { const t = tag; return execFileSync('git', argv); };\n", [['h:param-outside-spawn'], 1], 'not an alias: a parameter that reaches neither the argv nor the options slice belongs to some other question'],
    ["const h = (x) => x + 1;\n", [['h:no-git-spawn'], 1], 'not an alias: the body never spawns git'],
    ["const h = (o) => execFileSync('git');\n", [['h:no-git-spawn'], 1], 'the slice finder keys on the comma after the program literal, so a git spawn that states no argv at all is invisible to it and reads as no-git-spawn — recorded rather than fixed, because a reason with no reachable shape is a reason the fixture list cannot test'],
    ["const h = (args) => { /* execFileSync('git', ['-C', dir]) is only an example here */ return 0; };\n", [['h:no-code-position-git-spawn'], 1], 'amendment 100: a candidate whose only spawn is a COMMENT is no longer refused for a flag it never passes — it stops being a candidate, because the arm now asks whether this text reaches a git child at CODE POSITION'],
    ["const h = () => { const doc = `execFileSync('git', ['-C', dir])`; return doc; };\n", [['h:no-code-position-git-spawn'], 1], 'and the same when the spawn lives in a STRING: the redirect flag is quoted inside a mention, so there is no helper here at all, only a sentence about one'],
  ];
  let exact10 = 0;
  for (const [src, want, why] of cases) {
    const got = ONE(src);
    if (JSON.stringify(got) === JSON.stringify(want)) exact10++;
    console.log(`  ${JSON.stringify(got) === JSON.stringify(want) ? 'ok  ' : 'MISS'} ${why} → ${JSON.stringify(got)} (want ${JSON.stringify(want)})`);
  }
  assert.equal(exact10, cases.length, `the verdict channel answered ${cases.length - exact10} of ${cases.length} reasons differently than this row predicts — and a reason with no fixture is a reason the census can hide in`);
  const REAL = "const h = (...args) => execFileSync('git', args);\n";
  const COMMENTED = REAL.replace("execFileSync('git', args);", "/* execFileSync('git', args) */ 0;");
  assert.notEqual(COMMENTED, REAL, '(§10) the comment mutation found nothing to wrap, so the pair below checks nothing');
  assert.deepEqual([ONE(REAL)[0], ONE(COMMENTED)[0]], [['h'], ['h:no-code-position-git-spawn']], '(§10) same helper name, same parameter, same argv slice — the ONLY difference is that one spawn is commented out, and that is enough to move it from READABLE to a candidate that never existed: this pair is the defect amendment 100 counted, kept measured by the two sources that differ by nothing else');
  const EXERCISED = new Set(cases.map(([, w]) => w[0]).flat().filter((x) => x !== 'h').map((x) => x.slice(2)));
  for (const r of rows) {
    const n = basename(r.path);
    const v = sw.aliasVerdicts(r.text);
    const d = sw.definitions(r.text);
    const spoken = [...v.readable, ...v.refused, ...v.notAlias].map((x) => x.at).sort((a, b) => a - b);
    assert.equal(spoken.length, d.length, `${n}: ${d.length} definitions but ${spoken.length} verdicts — a helper the arm neither read nor named`);
    assert.deepEqual(spoken, d.map((x) => x.at).sort((a, b) => a - b), `${n}: the verdicts are not the definitions — some definition was counted twice or dropped`);
    assert.deepEqual([...new Set([...v.refused, ...v.notAlias].map((x) => x.why))].filter((w) => !EXERCISED.has(w)), [], `${n}: a reason reached the census that §10 has no fixture for, so the filter list and the tested list have desynced (exercised: ${JSON.stringify([...EXERCISED].sort())})`);
  }
  const census = rows.reduce((t, r) => { const v = sw.aliasVerdicts(r.text); t.readable += v.readable.length; for (const x of v.refused) t.refused[x.why] = (t.refused[x.why] ?? 0) + 1; for (const x of v.notAlias) t.notAlias[x.why] = (t.notAlias[x.why] ?? 0) + 1; return t; }, { readable: 0, refused: {}, notAlias: {} });
  const spokenTotal = census.readable + Object.values(census.refused).reduce((a, b) => a + b, 0) + Object.values(census.notAlias).reduce((a, b) => a + b, 0);
  const defTotal = rows.reduce((a, r) => a + sw.definitions(r.text).length, 0);
  assert.equal(spokenTotal, defTotal, `the population has ${defTotal} definitions and the arm speaks ${spokenTotal} verdicts — silence is ${defTotal - spokenTotal} helpers deep`);
  // Amendment 101's addendum: this census is over a population that CONTAINS THIS ROW, so its total moves every time
  // the row is edited, and a previous run's number is a measurement of a different tree. So the total is anchored to
  // the ref it was counted at, recounted from `git show` rather than from the array the census already holds, and the
  // self-inclusion is graded with a sentinel rather than asserted in prose.
  const rev = git('rev-parse', 'HEAD').trim();
  const recount = rows.reduce((a, r) => a + sw.definitions(norm(git('show', `${rev}:${r.path}`))).length, 0);
  assert.equal(recount, defTotal, `the census holds ${defTotal} definitions from the loaded population but ${recount} from git show ${rev.slice(0, 12)} — the totals are not counting the same tree`);
  const self = rows.find((r) => basename(r.path) === 'confession-proof.mjs');
  assert.ok(self, 'this row is not in its own population, so the sentinel below would grade nothing');
  const grown = self.text + '\nconst SENTINEL_FOR_THE_CENSUS_SEES_ITSELF = (x) => x;\n';
  assert.equal(sw.definitions(grown).length, sw.definitions(self.text).length + 1, 'adding one function to THIS row did not move the census total by one — so the row is not being counted in its own population and the stale-base lesson above is prose, not a measurement');
  console.log(`[§10] verdict channel: ${exact10}/${cases.length} reasons each carry their own fixture · population of ${rows.length} rows speaks ${spokenTotal}/${defTotal} definitions counted at ${rev.slice(0, 12)} (recounted from git show: ${recount}; a sentinel added to this row alone moves it to ${sw.definitions(grown).length + defTotal - sw.definitions(self.text).length}) — readable ${census.readable}, refused ${JSON.stringify(census.refused)}, not-an-alias ${JSON.stringify(census.notAlias)} — so the ceiling's third face is now a list of reasons, not an adjective`);
}
console.log(`\n[summary] two witnesses for ${clauses.length} confessions: ${selfNamed.length} commands the runner can name in its own file, ${byState('supported').length} clauses corroborated by a body and ${byState('invisible').length} that hide one frame up — of which ${misCited.length} were the sentence's fault (citable) and ${unreadable.length} are the arm's ceiling (${JSON.stringify(deadVerbs)}), so the residual is now a measurement rather than a shrug · ${namedCases.length} naming cases held the free-text grammar (one of them recorded as a false negative rather than fixed), and the cause arm reddened under exactly one of the mutations it was shown — the omission. A surplus is stated, never scored. The wiring is graded too: §6 reproduces the lookup that killed a seven-minute census on 6807ba1 in one line, and shows a reader keyed by the wrong path ending cannot hide behind its own zero. §9 makes the axis's OWN explanation carry a witness: its ceiling sentence interpolates aliasCeiling, and the two faces it counts differ in who can close them — a row's own edit lifts a declined clause, no row edit lifts an unseen one. Two gates print after the rows: the sweep's omissions + silent blind spots at zero, and this row's mis-cited clauses at zero`);
