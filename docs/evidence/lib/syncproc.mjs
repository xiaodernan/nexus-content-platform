/**
 * A blocking `execFileSync`/`spawnSync` that works on this host.
 *
 * WHY THIS EXISTS (§60 — stated, not hidden):
 * On this machine **every** synchronous child-process API fails with `EBUSY` (`spawnSync`,
 * `execFileSync`, `execSync`, and the same calls made from inside a `worker_threads` Worker),
 * while the **asynchronous** `spawn` path works normally:
 *
 *     spawnSync('git', ['--version'])   -> { status: null, error: EBUSY }
 *     spawn('git', ['--version'])       -> git version 2.55.0.windows.3
 *
 * That silently breaks every git-based proof script in `docs/evidence/agents/` (32 of them),
 * none of whose logic is wrong. Rather than rewrite them all into async style — a large,
 * mechanical, high-risk change — this module re-implements the synchronous API on top of the
 * async one, so each proof keeps its own logic byte-identical and reviewable.
 *
 * HOW: the main thread cannot run its event loop while blocked, so the work is delegated to a
 * `worker_threads` Worker (its own event loop, where async `spawn` completes). The Worker
 * writes the result to a file and raises an `Atomics` flag; the main thread spins on
 * `Atomics.wait` and then reads the file. Output travels through the filesystem rather than
 * `postMessage` because the blocked main thread could not process a message.
 *
 * This is a **host workaround, not a design choice**: the day `spawnSync` works again, the only
 * thing to delete is this file and the import lines that point at it.
 */
