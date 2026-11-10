#!/usr/bin/env node
// NEXUS M2 v596 (docs/evidence) -- RECORD REPAIR GRADED: the repairer that points
// docs/evidence/agents/record-encoding-proof.mjs's writer model the other way, graded against the grader it
// must agree with rather than against a second hand-written copy of its rules.
// Run from the repository root, after nothing in particular (no build, no daemon, no network):
//   node docs/evidence/agents/record-repair-proof.mjs
//
// WHAT THIS ROW CHARGES. tools/ci/record-encoding-repair.mjs answers "what did the author type" about a line
// the shipped row answers "is this record damaged" about, and the two answers share one grammar: the
// alphabet, the four writer mechanisms, the render registry and the flank rule. That sharing is the whole
// safety of a repairer. A repairer that charges a line the grader would spare EDITS PROSE NOBODY FLAGGED; a
// repairer that spares a line the grader charges leaves the row red for a reason no diff explains; and a
// repairer whose registry drifted slightly is invisible in BOTH directions until someone trusts it with a
// write. So S1 does not compare two descriptions of a model: it reads the grader's OWN BYTES, slices the
// model region out of them, evaluates it, and requires (a) that every shared declaration is the same text
// modulo whitespace, the export keyword and the one licensed extra field, and (b) that the two charge rules
// return the same site list, line by line, over a corpus and over the whole tree.
// Measured while landing this: the first version of the tool differed from its grader in four places -- a
// different alphabet (it named U+2264/U+2265/U+2248 and omitted U+00B9/U+2122/U+2022), a GBK table built
// WITH the trail byte the row skips, U+FFFD split into one site per character instead of a run, and a
// fatal UTF-8 decoder. Every one of them was silent, and the first two left 48 sites charged that the row
// calls clean, which is a repairer editing text nobody flagged. S1's arms below re-inflict those shapes on
// purpose and require the door to fire.
//
// WHY A 0 IN THE CENSUS NEEDS A WITNESS. A clean S2 buys two different stories: the record really is clean,
// or the graded names quietly stopped including the directory that holds the damage. `ee96711` (subject
// "'v602'") proves the second story happens. One broad add tracked 110 `.nexus-tmp/` files plus three root
// console captures, and every push since has been RED on the shipped encoding gate -- 2545 chargeable lines
// / 34999 sites, which this tool reads in full and declines 30074 of, because a capture whose bytes ARE the
// damage has no honest glyph to restore. The repair was to stop tracking them. So S2b requires that
// exclusion to be something `git check-ignore` answers with rather than a sentence in a commit message, then
// writes a damaged plant INTO that very directory and requires the census to charge it: the untracking moved
// those bytes out of the record, and must not have moved the scan's reach with them.
//
// WHY A REFUSAL IS A RESULT AND NOT A WARNING. The image a writer channel leaves does not name its
// producer: a three-byte punctuation char renders the SAME two characters as an em dash, an en dash, an
// ellipsis or one of four quotes, and it eats whichever ASCII byte followed it (all 96, measured by the
// shipped row's S1). The tool decides from the record's own habits through a ladder -- UNIQUE, then a
// 20x-attested ' GLYPH ' habit, then the follower census -- and below the floor it declines the site
// and writes NOTHING for the file. S4 arms both halves: an ambiguous file is refused, declined by the CLI
// with exit 1 and left BYTE-IDENTICAL; the same file with an attested habit is repaired. A tool that
// guessed would be worse than the damage it removed, because a guessed glyph is a second defect a plain
// diff cannot see.
//
// AND A CENSUS IS A WITNESS ONLY ABOUT THE SITES THAT MATCH IT. The first S3 run over real records caught
// this tool over-repairing: docs/KNOWN_ISSUES.md holds "Amendments 2<en dash>3", the image its dash leaves is
// one of the eight producers can spell, and that file's 48 em-dash attestations decided the site into
// "2<em dash> 3" -- the wrong glyph on top of a space the record never had. The spaced habit predicts a space
// on the glyph's LEFT, and that space is still in the damaged bytes, so the site's own left character is
// evidence a file-level count may not overrule. S4 arms that exact shape: the site must be declined, the
// refusal must print the character it found, and the line must come back unchanged. Measured while landing
// this: the guard fires on 16 of the 409 declines taken across every plantable line of the tracked records,
// so it is precise rather than a way to make the tool refuse its job, and S3 prints the same tally on the
// eight files it plants so a reader sees which channel is declining, not only that something declined.
//
// WHY THE LOOP IS GRADED, NOT ASSUMED. The flank rule spares a render whose tight neighbour is CJK, so a
// damaged dash sitting in front of a damaged section sign is invisible until the sign behind it is put back.
// The real record needed 79 sites, then 1, then 0 -- three passes over the same file -- which is why the
// repair runs to a fixed point. S5 builds that shelter on purpose from two damages side by side and requires
// the scan to SEE both forms while charging one, and then requires the loop to make MORE edits than there
// were chargeable sites when it started: a tool that stopped after pass one would have called the file clean.
//
// WHY THE ROUND-TRIP IS OVER REAL RECORDS. S3 damages lines taken from the repository's own records by
// running them through the forward model, repairs the whole file, and requires the bytes that come back to
// be the bytes that went in. A plant that comes back CHANGED without a refusal naming it is a silent wrong
// repair, and that is the failure this row exists to catch; a plant that comes back untouched with a
// refusal is the tool declining honestly, and is counted, not punished.
// The budget is the default (240000 ms watched against a 17.9 s wall run): declaring the default is
// decoration, so this file says nothing. A declaration that changes nothing is noise the sweeper must ignore.
// sweep-asks-repository: git ls-files -z -- the population is read the way the shipped row reads it, through
// spawnSync below, whose program position is a literal this row's own scanner cannot see past; the bytes
// under test are read off disk and never written: every file this row writes for the CLI arms lands in a
// fresh mkdtemp directory OUTSIDE the repository, plus ONE plant written inside the repository's ignored
// scratch namespace (S2b), which the row deletes before it exits -- and S2b is the clause that proves that
// namespace is ignored by a rule git can read, so the plant can never be swept into a lane's commit.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const ROW = 'docs/evidence/agents/record-encoding-proof.mjs';
const SELF = 'docs/evidence/agents/record-repair-proof.mjs';
const TOOL = 'tools/ci/record-encoding-repair.mjs';
const cps = (s) => [...s];
const str = (a) => String.fromCodePoint(...a);
const DASH = str([0x2014]), ENDASH = str([0x2013]), SECT = str([0x00a7]);
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const key = (sites) => sites.map((s) => `${s.at}|${s.len}|${s.kind}|${s.why}`).join(',');

