import { describe, expect, it } from 'vitest';

import { GET, POST } from './route';

/**
 * M7 v498 (ADR 0016 amendment 491) — the world-saves DOOR, graded directly.
 *
 * `worldSaveServer.test.ts` has always graded the store with an INJECTED fs: every naming rule, every
 * refusal, every byte. This file grades the hop above it — the route that dispatches — whose decisions
 * belong to nothing else: which shapes are refused before the store is even built, which action names
 * the door speaks, and how the store's own honest answer becomes an HTTP status.
 *
 * Nothing here writes a byte. Every case below is decided BEFORE the store is constructed, so the
 * dispatch is graded without a filesystem side effect; the cases that WOULD write are the store's own
 * subject, graded in its own file with an injected fs.
 */

const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/agent/world-saves', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe('world-saves route — the GET ask (v498)', () => {
  it('the state answers the store\u2019s own shape — a version stamp, an availability and either a root or a reason', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serverVersion).toBe('studio-world-save-v1');
    expect(typeof body.available).toBe('boolean');
    if (body.available) {
      expect(typeof body.root).toBe('string');
      expect(Array.isArray(body.saves)).toBe(true);
      expect(typeof body.count).toBe('number');
    } else {
      expect(typeof body.reason).toBe('string');
    }
  });
});

describe('world-saves route — the POST dispatch (v498)', () => {
  it('a body that is not JSON is refused by name — and the sentence names the two actions the door speaks', async () => {
    const res = await post(undefined, 'not json at all');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not JSON; this route answers { action: "write" | "read", ... }');
  });

  it('a body that is not an object is the same refusal', async () => {
    const res = await post(undefined, '"a string"');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not an object; this route answers { action: "write" | "read", ... }');
  });

  it('an action the door does not speak is refused by name — and the sentence says which two it does', async () => {
    const res = await post({ action: 'delete', path: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('action is "delete"; this route speaks "write" and "read" only');
  });

  it('a MISSING action is the same refusal — and it says so without inventing a name', async () => {
    const res = await post({ path: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('action is undefined; this route speaks "write" and "read" only');
  });

  it('a WRITE with no path is refused with the STORE\u2019s own sentence — the route forwards, it does not paraphrase', async () => {
    const res = await post({ action: 'write', file: { a: 1 } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toContain('a world save needs a save path (a non-empty string)');
  });

  it('a WRITE whose file is not a save-file object is refused BEFORE any byte moves', async () => {
    const res = await post({ action: 'write', path: 'some-save', file: 'not an object' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toContain('not a world-save object');
    expect(body.reason).toContain('nothing was written');
  });

  it('a READ with no path is refused with the store\u2019s own sentence', async () => {
    const res = await post({ action: 'read' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toContain('a world read needs a save path (a non-empty string)');
  });

  it('a READ of a name that is not there is an ANSWER, not an error — and the route answers 400 with the store\u2019s sentence', async () => {
    const res = await post({ action: 'read', path: 'a-world-nobody-saved-v498' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toContain('is not in the store');
  });
});
