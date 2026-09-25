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
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROOF_DIR = 'docs/evidence/agents';
export const DIST_ROOTS = ['agents', 'packages'];
export const DEFAULT_PROOF_TIMEOUT_MS = 240_000;

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
    const committed = sha256(await committedBlob(ref, name, cwd));
    const file = join(cwd, name);
    rows.push({ name, committed, worktree: existsSync(file) ? sha256(readFileSync(file)) : null });
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

/** The block every future sweep sentence should quote: which ref, which build, which dirt. */
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
  };
}

/**
 * The sweep: identity first, then every committed proof of that ref run from a temp directory, then a
 * summary line written so it can be pasted into an amendment without paraphrase.
 */
export async function runSweep({ ref = 'HEAD', only = null, cwd = process.cwd(), timeoutMs = DEFAULT_PROOF_TIMEOUT_MS, keep = false, log = console.log } = {}) {
  const id = await identityBlock(ref, cwd);
  log(`[identity] ref ${id.ref} = ${id.sha.slice(0, 12)} · node ${id.node} · ${id.platform} · ${id.git}`);
  log(`[identity] build under test: ${id.distFiles} dist files, digest ${id.distDigest.slice(0, 16)} (sha256 over path+content of every shipped dist file)`);
  log(`[identity] dirty tracked sources under packages: ${id.dirtySources.length}${id.dirtySources.length ? ` — ${id.dirtySources.slice(0, 6).join(', ')}${id.dirtySources.length > 6 ? ' …' : ''}` : ''}`);

  const dest = mkdtempSync(join(tmpdir(), 'nexus-sweep-'));
  const started = Date.now();
  let results;
  try {
    const landed = await materialize(ref, dest, cwd);
    const divergence = await proofDivergence(ref, cwd);
    const differs = divergence.filter((r) => r.worktree !== r.committed).length;
    log(`[identity] scripts: ${landed.length} committed proofs materialised into ${dest}${differs ? ` · ${differs} of them differ from the WORKTREE copy (the ref's bytes are what runs)` : ' · worktree copies identical to the ref'}`);
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
  // A twelve-minute sweep is long enough for someone to rebuild. If the bytes moved mid-run, the green
  // rows were graded against two different builds, and only saying so afterwards makes that visible.
  const after = distDigest(cwd);
  const stable = after.digest === id.distDigest;
  if (!stable) log(`[identity] ⚠ the build MOVED during this run: ${id.distDigest.slice(0, 16)} (${id.distFiles} files) at the start, ${after.digest.slice(0, 16)} (${after.files} files) at the end — these rows were not all graded against the same bytes`);
  log(`\n[summary] ref ${id.sha.slice(0, 12)} · scripts ${results.length} · failed ${failed.length} · dist ${id.distDigest.slice(0, 16)}${stable ? ' (stable across the run)' : ' (MOVED mid-run)'} · dirty-sources ${id.dirtySources.length} · ${Math.round((Date.now() - started) / 1000)}s`);
  return { identity: id, results, failed, dir: dest, distStable: stable, distAfter: after };
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
