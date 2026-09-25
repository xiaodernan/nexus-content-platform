// NEXUS M2 v78 (docs/evidence) — A SWEEP MUST NAME THE BYTES IT GRADED (ADR 0016 amendment 78).
// Why this exists, stated the way §60 requires: every amendment since v34 has written a sentence like
// "the 60-proof sweep is this increment's 'nothing else moved' assertion", and the sentence was not
// certifiable. Two different things get called "the tree": the SCRIPTS that do the asserting, and the
// BUILD they assert about. Each of the 61 proofs imports `./agents/*/dist/index.js` relative to the
// CURRENT WORKING DIRECTORY, so a proof file can be the committed one while the code it grades is
// whatever someone happened to build last. This runner was written after amendment 76's own bookkeeping
// sentence claimed a sweep ran "against this commit's own tree" — true of the scripts, unverifiable of
// the build, because a compiled artifact carries no provenance stamp and had already been rebuilt by the
// time anyone asked.
//
// So the runner fixes the two halves separately and prints both:
//   1. the SCRIPTS come from a git object (the ref, not the worktree), materialised into os.tmpdir, and
//      the divergence between that ref and the worktree is counted rather than assumed;
//   2. the BUILD is identified by a digest over the shipped `dist` trees, so "green" is a claim about
//      named bytes and a later reader can tell whether the bytes it now has are the bytes it graded.
//
// M2 v80 adds the third half, which v78 named only as a bound: proofs run with the REPOSITORY ROOT as
// cwd, so a script that reads `.` reads the WORKING TREE — including files no commit owns. That tree now
// gets its own digest and ownership split in the `[identity]` block, and is re-checked after the last
// script for the same reason the build is.
//
// It is a HUMAN-RUN tool, not an agent door: it shells out to `git` with the ambient environment (§9 is
// held by never writing inside the repository except into a temp dir under os.tmpdir, and by running
// only read-only scripts). It uses the ASYNCHRONOUS spawn path only — the synchronous child-process API
// is broken on some hosts in this workspace (see `docs/evidence/lib/syncproc.mjs`), and a runner that
// itself could not run would certify nothing.
//
// Run from the repository root after `npm run build`:
//   node docs/evidence/agents/sweep.mjs                 # sweep HEAD's committed proofs
//   node docs/evidence/agents/sweep.mjs --ref <sha>     # sweep a specific commit
//   node docs/evidence/agents/sweep.mjs --only record   # one proof, for iteration
//   node docs/evidence/agents/sweep.mjs --keep          # leave the materialised copies behind
//   node docs/evidence/agents/sweep.mjs --isolated      # run them INSIDE a clean checkout of the ref, so
//                                                       # the build they import is the ref's, not this one's
//   node docs/evidence/agents/sweep.mjs --isolated --no-build   # same, without the clean-room compile
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const PROOF_DIR = 'docs/evidence/agents';
export const DIST_ROOTS = ['agents', 'packages'];
export const DEFAULT_PROOF_TIMEOUT_MS = 240_000;
/** This file lives at `<repo>/docs/evidence/agents/sweep.mjs`, so the repository root is three levels up. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** One child process, output collected, never a throw on non-zero: a refusal is DATA here. */
function run(cmd, argv, opts = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, argv, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      windowsHide: true,
      // `ignore` closes the door a batch command must be written through, so stdin stays closed unless
      // the caller has something to send.
      stdio: [opts.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    if (opts.stdin !== undefined) child.stdin.end(opts.stdin);
    const out = [];
    const err = [];
    let bytes = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs ?? 60_000);
    child.stdout.on('data', (d) => {
      bytes += d.length;
      if (bytes <= (opts.maxBuffer ?? 64 * 1024 * 1024)) out.push(d);
    });
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => {
      clearTimeout(timer);
      rej(e);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const as = (chunks) => (opts.encoding === 'buffer' ? Buffer.concat(chunks) : Buffer.concat(chunks).toString(opts.encoding ?? 'utf8'));
      res({ code, signal, timedOut, stdout: as(out), stderr: as(err) });
    });
  });
}

/** `git` in this repository, with the ambient environment. Throws on a non-zero exit: no silent empty answer. */
async function git(argv, cwd) {
  const r = await run('git', argv, { cwd, timeoutMs: 120_000 });
  if (r.timedOut) throw new Error(`git ${argv.join(' ')} timed out`);
  if (r.code !== 0) throw new Error(`git ${argv.join(' ')} → exit ${r.code}: ${r.stderr.trim().slice(0, 300)}`);
  return r.stdout;
}

/** Exported under a name a witness can call, so the proof need not re-implement the spawn path it is grading. */
export const gitText = git;

export function isMainModule(importedUrl) {
  const entry = process.argv[1];
  return Boolean(entry) && pathToFileURL(resolve(entry)).href === importedUrl;
}

/** The committed proof list — from git's object store, so a worktree file that exists but is untracked cannot join a sweep. */
export async function trackedProofs(ref, cwd) {
  const listing = await git(['ls-tree', '-r', '--name-only', ref, '--', PROOF_DIR], cwd);
  // M2 v79: `-proof.mjs`, not `.mjs`. With the wider filter this runner listed ITSELF as a proof, ran
  // itself as a proof, and so spawned a nested sweep that ran a third — measured as `scripts 63` where
  // the population is 62, one `TIMEOUT` row that is not a proof result at all, and a 961 s sweep that
  // should have taken ~200 s. The directory's own convention (every proof, and the runner this file
  // replaced) is the `-proof.mjs` suffix; a tool is not a test of itself.
  return listing.split(/\r?\n/).filter((l) => l.endsWith('-proof.mjs')).sort();
}

