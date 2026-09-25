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
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    const child = spawn(cmd, argv, { cwd: opts.cwd, env: opts.env ?? process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
export async function proofDivergence(ref, cwd) {
  const names = await trackedProofs(ref, cwd);
  const rows = [];
  for (const name of names) {
    const blob = await committedBlob(ref, name, cwd);
    const committed = sha256(blob);
    const file = join(cwd, name);
    // M2 v80: which of these scripts DEPEND on the walked tree? A text scan of the ref's own bytes, and
    // labelled as such wherever it is printed — it is a claim about the scripts, not an observation of
    // what a process opened. Two shapes are counted SEPARATELY because they are two different facts, and
    // `process.cwd(` alone is not one of them: most scripts use it to locate the `dist` they import, and
    // two more use it as a JAIL root without reading a directory.
    const text = blob.toString('utf8');
    rows.push({
      name,
      committed,
      worktree: existsSync(file) ? sha256(readFileSync(file)) : null,
      dotIngest: /collectTextFiles\s*\(\s*['"]\./.test(text),
      ownWalk: /readdirSync\s*\(/.test(text) && /SKIP_DIRS|TEXT_EXT/.test(text),
    });
  }
  return rows;
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
  const isTracked = new Set((await git(['ls-files', '-z'], cwd)).split('\0').filter(Boolean));
  const isUntracked = new Set((await git(['ls-files', '--others', '--exclude-standard', '-z'], cwd)).split('\0').filter(Boolean));
  const owned = { tracked: [], untracked: [], other: [] };
  let bytes = 0;
  let untrackedBytes = 0;
  const hash = createHash('sha256');
  for (const p of paths) {
    const size = Buffer.byteLength(files[p], 'utf8');
    bytes += size;
    if (isTracked.has(p)) owned.tracked.push(p);
    else if (isUntracked.has(p)) {
      owned.untracked.push(p);
      untrackedBytes += size;
    } else owned.other.push(p); // present, not tracked, not untracked-when-ignored-are-excluded ⇒ ignored
    hash.update(`${p}\t${sha256(Buffer.from(files[p], 'utf8'))}\n`);
  }
  return {
    digest: hash.digest('hex'),
    files: paths.length,
    bytes,
    tracked: owned.tracked.length,
    untracked: owned.untracked.length,
    untrackedBytes,
    other: owned.other.length,
    sample: owned.untracked.slice(0, 6),
  };
}

/** Did the walked tree move while the sweep ran, and what to say when it did — kept separate so a witness can grade both shapes. */
export function treeMoveNotice(before, after) {
  if (before.digest === after.digest) return null;
  return `[identity] ⚠ the WALKED TREE moved during this run: ${before.files} files / ${before.digest.slice(0, 16)} at the start, ${after.files} / ${after.digest.slice(0, 16)} at the end (${before.untracked} untracked then, ${after.untracked} now) — these rows were not all graded against the same working tree`;
}

/** Write the ref's bytes into a temp directory, one file per proof, and report what landed where. */
export async function materialize(ref, dest, cwd) {
  const names = await trackedProofs(ref, cwd);
  const landed = [];
  for (const name of names) {
    const bytes = await committedBlob(ref, name, cwd);
    const target = join(dest, name.split('/').pop());
    writeFileSync(target, bytes);
    landed.push({ name, target, sha: sha256(bytes), bytes: bytes.length });
  }
  return landed;
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

/** Run one script with the repository root as CWD — which is exactly why the build it grades is the CURRENT one. */
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
 */
export async function runSweep({ ref = 'HEAD', only = null, cwd = process.cwd(), timeoutMs = DEFAULT_PROOF_TIMEOUT_MS, keep = false, log = console.log, beforeRecheck = null } = {}) {
  const id = await identityBlock(ref, cwd);
  log(`[identity] ref ${id.ref} = ${id.sha.slice(0, 12)} · node ${id.node} · ${id.platform} · ${id.git}`);
  log(`[identity] build under test: ${id.distFiles} dist files, digest ${id.distDigest.slice(0, 16)} (sha256 over path+content of every shipped dist file)`);
  log(`[identity] dirty tracked sources under packages: ${id.dirtySources.length}${id.dirtySources.length ? ` — ${id.dirtySources.slice(0, 6).join(', ')}${id.dirtySources.length > 6 ? ' …' : ''}` : ''}`);
  log(`[identity] walked tree (read by the tree-walking scripts via cwd, so the WORKTREE not the ref): ${id.tree.files} files / ${id.tree.bytes} B, digest ${id.tree.digest.slice(0, 16)} · owned by the ref ${id.tree.tracked} · UNTRACKED ${id.tree.untracked} (${id.tree.untrackedBytes} B) · ignored-but-read ${id.tree.other}${id.tree.sample.length ? ` — e.g. ${id.tree.sample.join(', ')} …` : ''}`);

  const dest = mkdtempSync(join(tmpdir(), 'nexus-sweep-'));
  const started = Date.now();
  let results;
  try {
    const landed = await materialize(ref, dest, cwd);
    const divergence = await proofDivergence(ref, cwd);
    const differs = divergence.filter((r) => r.worktree !== r.committed).length;
    const walkers = divergence.filter((r) => r.dotIngest || r.ownWalk).length;
    log(`[identity] scripts: ${landed.length} committed proofs materialised into ${dest}${differs ? ` · ${differs} of them differ from the WORKTREE copy (the ref's bytes are what runs)` : ' · worktree copies identical to the ref'}`);
    log(`[identity] of those ${landed.length}, ${walkers} read the WORKING TREE as their corpus — ${divergence.filter((r) => r.dotIngest).length} call collectTextFiles on '.' and ${divergence.filter((r) => r.ownWalk).length} re-implement the walk over process.cwd() (a text scan of their committed bytes: a claim about the scripts, not an observation of what a process opened)`);
    const chosen = only ? landed.filter((l) => l.name.includes(only)) : landed;
    if (chosen.length === 0) throw new Error(`--only "${only}" selected no committed proof`);
    results = [];
    for (const l of chosen) {
      const r = await runProof(l.target, cwd, timeoutMs);
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
  const treeAfter = await walkedTree(cwd);
  const treeNotice = treeMoveNotice(id.tree, treeAfter);
  if (treeNotice) log(treeNotice);
  log(`\n[summary] ref ${id.sha.slice(0, 12)} · scripts ${results.length} · failed ${failed.length} · dist ${id.distDigest.slice(0, 16)}${stable ? ' (stable across the run)' : ' (MOVED mid-run)'} · tree ${id.tree.digest.slice(0, 16)} ${treeNotice ? '(MOVED mid-run)' : '(stable)'} ${id.tree.files} files · dirty-sources ${id.dirtySources.length} · ${Math.round((Date.now() - started) / 1000)}s`);
  return { identity: id, results, failed, dir: dest, distStable: stable, distAfter: after, treeStable: treeNotice === null, treeAfter, treeNotice };
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  runSweep({ ref: opt('--ref') ?? 'HEAD', only: opt('--only') ?? null, timeoutMs: Number(opt('--timeout') ?? DEFAULT_PROOF_TIMEOUT_MS), keep: argv.includes('--keep') })
    .then((s) => process.exit(s.failed.length ? 1 : 0))
    .catch((e) => {
      console.error(`[sweep] ${e.message}`);
      process.exit(2);
    });
}
