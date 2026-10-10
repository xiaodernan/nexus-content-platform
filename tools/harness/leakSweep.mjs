/**
 * M7 v222 — retiring a throwaway database a PREVIOUS run left RUNNING.
 *
 * A run's container is named `nexus-publish-e2e-db-<Date.now()>-<pid>`, started with `docker run -d --rm`,
 * and removed by `studio-publish.mjs`'s `finally`. That covers every exit it can see — a failed assertion
 * included — but it cannot cover a HARD KILL, and `--rm` only removes a container that STOPS. A killed proof
 * therefore leaves a container RUNNING, holding a published port and a PostgreSQL instance, forever.
 *
 * Measured 2026-10-10: `nexus-publish-e2e-db-1791461501643-9348` had been **Up 2 days**, created
 * 2026-10-08T12:12 by a run killed during teardown. It was holding 127.0.0.1:51149 and enough memory that the
 * machine was measurably slower — plausibly a contributor to the same session's doc-gate flake.
 *
 * The rule is by OWNER, not by age alone. The name carries the pid that created it, so a container whose
 * owner is GONE is one nobody will ever clean up. A container whose owner is still ALIVE belongs to a
 * concurrent run and is left alone — a sweep that killed it would be a worse bug than the leak. Age is the
 * second gate, for the case where the pid has been recycled by an unrelated process.
 */

export const LEFTOVER_PREFIX = 'nexus-publish-e2e-db-';

/** A pid the name could carry: `nexus-publish-e2e-db-<stampMs>-<pid>`. */
const NAME_SHAPE = /^nexus-publish-e2e-db-(\d+)-(\d+)$/;

/** Six hours. Long past any plausible run of this proof (it takes minutes), short enough that a recycled pid
 *  cannot keep a corpse alive for a day. */
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Which of `containers` should this run retire? Pure: the caller supplies `now` and the liveness check, so the
 * decision table is testable without a docker daemon and without spawning anything.
 *
 * @param {{ name: string }[]} containers
 * @param {{ now: number, isAlive: (pid: number) => boolean, maxAgeMs?: number }} opts
 * @returns {{ name: string, reason: 'owner-gone' | 'stale', ageMs: number, pid: number }[]}
 */
export function containersToRetire(containers, { now, isAlive, maxAgeMs = MAX_AGE_MS }) {
  const out = [];
  for (const c of containers) {
    const m = NAME_SHAPE.exec(c?.name ?? '');
    // A name this sweep does not understand is LEFT ALONE rather than guessed at: the pattern is the only
    // thing that tells us where the pid is, and removing a container on a hunch is how a sweep becomes a
    // hazard. (It is also why the prefix filter on the `docker ps` call matters — everything else the host is
    // running is none of this proof's business.)
    if (!m) continue;
    const stampMs = Number(m[1]);
    const pid = Number(m[2]);
    const ageMs = now - stampMs;
    const ownerGone = !isAlive(pid);
    if (ownerGone || ageMs > maxAgeMs) {
      out.push({ name: c.name, reason: ownerGone ? 'owner-gone' : 'stale', ageMs, pid });
    }
  }
  return out;
}

/**
 * The same decision, applied to the host: list every leftover by prefix, decide, and remove.
 *
 * `run` is injected (an async `(cmd, args) => { code, stdout, stderr }`) so the wiring can be exercised
 * without docker, and `isAlive` defaults to a real liveness probe.
 */
export async function sweepLeftoverDatabases(run, { now = Date.now(), isAlive = pidIsAlive, maxAgeMs = MAX_AGE_MS, log = () => {} } = {}) {
  const listed = await run('docker', ['ps', '-a', '--filter', `name=${LEFTOVER_PREFIX}`, '--format', '{{.Names}}']);
  if (listed.code !== 0) return { listed: false, retired: [], reason: listed.stderr.trim() };

  const containers = listed.stdout.split('\n').map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
  const doomed = containersToRetire(containers, { now, isAlive, maxAgeMs });

  const retired = [];
  for (const d of doomed) {
    const rm = await run('docker', ['rm', '-f', d.name]);
    if (rm.code === 0) {
      retired.push(d);
      log(`  retired ${d.name} (${d.reason}, ${Math.round(d.ageMs / 1000)}s old)`);
    } else {
      log(`  could NOT retire ${d.name}: ${rm.stderr.trim()}`);
    }
  }
  return { listed: true, retired, seen: containers.length };
}

/**
 * Is `pid` a live process? `process.kill(pid, 0)` sends no signal — it only asks the OS whether the pid can be
 * signalled, which is the cheapest liveness probe available and works on Windows for a pid owned by the same
 * user. `EPERM` means the process EXISTS but belongs to someone else, which still counts as alive.
 */
export function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  }
}
