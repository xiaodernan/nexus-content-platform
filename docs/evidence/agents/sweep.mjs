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
// M2 v88 adds the fourth half, which the first three never questioned: the population is a CLOSURE, not
// a directory. Since amendment 86, 32 of the tracked proofs import a shared file that does not live in
// `docs/evidence/agents`, and the materialiser wrote the ref's bytes ONE FILE PER PROOF into a flat temp
// directory — so that import could not resolve twice over (the file was not fetched, and `../lib` from a
// flat copy points outside the copy). Measured on ref `e04e3ae`: 35 of 68 rows red, 32 of them
// `ERR_MODULE_NOT_FOUND`, and every one of those rows reported an EMPTY reason followed by a stack line,
// because the only line that names the missing module is the FOURTH line of stderr and the runner quoted
// three. A reader of that report could not tell "32 proofs broke" from "the runner cannot stage a proof",
// which is the same mistake amendment 86 found in `ran: true`. Hence: fetch what the proofs import, in the
// ref's own directory shape, and quote the sentence that names the cause instead of a window onto a stack.
//
// It is a HUMAN-RUN tool, not an agent door: it shells out to `git` with the ambient environment (§9 is
// held by never writing inside the repository except into a temp dir OUTSIDE it — v84 added that the dir
// is chosen on the repository's own DRIVE rather than wherever os.tmpdir() happens to be, because the
// drive under a clean checkout decides whether its clean-room build compiles at all — and by running
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
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const PROOF_DIR = 'docs/evidence/agents';
export const DIST_ROOTS = ['agents', 'packages'];
export const DEFAULT_PROOF_TIMEOUT_MS = 240_000;
/** This file lives at `<repo>/docs/evidence/agents/sweep.mjs`, so the repository root is three levels up. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The DRIVE a path sits on: `C:\` or `D:\` on Windows, and `/` for every path on POSIX — which is the
 * honest shape of the axis v84 found: on a POSIX host the two arms below cannot differ and the question
 * does not arise, while on a Windows host with `os.tmpdir()` on another drive than the repository it
 * decides whether an isolated build compiles at all.
 */
export const driveOf = (p) => parse(resolve(p)).root;

/** The largest budget one row may ask for. Above it a human has to say so with `--timeout`, deliberately. */
export const MAX_ROW_BUDGET_MS = 3_600_000;

/**
 * Read the budget a proof names for ITSELF, from its own first-column comment:
 *
 *     // sweep-budget-ms: 900000
 *
 * This exists because of a measurement, not a preference: v84 found `isolated-proof.mjs` taking 338 000 ms
 * for its clean-room build, and 513 000–522 000 ms under load, while every row of a sweep was given the
 * same `DEFAULT_PROOF_TIMEOUT_MS`. A runner that stops asking at 240 000 ms cannot distinguish that row
 * from one that hung, so for the whole of v81→v84 the full sweep contained a red that was a fact about a
 * constant in this file. The declaration is read from the REF's bytes, like every other fact this runner
 * takes from the population it grades, and a form it does not recognise is refused OUT LOUD rather than
 * obeyed silently — `null`-style honesty, as in v80's census.
 */
export function rowBudget(text, fallback = DEFAULT_PROOF_TIMEOUT_MS) {
  // v94: read through the same code-position tokenizer that reads `sweep-asks-repository`, so a budget marker
  // quoted inside a string or a block comment cannot buy a row extra milliseconds. Measured over HEAD's 71 scored
  // rows before shipping: both grammars agree on ALL 71 (three declarations — 900 000 / 600 000 / 300 000 ms —
  // parse to the same value either way), so this closes a hole the population does not yet exercise, and the
  // number a sweep was graded with does not move. `asks-axis-proof.mjs` §5 holds the reader to the PAYLOAD it
  // was handed, because the migration itself first shipped `all[0][1]` — the second CHARACTER of the payload.
  const all = declarations(text, 'sweep-budget-ms');
  if (all.length === 0) return { budgetMs: fallback, budgetSource: 'default', note: null };
  const refuse = (note) => ({ budgetMs: fallback, budgetSource: 'refused', note });
  if (all.length > 1) return refuse(`${all.length} declarations — a row names its budget once, and the runner will not guess which`);
  const raw = all[0];
  if (!/^\d+$/.test(raw)) return refuse(`declared ${JSON.stringify(raw)} is not a whole number of milliseconds`);
  const n = Number(raw);
  if (n <= 0) return refuse(`declared ${n}ms — no duration is asked for, so this is not a budget`);
  if (n > MAX_ROW_BUDGET_MS) return refuse(`declared ${n}ms exceeds the ${MAX_ROW_BUDGET_MS}ms ceiling a row may claim; raise --timeout for the whole sweep instead`);
  return { budgetMs: n, budgetSource: 'declared', note: null };
}

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

/**
 * `git cat-file --batch` for objects that MAY NOT EXIST, answering `null` for the ones the ref lacks.
 *
 * The strict reader above cannot be reused for a closure probe: there, a missing object is the FINDING
 * (v88's whole point is that a proof can import a file no commit owns), while here it would be a thrown
 * error that hides every other answer in the same batch. Git's own shape is exact — `<query> missing` —
 * so it is compared, not pattern-guessed.
 */
async function catFileBatchOptional(queries, cwd) {
  const r = await run('git', ['cat-file', '--batch'], { cwd, timeoutMs: 300_000, encoding: 'buffer', stdin: queries.join('\n') + '\n', maxBuffer: 1 << 29 });
  if (r.timedOut) throw new Error('git cat-file --batch (closure probe) timed out');
  const out = r.stdout;
  const blobs = [];
  let pos = 0;
  for (let i = 0; i < queries.length; i++) {
    const nl = out.indexOf(0x0a, pos);
    if (nl < 0) throw new Error(`cat-file --batch: no header for request ${i} of ${queries.length} (stream ended at ${pos})`);
    const header = out.slice(pos, nl).toString('utf8').trim();
    if (header === `${queries[i]} missing`) {
      blobs.push(null);
      pos = nl + 1;
      continue;
    }
    const m = /^([0-9a-f]{7,40}) blob (\d+)$/.exec(header);
    if (!m) throw new Error(`cat-file --batch: request ${i} answered ${header.slice(0, 80) || 'MISSING'} — neither a blob header nor an exact "missing"`);
    const size = Number(m[2]);
    if (nl + 1 + size > out.length) throw new Error(`cat-file --batch: header says ${size} B for request ${i} but the stream has ${out.length - nl - 1}`);
    blobs.push(out.slice(nl + 1, nl + 1 + size));
    pos = nl + 1 + size + 1;
  }
  return blobs;
}