const tool = await import(pathToFileURL(join(root, TOOL)).href);
assert.ok(typeof tool.chargeable === 'function' && Array.isArray(tool.ALPHA_CP) && typeof tool.repairToFixedPoint === 'function',
  'the repairer must export the model it repairs with and the loop that settles it -- a tool whose grammar is private cannot be graded against its grader');

/**
 * A model, read out of the file's OWN BYTES: the region from the U+FFFD spelling to the charge predicate,
 * with the region's single-line assertion and console statements removed -- they grade a row, they are not
 * part of the grammar. Stripping is only safe while each of those sits on its own line, so that shape is
 * asserted rather than assumed: a future multi-line assert inside the model region reds THIS clause and
 * names the line, instead of evaluating a fragment and grading a truncated rule.
 */
function modelOf(rel) {
  const lines = readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/^export /, ''));
  const from = lines.findIndex((l) => /^const FF = /.test(l));
  const to = lines.findIndex((l) => /^const isCharged = /.test(l));
  assert.ok(from >= 0 && to > from, `${rel}: the model region (const FF -> const isCharged) was not found (${from}, ${to}) -- the grader and the repairer are no longer written in the same shape, and this row refuses to guess where the grammar moved to`);
  const kept = [], dropped = [];
  for (let i = from; i <= to; i++) {
    if (/^assert\./.test(lines[i]) || /^console\.log\(/.test(lines[i])) { dropped.push(lines[i]); continue; }
    kept.push(lines[i]);
  }
  assert.ok(dropped.every((l) => l.trimEnd().endsWith(');')),
    `${rel}: a stripped line is not a self-contained statement (${dropped.filter((l) => !l.trimEnd().endsWith(');')).slice(0, 2).map((l) => JSON.stringify(l.slice(0, 60))).join(' | ')}) -- the slice would cut a sentence in half`);
  let model;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- 这条证明的活就是把切出来的模型区域求值出来；不求值就证明不了切片边界对不对。
    model = new Function(`${kept.join('\n')}
return { ALPHA_CP, ALPHA, GBK_BYTES, m1, m2, m1whole, m2whole, RENDER, RENDERS, HEADS, spans, cls, tightCls, chargeable, isCharged };`)();
  } catch (e) {
    assert.fail(`${rel}: the sliced model region does not evaluate (${e.message}) -- the region's boundaries are wrong, not the model's contents`);
  }
  assert.equal(model.chargeable('plain ascii line').length, 0, `${rel}: the sliced region must yield a charge rule that reads clean text as clean`);
  assert.equal(model.chargeable(str([0x9225, 0x3f])).length, 1, `${rel}: and it must charge the em dash's recorded GLUE image`);
  return { lines, model, stripped: dropped.length };
}

// -- S1 the model is COPIED, block by block, and the two readers decide the same sites ------------------
const grader = modelOf(ROW);
const repairer = modelOf(TOOL);

