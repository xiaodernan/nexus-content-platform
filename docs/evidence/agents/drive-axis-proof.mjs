// NEXUS M2 v84 (docs/evidence) — 66th tracked proof: the DRIVE under `dest` is an axis of isolation.
// Run after `npm run build`:  node docs/evidence/agents/drive-axis-proof.mjs
//
// v81 built a CLEAN CHECKOUT of the ref, v82 made its build verdict quotable, v83 said which BUILD a
// child's cwd grades. All three put that checkout under `os.tmpdir()` without asking a question this box
// answers badly: what DRIVE is that? Here `os.tmpdir()` is `C:\Users\…\Temp` and the repository is
// `D:\终极项目`, and v81's junctions point at `node_modules` entries whose realpath is on D:. Windows
// `relative()` cannot name a D: path from a C: directory, so it returns one that is ABSOLUTE — and a
// bundler told to resolve `./` + that is told to resolve
// `./D:/终极项目/node_modules/next/dist/client/next.js`, which is neither relative (nothing under the app
// dir is named `D:`) nor absolute (it begins `./`).
//
// Measured before this witness existed — same ref, two arms back to back, `isolated-arms.mjs`:
//   dest on C: → clean-room build exit 1 in 522.4s · 55 lines · reason
//     `@nexus/studio:build: Module not found: Error: Can't resolve './D:/终极项目/node_modules/next/dist/client/next.js' in 'C:\Users\…\repo\apps\studio'`
//   dest on D: → exit 0 in 513.0s · 59 lines · every package · failed []
// with the home build unmoved through both (8b3ff8b0e7f62133, 224 files). So for three increments the
// runner has printed a build verdict whose FAILURE was a fact about where it was allowed to write, and
// read it as a fact about the ref — including v82's reason-capture gate, which has been quoting a drive
// letter.
//
// What this proof does NOT do is run a build: 513 s is more than double the 240 000 ms a sweep row gets
// (v83's §5 lesson, asserted in §5 below rather than learned a third time), so the build arms stay in the
// human-run tool and everything here is arithmetic or a ~12 s `build: false` checkout.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sw = await import(pathToFileURL(join(root, 'docs/evidence/agents/sweep.mjs')).href);
const started = Date.now();
const HOME_RUNTIME_DIST = join(root, 'agents', 'runtime', 'dist', 'index.js');
let checkouts = 0;

// --- §1 the drives, measured rather than assumed ---
console.log('§1 这台机器上有几个盘：tmpdir、仓库、node_modules 的真实路径');
const repoDrive = sw.driveOf(root);
const tmp = tmpdir();
const tmpDrive = sw.driveOf(tmp);
const nmReal = realpathSync(join(root, 'node_modules'));
const nmDrive = sw.driveOf(nmReal);
const win32Host = /^[A-Za-z]:/.test(repoDrive);
// The verdict a same-drive dest must print: a Windows box answers SAME DRIVE; a POSIX box has one root, so
// the question does not arise and the answer is POSIX-SINGLE-ROOT. Until v539's repair the POSIX clause
// could not fire (its comparison was a string against a Path), so both hosts printed SAME DRIVE and no such
// branch existed here — the first ubuntu run of this row caught exactly that.
const sameVerdict = win32Host ? /SAME DRIVE/ : /POSIX-SINGLE-ROOT/;
assert.equal(nmDrive, repoDrive, `the repository's own node_modules realpath is on ${nmDrive} while the repository is on ${repoDrive} — the junctions v81 makes would cross a drive even at a same-drive dest, so §3's clean arm is not clean`);
assert.ok(existsSync(HOME_RUNTIME_DIST), `this proof grades a built tree; ${HOME_RUNTIME_DIST} is missing — run \`npm run build\` first`);
// The pre-v84 default, computed here rather than described: `mkdtempSync(join(tmpdir(), …))`.
const preDefaultCrossDrive = tmpDrive !== repoDrive;
console.log(`[1] tmpdir ${tmp} on ${tmpDrive} · repository ${resolve(root)} on ${repoDrive} · node_modules realpath ${nmReal} on ${nmDrive} · so the default dest before v84 was ${preDefaultCrossDrive ? 'CROSS-DRIVE on this box — the defect, observed not hypothesised' : `already same-drive here (${tmpDrive}), so §2 and §3 carry the cross-drive arm explicitly`}`);