/**
 * Every relative (`./`, `../`) specifier the text ACTUALLY imports, deduplicated.
 *
 * M2 v89 corrected what v88 shipped. The first version matched `from '…'` anywhere in the BYTES, which is
 * amendment 64's fault in a new costume: a quotation can wear an import's shape. The proof that found it was
 * `closure-proof.mjs` itself — green standalone at 03:55, red in the sweep of `1c9c7ee` at 03:57 without one
 * character of it changing, because the only thing that happened in between was that it got COMMITTED and so
 * joined the population it scans. Its §1 hands a snippet of source text to this function inside a template
 * literal, so the ref's copy of that proof "imported" `docs/evidence/lib/s.mjs` and
 * `docs/evidence/agents/x.mjs`, and the identity block dutifully reported two unsatisfiable edges that exist
 * only as sample code. Measured over the proof directory: the byte reader called 33 of 71 files an importer,
 * the code-position reader calls 32 one, and the single difference is exactly that proof.
 *
 * So a specifier counts only when the token introducing it stands at CODE position — outside every comment
 * and outside every string body. A template's `${ … }` interpolation IS code, so an import written there
 * still counts, which is the asymmetry a line-based rule could never express.
 */
export function relativeSpecs(text) {
  const src = String(text ?? '');
  const found = [];
  let code = ''; // the code-position text so far; only its tail can introduce a specifier
  let i = 0;
  const introduced = () => /(?:\bfrom|\bimport\s*\()\s*$/.test(code);
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      let body = '';
      let interp = '';
      while (i < src.length) {
        if (src[i] === '\\') {
          if (src[i + 1] !== '\n') body += src[i + 1];
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            else interp += src[i];
            i++;
          }
          continue;
        }
        body += src[i];
        i++;
      }
      if (introduced() && body.startsWith('.')) found.push(body);
      code = code.slice(-4000);
      for (const nested of relativeSpecs(interp)) found.push(nested);
      continue;
    }
    code += c;
    i++;
  }
  return [...new Set(found)];
}


/**
 * Which rows ask the REPOSITORY about itself — counted from the ref's bytes, before any row runs (M2 v93).
 *
 * Amendment 92 established the axis with a number read off a finished run: 43 of 43 reds shared one cause, a
 * tree with no `.git`. Reading that number after the rows means every one of them rediscovered `exit 128` on
 * its own. This is the same question asked of the bytes in advance, so the prediction can be RECONCILED with
 * the verdicts afterwards — a disagreement is then a finding about the scanner or about a row, not a surprise.
 *
 * Amendment 89's discipline carries over: a string that merely says git is not a reach. So a literal counts
 * only at code position (outside every comment and every string body, with `${ … }` re-entered as code) AND
 * where a program name or an argv actually goes — R1 is the first argument of a call into the child-process
 * family (node's names plus the `run`-shaped entries this host's `docs/evidence/lib/syncproc.mjs` bridge
 * exports), R2 opens an ARRAY, because `['git','status','*']` is how the exec-host doors are driven: the host
 * forks the child, not the proof. Measured over the population: 113 hits by R1, 124 by R2.
 *
 * What it cannot see is named rather than hidden, because the run reports it anyway: a program name bound to
 * a variable first (`const sh = (cmd, argv) => …; sh('git', …)`) and a row that reaches git THROUGH this
 * file's own helpers (`sw.proofCorpus`, `sw.isolatedCheckout`) both look like nothing to a call-site scanner.
 */
export const SPAWN_FAMILY = new Set(['execFileSync', 'execFile', 'spawnSync', 'spawn', 'execSync', 'exec', 'fork', 'run', 'runSync']);
export const GIT_PROGRAM = (s) => s === 'git' || s === 'git.exe' || /^git\s/.test(s);

/**
 * Which words after the word `git` are git COMMANDS rather than English (M2 v95).
 *
 * A confession and a failure cause are both FREE text, and free text is where amendment 89 lives: the string
 * `fatal: not a git repository` contains the word git followed by a word, and a matcher that reads that pair as
 * a command would report a row asking `git repository`. So the matcher is vocabulary-gated, and the vocabulary is
 * the union of what this directory's bytes, its helpers and its recorded causes actually name — 17 subcommands
 * measured in HEAD's 74 tracked `.mjs`, plus the ones `sweep.mjs` itself spawns or a clean-checkout cause has
 * already reported, plus the read-side commands a future proof in this directory would plausibly ask for. Every
 * name in it is checked against `git --list-cmds=main` by `confession-proof.mjs`, which answers on either plane
 * because listing commands needs no repository.
 *
 * The gate runs ONE way: a token outside the vocabulary is UNMATCHED, so the axis can under-claim and can never
 * invent a command. That is the safe direction, and `confession-proof.mjs` §1 measures the cost by listing what
 * the population says after the word git and showing which of those tokens the vocabulary declined.
 */
export const GIT_SUBCOMMANDS = new Set([
  'add', 'apply', 'archive', 'cat-file', 'commit', 'diff', 'grep', 'log', 'ls-files', 'ls-tree', 'mv', 'push',
  'reset', 'rev-list', 'rev-parse', 'show', 'status', 'blame', 'branch', 'checkout', 'clean', 'config',
  'describe', 'for-each-ref', 'hash-object', 'init', 'mktree', 'name-rev', 'remote', 'restore', 'rm',
  'show-ref', 'switch', 'tag', 'update-index', 'worktree', 'write-tree', 'version',
]);

export function gitReaches(src, sink) {
  const text = String(src ?? '');
  const hits = [];
  const stack = [];
  let code = '';
  let last = '';
  let i = 0;
  // v95: `run('git', ['archive', …])` puts the COMMAND one argument after the program, so a git program
  // literal hands its hit to the NEXT array that opens. One step only — every other frame clears it — because
  // a rule that chains is a call graph, and a call graph is what amendment 94 refused to build.
  let pendingProgram = null;
  const familyFrame = () => [...stack].reverse().find((f) => f.callee && SPAWN_FAMILY.has(f.callee));
  while (i < text.length) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') {
      // The comment's own text is a channel a row can speak through (v94: `// sweep-asks-repository:`), so it
      // is handed to the sink WITH the fact of whether `//` opened the line. Same tokenizer, one grammar —
      // a declaration inside a string never reaches this branch at all.
      const lineStart = i === 0 || text[i - 1] === '\n';
      const bodyFrom = i + 2;
      while (i < text.length && text[i] !== '\n') i++;
      if (sink) (sink.lineComments ??= []).push({ body: text.slice(bodyFrom, i).replace(/\r$/, ''), lineStart });
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      const top = stack[stack.length - 1];
      const asProgram = last === '(' && top && top.callee && SPAWN_FAMILY.has(top.callee);
      const asArgv = last === '[';
      const asArm = (last === '?' || last === ':') && Boolean(familyFrame());
      i++;
      let body = '';
      let interp = '';
      while (i < text.length) {
        if (text[i] === '\\') {
          if (text[i + 1] !== '\n') body += text[i + 1];
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          i++;
          break;
        }
        if (quote === '`' && text[i] === '$' && text[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < text.length && depth > 0) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') depth--;
            else interp += text[i];
            i++;
          }
          continue;
        }
        body += text[i];
        i++;
      }
      if (GIT_PROGRAM(body)) {
        if (asProgram) {
          const hit = { via: 'program', callee: top.callee, sub: null, at: i };
          hits.push(hit);
          pendingProgram = hit;
        } else if (asArgv) {
          const hit = { via: 'argv', callee: top ? top.callee : null, sub: null, at: i };
          hits.push(hit);
          // `['git', 'diff', '--name-only']` — the program is the array's own first element, so the frame
          // remembers this hit and the next command-shaped literal inside the SAME frame names the command.
          if (top && last === '[') top.gitArgv = hit;
        } else if (asArm) hits.push({ via: 'conditional', callee: familyFrame().callee, sub: null, at: i });
      } else if (asArgv && top?.gitArgv && top.gitArgv.sub === null && GIT_SUBCOMMANDS.has(body)) {
        top.gitArgv.sub = body;
      } else if (asArgv && top?.afterProgram && last === '[' && GIT_SUBCOMMANDS.has(body)) {
        top.afterProgram.sub = body;
      }
      for (const nested of gitReaches(interp)) hits.push({ ...nested, nested: true, at: i });
      last = quote;
      continue;
    }
    if (c === '(' || c === '[') {
      const frame = { callee: c === '(' ? ((/([A-Za-z_$][\w$.]*)\s*$/.exec(code) || [])[1] ?? null) : null };
      if (c === '[' && pendingProgram) frame.afterProgram = pendingProgram;
      pendingProgram = null;
      stack.push(frame);
    }
    else if (c === ')' || c === ']') stack.pop();
    code += c;
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return hits;
}

