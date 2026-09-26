// M2 v83 proof — WHICH BUILD does a sweep grade? The child cwd decides it, and the runner never said so.
//
// v78 taught a sweep to name its ref and its build digest; v80 taught it to name the tree it walked. Both
// sentences rested on an unexamined assumption: `runProof` was always handed the repository root, and the
// reason given for that was "a proof needs to reach ./agents/runtime/dist/index.js". The reason is right
// and the consequence was missed. Measured from HEAD's bytes by §1 below: 61 of the 64 tracked proofs
// spell the import `pathToFileURL('./agents/…')` and 3 spell it `pathToFileURL(join(root, …))` with
// `root = process.cwd()` — `pathToFileURL` resolves a RELATIVE path against `process.cwd()`, so the whole
// population loads the shipped code through the CHILD's cwd and none of it through its own file location.
//
// So `--ref <older sha>` did not run an older build. It ran the OLDER PROOF TEXT against THE BUILD THIS
// WORKTREE LAST COMPILED, while `[identity]` quoted that build's digest as if it belonged to the run. The
// fix is an axis, not a guess: `runSweep({ proofsCwd })`, plus `probeChildResolution()`, which asks a
// child what IT resolves instead of inferring it from the runner's own filesystem view.
//
// Run from the repository root: node docs/evidence/agents/cwd-axis-proof.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const startedAt = Date.now();
// This proof uses the idiom it is here to measure: relative to the child's cwd, which is the repository root.
const sw = await import(pathToFileURL('./docs/evidence/agents/sweep.mjs').href);

