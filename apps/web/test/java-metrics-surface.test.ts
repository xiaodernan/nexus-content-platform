import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * v658's STATIC half: the operator's door is NAMED, on every deployable, in both configuration planes.
 *
 * The topology proof (`docs/evidence/java/spring-cloud-proof.mjs` §10b) answers the other half — it
 * starts four JVMs and reads a real scrape off each one — but it needs four processes and a database,
 * so it is not part of the ordinary test population and it cannot see this file's subject at all:
 *
 *   1. **the local plane.** Every service boots WITHOUT the config door (that is the point of
 *      `optional:configserver:`). A service whose own `application.yml` forgot `prometheus` is a
 *      service that answers the scrape in a deployment that has a config server and answers 404 in one
 *      that does not — the same jar, two different platforms, and nothing in the proof would notice
 *      because the proof always runs with the shared document on the classpath.
 *   2. **the exposure list is an allowlist, and it is spelled out.** `include: *` publishes
 *      `heapdump`, `env`, `configprops` and `loggers` — a heap dump is the process's memory, `env` is
 *      its environment, and both are one word away from the list this file is about. The dangerous
 *      spelling is short and plausible, so it is asserted against by name rather than trusted.
 *   3. **the registry is on the classpath.** `include: prometheus` with no `micrometer-registry-prometheus`
 *      is an exposure list naming an endpoint that does not exist: Spring Boot exposes nothing and the
 *      scrape gets a 404. The pom and the list are two halves of one claim.
 *
 * What this file canNOT prove, stated so nobody reads it as more: that a scrape ANSWERS. That is the
 * proof's job (four consumer doors) and `ConfigServerTest`'s job (the config server's own door, on the
 * port its product route shares). Here the bytes of the configuration are graded, not a running process.
 */

/** The repository root: up from this file, never `process.cwd()` — tests run from more than one directory. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SERVICES_DIR = join(REPO_ROOT, 'services');
const SHARED_DOOR = join(REPO_ROOT, 'infra', 'config', 'application.yml');

/**
 * The five deployables that carry a registry, NAMED rather than derived-and-trusted.
 *
 * A sixth Spring service must not slip in without the door being decided about it, and a service that
 * is renamed must not silently leave this list: the count is asserted, so either event is a red test
 * whose fix is one line here — the friction is the feature (ADR 0016's "registry gate" rule).
 */
const DEPLOYABLES = [
  'java-config-server',
  'java-domain-service',
  'java-gateway',
  'java-registry',
  'nexus-api',
] as const;

/** What every deployable must expose. Named, never `*`. */
const REQUIRED_ENDPOINTS = ['health', 'info', 'metrics', 'prometheus'] as const;

/**
 * Endpoints that must never appear in an exposure list.
 *
 * Not a taste judgement: `heapdump` writes the process's heap to a file, `env` prints every property
 * (including any secret that arrived as one), `configprops` prints the bound configuration, `loggers`
 * lets a caller CHANGE the log level at runtime, and `shutdown` stops the process. All five are one
 * keystroke away from `metrics` in an editor and none of them belong on a door an operator reads.
 */
const FORBIDDEN_ENDPOINTS = [
  '*',
  'heapdump',
  'threaddump',
  'env',
  'configprops',
  'loggers',
  'shutdown',
  'beans',
  'mappings',
] as const;

/**
 * The `include:` value inside this file's `management:` block — read narrow and loud.
 *
 * No YAML library is a dependency of this package, and a hand-rolled YAML parser that guesses is worse
 * than no parser: it would happily read the WRONG `include:` (a comment, another block) and call the
 * reading a proof. So this reads exactly one line, refuses to proceed when it cannot find exactly one,
 * and refuses to proceed when `management:` is not where a top-level key lives. Every failure names
 * what it saw.
 */
function exposedEndpoints(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  const start = lines.findIndex((line) => /^management:\s*(#.*)?$/.test(line));
  expect(start, `${file}: no top-level \`management:\` block — this reader refuses to guess`).toBeGreaterThanOrEqual(0);

  const includes: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    // A line with no leading whitespace is the next top-level key: the block ended.
    if (/^\S/.test(line)) break;
    const match = /^\s+include:\s*(.+?)\s*$/.exec(line);
    if (match) includes.push(match[1]!.replace(/^["']|["']$/g, ''));
  }

  expect(
    includes,
    `${file}: expected exactly ONE \`include:\` inside \`management:\`; saw ${JSON.stringify(includes)}`,
  ).toHaveLength(1);

  return includes[0]!
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** The five service directories, read from the tree — and required to be exactly the named five. */
function deployablesOnDisk(): string[] {
  return readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(SERVICES_DIR, entry.name, 'pom.xml')))
    .map((entry) => entry.name)
    .sort();
}

describe('the operator door is a named allowlist on every deployable (v658)', () => {
  it('finds exactly the five deployables it is about — a sixth would have to be written down', () => {
    expect(deployablesOnDisk()).toEqual([...DEPLOYABLES].sort());
  });

  it.each([...DEPLOYABLES])('%s carries the Prometheus registry its exposure list names', (service) => {
    const pom = readFileSync(join(SERVICES_DIR, service, 'pom.xml'), 'utf8');

    // The artifact, not the word: the dependency block names the registry Spring Boot's own BOM
    // version-manages. `include: prometheus` without this is an endpoint that answers 404.
    expect(pom, `${service}/pom.xml must depend on micrometer-registry-prometheus`).toContain(
      '<artifactId>micrometer-registry-prometheus</artifactId>',
    );

    // And the DOOR ITSELF must exist. Measured 2026-11-11, and this leg exists because of it: the domain
    // service listed `health,info,metrics,prometheus` and carried the registry, but no
    // `spring-boot-starter-actuator` — so the whole `management:` block named endpoints nothing served and
    // `/actuator/prometheus` answered 404. The topology proof found it by asking the running door; this leg
    // makes it a compile-adjacent red instead of a twelve-minute run.
    expect(pom, `${service}/pom.xml names actuator endpoints but has no actuator on the classpath`).toContain(
      '<artifactId>spring-boot-starter-actuator</artifactId>',
    );
  });

  it.each([...DEPLOYABLES])('%s names the same door in its OWN application.yml as the shared one', (service) => {
    const local = exposedEndpoints(join(SERVICES_DIR, service, 'src', 'main', 'resources', 'application.yml'));

    // Set equality, not "contains": the claim is that the two planes tell the SAME story, and a
    // local file that exposes MORE than the shared document is its own kind of drift.
    expect(new Set(local)).toEqual(new Set(REQUIRED_ENDPOINTS));
  });

  it('the shared config door names the same four endpoints', () => {
    expect(new Set(exposedEndpoints(SHARED_DOOR))).toEqual(new Set(REQUIRED_ENDPOINTS));
  });

  it('no configuration plane in the repository exposes a wildcard or a dangerous endpoint', () => {
    const files = [
      SHARED_DOOR,
      ...DEPLOYABLES.map((service) =>
        join(SERVICES_DIR, service, 'src', 'main', 'resources', 'application.yml'),
      ),
    ];

    for (const file of files) {
      const exposed = exposedEndpoints(file);
      for (const forbidden of FORBIDDEN_ENDPOINTS) {
        expect(exposed, `${file}: \`${forbidden}\` must never be exposed`).not.toContain(forbidden);
      }
    }
  });
});