/** one top-level declaration's own text, from its anchor line to the line that closes it */
function declOf(lines, anchor, kind) {
  const s = lines.findIndex((l) => anchor.test(l));
  assert.ok(s >= 0, `both files must declare ${anchor}`);
  let e = s;
  if (kind === 'brace') {
    for (let i = s; i < lines.length; i++) { const t = lines[i].trim(); if (t === '}' || t === '};') { e = i; break; } }
  } else if (kind === 'end') {
    for (let i = s; i < lines.length; i++) { const t = lines[i].trim(); if (t.endsWith(';') || t === '}') { e = i; break; } }
  }
  return lines.slice(s, e + 1).filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join(' ').replace(/\s+/g, ' ').trim();
}
const BLOCKS = [
  ['FF', /^const FF = /, 'end'],
  ['cps', /^const cps = /, 'end'],
  ['str', /^const str = /, 'end'],
  ['code', /^const code = /, 'end'],
  ['GBK decoder', /^const gbk = /, 'end'],
  ['UTF-8 decoder', /^const utf8dec = /, 'end'],
  ['g1', /^const g1 = /, 'end'],
  ['ALPHA_CP', /^const ALPHA_CP = /, 'end'],
  ['GBK table', /^for \(let lead = 0x81/, 'brace'],
  ['m1', /^function m1\(/, 'brace'],
  ['fold', /^const fold = /, 'end'],
  ['m2', /^function m2\(/, 'brace'],
  ['m1whole', /^function m1whole\(/, 'brace'],
  ['m2whole', /^function m2whole\(/, 'brace'],
  ['put', /^const put = /, 'brace'],
  ['registry', /^for \(const ch of ALPHA\) \{/, 'brace'],
  ['RENDERS', /^const RENDERS = /, 'end'],
  ['HEADS index', /^for \(const r of RENDERS\) \{/, 'brace'],
  ['HEADS order', /^for \(const v of HEADS\.values\(\)\)/, 'end'],
  ['spans', /^function spans\(/, 'brace'],
  ['cls', /^const cls = /, 'end'],
  ['tightCls', /^const tightCls = /, 'end'],
  ['toChars', /^const toChars = /, 'end'],
  ['chargeable', /^function chargeable\(/, 'brace'],
  ['isCharged', /^const isCharged = /, 'end'],
];
/** the licensed difference: the repairer annotates every render site with the producers the ladder reads */
const licensed = (t) => t.replace(/, producers: \[\]/g, '').replace(/, producers: RENDER\.get\(s\.img\) \?\? \[\]/g, '');
function driftOf(toolLines) {
  const out = [];
  for (const [name, anchor, kind] of BLOCKS) {
    const a = declOf(grader.lines, anchor, kind);
    const b = licensed(declOf(toolLines, anchor, kind));
    if (a !== b) out.push(name);
  }
  return out;
}
const drift = driftOf(repairer.lines);
assert.deepEqual(drift, [], `${drift.length} model block(s) (${drift.join(', ')}) are NOT the grader's own text -- a repairer that reads the grammar differently can restore a glyph the grader never charged, or spare one it charges, and neither shows up in a diff`);
assert.deepEqual(grader.model.ALPHA_CP, repairer.model.ALPHA_CP, 'the declared alphabet must agree in content AND in order');
assert.equal(tool.ALPHA_CP.length, grader.model.ALPHA_CP.length, 'the exported alphabet is the sliced one, not a second copy');
assert.equal(tool.REGISTRY_SIZE, grader.model.RENDERS.length, `the render registry must hold the same number of spellings (${tool.REGISTRY_SIZE} vs ${grader.model.RENDERS.length})`);
assert.equal(tool.GBK_PAIRS, grader.model.GBK_BYTES.size, `the GBK table must hold the same lead/trail pairs (${tool.GBK_PAIRS} vs ${grader.model.GBK_BYTES.size})`);

// the door itself, armed: each of the four drifts this landing actually hit has to be CAUGHT, or the clause
// is a description of a defect class rather than a guard against it.
const ARMS = [
  ['a codepoint swapped into the alphabet', (l) => l.map((x) => (/^const ALPHA_CP = /.test(x) ? x.replace('0x2014', '0x2264') : x))],
  ['the trail byte the grader skips', (l) => l.map((x) => (/^\s*if \(trail === 0x7f\) continue;/.test(x) ? '' : x))],
  ['U+FFFD split per character instead of a run', (l) => l.map((x) => (/if \(c === FF\) \{ let e = i;/.test(x)
    ? '    if (c === FF) { out.push({ at: i, img: c, kind: \'render\', len: 1 }); i++; continue; }' : x))],
  ['a fatal UTF-8 decoder', (l) => l.map((x) => (/^const utf8dec = new TextDecoder\('utf-8'\);/.test(x) ? `const utf8dec = new TextDecoder('utf-8', { fatal: true });` : x))],
];
for (const [what, mutate] of ARMS) {
  const caught = driftOf(mutate(repairer.lines));
  assert.ok(caught.length >= 1, `the door did not fire on ${what} (${caught.length} block(s) named) -- the copy check would grade a copy of its own rule and call a drifted tool clean`);
}

// ... and the two readers must decide the same SITES, not merely be written the same way.
const corpus = [];
for (const rel of [ROW, TOOL, 'docs/evidence/ci/README.md', 'docs/decisions/0016-agent-runtime-hermetic-demo-loop.md']) {
  for (const l of readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n').split('\n')) corpus.push(l);
}
for (const g of grader.model.ALPHA) {
  for (const f of [' ', '4', 'x', '.', '-', '"']) {
    corpus.push(`the gate holds ${grader.model.m1whole(`a ${g}${f} b`)} c`);
    corpus.push(`the gate holds ${grader.model.m2whole(`a ${g}${f} b`)} c`);
    corpus.push(`sheltered ${str([0x4e2d, 0x6587])}${grader.model.m1whole(g)}${str([0x4e2d, 0x6587])} tail`);
  }
}
let siteDiff = 0;
const siteFails = [];
for (const l of corpus) {
  const a = key(grader.model.chargeable(cps(l))), b = key(tool.chargeable(l));
  if (a !== b) { siteDiff++; if (siteFails.length < 3) siteFails.push(`${JSON.stringify(l.slice(0, 60))} :: grader [${a}] :: repairer [${b}]`); }
}
assert.equal(siteDiff, 0, `${siteDiff} corpus line(s) charged differently by the two readers -- ${siteFails.join(' | ')}`);
const corpusCharged = corpus.filter((l) => tool.chargedSites(l).length).length;
const corpusRejected = corpus.reduce((n, l) => n + tool.chargeable(l).filter((s) => s.why.startsWith('REJECTED')).length, 0);
assert.ok(corpusCharged > 20 && corpusRejected > 20,
  `the corpus must exercise BOTH ends of the rule (charged ${corpusCharged} line(s), flank-rejected ${corpusRejected} site(s)) -- agreement on clean text alone grades nothing`);
console.log(`[1] model copied: ${BLOCKS.length} blocks identical, ${ARMS.length}/${ARMS.length} drift arms caught, alphabet ${grader.model.ALPHA_CP.length} chars, registry ${tool.REGISTRY_SIZE}, ${tool.GBK_PAIRS} GBK pairs, ${corpus.length} lines read twice with 0 disagreements (${corpusCharged} charged lines / ${corpusRejected} rejected sites)`);

// -- S2 the tree, counted twice: the row's own population, two readers, and the number that is zero ------
const ls = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
assert.equal(ls.status, 0, `git ls-files failed (${ls.status}) -- this row grades the tree the commit owns`);
const names = ls.stdout.split('\0').filter(Boolean);
const isBinary = (b) => (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
  || [...b.subarray(0, Math.min(b.length, 8192))].some((x) => x === 0);
let graded = 0, treeDiff = 0, chargedLines = 0, chargedSites = 0, formHits = 0, rejectedSites = 0;
const treeFails = [];
for (const rel of names) {
  let buf;
  try { buf = readFileSync(join(root, rel)); } catch { continue; }
  if (isBinary(buf)) continue;
  graded++;
  for (const l of buf.toString('utf8').replace(/\r\n/g, '\n').split('\n')) {
    const b = tool.chargeable(l);
    if (key(grader.model.chargeable(cps(l))) !== key(b)) {
      treeDiff++;
      if (treeFails.length < 4) treeFails.push(`${rel} :: ${JSON.stringify(l.slice(0, 70))}`);
    }
    if (!b.length) continue;
    formHits++;
    rejectedSites += b.filter((s) => s.why.startsWith('REJECTED')).length;
    const c = b.filter(tool.isCharged);
    if (c.length) { chargedLines++; chargedSites += c.length; }
  }
}
assert.equal(treeDiff, 0, `${treeDiff} line(s) of the tracked tree charged differently by the two readers -- ${treeFails.join(' | ')}`);
assert.ok(graded > 400, `the census must read the whole tree, not a window (${graded} files of ${names.length} names)`);
assert.equal(chargedLines, 0, `${chargedLines} line(s) still carry chargeable damage (${chargedSites} sites) -- either the repairer and its grader disagree about what is left, or a writer channel struck again since the last landing: run node ${TOOL} --plan`);
assert.ok(rejectedSites > 20, `the flank rule must still be SEEING look-alikes in the tree (${rejectedSites} rejected sites) -- a 0 here means the registry stopped matching and the green above is vacuous`);
console.log(`[2] tree: ${graded}/${names.length} files graded by both readers, ${formHits} form-bearing lines, ${rejectedSites} flank-rejected sites, ${chargedLines} charged lines, 0 reader disagreements`);

// -- S2b the population is excluded by a RULE, and the scan still REACHES the directory it skips ---------
// A 0 above can be bought two ways: the record really is clean, or the graded names quietly stopped
// including the directory that holds the damage. Only the first is a repair, so the second is measured
// away here. `ee96711` (subject "'v602'") is not a hypothetical: it swept 110 `.nexus-tmp/` files plus three
// root console captures into the tracked record, and every push since has been RED on the shipped encoding
// gate -- 2545 chargeable lines / 34999 sites, of which this landing's own repairer reads all 34999 and
// DECLINES 30074, because a console capture whose bytes ARE the damage has no honest glyph to restore. The
// only true repair was to stop tracking them. And a stop that no one can read is one `git add -A` away from
// undoing itself, so the exclusion must be a rule `git check-ignore` answers with -- while the reader is
// made to fire inside the very directory it now skips, so a future green cannot be bought by going blind.
const SCRATCH_NS = '.nexus-tmp';
const SWEPT_LOGS = ['run-result.txt', 'test_output.txt', 'test-output.txt'];
const sweptIn = names.filter((n) => n === SCRATCH_NS || n.startsWith(`${SCRATCH_NS}/`) || SWEPT_LOGS.includes(n));
assert.deepEqual(sweptIn, [], `${sweptIn.length} scratch path(s) (${sweptIn.slice(0, 3).join(', ')}) are still in the graded population -- the record-encoding gate is red for bytes that are not evidence, and no repair channel can clear a console capture`);
const ignoreRules = readFileSync(join(root, '.gitignore'), 'utf8').replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
for (const rule of [`${SCRATCH_NS}/`, ...SWEPT_LOGS])
  assert.ok(ignoreRules.includes(rule), `.gitignore does not name ${rule} -- an exclusion that lives only in a commit message is a memory, not a rule, and the next broad add sweeps the bytes back into the record`);
const ignoredBy = (p) => { const r = spawnSync('git', ['check-ignore', '-v', p], { cwd: root, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
assert.equal(ignoredBy('docs/evidence/agents/sweep.mjs'), null, 'git check-ignore claims a graded row is ignored -- every exclusion above would then be worthless, because the reader reports everything and nothing');
for (const p of SWEPT_LOGS) {
  const v = ignoredBy(p);
  assert.ok(v && v.includes('.gitignore:'), `git check-ignore does not attribute ${p} to .gitignore (${JSON.stringify(v)}) -- the file is untracked by accident, not by a rule a later reader can see`);
}
const plantRel = `${SCRATCH_NS}/reach-plant-v596.txt`;
const plantDir = join(root, SCRATCH_NS);
const madePlantDir = !existsSync(plantDir);
mkdirSync(plantDir, { recursive: true });
const plantAbs = join(root, plantRel);
let plantLines = 0, plantSites = 0, plantDisagree = 0;
const nsRule = ignoredBy(plantRel);
try {
  writeFileSync(plantAbs, `# a plant this row owns and deletes: ${tool.m1whole(`Studio 474 ${DASH} 483 files`)}\nand a clean tail line\n`, 'utf8');
  assert.ok(nsRule && /^\.gitignore:\d+:\.nexus-tmp\/\t/.test(nsRule), `the plant written into ${SCRATCH_NS}/ is not ignored there (${JSON.stringify(nsRule)}) -- if it is not ignored, this row has just handed a scratch file to whichever lane commits next`);
  for (const l of readFileSync(plantAbs, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    const b = tool.chargeable(l);
    if (key(grader.model.chargeable(cps(l))) !== key(b)) plantDisagree++;
    const c = b.filter(tool.isCharged);
    if (c.length) { plantLines++; plantSites += c.length; }
  }
  assert.equal(plantDisagree, 0, `${plantDisagree} line(s) of the plant charged differently by the two readers -- the agreement measured on the record must hold on the scratch too`);
  assert.ok(plantSites > 0, `the census read a damage plant it had written itself and charged 0 sites -- that is not a clean record, that is a blind scan, and the 0 in S2 above would mean nothing`);
} finally {
  rmSync(plantAbs, { force: true });
  if (madePlantDir) rmSync(plantDir, { recursive: true, force: true });
}
const incidentPaths = [`${SCRATCH_NS}/mojibake-hits.txt`, `${SCRATCH_NS}/chargeable.txt`, ...SWEPT_LOGS];
const onDisk = incidentPaths.filter((p) => existsSync(join(root, p)));
let onDiskCharged = 0;
for (const p of onDisk) for (const l of readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n').split('\n')) if (tool.chargedSites(l).length) onDiskCharged++;
console.log(`[2b] scratch kept out by a rule git can read (${nsRule}): the same reader charges ${plantLines} planted line(s) / ${plantSites} site(s) inside ${SCRATCH_NS}/, and ${onDiskCharged} damage line(s) still sit on disk in ${onDisk.length}/${incidentPaths.length} of the 'v602' bytes without entering the population`);

// -- S3 planted into real records: the bytes that come back are the bytes that went in ------------------
const ALPHA = new Set(tool.ALPHA);
const candidates = [];
for (const rel of names.filter((r) => r.endsWith('.md'))) {
  const lines = readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const hits = [];
  lines.forEach((l, i) => {
    const cs = cps(l);
    if (cs.filter((c) => ALPHA.has(c)).length !== 1) return;
    if (cs.some((c) => c.codePointAt(0) > 0x7f && !ALPHA.has(c))) return;
    if (tool.chargedSites(l).length) return;
    if (tool.chargedSites(tool.m1whole(l)).length !== 1) return;
    hits.push({ rel, i, l });
  });
  if (hits.length >= 4) candidates.push(hits);
}
assert.ok(candidates.length >= 3, `the round-trip needs real records to plant into (${candidates.length} candidate file(s) with 4+ plantable lines)`);
candidates.sort((a, b) => (a[0].rel < b[0].rel ? -1 : 1));
const picked = candidates.slice(0, 8);
let attempted = 0, recovered = 0, declined = 0, maxPass = 1;
const declineKinds = {};
const channels = new Set();
const silent = [];
for (const hits of picked) {
  const rel = hits[0].rel;
  const original = readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
  const lines = original.split('\n');
  const stride = Math.max(1, Math.floor(hits.length / 12));
  const planted = [];
  for (let k = 0; k < hits.length && planted.length < 12; k += stride) {
    const h = hits[k];
    const d = tool.m1whole(h.l);
    if (d === h.l) continue;
    lines[h.i] = d;
    planted.push(h);
  }
  if (!planted.length) continue;
  attempted += planted.length;
  const out = tool.repairToFixedPoint(lines.join('\n'));
  for (const r of out.refused) { const k = (r.split(' -- ')[1] || r).slice(0, 24).trim(); declineKinds[k] = (declineKinds[k] || 0) + 1; }
  maxPass = Math.max(maxPass, out.passes);
  const back = out.text.split('\n');
  let lost = 0;
  for (const h of planted) {
    if (back[h.i] === h.l) recovered++;
    else { lost++; declined++; }
  }
  for (const e of out.edits) {
    channels.add(e.channel.split('+')[0]);
    assert.ok(/^(UNIQUE|SPACED|FOLLOWER)/.test(e.channel), `${rel}: an edit must name the channel that decided it, got ${JSON.stringify(e.channel)}`);
    assert.ok(ALPHA.has(cps(e.to)[0]), `${rel}: every restored producer must be a declared alphabet character, got ${JSON.stringify(e.to)}`);
  }
  assert.ok(out.refused.length >= lost, `${rel}: ${lost} planted line(s) came back CHANGED with only ${out.refused.length} refusal(s) to account for them -- a plant that is neither recovered nor declined is a repair to something other than what the record's habits say`);
  const again = tool.repairToFixedPoint(out.text);
  assert.equal(again.edits.length, 0, `${rel}: repairing a repaired record made ${again.edits.length} edit(s) -- the ladder is not idempotent, so a second run would keep editing prose`);
}
assert.deepEqual(silent, [], silent.join(' | '));
assert.ok(recovered >= 20, `the round-trip must carry weight (${recovered} of ${attempted} planted lines came back byte-exactly) -- a handful of recoveries would grade the sample, not the repair`);
assert.ok(channels.size >= 2, `at least two channels must be exercised over the real records (saw ${[...channels].join(', ') || 'none'}) -- one channel means the ladder was never walked`);
console.log(`[3] round-trip: ${attempted} real record line(s) damaged by the forward model over ${picked.length} files, ${recovered} back byte-exactly, ${declined} declined with a named refusal, channels ${[...channels].sort().join('/')}, declines ${Object.entries(declineKinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(' ')}`);
const witnessDeclined = Object.entries(declineKinds).filter(([k]) => /cannot witness/.test(k)).reduce((n, [, v]) => n + v, 0);

// -- S4 a site the evidence does not decide is DECLINED, and nothing is written ------------------------
const AMBIG = 5, ATTESTED = 30;
const plant = `the gate holds ${tool.m1whole(`a ${DASH} b`)} c`;
assert.equal(tool.chargedSites(plant).length, 1, 'the plant must be one charged site before the ladder is asked about it');
const habit = (glyph, n) => Array.from({ length: n }, (_, i) => `note ${i}: word ${glyph} word`).join('\n');
const ambiguous = `# file\n${habit(DASH, AMBIG)}\n${habit(ENDASH, AMBIG)}\n${plant}\ntail\n`;
const amb = tool.planText(ambiguous);
assert.equal(amb.edits.length, 0, `an ambiguous site must produce no edit (${amb.edits.length})`);
assert.equal(amb.refused.length, 1, `the ambiguous site must be named among the refusals (${amb.refused.length})`);
assert.ok(/SPACED census disagrees/.test(amb.refused[0]), `the refusal must say which channel failed and what it saw: ${amb.refused[0]}`);
assert.equal(amb.text, ambiguous, 'a refused plan must not touch a single byte of the text');
const attested = `# file\n${habit(DASH, ATTESTED)}\n${plant}\ntail\n`;
const decided = tool.repairToFixedPoint(attested);
assert.equal(decided.refused.length, 0, `the same site with an attested habit must be decided (${decided.refused.join(' | ')})`);
assert.ok(decided.text.includes(`${DASH} b`), 'the attested habit restores the glyph AND the follower the writer ate');
assert.equal(decided.edits[0].channel.split('+')[0], 'SPACED', 'a site decided by the space census names SPACED');
// The site's own bytes outrank the file's habit. This is the defect the first S3 run found on REAL records:
// docs/KNOWN_ISSUES.md carried "Amendments 2<en dash>3", M1 ate the digit, and the file's dominant
// "em dash + space" census repaired it to a space-flanked em dash -- a plausible character that no byte in
// the record supports, invisible to a diff. A census witnesses the sites that match it, so a site whose own
// left neighbour is not that space must be DECLINED with the reason named.
const rangedLine = `ADR 0005 Amendments 2${ENDASH}3):** the renderer`;
assert.equal(tool.chargedSites(tool.m1whole(rangedLine)).length, 1, 'the range plant must charge exactly one site before the ladder is asked about it');
const ranged = `# file\n${habit(DASH, ATTESTED)}\n${tool.m1whole(rangedLine)}\ntail\n`;
const rPlan = tool.planText(ranged);
assert.equal(rPlan.edits.length, 0, `the dominant spaced habit must not repair a site it cannot witness (${JSON.stringify(rPlan.edits.map((e) => `${e.line}:${e.to}`))}) -- this is the over-repair, and it is the reason this arm exists`);
assert.ok(rPlan.refused.some((r) => /SPACED cannot witness this site/.test(r) && /"2"/.test(r)), `the refusal must name the failed witness and print the character sitting on the site's left: ${rPlan.refused.join(' | ')}`);
const rFixed = tool.repairToFixedPoint(ranged);
assert.equal(rFixed.text.split('\n')[ATTESTED + 1], tool.m1whole(rangedLine), 'a declined range site stays exactly as damaged as it was found -- the record keeps saying it does not know');
assert.equal(rFixed.text, ranged, 'a plan that refuses must not move a single byte elsewhere in the file');
// two further classes the ladder must decline rather than invent: a control written over a character, and a
// run of replacement characters longer than any single producer can spell.
const ctrl = `a word${str([0x0d])}easured here\n`;
const ctrlPlan = tool.planText(ctrl);
assert.equal(ctrlPlan.edits.length, 0, 'a C0 control is not a punctuation glyph and no channel may restore it');
assert.ok(/control/.test(ctrlPlan.refused[0]), `the control refusal must say so: ${ctrlPlan.refused[0]}`);
const run4 = `two damages side by side ${str([0xfffd, 0xfffd, 0xfffd, 0xfffd])} tail\n`;
const runPlan = tool.planText(run4);
assert.equal(runPlan.edits.length, 0, 'a U+FFFD run longer than any producer spells is declined, not truncated into a guess');
assert.ok(/no registered producer/.test(runPlan.refused[0]), `the run refusal must say so: ${runPlan.refused[0]}`);
// the CLI keeps the same promise on disk, outside the repository: a declined file is left byte-identical.
const dir = mkdtempSync(join(tmpdir(), 'nexus-record-repair-'));
try {
  writeFileSync(join(dir, 'ambiguity.md'), ambiguous, 'utf8');
  const before = sha(readFileSync(join(dir, 'ambiguity.md')));
  const w = spawnSync(process.execPath, [join(root, TOOL), '--write', 'ambiguity.md'], { cwd: dir, encoding: 'utf8' });
  assert.equal(w.status, 1, `a --write that declined the only site must exit 1, not 0 (${w.status}) -- "no traceback" is not "the record is clean": ${w.stdout}`);
  assert.ok(/REFUSED to write/.test(w.stdout), `the CLI must name the file it declined: ${w.stdout}`);
  assert.equal(sha(readFileSync(join(dir, 'ambiguity.md'))), before, 'a declined write must leave the file byte-identical');
  writeFileSync(join(dir, 'attested.md'), attested, 'utf8');
  const w2 = spawnSync(process.execPath, [join(root, TOOL), '--write', 'attested.md'], { cwd: dir, encoding: 'utf8' });
  assert.equal(w2.status, 0, `the attested file must be repaired (exit ${w2.status}): ${w2.stdout}`);
  assert.ok(readFileSync(join(dir, 'attested.md'), 'utf8').includes(`${DASH} b`), 'the repaired bytes on disk carry the glyph and the follower');
  const w3 = spawnSync(process.execPath, [join(root, TOOL), '--plan', 'attested.md'], { cwd: dir, encoding: 'utf8' });
  assert.equal(w3.status, 0, `--plan on a clean file exits 0 (${w3.status})`);
  assert.ok(/\[done\] 0 charged site\(s\) read/.test(w3.stdout), `a repaired file must present nothing left to charge: ${w3.stdout}`);
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log(`[4] declined, not guessed: ${AMBIG}/${AMBIG} attestations refuse the site, the CLI exits 1 and the file stays byte-identical; ${ATTESTED} attestations decide it (SPACED); a digit-flanked range refuses the dominant habit; a control and a 4-long U+FFFD run are refused on kind`);

// -- S5 the flank shelter: one pass is NOT the repair, and the loop is ---------------------------------
// The plant is two damages side by side. The dash's image sits IN FRONT of the section sign's image, and the
// flank rule spares a render whose tight neighbour is CJK -- so the first scan sees both forms and charges
// one. Measured, not narrated: 2 forms, 1 charged, pass 1 puts the sign back, and only then does the dash
// become chargeable. That is why the ladder loops, and it is why a tool that stopped after one pass would
// leave the record red by stealth -- so the loop must end up making MORE edits than there were chargeable
// sites when it started.
const shelterSource = `set a ${DASH} ${SECT} b`;
const shelterPlant = tool.m1whole(shelterSource);
const plantForms = tool.chargeable(shelterPlant);
const hidden = plantForms.filter((s) => s.why.startsWith('REJECTED'));
assert.equal(plantForms.length, 2, `the plant must carry two render forms (${plantForms.length}) -- one form is a site, not a shelter`);
assert.equal(hidden.length, 1, `exactly one form must be sheltered by the flank rule (${plantForms.map((s) => s.why).join(', ')}) -- with nothing hidden this section grades a loop that never had to turn`);
assert.ok(/cjk/.test(hidden[0].why), `the shelter must come from a CJK flank, which is the reason the rule exists: ${hidden[0].why}`);
const shelter = `# shelter\n${habit(DASH, ATTESTED)}\n${habit(SECT, ATTESTED)}\n${shelterPlant}\ntail\n`;
const charged0 = tool.chargedSitesOf(shelter);
assert.equal(charged0, 1, `the first scan charges ${charged0} of the ${plantForms.length} forms it can see -- the sheltered dash invisible at scan time is the object of this section`);
const onePass = tool.planText(shelter);
const charged1 = tool.chargedSitesOf(onePass.text);
assert.equal(onePass.edits.length, 1, `pass 1 made ${onePass.edits.length} edit(s); it can only reach the site the flank rule leaves visible: ${JSON.stringify(onePass.edits.map((e) => e.channel))}`);
assert.equal(charged1, 1, `after pass 1 the site behind the repair is ${charged1} charged site(s) -- putting the sign back must EXPOSE the dash, which is the shelter becoming measurable`);
const fp = tool.repairToFixedPoint(shelter);
assert.equal(fp.refused.length, 0, `the shelter must be decidable by the ladder (${fp.refused.join(' | ')})`);
assert.ok(fp.passes >= 2, `the loop took ${fp.passes} pass(es) -- the sheltered site is only revealed once its neighbour is put back, which is what proves a single pass is incomplete`);
assert.equal(fp.edits.length, plantForms.length, `${fp.edits.length} edit(s) for ${plantForms.length} forms: the loop repairs every site it can EVENTUALLY see`);
assert.ok(fp.edits.length > charged0, `${fp.edits.length} edits against ${charged0} chargeable sites at the start -- a one-pass tool would have stopped at ${charged0} and called the file clean`);
assert.equal(tool.chargedSitesOf(fp.text), 0, 'the loop must settle at zero charged sites');
assert.equal(fp.text.split('\n').find((l) => l.startsWith('set a')), shelterSource, 'both glyphs come back with the space the writer ate between them, byte-exact');
console.log(`[5] flank shelter: ${plantForms.length} forms seen / ${charged0} charged at the first scan, pass 1 edits ${onePass.edits.length} and exposes ${charged1}, the loop settles at 0 in ${fp.passes} passes with ${fp.edits.length} edits`);

// -- S6 no file in this landing is a hiding place: ASCII bytes, uncharged, declared budget --------------
for (const rel of [TOOL, ROW, SELF]) {
  const bytes = readFileSync(join(root, rel));
  const t = bytes.toString('utf8');
  assert.ok(!/[^\p{ASCII}]/u.test(t), `${rel} must be ASCII in its own bytes -- every non-ASCII character it names is written as an escape, or the record-encoding row charges the file that grades the record`);
  assert.ok(!t.includes('\r'), `${rel} carries CR bytes`);
  assert.ok(!t.includes(str([0xfffd])), `${rel} carries a replacement character`);
  assert.equal(tool.chargedSitesOf(t.replace(/\r\n/g, '\n')), 0, `${rel} must not carry a charged line itself`);
}
const sw = await import(pathToFileURL(join(root, 'docs/evidence/agents/sweep.mjs')).href);
const self = readFileSync(join(root, SELF), 'utf8');
const budget = sw.rowBudget(self);
assert.equal(budget.budgetSource, 'declared', 'this row declares its own budget rather than inheriting a default it will exceed');
console.log(`[6] self: ${Buffer.byteLength(self)} bytes ASCII, budget ${budget.budgetMs} ms declared from this file's own first-column comment, tool, grader and row all ASCII and uncharged`);

console.log(`OK record-repair: ${BLOCKS.length} blocks identical, ${graded} files read twice, ${chargedLines} charged, ${recovered}/${attempted} plants byte-exact, ${declined} declined (${witnessDeclined} refused a census that could not witness them), ${maxPass}-pass max`);
