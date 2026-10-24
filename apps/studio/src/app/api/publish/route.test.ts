import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, dynamic, runtime } from './route';

/**
 * M7 v512 (ADR 0016 amendment 505) — the publish ROUTE, graded directly.
 *
 * `publishServer.test.ts` has always graded the lib: how a call to the service composes an address, waits,
 * and reads an answer back. This file grades the hop above it, whose decisions belong to nothing else: which
 * refusals happen BEFORE the service is asked, in what order the guards run, which values are forwarded
 * exactly as the caller wrote them and which are trimmed first, what the browser's HTTP status does and does
 * not mean, and what vocabulary the route's own refusal sentences claim.
 *
 * The service is faked at the `fetch` boundary rather than injected, because the route calls the lib's
 * defaults and those read the global `fetch` per call — so a stub grades the route without asking any source
 * file to carry a seam for the test's benefit.
 */

const API_BASE = 'http://svc.test';

/** The actions the handler dispatches, read off the handler itself. */
const ACTIONS = ['publish', 'read', 'unpublish', 'list'] as const;

/**
 * The two sentences that describe the shape a caller should send, and the sentence that names the vocabulary.
 * Pinned as whole strings on purpose: a refusal that quietly stops naming one of the four actions is the
 * defect this increment found, and a `toContain` of the three it still names would not have caught it.
 */
const SHAPE = '{ action: "publish" | "read" | "unpublish" | "list", projectId, … }';
const REFUSAL_NOT_JSON = `the body is not JSON; this route answers ${SHAPE}`;
const REFUSAL_NOT_OBJECT = `the body is not an object; this route answers ${SHAPE}`;
const unknownAction = (shown: string): string =>
  `action is ${shown}; this route speaks "publish", "read", "unpublish" and "list" only`;

interface Call {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** The bytes the Studio wrote — the only honest witness of "forwarded as asked" and of what was NOT invented. */
  raw?: string;
  body?: unknown;
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Answer every call the service is asked with what `answer` says it would say. */
function stubFetch(answer: (call: Call) => { status: number; json?: unknown }): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    async (input: string | URL, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => {
      const raw = init?.body;
      const call: Call = { url: String(input), method: init?.method, headers: init?.headers, raw, body: parseJson(raw) };
      calls.push(call);
      const out = answer(call);
      return {
        status: out.status,
        ok: out.status >= 200 && out.status < 300,
        json: async () => {
          if (out.json === undefined) throw new Error('the service sent no body');
          return out.json;
        },
      } as unknown as Response;
    },
  );
  return calls;
}

const okWith = (json: unknown) => () => ({ status: 200, json });

interface Answer {
  status: number;
  body: unknown;
}

async function ask(payload: unknown): Promise<Answer> {
  return askRaw(JSON.stringify(payload));
}

/** A body written by hand, so a caller can send bytes `JSON.stringify` would never produce. */
async function askRaw(text: string): Promise<Answer> {
  const res = await POST(
    new Request('http://studio.test/api/publish', {
      method: 'POST',
      body: text,
      headers: { 'content-type': 'application/json' },
    }),
  );
  return { status: res.status, body: (await res.json()) as unknown };
}

const fields = (body: unknown): Record<string, unknown> => body as Record<string, unknown>;
const reasonOf = (body: unknown): string => String(fields(body).reason);