/** The naive second grammar (amendment 89's rule: two grammars, one question): the word git ANYWHERE. */
export const mentionsGit = (text) => /\bgit\b/.test(String(text ?? ''));

/**
 * What a row says ITSELF that it asks the repository (M2 v94), in a first-column comment:
 *
 *     // sweep-asks-repository: git rev-parse HEAD
 *
 * The declaration grammar is amendment 85's (`// sweep-budget-ms:`) — a line the ROW owns, read out of the ref's
 * bytes, refused out loud when malformed — and it exists because amendment 93 measured the two shapes a
 * call-site scanner cannot see: `const sh = (cmd, argv) => execFile(cmd, argv)` puts a PARAMETER in program
 * position, and a row that reaches git through this file's own helpers spawns one frame away from where the
 * scanner looks. Three rows went red on the clean-checkout plane for causes the prediction foresaw but could
 * not name. A row can name them.
 *
 * A declaration changes NO behaviour: it does not skip a row, does not grant a fallback, does not soften a
 * verdict (amendment 86's rule against a green that graded nothing). It is foreknowledge the runner can be
 * reconciled against, which is the only thing that makes a claim like "every failure was accounted for"
 * checkable instead of rhetorical.
 *
 * Read through the SAME tokenizer as `gitReaches` (the sink below), so a quotation of a declaration inside a
 * string or a block comment cannot declare anything — amendment 89's discipline applied to a confession.
 */
export const ASKS_RE = /^[ \t]*sweep-asks-repository:[ \t]*([^\r]*?)[ \t]*$/;

/** Every payload of a first-column `// <marker>: …` comment, at code position only. */
export function declarations(src, marker) {
  const sink = { lineComments: [] };
  gitReaches(src, sink);
  const re = new RegExp(`^[ \\t]*${marker}:[ \\t]*([^\\r]*?)[ \\t]*$`);
  return sink.lineComments.filter((c) => c.lineStart).map((c) => re.exec(c.body)).filter(Boolean).map((m) => m[1]);
}

export const asksRepository = (src) => declarations(src, 'sweep-asks-repository');

/**
 * Which DEFINITIONS a source declares, in byte order (M2 v95).
 *
 * A confession can point at a helper by name (`via sw.proofCorpus`), and the only honest answer to that is the
 * helper's OWN bytes — which means knowing where a named body starts. This is a line-anchored table of
 * `function name (…)`, `const name = (…) =>`, and their `export`/`async` variants, used only to attribute a
 * call site to the definition that contains it. It is deliberately not a scope analysis: definitions that open
 * between two offsets are ordered, and the last one before a hit owns it.
 */
const DEFINITION_RE = /^[ \t]*(?:export[ \t]+)?(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)|^[ \t]*(?:export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*=[ \t]*(?:async[ \t]*)?(?:\([^)]*\)|[A-Za-z_$][\w$*])[ \t]*=>/gm;

export function definitions(src) {
  const out = [];
  let m;
  DEFINITION_RE.lastIndex = 0;
  while ((m = DEFINITION_RE.exec(String(src ?? '')))) out.push({ name: m[1] ?? m[2], at: m.index });
  return out;
}

/** The DEFINITION a byte offset sits inside — the last one declared before it. */
export function definitionAt(src, at) {
  let owner = null;
  for (const d of definitions(src)) {
    if (d.at > at) break;
    owner = d;
  }
  return owner ? owner.name : null;
}

/**
 * The git commands visible AT CODE POSITION in a source, optionally only those inside one definition (M2 v95).
 *
 * These are the commands the tokenizer can name without being told: an argv array that opens with `'git'`
 * followed by a command literal, or a program literal followed by an array whose first element is one. A helper
 * that hands a PARAMETER to `run('git', argv)` contributes nothing here, which is the whole reason this
 * function prints a coverage number rather than a verdict — an absent command is not an absent claim.
 */
export function gitCommandsIn(src, fnName = null) {
  const out = [];
  for (const h of gitReaches(src)) {
    if (!h.sub) continue;
    if (fnName !== null && definitionAt(src, h.at) !== fnName) continue;
    out.push(h.sub);
  }
  return out;
}

/**
 * Every git COMMAND named in free text (M2 v95), gated by `GIT_SUBCOMMANDS`.
 *
 * Used on both sides of a confession: on a row's declaration payload, and on the cause line the row reported
 * when it failed. The option-skipping group means `git diff --name-only`, `git -c x status --porcelain` and
 * `git ls-tree -r --name-only HEAD -- path` all name ONE command each, while `not a git repository` names
 * nothing because `repository` is not a command. Occurrences are returned in order, duplicates included: a row
 * that says `git rev-parse HEAD (twice)` means it, and the count is the reader's to interpret.
 */
export function gitCommandsNamed(text) {
  const out = [];
  const re = /\bgit(?:\.exe)?[ \t]+((?:-{1,2}\S+[ \t]+)*)?([a-z][a-z0-9-]*)/g;
  let m;
  while ((m = re.exec(String(text ?? '')))) if (GIT_SUBCOMMANDS.has(m[2])) out.push(m[2]);
  return out;
}

/** A declaration payload is one line of free text; `·` separates the claims a row makes in it. */
export const confessionClauses = (payload) => String(payload ?? '').split('·').map((c) => c.trim()).filter(Boolean);

/**
 * Grade a confession against bytes the runner can read (M2 v95) — the arm that makes `// sweep-asks-repository:`
 * more than a sentence.
 *
 * Each clause is graded against the source it points at: a clause naming `sw.<helper>` is graded against that
 * helper's body in THIS file, and a clause naming no helper against the row's own bytes. Four states, and the
 * difference between the last two is the finding this increment exists to report:
 *   supported   — every command the clause names is visible at code position where the clause points
 *   partial     — some are, some are not
 *   invisible   — the clause names commands and the bytes it points at show NONE: true, most likely, and
 *                 unreadable, because the reach goes through a wrapper whose argv is a parameter
 *   no-command  — the clause names no command (it points at a helper, or describes a shape)
 */
