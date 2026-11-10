import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * v656's STATIC half: one trace id, W3C, printed at every hop.
 *
 * The topology proof (`docs/evidence/java/spring-cloud-proof.mjs` §10c) answers the other half: it
 * mints a trace id, sends it as a `traceparent` through four running JVMs, and reads that exact id out
 * of three logs. It needs a database and four processes, so it cannot be the only thing standing
 * between this claim and a silent regression. What this file grades is the WIRING, in bytes:
 *
 *   1. **a bridge on the classpath.** `micrometer-tracing` alone records nothing; the brave bridge is
 *      what turns an observation into a span with ids. A pom that lost it still compiles, still boots,
 *      still answers `/actuator/prometheus` — and prints `[nexus-api,,]` forever.
 *   2. **the ids have somewhere to land.** The correlation pattern is what puts `%X{traceId}` into the
 *      log line at all; without it the line is `[app]` and no id is printed even when the span exists.
 *      Measured (2026-11-11): the format without the pattern carries no ids, and the pattern turns the
 *      segment into `[app,<trace>,<span>]` — empty when the thread has no span, which is honest.
 *   3. **the propagation is W3C, not an invented header.** `traceparent` is a standard every proxy,
 *      mesh and APM understands; a bespoke `X-Nexus-Trace` would trace this repo and nothing else.
 *   4. **each hop WRITES a line.** The ids are only readable where something is written down. Both the
 *      edge and the domain service wrote one line per process and none per request, so the id existed
 *      in three places and was visible in one. The hop log is a production feature (what you grep at
 *      03:00) and it is what makes the proof's question answerable at all.
 *   5. **the edge fetches its ids instead of printing nothing.** WebFlux opens no thread-scoped span:
 *      measured, the edge's wire carried `traceparent: 00-<id>-<span>-01` while its log printed
 *      `[nexus-gateway,,]`. The edge therefore reads the observation off the exchange. That is an
 *      implementation detail this file pins on purpose — if it is ever "simplified" back to plain MDC,
 *      the ids go empty again and only a twelve-minute proof would notice.
 *
 * What this file canNOT prove: that the id ARRIVES. That is §10c, and it needs four processes.
 */

/** The repository root: up from this file, never `process.cwd()` — tests run from more than one directory. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SERVICES_DIR = join(REPO_ROOT, 'services');
const SHARED_DOOR = join(REPO_ROOT, 'infra', 'config', 'application.yml');

/**
 * The hops a request actually crosses, in order. NAMED, and the count is asserted.
 *
 * The registry and the config server are deliberately NOT here: one is discovery and the other is
 * boot-time configuration, and neither sees a project read. A new service that starts serving traffic
 * has to be added to this list — the friction is the feature (the same rule v658's door file follows).
 */
const TRAFFIC_HOPS = ['java-gateway', 'nexus-api', 'java-domain-service'] as const;

/** Every deployable must print the correlation segment, whether or not it is a hop. */
const DEPLOYABLES = [
  'java-config-server',
  'java-domain-service',
  'java-gateway',
  'java-registry',
  'nexus-api',
] as const;

const configOf = (service: string) =>
  join(SERVICES_DIR, service, 'src', 'main', 'resources', 'application.yml');

const pomOf = (service: string) => join(SERVICES_DIR, service, 'pom.xml');

/** The value of `type:` inside `management.tracing.propagation`, read narrow and loud. */
function propagationType(file: string): string | null {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s+propagation:\s*(#.*)?$/.test(line));
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/^\s{0,4}\S/.test(line) && !/^\s{5,}/.test(line)) break; // dedented out of the block
    const match = /^\s+type:\s*(.+?)\s*$/.exec(line);
    if (match) return match[1]!.replace(/^["']|["']$/g, '');
  }
  return null;
}

/** The deployables on disk — required to be exactly the named five, as in the door file. */
function deployablesOnDisk(): string[] {
  return readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(SERVICES_DIR, entry.name, 'pom.xml')))
    .map((entry) => entry.name)
    .sort();
}