beforeEach(() => {
  vi.stubEnv('NEXUS_API_URL', API_BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('publish route — the declarations that keep the service server-side', () => {
  it('runs on the node runtime, because this is the hop that holds the service address', () => {
    // The browser must never learn `NEXUS_API_URL` or reach the service; a route that became edge would
    // publish the address inside a bundle.
    expect(runtime).toBe('nodejs');
  });

  it('is never a cached static answer, because a publication changes under the same URL', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});

describe('publish route GET — what the Studio can say without publishing', () => {
  it('a 404 for the probe id is an AVAILABLE service, passed through at 200', async () => {
    const calls = stubFetch(() => ({ status: 404 }));
    const res = await GET();
    const body = fields((await res.json()) as unknown);

    expect(res.status).toBe(200);
    expect(body).toEqual({ available: true, apiBase: API_BASE, probeStatus: 404 });
    expect(calls[0]!.url).toBe(`${API_BASE}/projects/__nexus_studio_probe__`);
  });

  it('a service that is NOT running is an ordinary answer at 200, not a 500 — and it says where it looked', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:8080');
    });
    const res = await GET();
    const body = fields((await res.json()) as unknown);

    // The panel has to be able to say "the service is not up" rather than "something went wrong", so the
    // status is 200 and the sentence carries the base URL the Studio actually tried.
    expect(res.status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.apiBase).toBe(API_BASE);
    expect(reasonOf(body)).toContain('unreachable');
    expect(reasonOf(body)).toContain(API_BASE);
  });
});

describe('publish route — the body the caller sent', () => {
  it('a body that is not JSON is refused with the shape to send instead, and the service is not asked', async () => {
    const calls = stubFetch(okWith({}));
    const answer = await askRaw('{"action": "list", ');

    expect(answer.status).toBe(400);
    expect(reasonOf(answer.body)).toBe(REFUSAL_NOT_JSON);
    expect(calls).toHaveLength(0);
  });

  it('a body that is JSON but not an object is refused, whatever it turns out to be', async () => {
    const calls = stubFetch(okWith({}));
    // A bare string is what a caller sends when it thinks the route takes an action NAME, so the refusal has
    // to answer with an object shape even for the body that is closest to a plausible mistake.
    for (const text of ['null', '5', '"publish"']) {
      const answer = await askRaw(text);
      expect(answer.status, `body ${text}`).toBe(400);
      expect(reasonOf(answer.body), `body ${text}`).toBe(REFUSAL_NOT_OBJECT);
    }
    expect(calls).toHaveLength(0);
  });

  it('a JSON array is the wrong SHAPE, not an object wearing no action', async () => {
    const calls = stubFetch(okWith({}));
    const answer = await askRaw('[{"action":"list"}]');

    // `typeof` calls an array an object, so without this term a caller that wrapped its request in `[…)` was
    // answered about a `projectId` it never sent — a refusal that points at a field the body does not have.
    expect(answer.status).toBe(400);
    expect(reasonOf(answer.body)).toBe(REFUSAL_NOT_OBJECT);
    expect(calls).toHaveLength(0);
  });

  it('a refusal is a 400 and nothing else — no refusal reaches the browser as a 500', async () => {
    const calls = stubFetch(okWith({}));
    const answer = await ask({ action: 'publish', title: 'no project named' });

    expect(answer.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('publish route — list is the action that names no project', () => {
  it('`list` is answered BEFORE the projectId guard, so asking what is published needs no project', async () => {
    const rows = [{ projectId: 'p1', title: 'Harbour', version: 1, publishedAt: '2026-10-24T00:00:00Z', url: `${API_BASE}/projects/p1` }];
    const calls = stubFetch(okWith({ publications: rows, count: 1, limit: 20, offset: 0 }));
    const answer = await ask({ action: 'list' });

    expect(answer.status).toBe(200);
    expect(fields(answer.body).ok).toBe(true);
    expect(fields(answer.body).publications).toEqual(rows);
    expect(calls[0]!.url).toBe(`${API_BASE}/projects?limit=20`);
  });

  it('a `list` that also carries a projectId still lists — the id is not used as a project', async () => {
    const calls = stubFetch(okWith({ publications: [], count: 0, limit: 20, offset: 0 }));
    const answer = await ask({ action: 'list', projectId: 'p1' });

    expect(fields(answer.body).ok).toBe(true);
    expect(calls[0]!.url).toBe(`${API_BASE}/projects?limit=20`);
  });

  it('a limit is asked as a whole number of rows', async () => {
    const calls = stubFetch(okWith({ publications: [], count: 0, limit: 3, offset: 0 }));
    await ask({ action: 'list', limit: 3.7 });

    expect(calls[0]!.url).toBe(`${API_BASE}/projects?limit=3`);
  });

  it('a limit that is not a number the route can count in rows asks the default', async () => {
    const calls = stubFetch(okWith({ publications: [], count: 0, limit: 20, offset: 0 }));
    // '5' is a string, `null` is not a number, and a body may carry `1e999`, which arrives as Infinity —
    // none of them is a count of rows, so none of them is forwarded.
    await ask({ action: 'list', limit: '5' });
    await ask({ action: 'list', limit: null });
    await askRaw('{"action":"list","limit":1e999}');

    expect(calls.map((call) => call.url)).toEqual([
      `${API_BASE}/projects?limit=20`,
      `${API_BASE}/projects?limit=20`,
      `${API_BASE}/projects?limit=20`,
    ]);
  });

  it('a limit so large the route cannot write it as digits is forwarded as asked, not quietly turned into a page', async () => {
    const calls = stubFetch(okWith({ publications: [], count: 0, limit: 20, offset: 0 }));
    await ask({ action: 'list', limit: 1e21 });

    // The Studio has no rule about how many rows exist, so it does not invent an answer to a different
    // question: "everything" goes to the service as written, and the service — which binds an integer —
    // answers in its own words. A fallback to 20 here would be a Studio guessing at what the caller meant.
    expect(calls[0]!.url).toBe(`${API_BASE}/projects?limit=1e%2B21`);
  });

  it('a negative limit is asked RAW — fewer than one row is the service\'s rule to refuse', async () => {
    const calls = stubFetch(okWith({ publications: [], count: 0, limit: -3, offset: 0 }));
    await ask({ action: 'list', limit: -2.5 });

    expect(calls[0]!.url).toBe(`${API_BASE}/projects?limit=-3`);
  });

  it('an owner narrows the listing to that account, trimmed first', async () => {
    const calls = stubFetch(okWith({ publications: [], count: 0, limit: 20, offset: 0 }));
    await ask({ action: 'list', owner: '  ada  ' });

    expect(calls[0]!.url).toBe(`${API_BASE}/projects?limit=20&owner=ada`);
  });

  it('a blank or non-string owner is the ABSENCE of one and is not forwarded — the service answers "everybody"', async () => {
    const calls = stubFetch(okWith({ publications: [], count: 0, limit: 20, offset: 0 }));
    await ask({ action: 'list', owner: '   ' });
    await ask({ action: 'list', owner: 42 });

    // Forwarding `owner=` would ask the service for the publications of an account named nothing, which is
    // not the same question as "what is published".
    expect(calls.map((call) => call.url)).toEqual([`${API_BASE}/projects?limit=20`, `${API_BASE}/projects?limit=20`]);
  });
});

describe('publish route — the guards that run before any call', () => {
  it('a publish with no project is refused BEFORE the title is even looked at', async () => {
    const calls = stubFetch(okWith({}));
    const answer = await ask({ action: 'publish', title: '   ' });

    // Both halves are broken here, and the order is the decision: the reason names the project and not the
    // title, so a caller fixing the sentence it was given fixes the field that was checked first.
    expect(answer.status).toBe(400);
    expect(reasonOf(answer.body)).toBe('projectId is required and must be a non-empty string');
    expect(reasonOf(answer.body)).not.toContain('title');
    expect(calls).toHaveLength(0);
  });

  for (const projectId of [undefined, '', '   ', 42]) {
    it(`a project id of ${JSON.stringify(projectId) ?? 'absent'} is the absence of one, for every action that needs it`, async () => {
      const calls = stubFetch(okWith({}));
      for (const action of ['publish', 'read', 'unpublish']) {
        const answer = await ask({ action, projectId, title: 'Harbour' });
        expect(answer.status, `action ${action}`).toBe(400);
        expect(reasonOf(answer.body), `action ${action}`).toBe('projectId is required and must be a non-empty string');
      }
      expect(calls).toHaveLength(0);
    });
  }

  for (const title of [undefined, '', '   ', 42]) {
    it(`a publish title of ${JSON.stringify(title) ?? 'absent'} is refused without asking the service`, async () => {
      const calls = stubFetch(okWith({}));
      const answer = await ask({ action: 'publish', projectId: 'p1', title });

      expect(answer.status).toBe(400);
      expect(reasonOf(answer.body)).toBe('title is required and must be a non-empty string');
      expect(calls).toHaveLength(0);
    });
  }
});

describe('publish route — what crosses the hop', () => {
  it('a title is trimmed only to DECIDE, and forwarded exactly as the caller wrote it', async () => {
    const calls = stubFetch(okWith({ projectId: 'p1', title: '  Harbour at dusk  ', version: 1 }));
    await ask({ action: 'publish', projectId: 'p1', title: '  Harbour at dusk  ', document: { pages: [] } });

    // The route is a pass-through, not a formatter: whose rule the whitespace is, the service decides. A
    // reader comparing what was sent with what was stored must be able to tell the two apart.
    expect(calls[0]!.url).toBe(`${API_BASE}/projects/p1/publish`);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers?.['content-type']).toBe('application/json');
    expect(calls[0]!.body).toEqual({ title: '  Harbour at dusk  ', document: { pages: [] } });
  });

  it('a publish with no document sends no document rather than an invented one', async () => {
    const calls = stubFetch(okWith({ projectId: 'p1', title: 'T', version: 1 }));
    await ask({ action: 'publish', projectId: 'p1', title: 'T' });

    expect(calls[0]!.raw).not.toContain('"document"');
  });

  it('an owner claim is attached verbatim when given — and the route does not judge its shape', async () => {
    const calls = stubFetch(okWith({ projectId: 'p1', title: 'T', version: 1 }));
    await ask({ action: 'publish', projectId: 'p1', title: 'T', owner: { handle: 'ada', assurance: 'self-reported' } });
    await ask({ action: 'publish', projectId: 'p1', title: 'T', owner: 'ada' });

    // Attach-only: `owner` is the caller's claim about who published this and the SERVICE decides what it is
    // worth, so a string wearing the shape of a claim object crosses unchanged rather than being dropped or
    // repaired here.
    expect(fields(calls[0]!.body!).owner).toEqual({ handle: 'ada', assurance: 'self-reported' });
    expect(fields(calls[1]!.body!).owner).toBe('ada');
  });

  it('no owner claim means the body names no owner at all', async () => {
    const calls = stubFetch(okWith({ projectId: 'p1', title: 'T', version: 1 }));
    await ask({ action: 'publish', projectId: 'p1', title: 'T' });

    expect(calls[0]!.raw).not.toContain('"owner"');
  });

  it('the service\'s receipt is passed through and the HTTP status stays the Studio\'s', async () => {
    stubFetch(() => ({
      status: 201,
      json: { projectId: 'p1', title: 'Harbour', version: 2, publishedAt: '2026-10-24T09:00:00Z', url: `${API_BASE}/projects/p1` },
    }));
    const answer = await ask({ action: 'publish', projectId: 'p1', title: 'Harbour', document: { pages: [] } });

    // 200 here means "the Studio has an answer it can show"; the service's 201 is a fact INSIDE that answer,
    // and the version and the URL are the service's, never recomputed here.
    expect(answer.status).toBe(200);
    expect(fields(answer.body)).toEqual({
      ok: true,
      projectId: 'p1',
      title: 'Harbour',
      version: 2,
      publishedAt: '2026-10-24T09:00:00Z',
      url: `${API_BASE}/projects/p1`,
    });
  });

  it('the service\'s own refusal sentence survives, rather than becoming "publish failed"', async () => {
    stubFetch(() => ({ status: 409, json: { message: 'this document is not readable as a design' } }));
    const answer = await ask({ action: 'publish', projectId: 'p1', title: 'T', document: 'not a document' });

    expect(answer.status).toBe(200);
    expect(fields(answer.body).ok).toBe(false);
    expect(reasonOf(answer.body)).toBe('this document is not readable as a design');
  });

  it('a read asks for the id the caller named, as ONE path segment, and carries the document back', async () => {
    const calls = stubFetch(okWith({ projectId: 'a/b', title: 'T', version: 4, document: { pages: [1] }, owner: { handle: 'ada', assurance: 'self-reported' } }));
    const answer = await ask({ action: 'read', projectId: 'a/b' });

    expect(calls[0]!.url).toBe(`${API_BASE}/projects/a%2Fb`);
    expect(answer.status).toBe(200);
    expect(fields(answer.body).document).toEqual({ pages: [1] });
    expect(fields(answer.body).owner).toEqual({ handle: 'ada', assurance: 'self-reported' });
  });

  it('a project nothing has published reads back with `notFound` — the flag, not the sentence', async () => {
    stubFetch(() => ({ status: 404 }));
    const answer = await ask({ action: 'read', projectId: 'ghost' });

    // The artifact page separates "404, nothing here" from "503, no service" with this flag, so it must
    // arrive through the route intact; a caller that read the wording would break the day it is reworded.
    expect(answer.status).toBe(200);
    expect(fields(answer.body)).toEqual({ ok: false, notFound: true, reason: 'nothing is published as "ghost"' });
  });

  it('a takedown names the claimer when given and names none when not', async () => {
    const calls = stubFetch(okWith({ projectId: 'p1', removed: true }));
    await ask({ action: 'unpublish', projectId: 'p1', claimer: 'a1' });
    await ask({ action: 'unpublish', projectId: 'p1' });
    await ask({ action: 'unpublish', projectId: 'p1', claimer: '' });

    expect(calls.map((call) => call.url)).toEqual([
      `${API_BASE}/projects/p1?claimer=a1`,
      `${API_BASE}/projects/p1`,
      `${API_BASE}/projects/p1`,
    ]);
    expect(calls[0]!.method).toBe('DELETE');
  });

  it('taking down a row that was not there is a success that says `removed: false`', async () => {
    stubFetch(okWith({ projectId: 'ghost', removed: false }));
    const answer = await ask({ action: 'unpublish', projectId: 'ghost' });

    // Nothing to remove is not a failure, so it is not a 400 and not an ok:false — the answer just says
    // whether anything actually moved.
    expect(answer.status).toBe(200);
    expect(fields(answer.body)).toEqual({ ok: true, projectId: 'ghost', removed: false });
  });
});

describe('publish route — an action name the handler does not dispatch', () => {
  it('the refusal names the action asked for AND every action the route actually speaks', async () => {
    const calls = stubFetch(okWith({}));
    const answer = await ask({ action: 'share', projectId: 'p1' });

    expect(answer.status).toBe(400);
    expect(reasonOf(answer.body)).toBe(unknownAction('"share"'));
    expect(calls).toHaveLength(0);

    // The sentence is the claim this increment exists for: the handler dispatches four actions, and a
    // reader who trusts a three-action sentence would keep trying to make "list" work.
    for (const action of ACTIONS) expect(reasonOf(answer.body), action).toContain(`"${action}"`);
  });

  it('the action is shown in the shape it arrived, quoted only when it was a string', async () => {
    const calls = stubFetch(okWith({}));
    const shown: Array<[unknown, string]> = [
      [42, '42'],
      [null, 'null'],
      [undefined, 'undefined'],
      [{ any: 'thing' }, '[object Object]'],
    ];
    for (const [action, text] of shown) {
      const answer = await ask({ action, projectId: 'p1' });
      expect(answer.status, `action ${text}`).toBe(400);
      expect(reasonOf(answer.body), `action ${text}`).toBe(unknownAction(text));
    }
    expect(calls).toHaveLength(0);
  });
});
