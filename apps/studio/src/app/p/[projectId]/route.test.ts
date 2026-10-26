import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, dynamic, runtime } from './route';

/**
 * M7 v523 (ADR 0016 amendment 509) — the PUBLICATION page, graded directly for the first time.
 *
 * `publishServer.test.ts` has graded the lib underneath (how one read composes an address and reads an
 * answer back), and `/api/publish/route.test.ts` grades the door a WRITE crosses. Nothing graded THIS
 * route: the page a person opens, and the name it asks about. The name is the whole route's decision —
 * it reads a URL segment, and a segment is bytes that arrived percent-encoded.
 *
 * What this file pins is that the door asks about the name the URL NAMED, once. Next decodes a dynamic
 * segment before handing it to a route (`base-server.js`'s `prepareDestination`, the file dev and prod
 * share), so a route that decodes again is running a second decode over bytes that already mean what
 * they say: a percent in an id threw `URIError` out of the handler — a 500 with no sentence and no ask
 * — and a double-encoded id asked about a third value nobody typed.
 *
 * The service is faked at the `fetch` boundary, the way every other door's suite fakes it, and the names
 * are read back THROUGH the URL parser rather than by byte needles: decoding the address the door
 * composed is exactly what the service will do to it, so the answer is the name that gets looked up.
 */

const API_BASE = 'http://service.test';

let seen: string[] = [];

/** Fake the service: every ask is recorded, and every publication is missing. */
function stubMissing() {
  seen = [];
  vi.stubGlobal('fetch', async (input: string | URL) => {
    seen.push(String(input));
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

function stubDeadService() {
  seen = [];
  vi.stubGlobal('fetch', async () => {
    throw new Error('nexus-api unreachable');
  });
}

const open = (projectId: string) =>
  GET(new Request(`http://studio.test/p/${encodeURIComponent(projectId)}`), { params: Promise.resolve({ projectId }) });

/**
 * The name the door asked the service to look up — the last path segment of the address, decoded the way
 * the service will decode it.
 */
function nameAsked(): string {
  const path = new URL(seen[0]!).pathname;
  return decodeURIComponent(path.slice('/projects/'.length));
}

beforeEach(() => {
  vi.stubEnv('NEXUS_API_URL', API_BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('publication page — the name a segment is asked about (v523)', () => {
  it('runs on the node runtime, because this page is the hop that holds the service address', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
  });

  it('a percent sign in an id is a NAME, not a broken escape', async () => {
    // The browser sent `/p/a%25b`; the framework handed the route `a%b`, which is the id. Decoding it
    // again is what turned a real name into a 500 — and a 500 with no sentence is the number a caller
    // cannot read as anything about their own request.
    stubMissing();
    const res = await open('a%b');
    expect(seen, 'the door asks the service about the name the URL named').toHaveLength(1);
    expect(nameAsked()).toBe('a%b');
    expect(res.status).toBe(404);
  });

  it('one decode, not two: an id that NAMES a percent is asked about as the percent it names', async () => {
    // `/p/a%2525b` names the id `a%25b`. A second decode makes the door ask about `a%b` — a publication
    // that is not the one the URL pointed at, and the page says so in its own heading.
    stubMissing();
    await open('a%25b');
    expect(nameAsked()).toBe('a%25b');
  });

  it('a padded id is asked about as the name the caller MEANT, and the page names the same bytes', async () => {
    // The rule the query-side doors have kept since amendment 501 and the body-side ones since 507:
    // decide on the trimmed bytes and FORWARD them. The heading is pinned beside the ask because a page
    // that asked about `p1` and told the reader about ` p1 ` is two answers to one question.
    stubMissing();
    const res = await open(' p1 ');
    expect(nameAsked()).toBe('p1');
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain('<code>p1</code>');
    expect(body).not.toContain('<code> p1 </code>');
  });

  it('an id that is blank after trimming is refused by the page, which asks nothing', async () => {
    // `/p/%2520` reaches this handler with a segment of space. A blank name is not an address, and asking
    // the collection door about one is how a page ends up reading a LISTING as a publication.
    stubMissing();
    const res = await open('   ');
    expect(res.status).toBe(400);
    expect(seen, 'a name that is blank after trimming is not asked about at all').toHaveLength(0);
    const body = await res.text();
    expect(body).toContain('names no publication');
    expect(body).not.toContain('<code></code>');
  });

  it('nothing published here is a 404, and the service not answering is a 503 — the two stay different', async () => {
    // The page's own contract, ungraded until this file: a reader who is told the publication is missing
    // when the service is down looks for the problem in the wrong place.
    stubMissing();
    expect((await open('p1')).status).toBe(404);
    stubDeadService();
    const down = await open('p1');
    expect(down.status).toBe(503);
    expect(await down.text()).toContain('not answering');
  });
});