describe('one trace id crosses every hop (v656)', () => {
  it('finds exactly the five deployables it is about — a sixth would have to be written down', () => {
    expect(deployablesOnDisk()).toEqual([...DEPLOYABLES].sort());
  });

  it.each([...TRAFFIC_HOPS])('%s carries the tracing bridge its correlation pattern needs', (service) => {
    const pom = readFileSync(pomOf(service), 'utf8');
    expect(pom, `${service}/pom.xml must depend on micrometer-tracing-bridge-brave`).toContain(
      '<artifactId>micrometer-tracing-bridge-brave</artifactId>',
    );
  });

  it('exactly the three traffic hops carry the bridge — the registry and the config door do not', () => {
    const withBridge = readdirSync(SERVICES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(pomOf(entry.name)))
      .filter((entry) => readFileSync(pomOf(entry.name), 'utf8').includes('micrometer-tracing-bridge-brave'))
      .map((entry) => entry.name)
      .sort();
    expect(withBridge).toEqual([...TRAFFIC_HOPS].sort());
  });

  it('nexus-api can OBSERVE its Feign calls, or the trace stops at the call', () => {
    const pom = readFileSync(pomOf('nexus-api'), 'utf8');
    // `feign-micrometer` is the capability that turns a Feign call into an observation with a client
    // span and injects the context into the outgoing request. Without it the call is still made, the
    // server still answers, and the domain service starts a trace of its own — a chain that looks
    // whole in the logs and is two unrelated traces.
    expect(pom, 'nexus-api/pom.xml must depend on feign-micrometer').toContain(
      '<artifactId>feign-micrometer</artifactId>',
    );
  });

  it.each([...DEPLOYABLES])('%s prints the correlation segment', (service) => {
    const text = readFileSync(configOf(service), 'utf8');
    expect(text, `${service}: no logging.pattern.correlation — the line will carry no ids at all`).toContain(
      'correlation:',
    );
    expect(text, `${service}: the pattern must read %X{traceId}`).toContain('%X{traceId');
    expect(text, `${service}: the pattern must read %X{spanId}`).toContain('%X{spanId');
  });

  it('the shared config door prints the same segment as the services it feeds', () => {
    const text = readFileSync(SHARED_DOOR, 'utf8');
    expect(text).toContain('%X{traceId');
    expect(text).toContain('%X{spanId');
  });

  it.each([...TRAFFIC_HOPS])('%s propagates W3C traceparent, not a header this repo invented', (service) => {
    expect(
      propagationType(configOf(service)),
      `${service}: management.tracing.propagation.type must be W3C`,
    ).toBe('W3C');
  });

  it('the shared document propagates W3C too — a consumer must not learn a different header', () => {
    expect(propagationType(SHARED_DOOR)).toBe('W3C');
  });

  it.each([...TRAFFIC_HOPS])('%s samples through a knob, not a constant', (service) => {
    const text = readFileSync(configOf(service), 'utf8');
    expect(text, `${service}: sampling must be overridable (a sampled-out request has nothing to read)`).toMatch(
      /probability:\s*\$\{NEXUS_TRACING_SAMPLING:/,
    );
  });

  it.each([...TRAFFIC_HOPS])('%s WRITES a line per request — otherwise the ids have nowhere to land', (service) => {
    const source = join(SERVICES_DIR, service, 'src', 'main', 'java');
    const found = readdirSync(source, { recursive: true, encoding: 'utf8' })
      .filter((entry) => entry.endsWith('HopLogFilter.java'))
      .map((entry) => join(source, entry));
    expect(found, `${service}: no HopLogFilter — a hop that logs nothing cannot be found by an id`).toHaveLength(1);

    const text = readFileSync(found[0]!, 'utf8');
    expect(text, `${service}: the hop log must actually log`).toContain('log.info(');
    expect(text, `${service}: the hop log must see every request`).toMatch(/OncePerRequestFilter|GlobalFilter/);
  });

  it('the edge reads its ids from the observation, because WebFlux has no thread-scoped span', () => {
    const source = join(SERVICES_DIR, 'java-gateway', 'src', 'main', 'java');
    const file = readdirSync(source, { recursive: true, encoding: 'utf8' })
      .filter((entry) => entry.endsWith('HopLogFilter.java'))
      .map((entry) => join(source, entry))[0];
    const text = readFileSync(file!, 'utf8');
    // Measured: `[nexus-gateway,,]` on a request whose wire carried `traceparent: 00-<id>-<span>-01`.
    // The ids are on the exchange's observation; MDC alone is empty here.
    expect(text, 'the edge must take the span off the exchange observation').toContain(
      'TracingObservationHandler.TracingContext',
    );
  });
});