export async function commitOf(ref, cwd) {
  return (await git(['rev-parse', ref], cwd)).trim();
}

/** A committed blob, as bytes. */
export async function committedBlob(ref, path, cwd) {
  const r = await run('git', ['cat-file', 'blob', `${ref}:${path}`], { cwd, timeoutMs: 120_000, encoding: 'buffer', maxBuffer: 1 << 28 });
  if (r.timedOut) throw new Error(`git cat-file ${path} timed out`);
  if (r.code !== 0) throw new Error(`git cat-file ${ref}:${path} → exit ${r.code}: ${r.stderr.trim()}`);
  return r.stdout;
}

/**
 * Per proof: the sha of the ref's bytes and of the worktree's bytes.
 *
 * This is the runner's own honesty guard. A sweep that says "the committed proofs passed" while the
 * worktree holds rewritten copies of them would be describing scripts nobody ran — and on this repo
 * that is not hypothetical: the worktree and the ref differ per file right now.
 */
export async function proofDivergence(ref, cwd, corpus = null) {
  const rows = (corpus ?? (await proofCorpus(ref, cwd))).rows;
  return rows.map((r) => ({ name: r.name, committed: r.committed, worktree: r.worktree, dotIngest: r.dotIngest, ownWalk: r.ownWalk }));
}

function walk(dir, base, out) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(full);
  }
  return out;
}

/**
 * Identity of the code the proofs import: one digest over every file in every shipped `dist` tree,
 * keyed by path so a rename or a deletion cannot hide inside a same-size rewrite.
 */
export function distDigest(cwd, roots = DIST_ROOTS) {
  const hash = createHash('sha256');
  const files = [];
  for (const root of roots) {
    const top = join(cwd, root);
    if (!existsSync(top)) continue;
    for (const dirEntry of readdirSync(top).sort()) {
      const pkg = join(top, dirEntry);
      // Measured on this repo: `agents/README.md` sits beside the packages, so a directory listing is
      // not a list of directories — and a package with no build yet is a fact about the tree, not an error.
      if (!statSync(pkg).isDirectory()) continue;
      const dist = join(pkg, 'dist');
      if (existsSync(dist) && statSync(dist).isDirectory()) walk(dist, dist, files);
    }
  }
  files.sort((a, b) => relative(cwd, a).split(sep).join('/').localeCompare(relative(cwd, b).split(sep).join('/')));
  for (const f of files) hash.update(`${relative(cwd, f).split(sep).join('/')}\t${sha256(readFileSync(f))}\n`);
  return { digest: hash.digest('hex'), files: files.length };
}

