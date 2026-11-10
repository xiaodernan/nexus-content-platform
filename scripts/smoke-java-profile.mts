/**
 * NEXUS — the Java compose profile's SMOKE. A PLANE, not a promise.
 *
 * What it does, deliberately narrowly:
 *   1. brings up ONLY the throwaway pg (`nexus-java-pg`, tmpfs, host port 15433) and migrates the
 *      schema into it with this repository's own `npm run db:migrate` (drizzle is the schema owner;
 *      the domain service boots with `ddl-auto: validate` and REFUSES an empty database);
 *   2. brings up all six Java deployables and waits on their healthchecks;
 *   3. probes the four doors + the edge chain from THIS host:
 *        - the registry says UP            (18761/actuator/health)
 *        - the config door serves           (18888/application/default and /nexus-api/default)
 *        - the domain service says itself  (18082/health)
 *        - the api says itself             (18080/health)
 *        - the edge says its health        (18081/actuator/health)
 *        - the whole edge → api → domain → throwaway-pg chain answers 404 for an id nobody holds
 *          (the answer is honest: a healthy chain, an absent project)
 *   4. tears the profile down ALWAYS (even on failure), double-checking nothing persists (tmpfs).
 *
 * What it does NOT do, said plainly:
 *   - it does NOT reuse the shared dev database. The throwaway database dies with its container.
 *   - it does NOT insert, update or publish anything. The chain probe asks a question with an
 *     answer of NO, which is an honest verification that "the route works all the way down".
 *   - it does NOT assert pager/alerting/observability "readiness". The healthchecks prove the JVM
 *     accepts connections; the http probes prove the platform answers its named questions; the
 *     spring-cloud proof does the breaker/edge/kill work — this smoke does not duplicate it.
 *   - it will NOT pass on a host without Docker. That is a fact, not a red.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const COMPOSE = ['compose', '-f', 'infra/docker-compose.yml', '--profile', 'java'];
const DOWN = ['compose', '-f', 'infra/docker-compose.yml', '--profile', 'java', 'down'];
const PG_URL = 'postgres://nexus:nexus_java_only@127.0.0.1:15433/nexus';
const DEADLINE_CHAIN_MS = 180_000;

const teardown = () => {
  spawnSync('docker', DOWN, { stdio: 'inherit' });
};
const run = (args: string[], label: string) => {
  const r = spawnSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    const tail = String(r.stderr || r.stdout).slice(-1500);
    console.error(`[smoke-java] FAILED at: ${label}\n${tail}`);
    teardown();
    process.exit(1);
  }
  return r.stdout;
};
const probe = async (path: string, must: string): Promise<void> => {
  const r = await fetch(path, { headers: { Accept: 'application/json' } });
  const text = await r.text();
  if (!text.includes(must)) {
    throw new Error(`${path} answered ${r.status} and did not contain ${JSON.stringify(must)}: ${text.slice(0, 300)}`);
  }
};
const until = async (label: string, fn: () => Promise<void>, deadlineMs: number): Promise<void> => {
  const deadline = Date.now() + deadlineMs;
  let last: unknown = null;
  while (Date.now() < deadline) {
    try {
      await fn();
      console.log(`  ok    ${label}`);
      return;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`${label} did not become true in ${Math.round(deadlineMs / 1000)}s — last: ${String(last).slice(0, 300)}`);
};

if (!existsSync('infra/docker-compose.yml')) {
  console.error('[smoke-java] must be run from the repository root');
  process.exit(1);
}
if (spawnSync('docker', ['--version'], { encoding: 'utf8' }).status !== 0) {
  console.error('[smoke-java] docker is not reachable — the smoke cannot run on this host, and a green here would be a lie');
  process.exit(1);
}

try {
  console.log('[1/5] bring up the throwaway postgres (tmpfs — nothing survives the container)');
  run([...COMPOSE, 'up', '-d', 'nexus-java-pg'], 'throwaway pg up');
  console.log('[2/5] migrate the schema into the throwaway (this repo’s own db:migrate)');
  // `npm` is a .cmd shim on Windows — spawn through the shell so the exit code propagates.
  const migrate = spawnSync('npm', ['run', 'db:migrate'], {
    env: { ...process.env, NEXUS_DATABASE_URL: PG_URL },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: true,
  });
  if (migrate.status !== 0) {
    console.error(`[smoke-java] FAILED at: db:migrate\n${String(migrate.stderr || migrate.stdout).slice(-2000)}`);
    teardown();
    process.exit(1);
  }
  console.log('[3/5] bring up all six Java deployables and wait on their healthchecks');
  run([...COMPOSE, 'up', '-d', '--wait'], 'java deployables up');

  console.log('[4/5] the probes from this host');
  await until('registry /actuator/health answers UP', () => probe('http://127.0.0.1:18761/actuator/health', '"status":"UP"'), 120_000);
  await until('config door serves the shared surface', () => probe('http://127.0.0.1:18888/application/default', 'health,info,metrics'), 60_000);
  await until('config door serves the api overlay', () => probe('http://127.0.0.1:18888/nexus-api/default', 'dev.nexus.api'), 60_000);
  await until('domain names itself + database reachable', () => probe('http://127.0.0.1:18082/health', 'nexus-domain-service'), 120_000);
  await until('domain reached its database', () => probe('http://127.0.0.1:18082/health', '"reachable":true'), 30_000);
  await until('api names itself', () => probe('http://127.0.0.1:18080/health', 'nexus-api'), 120_000);
  await until('api reached its database', () => probe('http://127.0.0.1:18080/health', '"reachable":true'), 30_000);
  await until('edge /actuator/health answers UP', () => probe('http://127.0.0.1:18081/actuator/health', '"status":"UP"'), 120_000);
  // An id nobody holds: the edge routes lb://nexus-api to the live instance, which reaches the domain
  // service, which answers NOT-FOUND. A 404 here proves discovery + routing + Feign + the LB + the DB.
  await until('edge → api → domain → throwaway pg answers 404 for a nonexistent id',
    () => probe('http://127.0.0.1:18081/api/domain/projects/00000000-0000-0000-0000-000000000000', '"state":"not-found"'),
    DEADLINE_CHAIN_MS);

  console.log('[5/5] tear the profile down (tmpfs — nothing survives)');
  teardown();
  console.log('[smoke-java] PASS — six deployables stood up from the profile, the chain answered honestly, everything is gone');
} catch (e) {
  console.error(`[smoke-java] FAILED: ${String(e).slice(0, 500)}`);
  teardown();
  process.exit(1);
}