/** Windows reports a cwd with backslashes and can differ in drive-letter case; compare paths, not strings. */
function sameDir(a, b) {
  const norm = (p) => String(p).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

console.log('[0] the runner reports what a child sees, not what the caller passed');

// --- §1 the census: how the population reaches the code it grades -------------------------------
// A text scan of the ref's own bytes — a claim about the SCRIPTS. §2 and §3 are the observations.
const censusStarted = Date.now();
// One batch read of the population, kept and handed to both sweeps below: `proofCorpus` self-checks its
// stream parser against the slow single-blob path at the first and the last file.
// The second blind spot M2 v93 named: every git call this row makes is in ANOTHER FILE — docs/evidence/agents/
// sweep.mjs, one frame down the stack — so a scan of these bytes cannot foresee the exit 128 a checkout gives it.
// Stating the reach is what lets the runner account for this row's red from the inside (amendment 94).
// sweep-asks-repository: git ls-tree + git cat-file --batch (sw.proofCorpus) · git archive HEAD (sw.isolatedCheckout) · a nested sweep (sw.runSweep) — every call is in sweep.mjs, not in these bytes
const corpus = await sw.proofCorpus('HEAD', root);
const idioms = await sw.proofImportIdioms('HEAD', root, corpus);
const censusMs = Date.now() - censusStarted;
// v83 asserted `fileRelative === 0` and amendment 89 falsified the pin: since amendment 86 the population
// imports a SHARED LIBRARY relative to itself, so that counter is no longer this axis's claim. What the axis
// actually asserts is narrower and still true — no proof may reach THE CODE UNDER TEST through its own
// location, because then the materialised copy, not the child cwd, would decide which build it grades.
const distRelative = corpus.rows.filter((r) => /from\s+['"]\.[^'"]*\/dist\/[^'"]+['"]/.test(r.text)).map((r) => r.name);
assert.deepEqual(distRelative, [], `a proof that loads the shipped build relative to ITSELF escapes the child-cwd axis entirely: ${distRelative.join(', ')}`);
const closureNow = await sw.closureOf('HEAD', root, corpus);
// The two readers count different grammars on purpose: `fileRelative` also fires on `import.meta.url`, while
// the closure counts specifiers the new code-position scanner believes. An equality here would be one rule
// agreeing with itself, so the live claim is the DIST one above and the numbers are printed, not pinned.
assert.ok(idioms.fileRelative >= closureNow.importers, `the census reader missed file-relative edges the closure reader found (${idioms.fileRelative} vs ${closureNow.importers})`);
assert.equal(idioms.childRelative, idioms.total, `every tracked proof must resolve through the child's cwd, or the census sentence below overstates (child-relative ${idioms.childRelative} of ${idioms.total})`);
assert.deepEqual(idioms.unresolved, [], `a proof that resolves the build NEITHER way would silently escape this axis: ${idioms.unresolved.join(', ')}`);
console.log(`[1] census of HEAD's tracked proofs: ${idioms.childRelative}/${idioms.total} reach the shipped code through the CHILD's cwd · ${idioms.fileRelative} through their own file location · ${idioms.unresolved.length} through neither — all ${idioms.total} blobs in one \`git cat-file --batch\` spawn, ${censusMs}ms`);

// --- §2 the probe: two trees, two different builds, one child asking -----------------------------
const tinyTree = (tag, body) => {
  const dir = mkdtempSync(join(tmpdir(), `nexus-v83-${tag}-`));
  const dist = join(dir, 'agents', 'runtime', 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.js'), body, 'utf8');
  return dir;
};
const SPECS = ['agents/runtime/dist/index.js'];
const t1 = tinyTree('one', 'export const which = "tree one";\n');
const t2 = tinyTree('two', 'export const which = "tree two";\n');
const t3 = mkdtempSync(join(tmpdir(), 'nexus-v83-bare-')); // a tree with nothing built in it
const p1 = await sw.probeChildResolution(t1, SPECS);
const p2 = await sw.probeChildResolution(t2, SPECS);
const p3 = await sw.probeChildResolution(t3, SPECS);
assert.equal(p1.resolved.length, 1);
assert.notEqual(p1.resolved[0].sha, p2.resolved[0].sha, 'two trees holding two files must not probe to one sha — if this ever passes vacuously the probe is not reading the file');
assert.ok(sameDir(p1.cwd, t1), `the child reported ${p1.cwd}, not the ${t1} it was given`);
assert.ok(sameDir(p1.resolved[0].path, join(t1, 'agents', 'runtime', 'dist', 'index.js')), `the child resolved the spec to ${p1.resolved[0].path}`);
// `exists: false` with `sha: null`, never `exists: false, sha: <hash of nothing>`: v80's census rule.
assert.equal(p3.resolved[0].exists, false);
assert.equal(p3.resolved[0].sha, null, `an absent build must report null, not a digest (${p3.resolved[0].sha})`);
// The cross-check that keeps §2 from being a story the probe tells about itself: at the real root the
// child's self-report must agree with the runner's own independent read of the same bytes.
const atRoot = await sw.probeChildResolution(root, sw.PROBED_BUILDS);
const homeEntry = join(root, 'agents', 'runtime', 'dist', 'index.js');
const homeSha = createHash('sha256').update(readFileSync(homeEntry)).digest('hex');
const runtimeRow = atRoot.resolved.find((r) => r.spec === 'agents/runtime/dist/index.js');
assert.ok(runtimeRow, `the probe did not report the entry the population imports (${atRoot.resolved.map((r) => r.spec).join(', ')})`);
assert.equal(runtimeRow.sha, homeSha, "the child's self-reported sha disagrees with the runner's own read of that file");
assert.equal(atRoot.resolved.filter((r) => r.exists).length, sw.PROBED_BUILDS.length, 'this worktree is built; every probed entry must resolve');
console.log(`[2] probe: identical relative specs resolve to ${p1.resolved[0].sha.slice(0, 12)} at tree one and ${p2.resolved[0].sha.slice(0, 12)} at tree two; at a tree with no build → exists ${p3.resolved[0].exists}, sha ${p3.resolved[0].sha}; at the real root the child's self-report equals an independent sha256 of the same file (${runtimeRow.sha.slice(0, 12)})`);

// --- §3 the load-bearing observation: same ref bytes, different cwd, different outcome ------------
// An archived checkout of HEAD is the ref's proof text with nothing compiled next to it. Run the ref's own
// `roles-proof.mjs` (not a paraphrase of it) and the child cannot load the code the proof grades. This
// proof is chosen for SPEED, and the speed is load-bearing: the sweep kills a row at 240 000 ms, and the
// first version of this witness used `code-index-proof.mjs`, which takes 53 s per arm — twice — and pushed
// the whole proof to 278 s, i.e. a witness that times out inside the very runner it is grading.
const homeBefore = sw.distDigest(root);
const iso = await sw.isolatedCheckout({ ref: 'HEAD', cwd: root, build: false, log: () => {} });
const proofRel = join('docs', 'evidence', 'agents', 'roles-proof.mjs');
const cleanProof = join(iso.root, proofRel);
const unbuildable = await sw.runProof(cleanProof, iso.root, 120_000);
const atHome = await sw.runProof(cleanProof, root, 240_000);
assert.notEqual(unbuildable.code, 0, 'a proof with no build at its cwd must NOT pass — if it does, this axis is decorative and the increment is wrong');
assert.match(`${unbuildable.errTail}`, /Cannot find|MODULE_NOT_FOUND|ERR_MODULE/i, `expected a load failure, got: ${unbuildable.errTail}`);
assert.equal(atHome.ok, true, `the SAME bytes (the ref's copy, read off disk) pass when their cwd holds a build: exit ${atHome.code} :: ${atHome.errTail || atHome.tail}`);
console.log(`[3] the ref's own roles-proof.mjs: exit ${unbuildable.code} in ${unbuildable.ms}ms (${unbuildable.errTail.slice(0, 70)}…) with cwd inside the archived checkout, exit ${atHome.code} in ${atHome.ms}ms with cwd at this worktree — one file, one build, the cwd picked which`);

// --- §4 `runSweep` actually plumbs the choice, and its sentences say what it decided --------------
const lines = [];
const s = await sw.runSweep({ ref: 'HEAD', only: 'roles-proof', cwd: root, corpus, proofsCwd: iso.root, timeoutMs: 240_000, log: (l) => lines.push(String(l)) });
assert.equal(s.results.length, 1, `--only roles-proof inside a sweep should run one row, ran ${s.results.length}`);
assert.equal(s.failed.length, 1, 'the isolated row must be RED here — §3 measured why');
assert.ok(sameDir(s.proofsCwd, iso.root), `the sweep reported child cwd ${s.proofsCwd}, not ${iso.root}`);
assert.ok(sameDir(s.childProbe.cwd, iso.root), 'the sweep must carry the CHILD’S own report of its cwd, not just the argument');
assert.equal(s.childBuild.files, 0, `an unbuilt checkout has no dist to grade (${s.childBuild.files} files reported)`);
assert.notEqual(s.childBuild.digest, s.identity.distDigest, 'the graded build must be named separately from the runner’s own');
assert.ok(s.childTree.unavailable, 'walking a tree with no built runtime is undigestable, and the runner must say so rather than guess a copy of the rule');
assert.match(s.treeNotice, /could not be digested/, `expected the undigestable-tree notice, got ${s.treeNotice}`);
assert.equal(s.importIdioms.childRelative, s.importIdioms.total);
const summary = lines[lines.length - 1];
assert.match(summary, /graded build [0-9a-f]{16} \(0 dist files/, `the summary must name the build the child would grade: ${summary}`);
assert.match(lines.join('\n'), /64\/64 tracked proofs reach the code under test through the CHILD's cwd|tracked proofs reach the code under test through the CHILD's cwd/, 'the identity block must state the census it is acting on');
// Rewriting the identity block reddened `tree-axis-proof.mjs`, which pins two sentences by prefix — the
// producer moved back, per v46's rule. So this witness pins them too, in BOTH arms, and pins the new
// difference: which cwd the walked-tree line names, and that one tree is printed once and not twice.
const said = (ls, needle) => ls.filter((l) => l.startsWith(needle)).length;
const walked = (ls) => ls.find((l) => l.startsWith('[identity] walked tree'));
assert.equal(said(lines, '[identity] walked tree'), 1, 'exactly one walked-tree line per sweep');
assert.ok(walked(lines)?.includes(iso.root), `the walked-tree line must name the CHILD's cwd the rows read: ${walked(lines)}`);
assert.equal(said(lines, "[identity] tree at the RUNNER's cwd"), 1, 'when the two cwd differ, the runner’s own tree is a second line and says so');
assert.ok(lines.some((l) => l.includes('read the WORKING TREE as their corpus')), 'v80’s sentence naming the tree-reading population still prints');
// Control at the default cwd: the same sweep call with no `proofsCwd` is what every sweep before v83 ran.
const homeLines = [];
const h = await sw.runSweep({ ref: 'HEAD', only: 'roles-proof', cwd: root, corpus, timeoutMs: 240_000, log: (l) => homeLines.push(String(l)) });
assert.equal(h.failed.length, 0, `the default sweep must still be green: ${h.results[0].errTail}`);
assert.ok(sameDir(h.proofsCwd, root), 'proofsCwd must default to the runner’s cwd, not to something new');
assert.equal(h.childBuild.digest, h.identity.distDigest, 'at the default cwd the graded build IS the runner’s own — that is the identity the flag breaks');
assert.ok(!h.childTree.unavailable && h.treeNotice === null, 'the home tree digests and does not move');
assert.equal(said(homeLines, '[identity] walked tree'), 1, 'the control sweep prints one walked-tree line');
assert.ok(walked(homeLines)?.includes(root), `the control's walked-tree line names the cwd the rows read (${root}): ${walked(homeLines)}`);
assert.equal(said(homeLines, "[identity] tree at the RUNNER's cwd"), 0, 'when the child cwd IS the runner’s cwd the tree is named once, not twice — v83 must not buy a new axis with a duplicated line');
assert.ok(homeLines.some((l) => l.includes('read the WORKING TREE as their corpus')), 'and the sentence v80 pinned survives the rewrite on the default path too');
console.log(`[4] runSweep: proofsCwd=archived checkout → 1 row, failed 1, graded build ${s.childBuild.digest.slice(0, 12)}/0 dist files, tree undigestable, walked-tree line names the child cwd and the runner gets a second one; default cwd → 1 row, failed 0, graded build ${h.childBuild.digest.slice(0, 12)}/${h.childBuild.files} dist files, tree ${h.childTree.files} files named once · v80’s two printed sentences pinned in both arms`);

// --- §5 the isolation gate: measuring an axis must not move the thing it measures -----------------
const homeAfter = sw.distDigest(root);
assert.equal(homeAfter.digest, homeBefore.digest, `⚠ home build digest MOVED during this proof (${homeBefore.digest.slice(0, 16)} → ${homeAfter.digest.slice(0, 16)}) — the archived checkout is not as isolated as v81 proved`);
assert.equal(homeAfter.files, homeBefore.files);
// The gate this increment learned from its own first run: a witness longer than `DEFAULT_PROOF_TIMEOUT_MS`
// is a row the sweep kills, so the proof must schedule itself, not merely pass.
const totalMs = Date.now() - startedAt;
assert.ok(totalMs < sw.DEFAULT_PROOF_TIMEOUT_MS, `this proof ran ${totalMs}ms, over the ${sw.DEFAULT_PROOF_TIMEOUT_MS}ms budget the sweep gives every row — it would be a TIMEOUT in the very runner it grades`);

rmSync(t1, { recursive: true, force: true });
rmSync(t2, { recursive: true, force: true });
rmSync(t3, { recursive: true, force: true });
rmSync(iso.dir, { recursive: true, force: true });

console.log(`\n[summary] the child cwd is an axis of a sweep, not an implementation detail: ${idioms.childRelative}/${idioms.total} tracked proofs resolve the shipped code through it (§1, a scan of their bytes), a child at two trees reports two builds and at a bare tree reports no build and a null sha (§2, an observation), and the REF'S OWN roles-proof exits ${unbuildable.code} inside an archived checkout against ${atHome.code} here with one file on disk unchanged (§3). runSweep now takes proofsCwd, probes the child, and prints the build it graded (§4), where it also re-pins the two [identity] sentences tree-axis-proof.mjs reads BY PREFIX — this increment's own rewrite of that block reddened that shipped witness once before it was committed; the home build sat unmoved through all of it (${homeAfter.digest.slice(0, 16)}, ${homeAfter.files} files, §5), and this witness schedules itself in ${totalMs}ms of the ${sw.DEFAULT_PROOF_TIMEOUT_MS}ms a sweep row is given — which is a gate, not a courtesy: the first version ran \`code-index-proof.mjs\` (53 s) twice and took 278 s, i.e. a TIMEOUT inside the very runner it grades. Bounds, stated: this proof never runs an isolated BUILD sweep — that is isolated-proof.mjs, and HEAD's studio build fails there, so a green full isolated run is not available to claim; PROBED_BUILDS is the four entries read off HEAD's bytes, so a fifth import idiom would need adding rather than being silently missed; §2's cross-check proves the probe reads the file, and §1's census is a text scan of scripts, which is why §3 exists; and the flag is opt-in — the DEFAULT sweep still grades this worktree's build, because that is what the four root gates just compiled and a runner must not silently change the meaning of a sentence already in the amendments.`);