import { spawn as spawnAsync, spawnSync as nodeSpawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT = 120_000;

/**
 * Worker body. Runs in its own thread so the async spawn can complete while the main thread is
 * parked on Atomics.wait. Kept as a string because `eval: true` avoids shipping a second file
 * that only this module would ever load.
 */
const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');

function settle(job, payload) {
  try { writeFileSync(job.outFile, JSON.stringify(payload)); } catch { /* main thread will time out */ }
  const flag = new Int32Array(job.sab);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
}

parentPort.on('message', (job) => {
  let child;
  try {
    child = spawn(job.file, job.args, {
      cwd: job.opts.cwd,
      env: job.opts.env,
      shell: !!job.opts.shell,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    settle(job, { error: { code: err.code ?? 'EUNKNOWN', message: err.message } });
    return;
  }

  const out = [];
  const err = [];
  let outLen = 0;
  let errLen = 0;
  let killedForBuffer = false;
  let settled = false;
  const once = (payload) => { if (!settled) { settled = true; settle(job, payload); } };

  child.stdout.on('data', (d) => {
    outLen += d.length;
    if (outLen > job.maxBuffer) { killedForBuffer = true; child.kill(); return; }
    out.push(d);
  });
  child.stderr.on('data', (d) => {
    errLen += d.length;
    if (errLen > job.maxBuffer) return;
    err.push(d);
  });

  child.on('error', (e) => once({ error: { code: e.code ?? 'EUNKNOWN', message: e.message } }));
  child.on('close', (status, signal) => once({
    status,
    signal,
    stdout: Buffer.concat(out).toString('utf8'),
    stderr: Buffer.concat(err).toString('utf8'),
    killedForBuffer,
  }));

  if (child.stdin) child.stdin.end(job.input);
});
`;

let worker = null;
let requestSeq = 0;
let scratchDir = null;

/**
 * One scratch directory for the whole process, not one per call.
 *
 * Two measured costs shaped this: a per-call `mkdtemp` is wasteful, and a per-call
 * `unlink` of the result file added **~30 seconds** to every second call on this host (the
 * sandbox intercepts deletes), which made the proof suite unusable. So the directory is made
 * once, each request writes a uniquely named file into it, and nothing is unlinked until exit.
 */
function scratch() {
  if (scratchDir) return scratchDir;
  scratchDir = mkdtempSync(join(tmpdir(), 'nexus-syncproc-'));
  process.once('exit', () => {
    try {
      rmSync(scratchDir, { recursive: true, force: true });
    } catch {
      /* best effort at exit */
    }
  });
  return scratchDir;
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(WORKER_SOURCE, { eval: true });
  // Don't hold the process open on this thread; each request is awaited explicitly.
  worker.unref();
  worker.on('error', () => {
    worker = null;
  });
  return worker;
}

/** Run one job on the worker and block the main thread until it reports back. */
function runBlocking(file, args, opts = {}) {
  const maxBuffer = opts.maxBuffer ?? DEFAULT_MAX_BUFFER;
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;

  const requestId = ++requestSeq;
  const outFile = join(scratch(), `r${requestId}.json`);
  const sab = new SharedArrayBuffer(4);
  const flag = new Int32Array(sab);

  getWorker().postMessage({
    file,
    args: Array.isArray(args) ? args : [],
    input: opts.input,
    maxBuffer,
    outFile,
    sab,
    opts: {
      cwd: opts.cwd,
      // A cloned plain object, never the live process.env proxy.
      env: opts.env ? { ...opts.env } : undefined,
      shell: opts.shell,
    },
  });

  const waited = Atomics.wait(flag, 0, 0, timeout);
  let payload;
  if (waited === 'timed-out') {
    payload = { error: { code: 'ETIMEDOUT', message: `syncproc: no result after ${timeout}ms (request ${requestId})` } };
  } else {
    try {
      payload = JSON.parse(readFileSync(outFile, 'utf8'));
    } catch (err) {
      payload = { error: { code: 'ENORESULT', message: `syncproc: result unreadable (${err.message})` } };
    }
  }

  if (payload.killedForBuffer) {
    payload.error = { code: 'ENOBUFS', message: `syncproc: output exceeded maxBuffer (${maxBuffer} bytes)` };
  }
  return payload;
}

function decode(payload, encoding) {
  return encoding && encoding !== 'buffer' ? (payload.stdout ?? '') : Buffer.from(payload.stdout ?? '', 'utf8');
}

/**
 * Drop-in `execFileSync`. Throws on a non-zero exit or a spawn error, attaching
 * `status`/`stdout`/`stderr` to the error exactly as Node does, so callers that inspect a
 * failure keep working.
 */
export function execFileSync(file, args = [], opts = {}) {
  const payload = runBlocking(file, args, opts);
  if (payload.error) {
    const err = new Error(`spawnSync ${file} ${payload.error.code}`);
    err.code = payload.error.code;
    err.status = payload.status ?? null;
    err.stdout = decode(payload, opts.encoding);
    err.stderr = payload.stderr ?? '';
    throw err;
  }
  if (payload.status !== 0 && !opts.allowNonZero) {
    const err = new Error(
      `Command failed: ${file} ${(Array.isArray(args) ? args : []).join(' ')}\n${payload.stderr ?? ''}`,
    );
    err.status = payload.status;
    err.signal = payload.signal;
    err.stdout = decode(payload, opts.encoding);
    err.stderr = payload.stderr ?? '';
    throw err;
  }
  return decode(payload, opts.encoding);
}

/** Drop-in `spawnSync`. Never throws for a non-zero exit; returns the shape Node returns. */
export function spawnSync(file, args = [], opts = {}) {
  const payload = runBlocking(file, args, opts);
  const encoding = opts.encoding;
  const asOut = (s) => (encoding && encoding !== 'buffer' ? (s ?? '') : Buffer.from(s ?? '', 'utf8'));
  return {
    status: payload.status ?? null,
    signal: payload.signal ?? null,
    stdout: asOut(payload.stdout),
    stderr: asOut(payload.stderr),
    error: payload.error ? Object.assign(new Error(payload.error.message), { code: payload.error.code }) : undefined,
  };
}

/**
 * True when this host needs the bridge — i.e. the REAL `node:child_process` sync API is broken.
 * Probes Node directly rather than this module, so it reports host truth and not "did my own
 * shim work".
 */
export function syncApiIsBroken() {
  const probe = nodeSpawnSync(process.execPath, ['-e', 'process.exit(0)']);
  return Boolean(probe.error) || probe.status !== 0;
}

// Re-exported so a proof can spawn detached/streaming processes the normal way.
export { spawnAsync as spawn };