export function gradeConfession(payloads, ownText, selfSrc) {
  const clauses = [];
  for (const p of payloads) {
    for (const clause of confessionClauses(p)) {
      const cmds = [...new Set(gitCommandsNamed(clause))];
      const helpers = [...new Set([...clause.matchAll(/\bsw\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))];
      const witness = helpers.length ? helpers.flatMap((h) => gitCommandsIn(selfSrc, h)) : gitCommandsIn(ownText);
      const avail = [...new Set(witness)];
      const missing = cmds.filter((c) => !avail.includes(c));
      const state = !cmds.length ? 'no-command' : missing.length === 0 ? 'supported' : avail.length === 0 ? 'invisible' : 'partial';
      clauses.push({ clause: clause.slice(0, 72), cmds, helpers, avail, missing, state });
    }
  }
  return clauses;
}

/**
 * Grade a confession against the FAILURE it predicted (M2 v95) — the arm that runs after the rows, where the
 * only reader is the row itself.
 *
 * A declaration says what a proof asks the repository; a red says what actually broke. When the two disagree the
 * asymmetry is the rule: an OMITTED command is a defect, because the row is the sole witness of its own cause and
 * a confession that leaves out what it just printed is not yet a confession. A SURPLUS is not a defect — a row
 * may reach five commands and fall on one of them — so it is stated and never scored. And a cause that names no
 * command at all is UNCHECKABLE: it can neither confirm nor refute the claim, and amendment 86 forbids reading
 * that as a pass.
 */
export function compareConfession(payloads, causeText) {
  const claim = [...new Set((payloads ?? []).flatMap((p) => gitCommandsNamed(p)))];
  const cause = [...new Set(gitCommandsNamed(causeText))];
  return {
    claim,
    cause,
    gradeable: cause.length > 0,
    omissions: cause.filter((c) => !claim.includes(c)),
    surplus: claim.filter((c) => !cause.includes(c)),
  };
}

/**
 * Resolve a relative specifier against the IMPORTING FILE's repo-relative path, in git's slash space.
 *
 * `path.join` is deliberately not used: on this host it would produce backslashes, while every name that
 * comes out of `git ls-files` uses forward ones, and the two spaces must not meet inside a lookup table.
 */
export const resolveRelative = (fromName, spec) => {
  const segs = fromName.split('/').slice(0, -1);
  for (const s of spec.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') segs.pop();
    else segs.push(s);
  }
  return segs.join('/');
};

/**
 * What the tracked proofs actually NEED beyond themselves (M2 v88).
 *
 * `trackedProofs` answers "which files are the population" and nothing answers "which files does the
 * population read", so a proof may import a sibling the sweep never fetched — and since amendment 86 that
 * is not hypothetical: `docs/evidence/lib/syncproc.mjs` is imported by 32 of the 68 tracked proofs, lives
 * outside the proof directory, and is therefore absent from every flat materialisation. The symptom is 32
 * rows of `ERR_MODULE_NOT_FOUND` in a report whose subject is the code under test, i.e. a runner that
 * reddens the population for being staged.
 *
 * So: read the ref's bytes, resolve every relative specifier against the importer's own path, and split
 * the targets three ways — already inside the corpus (a proof importing a proof), tracked elsewhere in the
 * REF (a dependency this runner must fetch and lay down at its real relative path), or in no commit at all
 * (a dependency that CANNOT be satisfied, which is named here rather than discovered 32 times later).
 */
export async function closureOf(ref, cwd, corpus = null) {
  const rows = (corpus ?? (await proofCorpus(ref, cwd))).rows;
  const inCorpus = new Set(rows.map((r) => r.name));
  const edges = new Map();
  let insideEdges = 0;
  const importerSet = new Set();
  for (const r of rows) {
    for (const spec of relativeSpecs(r.text)) {
      importerSet.add(r.name);
      const target = resolveRelative(r.name, spec);
      if (inCorpus.has(target)) {
        insideEdges++;
        continue;
      }
      if (!edges.has(target)) edges.set(target, []);
      edges.get(target).push(r.name);
    }
  }
  const candidates = [...edges.keys()];
  const blobs = await catFileBatchOptional(candidates.map((t) => `${ref}:${t}`), cwd);
  const deps = [];
  const missing = [];
  candidates.forEach((name, i) => {
    const entry = { name, importers: [...new Set(edges.get(name))] };
    if (blobs[i]) deps.push({ ...entry, bytes: blobs[i], sha: sha256(blobs[i]) });
    else missing.push(entry);
  });
  // A dependency of a dependency would need this scan again, so the depth is reported, not assumed away.
  const nested = deps.filter((d) => relativeSpecs(d.bytes.toString('utf8')).length > 0).map((d) => d.name);
  return { total: rows.length, importers: importerSet.size, insideEdges, deps, missing, nestedDeps: nested };
}

/** Write the ref's bytes into a temp directory, one file per proof, and report what landed where. */
export async function materialize(ref, dest, cwd, corpus = null, extra = null) {
  const rows = (corpus ?? (await proofCorpus(ref, cwd))).rows;
  const landed = [];
  // v88: the ref's DIRECTORY SHAPE is part of its bytes. A flat copy cannot serve `../lib/x.mjs`, because
  // `../lib` from a flat copy points OUTSIDE the copy — so a proof's own import decides where it lands.
  const write = (name, bytes) => {
    const target = join(dest, ...name.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return target;
  };
  for (const row of rows) {
    landed.push({ name: row.name, target: write(row.name, row.bytes), sha: row.committed, bytes: row.bytes.length });
  }
  for (const dep of extra ?? []) {
    write(dep.name, dep.bytes);
  }
  return landed;
}

/**
 * How the tracked population locates the CODE IT GRADES. Measured from the ref's own bytes, and the
 * answer decides a question v78–v82 never asked: 61 of HEAD's proofs spell the import as
 * `pathToFileURL('./agents/runtime/dist/index.js')` and 3 as `pathToFileURL(join(root, …))` with
 * `root = process.cwd()` — `pathToFileURL` resolves a relative path against `process.cwd()`, so ALL of
 * them are resolved by the CHILD's cwd, and NONE by the script's own location (`fileRelative` was 0).
 * CORRECTED by M2 v88: the child-cwd half still reads 68/68, but `fileRelative` is now 32 — the shared
 * spawn shim amendment 86 introduced is itself a file-relative edge, so a script's own LOCATION became
 * load-bearing at the very moment the population stopped being self-contained. `closureOf` measures both
 * halves every run rather than trusting this sentence, which is the honest shape of the claim.
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
 * Where a clean checkout goes. Every directory this runner makes is OUTSIDE the repository; v84 adds that
 * it must also be on the repository's OWN DRIVE, because the junctions in §`isolatedCheckout` point at
 * `node_modules` entries whose realpath is on that drive, and a bundler asked to reach a cross-drive path
 * "relatively" is handed a string that is not a relative path:
 * `relative('C:\\…\\repo\\apps\\studio', 'D:\\…\\node_modules\\next\\dist\\client\\next.js')` returns
 * `D:\…\next.js` — an absolute path, because no `..` chain crosses drives — so the request `./` + that is
 * `./D:/…/next.js`, which resolves to nothing. Measured on this box, same ref, back to back:
 * dest on C: → studio build exit 1; dest on D: → exit 0 with every package. See
 * `isolated-arms.mjs`, the human-run tool that re-measures it.
 *
 * `os.tmpdir()` is still preferred when it already shares the repository's drive (it is the conventional
 * place and gets cleaned by the OS); the drive root is the fallback, and if THAT cannot be written the
 * choice is reported rather than swallowed.
 */
export function isolatedDest(cwd = process.cwd(), prefix = 'nexus-isolated-', mkdir = mkdtempSync) {
  const repoDrive = driveOf(cwd);
  const tmp = tmpdir();
  if (driveOf(tmp) === repoDrive) {
    return { dir: mkdir(join(tmp, prefix)), chose: 'tmpdir', tmpDir: tmp, tmpDrive: driveOf(tmp), repoDrive };
  }
  try {
    return { dir: mkdir(join(repoDrive, prefix)), chose: 'repo-drive (FORCED off tmpdir by the drive mismatch)', tmpDir: tmp, tmpDrive: driveOf(tmp), repoDrive };
  } catch (e) {
    return { dir: mkdir(join(tmp, prefix)), chose: `tmpdir anyway — the repository drive refused mkdtemp (${e.code || e.message})`, tmpDir: tmp, tmpDrive: driveOf(tmp), repoDrive };
  }
}

/**
 * The sentence v84 exists to make printable: which drive the clean checkout went onto, and therefore
 * whether `relative()` can name the junction targets from inside it at all. `POSIX-SINGLE-ROOT` is
 * reported as its own fact rather than as an implied Windows bug-free path: on POSIX every path shares
 * the one root, so the mismatch this clause names cannot arise and no arm here is cross-drive.
 */
export function driveVerdict(where) {
  const destDrive = driveOf(where.dir);
  const mismatch = destDrive !== where.repoDrive;
  const posix = where.repoDrive === parse('/') && destDrive === parse('/');
  return {
    destDrive,
    mismatch,
    phrase: `${where.dir} on ${destDrive} vs the repository on ${where.repoDrive} — ${posix
      ? 'POSIX-SINGLE-ROOT, so there is no other drive to be on'
      : mismatch
        ? `CROSS-DRIVE: relative() cannot name a ${where.repoDrive} path from a ${destDrive} directory and returns it ABSOLUTE instead, so a bundler is handed a “./${where.repoDrive}…” request that resolves to nothing`
        : `SAME DRIVE, so relative() can name these paths and a bundler can follow them`}`,
  };
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
 *
 * A caller that passes `dest` gets exactly that directory, even when it sits on another drive: the
 * mismatch is then reported on the `[isolated]` line as `CROSS-DRIVE` rather than quietly repaired,
 * because a witness that WANTS the cross-drive failure (v82's reason gate needs a build that fails) must
 * be able to ask for one, and the runner's job is to say which tree it built.
 */
export async function isolatedCheckout({ ref = 'HEAD', cwd = process.cwd(), dest = null, build = true, log = console.log } = {}) {
  const where = dest ? { dir: dest, chose: 'caller-supplied', tmpDir: tmpdir(), tmpDrive: driveOf(tmpdir()), repoDrive: driveOf(cwd) } : isolatedDest(cwd);
  const root = join(where.dir, 'repo');
  mkdirSync(root, { recursive: true });
  const tar = await run('git', ['archive', '--format=tar', ref], { cwd, timeoutMs: 180_000, encoding: 'buffer', maxBuffer: 1 << 29 });
  if (tar.code !== 0) throw new Error(`git archive ${ref} → exit ${tar.code}: ${tar.stderr.toString().trim().slice(0, 200)}`);
  const tarFile = join(where.dir, 'ref.tar');
  writeFileSync(tarFile, tar.stdout);
  // M2 v90, corrected in place by v91: the archive and the destination are handed to tar RELATIVE to the
  // directory it runs in, so neither name ever carries a drive colon — which is the whole reason v81 needed
  // `--force-local`, and why this extraction stays FLAG-FREE. The original comment here claimed "this box's
  // `tar` on PATH is bsdtar", and that is a claim about a PATH, not about a box: measured by path on this
  // machine, `C:\Program Files\Git\usr\bin\tar.exe` is GNU tar 1.35 and ACCEPTS `--force-local` (it gets as
  // far as complaining the file cannot be opened), while `C:\Windows\System32\tar.exe` is bsdtar 3.8.8 and
  // refuses it with "Option --force-local is not supported". Which one answers the bare word `tar` is
  // whoever launched us: from a Git Bash shell the Git usr/bin entry is FIRST on PATH (`where tar` yields
  // GNU then System32), so a sweep started here has been running GNU all along, while a sweep started from
  // cmd.exe or PowerShell gets bsdtar. `tar -xf ref.tar -C repo` is the one form both answer with no flag
  // and no slash-munging, which is the only reason the checkout does not care which plane it was launched on.
  const untar = await run('tar', ['-xf', 'ref.tar', '-C', 'repo'], { cwd: where.dir, timeoutMs: 180_000 });
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
    const logFile = join(where.dir, 'build.log');
    writeFileSync(logFile, raw, 'utf8');
    built = { ...describeBuild(raw), code: b.code, timedOut: b.timedOut, ms: Date.now() - started, logFile };
  }
  const drive = driveVerdict(where);
  log(`[isolated] ${ref} → ${root}: ${tar.stdout.length} bytes of tar · dest ${drive.phrase} (chosen: ${where.chose}; os.tmpdir() is on ${where.tmpDrive}) · ${links} third-party junctions${linkFailures.length ? ` (${linkFailures.length} failed: ${linkFailures.slice(0, 3).join(', ')})` : ''} · ${workspace.length} workspace links from the ARCHIVED globs (${workspace.join(', ')})${build ? ` · build exit ${built.code}${built.timedOut ? ' TIMEOUT' : ''} in ${(built.ms / 1000).toFixed(1)}s · ${built.lines} output lines${built.failed.length ? ` · FAILED ${built.failed.join(', ')}` : ' · all packages'}${built.code !== 0 ? ` · reason ${built.reason ? `“${built.reason.slice(0, 160)}”` : 'NONE CAPTURED (the banner is not a reason)'}` : ''}${built.code !== 0 && drive.mismatch ? ' · ⚠ this build FAILED in a CROSS-DRIVE tree: on this ref the same checkout compiled GREEN on the repository drive, so do not read this as a defect of the ref without re-measuring (isolated-arms.mjs)' : ''}` : ''}`);
  return { dir: where.dir, destChoice: where.chose, destDrive: driveOf(where.dir), repoDrive: where.repoDrive, driveMismatch: drive.mismatch, tmpDrive: where.tmpDrive, root, archiveBytes: tar.stdout.length, links, linkFailures, workspace, build: built };
}

/**
 * The ONE stderr line that names why a child died, found by scanning the whole stream rather than by
 * quoting a window of it (M2 v88).
 *
 * Why a scan and not a bigger window: on an `ERR_MODULE_NOT_FOUND` Node prints its `Cannot find module
 * '…' imported from …` sentence as the FOURTH line of stderr, while the runner quoted three — so the only
 * line that names the cause was cut by the excerpt that exists to name it. A wider constant would just
 * move the cut, which is the error window amendment 63 already named for the git doors. When nothing in
 * the stream has a cause-shaped line, the fallback SAYS it cannot find one instead of passing a stack
 * header off as a reason.
 */
export function failureReason(stderrText) {
  const lines = String(stderrText ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const named = lines.find((l) => /Cannot find (?:package|module)|ENOENT|EBUSY|EACCES|EPERM/.test(l));
  if (named) return named;
  // An AssertionError IS the subject's own verdict line, so it is quoted as the cause it is; a bare
  // `Error:` or an `[ERR_*]` header is only a SHAPE that a cause usually sits in, and says so.
  const assertion = lines.find((l) => /^AssertionError\b/.test(l));
  if (assertion) return assertion;
  const shaped = lines.find((l) => /\[ERR_\w+\]|(^|\s)Error:/.test(l));
  return shaped ? `${shaped} (no named cause: reported what the stream DID say)` : null;
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
    budgetMs: timeoutMs,
    code: r.code,
    signal: r.signal,
    timedOut: r.timedOut,
    // v85: `ok` says the row did not pass, which is TRUE for a kill and for a red alike and therefore
    // answers nothing. `verdict` says WHICH of those happened, because "the proof answered no" and "the
    // runner stopped asking" are two findings and v73 already refused to let one borrow the other's words.
    verdict: r.timedOut ? 'killed' : r.code === 0 ? 'passed' : 'failed',
    ms: Date.now() - started,
    tail: tailOf(r.stdout, 2),
    errTail: headOf(r.stderr, 3),
    // v88: the WHOLE stream beside the window, because a witness has to be able to show that the cause sat
    // outside the excerpt — `headOf`'s three lines are not evidence about lines 4 and beyond.
    err: r.stderr,
    // v88: the row's REASON, which is a different thing from an excerpt of where it died.
    reason: failureReason(r.stderr),
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
  // v88: which files the population READS, not only which files it IS. Measured before any row runs,
  // because "32 rows are about to die of staging" is a fact a reader should get from the identity block.
  const closure = await closureOf(ref, cwd, runCorpus);
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
  // v93: amendment 92 named a plane's whole cause with a number read off a FINISHED run — 43 reds, one line
  // about `.git`. Asking the ref's bytes the same question BEFORE the rows turns that into a prediction, and
  // a prediction is the only thing the verdicts can be reconciled against afterwards.
  const reaches = new Map(runCorpus.rows.map((r) => [r.name, gitReaches(r.text)]));
  const pred0 = new Set([...reaches.entries()].filter(([, h]) => h.length > 0).map(([n]) => n));
  const askerNames = [...reaches.entries()].filter(([, h]) => h.length > 0).map(([n]) => n.split('/').pop());
  const naiveAskers = runCorpus.rows.filter((r) => mentionsGit(r.text)).length;
  const hits = [...reaches.values()].flat();
  const byRule = {};
  for (const h of hits) byRule[h.via] = (byRule[h.via] ?? 0) + 1;
  const planeSays = childTree.unavailable ? 'the child tree was not readable, so no prediction is offered' : childTree.gitRepo ? 'this tree HAS a .git, so these rows can be answered' : 'this tree has NO .git, so these rows must fall back or go red';
  log(`[identity] plane axis: ${askerNames.length}/${runCorpus.rows.length} tracked proofs reach a git child process AT CODE POSITION (${hits.length} call sites: ${Object.entries(byRule).map(([k, v]) => `${k}=${v}`).join(' ')}) — ${askerNames.slice(0, 6).join(', ')}${askerNames.length > 6 ? ` …${askerNames.length - 6} more` : ''} · a naive "the word git appears anywhere" rule calls ${naiveAskers}, and the ${naiveAskers - askerNames.length}-row difference is prose and comments, which cannot spawn (amendment 89) · ${planeSays}`);
  // v94: the prediction has two named blind spots (amendment 93), and neither is reachable from the outside,
  // because both hide a git call behind a frame the scanner does not enter — a wrapper whose program position
  // holds a PARAMETER, and this file's own helpers. A declaration is the channel the CALLER can use: the row
  // states what it asks, and the runner reconciles three sources instead of one. Nothing here changes behavior
  // — no row is skipped, no fallback is granted — and a declaration the scanner CAN see is corroborated, while
  // one it cannot is the blind spot closing.
  const declared = new Map(runCorpus.rows.map((r) => [r.name, asksRepository(r.text).filter((p) => p.trim() !== '')]).filter(([, a]) => a.length > 0));
  const emptyPayloads = runCorpus.rows.filter((r) => asksRepository(r.text).some((p) => p.trim() === '')).map((r) => r.name);
  const declaredNames = [...declared.keys()];
  const corroborated = declaredNames.filter((n) => pred0.has(n));
  const uncorroborated = declaredNames.filter((n) => !pred0.has(n));
  log(`[identity] asks axis: ${declaredNames.length}/${runCorpus.rows.length} tracked proofs DECLARE what they ask the repository (// sweep-asks-repository:)${declaredNames.length === 0 ? ' — NONE at this ref, so this axis has nothing to reconcile and is printed as an empty measurement, not a pass (amendment 86: a line that graded nothing may not read as though it did)' : ` — ${corroborated.length} of them corroborated by the code-position scanner above, ${uncorroborated.length} NOT visible to it (${uncorroborated.map((n) => n.split('/').pop()).join(', ') || 'none'}), which is exactly the channel amendment 93's two blind shapes need`}${emptyPayloads.length ? ` · ${emptyPayloads.length} rows attempted a declaration and named nothing (${emptyPayloads.map((n) => n.split('/').pop()).join(', ')}) — refused out loud, as a budget that is not a number is refused, and the row keeps its red` : ''} · a declaration buys foreknowledge, never a pass: the row still runs and the plane still answers`);
  // v95: amendment 94 printed WHO declares; a declaration is worth what its witness is worth, so this grades each
  // CLAUSE against the bytes it points at — a `sw.<helper>` clause against that helper's body in THIS file, a
  // clause naming no helper against the row's own bytes. `invisible` is not a lie caught: it is a reach the
  // runner still cannot see, and the finding is that the runner's own file is where it hides. Naming which
  // clauses are which is the whole product, because it is the half a row can act on — cite the frame where the
  // literal actually lives.
  const selfSrc = readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const textOfRow = new Map(runCorpus.rows.map((r) => [r.name, r.text]));
  const gradedClauses = declaredNames.flatMap((n) => gradeConfession(declared.get(n), textOfRow.get(n), selfSrc).map((c) => ({ ...c, row: n })));
  const stateCount = (st) => gradedClauses.filter((c) => c.state === st).length;
  const byState = (st) => gradedClauses.filter((c) => c.state === st).map((c) => `${c.row.split('/').pop()} "${c.clause}" → ${st === 'invisible' ? `shows none of ${c.cmds.join(', ')}` : c.missing.join(', ')}`).join(' · ') || 'none';
  log(`[identity] confession axis (bytes): ${declaredNames.length} declaring rows · ${gradedClauses.length} clauses graded against the source each one points at — supported ${stateCount('supported')} · partial ${stateCount('partial')}${stateCount('partial') ? ` (${byState('partial')})` : ''} · invisible ${stateCount('invisible')}${stateCount('invisible') ? ` (${byState('invisible')})` : ''} · name no command ${stateCount('no-command')} · "invisible" is amendment 93's blind shape one frame UP: the helper exists and really does spawn git, but its argv arrives as a PARAMETER, so the tokenizer shows nothing and the claim stays a confession until the row names the frame where the literal lives`);

  const dest = mkdtempSync(join(tmpdir(), 'nexus-sweep-'));
  const started = Date.now();
  let results;
  try {
    const landed = await materialize(ref, dest, cwd, runCorpus, closure.deps);
    log(`[identity] closure: ${closure.importers}/${closure.total} tracked proofs import ${closure.insideEdges + closure.deps.length + closure.missing.length} relative path(s) from their OWN location — ${closure.insideEdges} land inside the population, ${closure.deps.length} are tracked elsewhere in the ref and were fetched too (${closure.deps.map((d) => `${d.name} ← ${d.importers.length} proof(s)`).join(', ')}), ${closure.missing.length} are in NO commit${closure.missing.length ? ` — UNSATISFIABLE: ${closure.missing.map((d) => `${d.name} (wanted by ${d.importers.join(', ')})`).join('; ')}` : ''}${closure.nestedDeps.length ? ` · depth 1 only: ${closure.nestedDeps.join(', ')} imports further files this runner does not follow` : ''}`);
    const divergence = await proofDivergence(ref, cwd, runCorpus);
    const differs = divergence.filter((r) => r.worktree !== r.committed).length;
    const walkers = divergence.filter((r) => r.dotIngest || r.ownWalk).length;
    log(`[identity] scripts: ${landed.length} committed proofs materialised into ${dest}${differs ? ` · ${differs} of them differ from the WORKTREE copy (the ref's bytes are what runs)` : ' · worktree copies identical to the ref'}`);
    log(`[identity] of those ${landed.length}, ${walkers} read the WORKING TREE as their corpus by their own text scan — ${divergence.filter((r) => r.dotIngest).length} call collectTextFiles on '.' and ${divergence.filter((r) => r.ownWalk).length} re-implement the walk over process.cwd() (a scan of the committed bytes, not an observation of what a process opened; the whole population reads the code under test the same way, two lines above)`);
    const chosen = only ? landed.filter((l) => l.name.includes(only)) : landed;
    if (chosen.length === 0) throw new Error(`--only "${only}" selected no committed proof`);
    // v85: a row's budget is read from the ROW's own bytes, so the population says how long it needs and
    // this file stops deciding that on its behalf. The census prints BEFORE any row runs, because whether a
    // sweep was schedulable is a fact a reader should get from the identity block, not from a red at the end.
    const textOf = new Map(runCorpus.rows.map((r) => [r.name, r.text]));
    const budgets = new Map(landed.map((l) => [l.name, rowBudget(textOf.get(l.name) ?? '', timeoutMs)]));
    const named = [...budgets.entries()].filter(([, b]) => b.budgetSource === 'declared');
    const refused = [...budgets.entries()].filter(([, b]) => b.budgetSource === 'refused');
    const aboveDefault = named.filter(([, b]) => b.budgetMs > timeoutMs);
    log(`[identity] row budgets: ${named.length} of ${landed.length} rows name the milliseconds they need${named.length ? ` (${named.map(([n, b]) => `${n.split('/').pop()} ${b.budgetMs}ms`).join(', ')})` : ''}; ${aboveDefault.length} of those exceed this run's default of ${timeoutMs}ms, so at the default they would be KILLED for their duration and not for their assertions; ${landed.length - named.length - refused.length} rows name nothing and take ${timeoutMs}ms, which the runner cannot know is enough${refused.length ? ` · ${refused.length} declaration REFUSED: ${refused.map(([n, b]) => `${n.split('/').pop()} — ${b.note}`).join('; ')}` : ''}`);
    results = [];
    for (const l of chosen) {
      const bud = budgets.get(l.name) ?? { budgetMs: timeoutMs, budgetSource: 'default', note: null };
      const r = await runProof(l.target, runCwd, bud.budgetMs);
      results.push({ ...r, name: l.name, sha: l.sha, budgetSource: bud.budgetSource, budgetNote: bud.note });
      // A kill is the runner's own action, so the row says WHOSE number ended it; a red says nothing of the
      // sort, and v73's rule applies here too — one may not borrow the other's vocabulary.
      const line = r.verdict === 'killed'
        ? (bud.budgetSource === 'declared'
          ? `KILL ${l.name.split('/').pop()} (exit ${r.code}, ${r.ms}ms) — killed at the ${bud.budgetMs}ms this row named itself, so the number that ended it is the row's, not the runner's`
          : `KILL ${l.name.split('/').pop()} (exit ${r.code}, ${r.ms}ms) — killed by the runner's default budget of ${bud.budgetMs}ms; this row named no budget, so this red belongs to a constant in sweep.mjs and not to anything the proof asserted`)
        : `${r.ok ? 'OK  ' : 'FAIL'} ${l.name.split('/').pop()} (exit ${r.code}, ${r.ms}ms, budget ${bud.budgetMs}ms ${bud.budgetSource})`;
      // v88: a red names its CAUSE before its location. Quoting the head of a stack said where the child
      // tripped, not why, and 26 of these rows printed `:: ` + an empty stdout in front of it — so an
      // empty reason field now says so out loud instead of looking like a proof that had nothing to say.
      const spoke = String(r.tail ?? '').trim().length > 0;
      const said = spoke ? r.tail : r.ok ? '(no stdout)' : '(no stdout — the child never reached a print)';
      log(`${line} :: ${said}${r.ok ? '' : ` || ${r.reason ?? `NO NAMED CAUSE in stderr; first lines were: ${r.errTail}`}`}`);
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
  // v85: `failed` keeps its old meaning — a killed row did NOT pass, and no witness may read a kill as a
  // green — while the count of WHOSE number did it is stated beside it rather than instead of it.
  const killed = results.filter((r) => r.verdict === 'killed');
  const killedByRunner = killed.filter((r) => r.budgetSource !== 'declared').length;
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
  // v93: the prediction was printed BEFORE the rows, so the verdicts have to answer it afterwards. Two sets
  // are the whole product: a row that went red without being predicted an asker (either the scanner cannot
  // see how it reaches git, or it fails for a cause of its own — the reason line says which), and a row that
  // WAS predicted and came back green, which is a fallback arm doing its job or a git call that is the
  // SUBJECT of the test rather than its tool.
  const pred = pred0;
  let confessionAxis = null;
  if (results.length === runCorpus.rows.length) {
    const names = (rs) => (rs.length ? rs.map((r) => r.name.split('/').pop()).join(', ') : 'none');
    const namesGit = (r) => /\bgit\b/.test(String(r.reason ?? ''));
    const unforeseen = failed.filter((r) => !pred.has(r.name));
    const fellBack = results.filter((r) => r.ok && pred.has(r.name));
    const redAccounted = failed.filter((r) => pred.has(r.name));
    log(`[plane axis] prediction vs verdicts: ${pred.size} rows predicted to reach git · red AND predicted ${redAccounted.length} (of which ${redAccounted.filter(namesGit).length} name git in their reason line) · RED WITHOUT being predicted ${unforeseen.length} (${names(unforeseen)}; of these ${unforeseen.filter(namesGit).length} do name git, so the rest fail for a cause of their own) · GREEN while predicted ${fellBack.length} (${names(fellBack)}) · an empty "red without being predicted" list is the gate: every failure is accounted for by the prediction`);
    // v94: the line above asks the RUNNER to have foreseen every red. Three rows could not be foreseen from
    // outside, because their git call hides behind a frame the scanner does not enter — but a row can name its
    // own reach. This is the same gate with a second channel into it, and it is printed separately so
    // amendment 93's numbers stay comparable across refs instead of being rewritten under a new grammar.
    const foreseen = (r) => pred.has(r.name) || declared.has(r.name);
    const notForeseen = failed.filter((r) => !foreseen(r));
    const redDeclared = failed.filter((r) => declared.has(r.name));
    log(`[asks axis] declaration vs prediction vs verdicts: ${declaredNames.length} rows declared what they ask (${uncorroborated.length} of them invisible to the code-position scanner — ${uncorroborated.map((n) => n.split('/').pop()).join(', ') || 'none'}) · red AND declared ${redDeclared.length} of ${failed.length} red · RED with NEITHER prediction NOR declaration ${notForeseen.length} (${names(notForeseen)}) · the gate is this last number: amendment 93 could only ask the runner to foresee every red, and these three rows were beyond what a call-site scan can foresee; a row that states its own reach closes the list from the inside`);
    // v95: 94's line says WHO reaches git; a sentence is worth the witness behind it, so each declaring red is now
    // graded against the cause IT reported. Two readings of a mismatch, and only one of them is a crime:
    //   OMISSION — the failure named a git command the confession left out. The row is the only reader of its own
    //              cause, so a confession that misses what it just printed is incomplete in a way the reader can
    //              see without running anything. That incompleteness is what amendment 93's gate died on.
    //   SURPLUS — the confession names a command this run's cause never showed. NOT red: a row may reach more than
    //              one thing and break on only one of them, and `git archive` at exit 128 is one arm of a
    //              multi-arm claim. A surplus is stated, never scored.
    const verbs = (t) => [...new Set(gitCommandsNamed(t))];
    const declaring = failed.filter((r) => declared.has(r.name));
    const cmp = new Map(declaring.map((r) => [r.name, compareConfession(declared.get(r), r.reason)]));
    const gradeable = declaring.filter((r) => cmp.get(r).gradeable);
    const uncheckedRows = declaring.filter((r) => !cmp.get(r).gradeable);
    const omissions = gradeable.flatMap((r) => cmp.get(r).omissions.map((c) => `${r.name.split('/').pop()} reached ${c} and does not declare it`));
    const surplus = gradeable.flatMap((r) => cmp.get(r).surplus.map((c) => `${r.name.split('/').pop()} declares ${c}`));
    const silentBlind = notForeseen.filter((r) => verbs(String(r.reason ?? '')).length > 0);
    confessionAxis = {
      declaring: declaring.length,
      gradeable: gradeable.map((r) => r.name.split('/').pop()),
      unchecked: uncheckedRows.map((r) => r.name.split('/').pop()),
      omissions,
      surplus,
      silentBlind: silentBlind.map((r) => r.name.split('/').pop()),
    };
    log(`[confession axis] declaration vs the cause the row itself reported: ${declaring.length} red declaring rows, ${gradeable.length} of them gradeable (their cause names at least one git command) and ${uncheckedRows.length} NOT gradeable${uncheckedRows.length ? ` (${names(uncheckedRows)} — a red whose cause names no command can neither confirm nor refute a confession, so it is reported as unchecked rather than passed, amendment 86)` : ''} · OMISSIONS ${omissions.length} (${omissions.join(' · ') || 'none'}) · surplus ${surplus.length} (${surplus.join(' · ') || 'none'}) · SILENT BLIND SPOTS ${silentBlind.length} (${names(silentBlind)}) — a red neither the scanner nor the row foresaw whose own cause names a git command, which is the shape 94 could not rule out · the gate is OMISSIONS + SILENT BLIND SPOTS at zero: a confession that agrees with the failure it predicted, and no failure nobody spoke about`);
  } else {
    log(`[plane axis] ALL THREE reconciliations withheld (the [plane axis], [asks axis] and [confession axis] lines below would have been these): this run graded ${results.length} of ${runCorpus.rows.length} tracked proofs (--only), and one row says nothing about the population`);
  }
  log(`\n[summary] ref ${id.sha.slice(0, 12)} · scripts ${results.length} · failed ${failed.length} · killed ${killed.length} (${killedByRunner} at the runner's default, ${killed.length - killedByRunner} at a budget the row named) · child cwd ${probe.cwd} · graded build ${childBuild.digest.slice(0, 16)} (${childBuild.files} dist files${childStable ? ', stable across the run' : ', BUILD MOVED mid-run'})${runCwd === cwd ? '' : ` · runner's own build ${id.distDigest.slice(0, 16)}${stable ? ' stable' : ' MOVED'}`} · tree ${childTree.unavailable ? `UNDIGESTABLE (${childTree.unavailable.slice(0, 60)})` : `${childTree.digest.slice(0, 16)} (${treeNotice ? 'MOVED mid-run' : 'stable'}) ${childTree.files} files`} · dirty-sources ${id.dirtySources.length} · ${Math.round((Date.now() - started) / 1000)}s`);
  return { identity: id, results, failed, dir: dest, distStable: stable, distAfter: after, treeStable: treeNotice === null, treeAfter: childTreeAfter, treeNotice, proofsCwd: runCwd, childProbe: probe, childBuild, childBuildAfter, childStable, importIdioms: idioms, childTree, planeAxis: { predicted: [...pred], naiveMentions: naiveAskers, corpus: runCorpus.rows.length }, asksAxis: { declared: declaredNames.map((n) => n.split('/').pop()), corroborated: corroborated.length, uncorroborated: uncorroborated.map((n) => n.split('/').pop()) }, confessionAxis };
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