// A directory on a drive other than the repository's, to stand in for v81's temp tree. On a single-volume
// host none exists, and this witness says so instead of asserting a claim it cannot reach.
let otherRoot = preDefaultCrossDrive ? tmp : null;
if (!otherRoot && win32Host) {
  for (const letter of ['C', 'D', 'E', 'F', 'G']) {
    const cand = `${letter}:\\`;
    if (existsSync(cand) && sw.driveOf(cand) !== repoDrive) { otherRoot = cand; break; }
  }
}
if (!otherRoot && !win32Host && sw.driveOf('/') !== repoDrive) otherRoot = '/';
console.log(`[1] a writable directory on a drive other than ${repoDrive}: ${otherRoot ?? 'NONE on this host — the cross-drive arms are unavailable here and are quoted rather than re-observed'}`);

// --- §2 the mechanism, with no bundler and no build: what relative() actually returns ---
console.log('§2 机制本身：relative() 跨盘返回的不是相对路径');
const entry = realpathSync(join(root, 'node_modules', 'next', 'dist', 'client', 'next.js'));
assert.ok(isAbsolute(entry) && sw.driveOf(entry) === repoDrive, `the entry under test is ${entry} — it must be absolute and on the repository's drive, since that is what a junction resolves to`);
const makeParent = (base) => {
  const dir = mkdtempSync(join(base, 'nexus-v84-parent-'));
  const appDir = join(dir, 'apps', 'studio');
  mkdirSync(appDir, { recursive: true });
  return { dir, appDir };
};
// A parent on the repository's own drive, which is where a same-drive clean checkout would be.
const sameBase = tmpDrive === repoDrive ? tmp : repoDrive;
const arms = [{ tag: `same-drive ${repoDrive}`, ...makeParent(sameBase) }];
if (otherRoot) arms.push({ tag: `cross-drive ${sw.driveOf(otherRoot)}→${repoDrive}`, ...makeParent(otherRoot) });
const observed = arms.map(({ tag, dir, appDir }) => {
  const rel = relative(appDir, entry);
  const spec = `./${rel.split(sep).join('/')}`;
  const r = {
    tag,
    appDrive: sw.driveOf(appDir),
    rel,
    relIsAbsolute: isAbsolute(rel),
    climbsOutOfRepo: rel.startsWith('..' + sep) || rel === '..',
    spec,
    specHasDriveColon: /^[.][/\\][A-Za-z]:/.test(spec),
    // Does the request the bundler is handed name anything under the app directory?
    specNamesNoRealFile: !existsSync(join(appDir, spec)),
    // Is the path relative() returned usable AS ITSELF? For a cross-drive pair yes — which is the point:
    // the file is reachable, only the RELATIVE-ness is gone.
    reachableAsIs: existsSync(isAbsolute(rel) ? rel : join(appDir, rel)),
  };
  rmSync(dir, { recursive: true, force: true });
  return r;
});
const same = observed.find((o) => !o.relIsAbsolute);
assert.ok(same, `no arm produced a genuinely relative path: ${JSON.stringify(observed.map((o) => [o.tag, o.rel]))}`);
assert.ok(same.climbsOutOfRepo, `the same-drive arm's path ${JSON.stringify(same.rel)} does not climb out of the app dir, so this fixture is not shaped like a checkout sitting next to a repository`);
assert.ok(same.reachableAsIs, `the same-drive relative path does not reach ${entry} from ${same.tag} — the fixture is wrong, not the rule`);
assert.ok(!same.specHasDriveColon, `the same-drive request ${same.spec} unexpectedly contains a drive colon`);
const cross = observed.find((o) => o.relIsAbsolute);
if (otherRoot) {
  assert.ok(cross, `a parent exists on ${sw.driveOf(otherRoot)} while the entry is on ${repoDrive}, so relative() must return an absolute path there and no arm did: ${JSON.stringify(observed.map((o) => o.rel))}`);
  // The exact shape of the string in v84's measured reason line, DERIVED rather than quoted.
  assert.ok(cross.specHasDriveColon, `the cross-drive request ${JSON.stringify(cross.spec)} does not wear the "./<drive>:…" shape that broke the build, so the mechanism this increment claims is not what happened here`);
  assert.ok(cross.specNamesNoRealFile, `the cross-drive request ${cross.spec} resolved to an existing file, so nothing was unresolvable and this increment's explanation is wrong`);
  assert.ok(cross.reachableAsIs, `relative() returned ${JSON.stringify(cross.rel)} and even that absolute path does not exist — the failure would then be something other than the lost relative-ness`);
  // The derived string and the RECORDED one must be the same bytes. `isolated-arms.mjs` keeps the reason
  // line it measured in its own header, so this compares the derivation against that transcript instead
  // of against a paraphrase of it — if the two ever drift, the increment's central quote is wrong.
  const armsSrc = readFileSync(join(root, 'docs/evidence/agents/isolated-arms.mjs'), 'utf8');
  const recorded = (armsSrc.match(/Can't resolve '([^']+)'/) || [])[1];
  assert.ok(recorded, "isolated-arms.mjs no longer records a measured `Can't resolve …` reason line, so §2 has nothing to check the derivation against");
  assert.equal(cross.spec, recorded, `the request derived from this box's paths (${JSON.stringify(cross.spec)}) is not the request the measured build complained about (${JSON.stringify(recorded)}) — one of the two is misquoted`);
  console.log(`[2] ${cross.tag}: relative() → ${JSON.stringify(cross.rel)} · isAbsolute=${cross.relIsAbsolute} · request handed to a bundler = ${JSON.stringify(cross.spec)} · names nothing under the app dir=${cross.specNamesNoRealFile} · the file itself is reachable=${cross.reachableAsIs} · EQUAL to the reason line recorded in isolated-arms.mjs`);
} else {
  console.log(`[2] only a same-drive arm was reachable on this host, so the cross-drive claim is quoted from isolated-arms.mjs and NOT re-observed here: rel=${JSON.stringify(same.rel)} reaches the entry=${same.reachableAsIs}`);
}
console.log(`[2] ${same.tag}: relative() → ${JSON.stringify(same.rel)} · isAbsolute=${same.relIsAbsolute} · request ${JSON.stringify(same.spec)} reaches the entry=${same.reachableAsIs}`);

// --- §3 the runner's choice: the default, and a caller who asks for the other one ---
console.log('§3 修完之后：默认落在仓库那个盘，调用方指定的盘照旧但要说出来');
const homeBefore = sw.distDigest(root);
// The second blind shape M2 v93 named, in its purest form: this row never writes the word git in a call at all,
// it asks the runner's own helper to materialise the ref, so the spawn is one frame away from these bytes and the
// exit 128 a checkout gives this row was unforeseeable from outside. The row can say it (amendment 94).
// sweep-asks-repository: git clone --shared --no-checkout + git checkout HEAD once per sw.isolatedCheckout call (git archive HEAD only behind the v133 refusal) — the default-dest one below, plus the CROSS-DRIVE one when this host has a second drive — and these bytes themselves name no git call at all
const dfltLines = [];
const dflt = await sw.isolatedCheckout({ ref: 'HEAD', cwd: root, build: false, log: (l) => dfltLines.push(String(l)) });
checkouts += 1;
const dline = dfltLines.find((l) => l.startsWith('[isolated]'));
assert.ok(dline, `the runner printed no [isolated] line: ${JSON.stringify(dfltLines)}`);
assert.equal(dflt.driveMismatch, false, `the DEFAULT dest ${dflt.dir} is on ${dflt.destDrive} while the repository is on ${dflt.repoDrive} — v84's fix is not in effect`);
assert.equal(dflt.destDrive, dflt.repoDrive, 'the two drive fields must agree when the mismatch field says they do, or the printed sentence is not the computed one');
assert.match(dline, sameVerdict, `the [isolated] line must state the drive verdict it computed: ${dline}`);
assert.ok(dline.includes(`chosen: ${dflt.destChoice}`), 'the line must name HOW the dest was chosen, not only where it is');
assert.ok(!dline.includes('CROSS-DRIVE'), 'the default arm must not report a mismatch it does not have');
assert.ok(!resolve(dflt.dir).startsWith(resolve(root)), `the temp tree is at ${dflt.dir}: on the repository's drive is the point, INSIDE the repository is not — §9 still forbids that`);
if (preDefaultCrossDrive) {
  assert.notEqual(dflt.destChoice, 'tmpdir', `on a box where tmpdir is on ${tmpDrive} and the repository on ${repoDrive} the default reported ${JSON.stringify(dflt.destChoice)} — it went to tmpdir anyway, which is the pre-v84 behaviour this increment exists to end`);
  assert.match(dflt.destChoice, /FORCED off tmpdir/, `the default reported ${JSON.stringify(dflt.destChoice)}: the override happened but is not named, so a reader cannot tell it from the old behaviour`);
}
// A caller can still ask for the other drive, on purpose: v82's reason gate needs a build that FAILS, and
// on this box that means the cross-drive tree. The runner reports such a choice rather than repairing it.
let crossIso = null;
if (otherRoot) {
  const clines = [];
  crossIso = await sw.isolatedCheckout({ ref: 'HEAD', cwd: root, dest: mkdtempSync(join(otherRoot, 'nexus-v84-cross-')), build: false, log: (l) => clines.push(String(l)) });
  checkouts += 1;
  const cline = clines.find((l) => l.startsWith('[isolated]'));
  assert.equal(crossIso.driveMismatch, true, `a caller asked for ${crossIso.dir} on ${crossIso.destDrive} and the runner reported no mismatch — the axis is decoration if it cannot be asked for`);
  assert.notEqual(crossIso.destDrive, crossIso.repoDrive, 'and the fields must say so too');
  assert.match(cline, /CROSS-DRIVE/, `the cross-drive arm must SAY cross-drive: ${cline}`);
  assert.match(cline, /caller-supplied/, "and must say the directory was the caller's, not the runner's choice");
  assert.ok(!cline.includes('SAME DRIVE'), 'a mismatched arm must not also be called same-drive');
  console.log(`[3] caller-supplied ${crossIso.dir} on ${crossIso.destDrive} → reported CROSS-DRIVE vs ${crossIso.repoDrive} · default ${dflt.dir} on ${dflt.destDrive} (${dflt.destChoice})`);
} else {
  console.log(`[3] no second volume on this host, so only the default arm ran: ${dflt.dir} on ${dflt.destDrive} (${dflt.destChoice})`);
}

// --- §4 the sentence as arithmetic on all the shapes a host can present ---
// §3 can only show the shapes this box has. `driveVerdict()` is a function of paths, so the ones a
// one-volume Windows host cannot reach are graded here directly — including the clause that must NOT
// appear, which is the only way the POSIX branch is graded anywhere.
console.log('§4 那句话的形状：不靠这台机器凑');
const vv = (dir) => sw.driveVerdict({ dir, chose: 'caller-supplied', tmpDir: tmp, tmpDrive, repoDrive });
const sameSentence = vv(join(sameBase, 'x'));
assert.equal(sameSentence.mismatch, false, `a dest on the repository's own base ${sameBase} reported ${JSON.stringify(sameSentence.phrase)}`);
assert.match(sameSentence.phrase, sameVerdict, `same-drive sentence missing from ${JSON.stringify(sameSentence.phrase)}`);
if (otherRoot) {
  const crossSentence = vv(join(otherRoot, 'x'));
  assert.equal(crossSentence.mismatch, true, 'a dest on the other volume must be called a mismatch');
  assert.match(crossSentence.phrase, /CROSS-DRIVE/, `cross-drive sentence missing from ${JSON.stringify(crossSentence.phrase)}`);
  assert.ok(!/SAME DRIVE/.test(crossSentence.phrase), 'the two verdicts are mutually exclusive in the printed text');
}
if (win32Host) {
  assert.ok(!/POSIX-SINGLE-ROOT/.test(sameSentence.phrase), `a Windows host printed the POSIX clause: ${sameSentence.phrase} — the branch that reports "the question does not arise" must stay where it belongs`);
  console.log('[4] win32 host: the POSIX-SINGLE-ROOT clause is unreachable here and graded by ABSENCE from both real sentences');
} else {
  const p = sw.driveVerdict({ dir: '/tmp/nexus-x', chose: 'repo-drive', tmpDir: '/tmp', tmpDrive: '/', repoDrive: '/' });
  assert.equal(p.mismatch, false, 'on POSIX no dest can be cross-drive, so the field must not invent a mismatch');
  assert.match(p.phrase, /POSIX-SINGLE-ROOT/, `the POSIX arm must say the question does not arise instead of claiming a Windows-shaped victory: ${p.phrase}`);
  assert.ok(!/CROSS-DRIVE|SAME DRIVE/.test(p.phrase), `the POSIX sentence reported a Windows drive verdict anyway: ${p.phrase}`);
  console.log('[4] POSIX host: the single-root clause ran and is asserted');
}
console.log(`[4] same-drive → ${sameSentence.phrase.slice(sameSentence.phrase.indexOf('—') + 1).trim()} · the failure-attribution clause is gated on a build that FAILED, and no arm here ran one (${checkouts} checkouts, all build:false)`);

// --- §5 the isolation gate, and what this witness cost ---
const homeAfter = sw.distDigest(root);
assert.equal(homeAfter.digest, homeBefore.digest, `⚠ home dist MOVED during this proof (${homeBefore.digest.slice(0, 16)} → ${homeAfter.digest.slice(0, 16)}) — a clean checkout on the repository's own drive is not as harmless as v81 proved`);
assert.equal(homeAfter.files, homeBefore.files, 'and its file population too');
rmSync(dflt.dir, { recursive: true, force: true });
if (crossIso) rmSync(crossIso.dir, { recursive: true, force: true });
const totalMs = Date.now() - started;
assert.ok(totalMs < sw.DEFAULT_PROOF_TIMEOUT_MS, `this witness took ${totalMs}ms against the ${sw.DEFAULT_PROOF_TIMEOUT_MS}ms a sweep row gets — v83 learned this the hard way and v84 must not relearn it`);
const checkoutMs = Math.round(totalMs / Math.max(checkouts, 1));
console.log(`[5] home dist ${homeAfter.digest.slice(0, 16)} (${homeAfter.files} files) UNMOVED across ${checkouts} clean checkouts (~${checkoutMs}ms each) · this proof scheduled itself in ${totalMs}ms of ${sw.DEFAULT_PROOF_TIMEOUT_MS}ms · an isolated BUILD arm is not schedulable at all: 513.0s same-drive and 522.4s cross-drive were measured back to back, both more than 2× the row budget`);
console.log(`\n[summary] the drive under a clean checkout is an axis of isolation, now named by the runner and pinned here: ${observed.length} arms of relative() show that ${cross ? `a cross-drive pair returns an ABSOLUTE "relative" path whose ./<drive>: request names nothing under the app dir while the same-drive pair climbs out with ..${sep} and reaches the entry (§2)` : 'a same-drive pair climbs out with .. and reaches the entry (§2, cross-drive unavailable here)'}; the default dest is now on the repository's own drive (${dflt.dir}, ${dflt.destChoice}) and prints ${win32Host ? 'SAME DRIVE' : 'POSIX-SINGLE-ROOT'}${crossIso ? `, while a caller can still ask for the other volume and is told CROSS-DRIVE plus who chose it` : ''} (§3); the sentence is graded on every shape this host can name, including the one it cannot reach (§4); and the home build did not move while any of it happened (§5). Bounds, stated: this proof runs NO build, so the two build verdicts it leans on — cross-drive exit 1 with the module-not-found reason, same-drive exit 0 over 59 lines — are quoted from ONE back-to-back pair measured by the human-run \`isolated-arms.mjs\` on ONE box whose tmpdir is on ${tmpDrive} and whose repository is on ${repoDrive}, and a build arm's duration is load-dependent; on a host where those are the same volume the pre-v84 default was already right and §1 says so instead of claiming a fix it did not need; and a same-drive clean tree buys a compiling checkout, not a green isolated sweep — an archived tree still has no dist, which is what v83's §3 measured.`);