/** Tracked-and-modified source under a workspace package — the thing a "clean tree" sentence has to mean. */
export async function dirtySources(cwd) {
  const status = await git(['status', '--porcelain'], cwd);
  return status
    .split(/\r?\n/)
    .filter((l) => l !== '' && !l.startsWith('??')) // an untracked file is not a modified tracked one
    // porcelain v1 has TWO status columns: slicing one leaves the letter glued to the path, which is how
    // this function first answered "0 dirty sources" about a tree that had them.
    .map((l) => l.slice(2).trim())
    .filter((p) => /^(agents|packages|apps|services)\/[^/]+\/src\//.test(p));
}

/** The adapter the production walker expects — node's own sync fs API satisfies it. */
const fsForWalker = {
  readdirSync: (dir) => readdirSync(dir, { withFileTypes: true }),
  statSync: (p) => statSync(p),
  readFileSync: (p, encoding) => readFileSync(p, encoding),
};

/**
 * The THIRD axis of a sweep's object, which v78 named as a bound and did not name as a number.
 *
 * `runProof` runs each materialised script with the REPOSITORY ROOT as cwd — that is how a proof reaches
 * `./agents/runtime/dist/index.js` — so a proof that reads `.` does not read the ref. Seven tracked
 * proofs call `collectTextFiles('.', fs)` and `code-index-proof.mjs` walks `process.cwd()` with its own
 * copy of the same rule; measured on this repository, that walk returns 220 files where a clean clone of
 * the same commit returns 193, and the 27 untracked ones carry 2 204 169 of the 3 801 218 bytes — so 637
 * of the 1 664 chunks one shipped proof asserts about are owned by no commit at all.
 *
 * The population is defined by the production walker itself, imported from the same `dist` the proofs
 * import, so the runner holds no second copy of the skip-list or extension rule — and because that
 * walker lives in the built code, the build axis already names its bytes.
 *
 * Ownership is split by git: tracked (the ref owns it), untracked-and-not-ignored (present, owned by
 * nobody), and the remainder by elimination, which is also how the expensive question — enumerating
 * every ignored file, `node_modules` included — is avoided.
 */
export async function walkedTree(cwd, distEntry = join(REPO_ROOT, 'agents', 'runtime', 'dist', 'index.js')) {
  if (!existsSync(distEntry)) throw new Error(`walkedTree: no built runtime at ${distEntry} — the tree the proofs walk is defined by that build, so the runner must not guess a copy of its rule`);
  const { collectTextFiles } = await import(pathToFileURL(distEntry).href);
  const files = collectTextFiles(cwd, fsForWalker);
  const paths = Object.keys(files).sort();
  // A clean checkout has no `.git`, and `ls-files` there exits 128 — measured, it crashed the identity
  // block of the first isolated run. The census is then UNAVAILABLE rather than zero: in that tree every
  // file IS the ref's bytes, so answering "0 untracked" would report a number for a question git was
  // never asked, which is the v48 lesson applied to the runner's own third axis.
  let ownership = null;
  try {
    ownership = {
      tracked: new Set((await git(['ls-files', '-z'], cwd)).split('\0').filter(Boolean)),
      untracked: new Set((await git(['ls-files', '--others', '--exclude-standard', '-z'], cwd)).split('\0').filter(Boolean)),
    };
  } catch (e) {
    if (!/not a git repository/.test(e.message)) throw e;
  }
  const owned = { tracked: [], untracked: [], other: [] };
  let bytes = 0;
  let untrackedBytes = 0;
  const hash = createHash('sha256');
  for (const p of paths) {
    const size = Buffer.byteLength(files[p], 'utf8');
    bytes += size;
    if (!ownership) owned.other.push(p); // no census: everything lands in the one bin that says "unknown"
    else if (ownership.tracked.has(p)) owned.tracked.push(p);
    else if (ownership.untracked.has(p)) {
      owned.untracked.push(p);
      untrackedBytes += size;
    } else owned.other.push(p); // present, not tracked, not untracked-when-ignored-are-excluded ⇒ ignored
    hash.update(`${p}\t${sha256(Buffer.from(files[p], 'utf8'))}\n`);
  }
  return {
    digest: hash.digest('hex'),
    files: paths.length,
    bytes,
    gitRepo: ownership !== null,
    tracked: ownership ? owned.tracked.length : null,
    untracked: ownership ? owned.untracked.length : null,
    untrackedBytes: ownership ? untrackedBytes : null,
    // With no git to ask, the files cannot be sorted by ownership at all; `other` only counts the
    // ignored-but-read ones, and a tree with no `.git` has no such notion.
    other: ownership ? owned.other.length : null,
    censusUnknown: ownership ? 0 : paths.length,
    sample: ownership ? owned.untracked.slice(0, 6) : [],
  };
}

/** Did the walked tree move while the sweep ran, and what to say when it did — kept separate so a witness can grade both shapes. */
export function treeMoveNotice(before, after) {
  if (before.unavailable || after.unavailable) {
    return `[identity] ⚠ the WALKED TREE could not be digested (at the start: ${before.digest ?? before.unavailable?.slice(0, 120)}; at the end: ${after.digest ?? after.unavailable?.slice(0, 120)}) — the rows cannot be said to have seen one tree, let alone the ref's`;
  }
  if (before.digest === after.digest) return null;
  return `[identity] ⚠ the WALKED TREE moved during this run: ${before.files} files / ${before.digest.slice(0, 16)} at the start, ${after.files} / ${after.digest.slice(0, 16)} at the end (${before.untracked} untracked then, ${after.untracked} now) — these rows were not all graded against the same working tree`;
}

/** A tree the runner cannot digest (no built runtime where the child stands) is reported, never guessed at. */
async function safeWalkedTree(cwd) {
  try {
    return await walkedTree(cwd, join(cwd, 'agents', 'runtime', 'dist', 'index.js'));
  } catch (e) {
    return { unavailable: e.message, digest: null, files: null, bytes: null };
  }
}

const treeLabel = (t) => (t.unavailable ? `UNDIGESTABLE (${t.unavailable.slice(0, 90)})` : `${t.files} files / ${t.bytes} B, digest ${t.digest.slice(0, 16)}`);

/**
 * ONE pass over the ref's proof blobs, because everything the identity block says about the population —
 * its bytes, its divergence from the worktree, which tree it reads, which cwd it resolves its code
 * through — is a property of the same 64 files. Measured on this box: three separate passes left a sweep
 * spending 13 minutes in `git cat-file` (a Windows spawn is not free), and a runner slower than the
 * per-proof budget it grades is a runner nobody runs. The readers below keep their own signatures and
 * accept an optional corpus, so a witness may still ask one question without building the rest.
 */
export async function proofCorpus(ref, cwd) {
  const names = await trackedProofs(ref, cwd);
  const blobs = await catFileBatch(names.map((n) => `${ref}:${n}`), cwd, names.length);
  const rows = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const bytes = blobs[i];
    const text = bytes.toString('utf8');
    const file = join(cwd, name);
    rows.push({
      name,
      bytes,
      text,
      committed: sha256(bytes),
      worktree: existsSync(file) ? sha256(readFileSync(file)) : null,
      // v80: two tree shapes, counted SEPARATELY because they are two different facts, and `process.cwd(`
      // alone is not one of them — most scripts name a cwd only to reach the `dist` they import.
      dotIngest: /collectTextFiles\s*\(\s*['"]\./.test(text),
      ownWalk: /readdirSync\s*\(/.test(text) && /SKIP_DIRS|TEXT_EXT/.test(text),
      // v83: how the script reaches the CODE it grades — see `proofImportIdioms`.
      childRelative: /pathToFileURL\(\s*['"]\/?\.\/|pathToFileURL\(\s*join\(/.test(text),
      fileRelative: /from\s+['"]\.[./]/.test(text) || /import\.meta\.url/.test(text),
    });
  }
  // A batch parser that is one byte off would corrupt EVERY row while looking fast and green, so two of
  // them are checked against the slow, obvious path — the first and the last, the ends of the stream.
  for (const i of [0, names.length - 1]) {
    if (i < 0) continue;
    const solo = await committedBlob(ref, names[i], cwd);
    if (!solo.equals(rows[i].bytes)) throw new Error(`proofCorpus: the batch read of ${names[i]} is ${rows[i].bytes.length} B and the single read is ${solo.length} B — the stream parser is off`);
  }
  return { ref, rows };
}

/**
 * `git cat-file --batch` for a list of object names, in ONE spawn.
 *
 * This exists because of a measurement, not a hunch: the first v83 sweep spent 13 minutes and 58 seconds
 * reading 64 blobs three times over through `committedBlob`, which is one `git` process per blob, ~1.9 s
 * apiece on this box. One batch call answers the same questions in about a second — and a runner that is
 * slower than the per-proof budget it enforces (240 s) is a runner that times out its own witnesses.
 *
 * The reply is `<oid> blob <size>\n<size bytes>\n` per request, so the sizes are read from git, not
 * guessed from newlines: a proof's bytes may contain anything, and several of them are CRLF.
 */
async function catFileBatch(queries, cwd, expected) {
  const r = await run('git', ['cat-file', '--batch'], { cwd, timeoutMs: 300_000, encoding: 'buffer', stdin: queries.join('\n') + '\n', maxBuffer: 1 << 29 });
  if (r.timedOut) throw new Error('git cat-file --batch timed out');
  if (r.code !== 0) throw new Error(`git cat-file --batch → exit ${r.code}: ${r.stderr.toString('utf8').trim().slice(0, 200)}`);
  const out = r.stdout;
  const blobs = [];
  let pos = 0;
  for (let i = 0; i < expected; i++) {
    const nl = out.indexOf(0x0a, pos);
    if (nl < 0) throw new Error(`cat-file --batch: no header line for request ${i} of ${expected} (stream ended at ${pos})`);
    const header = out.slice(pos, nl).toString('utf8').trim();
    const m = /^([0-9a-f]{7,40}) blob (\d+)$/.exec(header);
    if (!m) throw new Error(`cat-file --batch: request ${i} answered ${header.slice(0, 80) || 'MISSING'} — not "<oid> blob <size>"; a missing object means the ref lacks a proof the listing named`);
    const size = Number(m[2]);
    if (nl + 1 + size > out.length) throw new Error(`cat-file --batch: header says ${size} B for request ${i} but the stream has ${out.length - nl - 1}`);
    blobs.push(out.slice(nl + 1, nl + 1 + size));
    pos = nl + 1 + size + 1; // skip the newline that terminates the payload
  }
  return blobs;
}

/** Write the ref's bytes into a temp directory, one file per proof, and report what landed where. */
export async function materialize(ref, dest, cwd, corpus = null) {
  const rows = (corpus ?? (await proofCorpus(ref, cwd))).rows;
  const landed = [];
  for (const row of rows) {
    const target = join(dest, row.name.split('/').pop());
    writeFileSync(target, row.bytes);
    landed.push({ name: row.name, target, sha: row.committed, bytes: row.bytes.length });
  }
  return landed;
}

/**
 * How the tracked population locates the CODE IT GRADES. Measured from the ref's own bytes, and the
 * answer decides a question v78–v82 never asked: 61 of HEAD's proofs spell the import as
 * `pathToFileURL('./agents/runtime/dist/index.js')` and 3 as `pathToFileURL(join(root, …))` with
 * `root = process.cwd()` — `pathToFileURL` resolves a relative path against `process.cwd()`, so ALL of
 * them are resolved by the CHILD's cwd, and NONE by the script's own location (`fileRelative` is 0).
 *
 * That makes `runProof`'s `cwd` argument more than a corpus choice. A sweep of an older ref with the
 * worktree as cwd runs the older PROOF TEXT against the CURRENT BUILD — while `[identity]` was quoting
 * the build digest of whatever tree the runner happened to sit in. The census is printed next to the
 * probe that measures the resolution, so the sentence names both.
 */
export async function proofImportIdioms(ref, cwd, corpus = null) {
  const rows = (corpus ?? (await proofCorpus(ref, cwd))).rows;
  const count = (k) => rows.filter((r) => r[k]).length;
  return {
    rows,
    total: rows.length,
    childRelative: count('childRelative'),
    fileRelative: count('fileRelative'),
    unresolved: rows.filter((r) => !r.childRelative && !r.fileRelative).map((r) => r.name),
  };
}

/** The four shipped entries the tracked proofs actually import — read off HEAD's bytes, not guessed. */
export const PROBED_BUILDS = [
  'agents/runtime/dist/index.js',
  'agents/exec-host/dist/index.js',
  'packages/design-model/dist/index.js',
  'packages/ai-providers/dist/index.js',
];

/**
 * Ask a CHILD what it would load, instead of inferring it from the runner's own view of the filesystem.
 *
 * The script written here is the runner's, not a proof's, so it may be asked anything — and what it is
 * asked is the population's own idiom: `pathToFileURL('./x')` and `fileURLToPath`, then the sha of the
 * bytes that resolve. It also reports its OWN `process.cwd()`, because "I passed cwd=X to spawn" is a
 * claim about an argument and "the child says it is standing at X" is an observation; on Windows those
 * two can differ (drive-letter case, 8.3 segments), and every `proofsCwd` sentence below rests on which
 * one the runner checked.
 */
export async function probeChildResolution(cwd, specs = PROBED_BUILDS, timeoutMs = 60_000) {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-cwdprobe-'));
  const file = join(dir, 'probe.mjs');
  writeFileSync(
    file,
    [
      "import { createHash } from 'node:crypto';",
      "import { existsSync, readFileSync } from 'node:fs';",
      "import { fileURLToPath, pathToFileURL } from 'node:url';",
      'const specs = JSON.parse(process.argv[2]);',
      'const out = specs.map((s) => {',
      "  const path = fileURLToPath(pathToFileURL('./' + s).href);",
      '  const exists = existsSync(path);',
      '  return { spec: s, path, exists, sha: exists ? createHash(\"sha256\").update(readFileSync(path)).digest(\"hex\") : null };',
      '});',
      'console.log(JSON.stringify({ cwd: process.cwd(), execPath: process.execPath, resolved: out }));',
    ].join('\n'),
    'utf8'
  );
  try {
    const r = await run(process.execPath, [file, JSON.stringify(specs)], { cwd, timeoutMs });
    if (r.code !== 0) throw new Error(`cwd probe exited ${r.code} at ${cwd}: ${r.stderr.trim().slice(0, 200)}`);
    return { ...JSON.parse(r.stdout), specs, probe: file, code: r.code, timedOut: r.timedOut };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function tailOf(text, n) {
  return text.split(/\r?\n/).filter(Boolean).slice(-n).join(' | ').slice(0, 300);
}

/**
 * The reason a script failed is its FIRST stderr line, not its last: measured here, a thrown Error
 * writes `Error: measured failure` and then four stack lines ending in `Node.js v24.x`, so a tail-read
 * FAIL row reports the runtime's version and loses the thing worth reading. Proof scripts end with a
 * `[summary]` line, which is why stdout keeps the tail and stderr takes the head.
 */
function headOf(text, n) {
  return text.split(/\r?\n/).filter(Boolean).slice(0, n).join(' | ').slice(0, 300);
}

/**
 * A build verdict is not finished when it names a PACKAGE; it is finished when it names a LINE THE BUILD
 * WROTE. Measured on the first isolated build: 55 non-empty output lines, and the failure's own line
 * (`Module not found: Error: Can't resolve …`) sits at index 35 while turbo's summary banner occupies 49-54
 * — so `tailOf(text, 4)` reports `Failed: @nexus/studio#build` and LOSES the reason entirely. That is the
 * rule `runProof` already states for scripts ("the reason is the FIRST stderr line, not its last")
 * reproduced one function over by newer code, and the same rule v52+ established for the git doors: a
 * failure sentence must quote the verdict line, not the banner.
 *
 * Pure and exported so a witness can grade the SELECTION on text it wrote itself, rather than waiting 35
 * seconds for a build that happens to fail in the right shape — and so `reason: null` stays an honest
 * answer when nothing reason-shaped was captured, instead of the banner being dressed up as one.
 */
export function describeBuild(text) {
  const all = text.split(/\r?\n/).filter((l) => l.trim());
  const failed = [...text.matchAll(/Failed:\s+(\S+)/g)].map((m) => m[1]);
  const reasons = all.filter((l) => /Module not found|Can't resolve|Cannot find module|error TS\d+|BUILD FAILED|Build failed|SyntaxError|ReferenceError|TypeError:|panic:|fatal:\s/i.test(l));
  // Prefer a line the FAILING task itself printed: turbo prefixes every task line `@scope/name:task:`, so
  // `@nexus/studio#build` → `@nexus/studio:build:`. An earlier error from a package that passed is not
  // this build's reason, and neither is the summary that only counts.
  const reason = failed.map((f) => reasons.find((l) => l.includes(f.replace('#', ':')))).find(Boolean) ?? reasons[0] ?? null;
  return { lines: all.length, bytes: Buffer.byteLength(text), failed, reasons: reasons.slice(0, 8), reason, tail: tailOf(text, 4), head: headOf(text, 3) };
}

/**
 * A CLEAN CHECKOUT of the ref, in a temp directory — the only way to run the tree-walking proofs against
 * the second axis v80 measured rather than the first. `git archive` gives the ref's tracked bytes with no
 * `.git` and nothing untracked, so what a proof walks there is exactly what a commit owns.
 *
 * `node_modules` has to be rebuilt, and that is the load-bearing part: this repository's
 * `node_modules/@nexus/*` are ABSOLUTE symlinks into the working tree, so reusing the home install as it
 * stands would compile the HOME sources into the HOME dist and move the very digest the sweep is grading.
 * Third-party packages are junctioned read-only; every workspace package is linked from the temp tree
 * instead. The caller proves the isolation by digesting the home build before and after — see
 * `isolated-proof.mjs`, which fails the increment if that digest moved.
 */
export async function isolatedCheckout({ ref = 'HEAD', cwd = process.cwd(), dest = mkdtempSync(join(tmpdir(), 'nexus-isolated-')), build = true, log = console.log } = {}) {
  const root = join(dest, 'repo');
  mkdirSync(root, { recursive: true });
  const tar = await run('git', ['archive', '--format=tar', ref], { cwd, timeoutMs: 180_000, encoding: 'buffer', maxBuffer: 1 << 29 });
  if (tar.code !== 0) throw new Error(`git archive ${ref} → exit ${tar.code}: ${tar.stderr.toString().trim().slice(0, 200)}`);
  const tarFile = join(dest, 'ref.tar');
  writeFileSync(tarFile, tar.stdout);
  // GNU tar reads `C:\…` as a remote host because of the drive colon, so --force-local and forward slashes.
  const untar = await run('tar', ['--force-local', '-xf', tarFile.replace(/\\/g, '/'), '-C', root.replace(/\\/g, '/')], { cwd, timeoutMs: 180_000 });
  if (untar.code !== 0) throw new Error(`tar -xf ref.tar → exit ${untar.code}: ${untar.stderr.toString().trim().slice(0, 200)}`);

  const homeNm = join(cwd, 'node_modules');
  const nm = join(root, 'node_modules');
  mkdirSync(nm);
  let links = 0;
  const linkFailures = [];
  for (const entry of readdirSync(homeNm)) {
    if (entry === '@nexus' || entry === '.cache') continue; // these two are the ones that must NOT be the home's
    try {
      symlinkSync(join(homeNm, entry), join(nm, entry), 'junction');
      links += 1;
    } catch (e) {
      linkFailures.push(`${entry}: ${e.code}`);
    }
  }
  mkdirSync(join(nm, '.cache')); // turbo's cache must not be the home repo's
  // The workspace links come from the archived tree's OWN package.json globs, not from the home install's
  // absolute targets, so this function never needs to know where the home repo thinks it lives.
  const workspace = [];
  const globs = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces ?? [];
  for (const glob of globs) {
    const dir = join(root, glob.replace(/\*$/, ''));
    if (!existsSync(dir)) continue;
    for (const pkg of readdirSync(dir)) {
      const manifest = join(dir, pkg, 'package.json');
      if (!existsSync(manifest)) continue;
      const { name } = JSON.parse(readFileSync(manifest, 'utf8'));
      if (!name) continue;
      const target = join(nm, name);
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(join(dir, pkg), target, 'junction');
      workspace.push(name);
    }
  }

  let built = null;
  if (build) {
    const started = Date.now();
    // `spawn('npm')` is ENOENT on Windows — npm is an npm.cmd and needs a shell (measured, not assumed).
    const b = await run('cmd.exe', ['/c', 'npm', 'run', 'build'], { cwd: root, timeoutMs: 1_800_000 });
    const raw = `${b.stdout}\n${b.stderr}`;
    // Written to `dest`, OUTSIDE `root`: the checked-out tree must contain the ref and nothing else, and a
    // witness counts exactly that. Every sentence below is a claim about bytes a reader can go look at.
    const logFile = join(dest, 'build.log');
    writeFileSync(logFile, raw, 'utf8');
    built = { ...describeBuild(raw), code: b.code, timedOut: b.timedOut, ms: Date.now() - started, logFile };
  }
  log(`[isolated] ${ref} → ${root}: ${tar.stdout.length} bytes of tar · ${links} third-party junctions${linkFailures.length ? ` (${linkFailures.length} failed: ${linkFailures.slice(0, 3).join(', ')})` : ''} · ${workspace.length} workspace links from the ARCHIVED globs (${workspace.join(', ')})${build ? ` · build exit ${built.code}${built.timedOut ? ' TIMEOUT' : ''} in ${(built.ms / 1000).toFixed(1)}s · ${built.lines} output lines${built.failed.length ? ` · FAILED ${built.failed.join(', ')}` : ' · all packages'}${built.code !== 0 ? ` · reason ${built.reason ? `“${built.reason.slice(0, 160)}”` : 'NONE CAPTURED (the banner is not a reason)'}` : ''}` : ''}`);
  return { dir: dest, root, archiveBytes: tar.stdout.length, links, linkFailures, workspace, build: built };
}

/**
 * Run one script with the CALLER's cwd — and since v83 the caller can choose a cwd that is not the
 * repository root. Before that option existed this function's second argument was always the root, which
 * is how a proof reached `./agents/runtime/dist/index.js` and also why it was THIS worktree's build.
 */
export async function runProof(file, cwd, timeoutMs = DEFAULT_PROOF_TIMEOUT_MS) {
  const started = Date.now();
  const r = await run(process.execPath, [file], { cwd, timeoutMs, maxBuffer: 8 * 1024 * 1024 });
  return {
    file,
    code: r.code,
    signal: r.signal,
    timedOut: r.timedOut,
    ms: Date.now() - started,
    tail: tailOf(r.stdout, 2),
    errTail: headOf(r.stderr, 3),
    ok: r.code === 0 && !r.timedOut,
  };
}

/** The block every future sweep sentence should quote: which ref, which build, which dirt, which tree. */
export async function identityBlock(ref, cwd) {
  const sha = await commitOf(ref, cwd);
  const dist = distDigest(cwd);
  return {
    ref,
    sha,
    node: process.version,
    platform: process.platform,
    git: (await git(['--version'], cwd)).trim(),
    distDigest: dist.digest,
    distFiles: dist.files,
    dirtySources: await dirtySources(cwd),
    tree: await walkedTree(cwd),
  };
}

/**
 * The sweep: identity first, then every committed proof of that ref run from a temp directory, then a
 * summary line written so it can be pasted into an amendment without paraphrase.
 *
 * `proofsCwd` is the child's working directory and it defaults to `cwd`, which has a consequence bigger
 * than where a script reads `.` from: `proofImportIdioms` measures that every tracked proof resolves the
 * shipped `dist` it grades through the CHILD's cwd, so this argument picks THE BUILD UNDER TEST. Point it
 * at an `isolatedCheckout` root and the run says "the ref's proof text, against the ref's build, walking
 * the ref's tree"; leave it at the default and the ref's text is being graded against whatever this
 * worktree most recently compiled — which is what every sweep before v83 did, including the ones this
 * file's own comments describe.
 */
export async function runSweep({ ref = 'HEAD', only = null, cwd = process.cwd(), proofsCwd = null, corpus = null, timeoutMs = DEFAULT_PROOF_TIMEOUT_MS, keep = false, log = console.log, beforeRecheck = null } = {}) {
  const id = await identityBlock(ref, cwd);
  const runCwd = proofsCwd ?? cwd;
  const probe = await probeChildResolution(runCwd);
  // A caller that has already read the population — a witness that censused it in its own §1 — hands the
  // blobs over rather than paying ~21 s of `git cat-file --batch` per sweep.
  const banked = corpus && corpus.ref === ref ? corpus : null;
  const runCorpus = banked ?? (await proofCorpus(ref, cwd));
  const idioms = await proofImportIdioms(ref, cwd, runCorpus);
  const childBuild = runCwd === cwd ? { digest: id.distDigest, files: id.distFiles } : distDigest(runCwd);
  const childTree = await safeWalkedTree(runCwd);
  log(`[identity] ref ${id.ref} = ${id.sha.slice(0, 12)} · node ${id.node} · ${id.platform} · ${id.git}`);
  log(`[identity] build at the runner's cwd: ${id.distFiles} dist files, digest ${id.distDigest.slice(0, 16)} (sha256 over path+content of every shipped dist file)`);
  log(`[identity] dirty tracked sources under packages: ${id.dirtySources.length}${id.dirtySources.length ? ` — ${id.dirtySources.slice(0, 6).join(', ')}${id.dirtySources.length > 6 ? ' …' : ''}` : ''}`);
  if (runCwd !== cwd) log(`[identity] tree at the RUNNER's cwd (not the one the rows read): ${treeLabel(id.tree)} · owned by the ref ${id.tree.tracked} · UNTRACKED ${id.tree.untracked} (${id.tree.untrackedBytes} B) · ignored-but-read ${id.tree.other}${id.tree.sample.length ? ` — e.g. ${id.tree.sample.join(', ')} …` : ''}`);
  log(`[identity] child cwd for every row below: spawn was given ${runCwd}, the child reports ${probe.cwd}${probe.cwd === resolve(runCwd) || probe.cwd === runCwd ? '' : ' ⚠ NOT the directory spawn named — this run is not pointing where the flag said'}`);
  log(`[identity] what a child standing there LOADS (its own resolution of the population's idiom): ${probe.resolved.map((r) => `${r.spec.split('/').slice(0, 2).join('/')} = ${r.sha ? r.sha.slice(0, 16) : 'MISSING'}`).join(' · ')}`);
  if (runCwd !== cwd) log(`[identity] build AT THAT cwd: ${childBuild.files} dist files, digest ${childBuild.digest.slice(0, 16)} — vs ${id.distDigest.slice(0, 16)} at the runner's cwd, so the two are not the same code`);
  log(`[identity] imports: ${idioms.childRelative}/${idioms.total} tracked proofs reach the code under test through the CHILD's cwd, ${idioms.fileRelative} through their own file location${idioms.unresolved.length ? `, ${idioms.unresolved.length} through neither (${idioms.unresolved.map((n) => n.split('/').pop()).join(', ')})` : ''} — so "the ref's bytes are what runs" describes the SCRIPTS, and this line's cwd decides the BUILD they grade`);
  log(`[identity] walked tree (read by the tree-walking scripts through the CHILD's cwd, so the WORKING TREE at ${runCwd} and not the ref's bytes): ${treeLabel(childTree)}${childTree.unavailable ? '' : ` · census ${childTree.gitRepo ? `tracked ${childTree.tracked} / untracked ${childTree.untracked} / ignored ${childTree.other}` : 'NO .git — every file here is the ref\'s'}`}`);

  const dest = mkdtempSync(join(tmpdir(), 'nexus-sweep-'));
  const started = Date.now();
  let results;
  try {
    const landed = await materialize(ref, dest, cwd, runCorpus);
    const divergence = await proofDivergence(ref, cwd, runCorpus);
    const differs = divergence.filter((r) => r.worktree !== r.committed).length;
    const walkers = divergence.filter((r) => r.dotIngest || r.ownWalk).length;
    log(`[identity] scripts: ${landed.length} committed proofs materialised into ${dest}${differs ? ` · ${differs} of them differ from the WORKTREE copy (the ref's bytes are what runs)` : ' · worktree copies identical to the ref'}`);
    log(`[identity] of those ${landed.length}, ${walkers} read the WORKING TREE as their corpus by their own text scan — ${divergence.filter((r) => r.dotIngest).length} call collectTextFiles on '.' and ${divergence.filter((r) => r.ownWalk).length} re-implement the walk over process.cwd() (a scan of the committed bytes, not an observation of what a process opened; the whole population reads the code under test the same way, two lines above)`);
    const chosen = only ? landed.filter((l) => l.name.includes(only)) : landed;
    if (chosen.length === 0) throw new Error(`--only "${only}" selected no committed proof`);
    results = [];
    for (const l of chosen) {
      const r = await runProof(l.target, runCwd, timeoutMs);
      results.push({ ...r, name: l.name, sha: l.sha });
      log(`${r.ok ? 'OK  ' : 'FAIL'} ${l.name.split('/').pop()} (exit ${r.code}${r.timedOut ? ', TIMEOUT' : ''}, ${r.ms}ms) :: ${r.tail}${r.ok ? '' : ' || ' + r.errTail}`);
    }
  } finally {
    if (keep) log(`[keep] materialised copies left in ${dest}`);
    else {
      try {
        rmSync(dest, { recursive: true, force: true });
      } catch (e) {
        log(`[cleanup] ${dest} survived: ${e.code || e.message}`);
      }
    }
  }
  const failed = results.filter((r) => !r.ok);
  // A sweep is long enough for someone to rebuild — or to drop a file into the tree these scripts walk.
  // `beforeRecheck` is a documented seam, not a test hook for its own sake: the re-check has to be
  // gradeable against a tree that moved, and nothing deterministic can move it from inside a sweep of
  // read-only scripts.
  if (beforeRecheck) await beforeRecheck();
  const after = distDigest(cwd);
  const stable = after.digest === id.distDigest;
  if (!stable) log(`[identity] ⚠ the build MOVED during this run: ${id.distDigest.slice(0, 16)} (${id.distFiles} files) at the start, ${after.digest.slice(0, 16)} (${after.files} files) at the end — these rows were not all graded against the same bytes`);
  const childTreeAfter = await safeWalkedTree(runCwd);
  const treeNotice = treeMoveNotice(childTree, childTreeAfter);
  if (treeNotice) log(treeNotice);
  const childBuildAfter = runCwd === cwd ? after : distDigest(runCwd);
  const childStable = childBuildAfter.digest === childBuild.digest;
  if (runCwd !== cwd && !childStable) log(`[identity] ⚠ the GRADED build moved during this run: ${childBuild.digest.slice(0, 16)} at the start, ${childBuildAfter.digest.slice(0, 16)} at the end, both at ${runCwd}`);
  log(`\n[summary] ref ${id.sha.slice(0, 12)} · scripts ${results.length} · failed ${failed.length} · child cwd ${probe.cwd} · graded build ${childBuild.digest.slice(0, 16)} (${childBuild.files} dist files${childStable ? ', stable across the run' : ', BUILD MOVED mid-run'})${runCwd === cwd ? '' : ` · runner's own build ${id.distDigest.slice(0, 16)}${stable ? ' stable' : ' MOVED'}`} · tree ${childTree.unavailable ? `UNDIGESTABLE (${childTree.unavailable.slice(0, 60)})` : `${childTree.digest.slice(0, 16)} (${treeNotice ? 'MOVED mid-run' : 'stable'}) ${childTree.files} files`} · dirty-sources ${id.dirtySources.length} · ${Math.round((Date.now() - started) / 1000)}s`);
  return { identity: id, results, failed, dir: dest, distStable: stable, distAfter: after, treeStable: treeNotice === null, treeAfter: childTreeAfter, treeNotice, proofsCwd: runCwd, childProbe: probe, childBuild, childBuildAfter, childStable, importIdioms: idioms, childTree };
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const isolated = argv.includes('--isolated');
  const ref = opt('--ref') ?? 'HEAD';
  const common = { ref, only: opt('--only') ?? null, timeoutMs: Number(opt('--timeout') ?? DEFAULT_PROOF_TIMEOUT_MS), keep: argv.includes('--keep') };
  const finish = (s) => process.exit(s.failed.length ? 1 : 0);
  if (!isolated) {
    runSweep(common).then(finish).catch((e) => {
      console.error(`[sweep] ${e.message}`);
      process.exit(2);
    });
  } else {
    // `--isolated` is the whole point of `proofsCwd`: the proofs are spawned INSIDE the ref's own tree, so
    // what they import is the ref's build rather than this worktree's. `--no-build` extracts the tree and
    // leaves it unbuilt, which measures the other half of the same claim (the population then finds
    // NOTHING to load) without waiting on a clean-room compile.
    const iso = await isolatedCheckout({ ref, build: !argv.includes('--no-build'), log: (l) => console.log(l) });
    runSweep({ ...common, proofsCwd: iso.root })
      .then((s) => {
        const home = distDigest(process.cwd());
        console.log(`[isolated] home build after the run: ${home.files} files, digest ${home.digest.slice(0, 16)}${home.digest === s.identity.distDigest ? ' · UNMOVED (the isolation gate)' : ` · MOVED from ${s.identity.distDigest.slice(0, 16)} — this run compiled into the repository it was grading`}`);
        if (!common.keep) rmSync(iso.dir, { recursive: true, force: true });
        finish(s);
      })
      .catch(async (e) => {
        console.error(`[sweep --isolated] ${e.message}`);
        if (!common.keep) rmSync(iso.dir, { recursive: true, force: true });
        process.exit(2);
      });
  }
}
