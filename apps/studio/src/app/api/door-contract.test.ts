import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET as auditGet } from './audit/route';
import { POST as buildArcPost } from './agent/build-arc/route';
import { DELETE as commentTakeBack } from './comments/[commentId]/route';
import { GET as commentsGet, POST as commentsPost } from './comments/route';
import { POST as containerPost } from './agent/container/route';
import { POST as saveFsPost } from './agent/save-fs/route';
import { POST as worldSavesPost } from './agent/world-saves/route';
import { POST as deployPost } from './agent/deploy/route';
import { GET as economyGet } from './economy/route';
import { GET as followsGet, POST as followsPost } from './follows/route';
import { DELETE as unfollow } from './follows/[accountId]/route';
import { GET as likesGet, POST as likesPost } from './likes/route';
import { DELETE as unlike } from './likes/[projectId]/route';
import { GET as moderationGet, POST as moderationPost } from './moderation/route';
import { DELETE as plansDelete, POST as plansPost, PUT as plansPut } from './plans/route';
import { DELETE as reportsDelete, GET as reportsGet, POST as reportsPost } from './reports/route';
import { DELETE as subsDelete, POST as subsPost } from './subscriptions/route';
import { GET as tipsGet, POST as tipsPost } from './tips/route';

/**
 * M7 v499 (ADR 0016 amendment 492) — the DOOR CONTRACT, graded across every door.
 *
 * v488–v498 graded each of the Studio's doors alone, and grading them alone is what made the HOUSE
 * visible: the same question is answered DIFFERENTLY on different doors, and until now nothing said so
 * in a test. A read refusal is a 502 on six doors and a 503 on three. A blank account is refused before
 * the service is asked on twelve doors and forwarded as asked on four. A new row is a 201 on five doors
 * and a 200 on three.
 *
 * None of that is a bug — but an unwritten contract is one a later edit cannot keep. This file asks every
 * door the SAME three questions and pins the answers, so that changing one of them becomes a decision
 * somebody has to make rather than an accident nobody notices.
 *
 * v507 — the FIRST of those answers turned out to BE the accident. The read-refusal split below (a 502 on
 * six doors, a 503 on three) had no defense in any comment: git shows the 503s come from the v284–v298
 * wave and the 502s from the v305–v335 wave, and the plans door answered BOTH — 502 for a read that
 * failed and 503 for a write that failed the same way. The repair names the two kinds of failure once
 * (`serviceCall.ts`) and derives every door's status from the kind, so the same failure now earns the
 * same number on every door: **the service answered and could not be served is a 502; the service did
 * not answer at all is a 503.**
 *
 * The service is faked at the `fetch` boundary, the same way each door's own suite fakes it.
 *
 * v509 — the AGENT doors joined the same discipline. They had kept their author’s number: every one
 * of them answered 400 for `ok: false`, whether the caller’s ask was refused or the MACHINE failed,
 * and a lib that threw took the route down as a bare 500 with no sentence at all. `doorFailure.ts`
 * names the two kinds once and every agent door now derives its status from them: 400 for a refused
 * ask, 503 for a failed machine, 200 for an answered door. The agent libs are faked at their OWN
 * seam — a delegating stub that is the real lib, byte for byte, until a failure mode says otherwise
 * — because a failing machine cannot be provoked through a route any other way: the fs is injected
 * one seam BELOW the route (each lib builds its own store over node:fs), and docker is not on the
 * test machine. The two disk doors’ libs answer every failure as an answer, so only their ANSWER
 * mode is faked; the three arc doors’ libs can also throw, and that is faked too.
 *
 * v524 — the container door’s `machine` mode was the exception to that promise, and the exception hid
 * the defect: the stub answered `{ ok: false, reason: 'the container runtime is not on this machine' }`,
 * a body the shipped lane never emits. The real lane answers that machine with `ok: true` and the words
 * “container node:22-alpine node --version → exit null” — a door claiming a run, at 200, because nothing
 * read the spawn error riding in the record. The stub now runs the REAL lane over a docker that cannot be
 * started, so the 503 pin grades an answer production gives, and a second pin keeps the policy refusal
 * where it belongs: an answered door, 200, the lane’s own sentence.
 */

let mode: 'ok' | 'refuse' = 'ok';

/**
 * v509 — which way the five agent libs are faked. `ok` is the REAL lib (the default, so every other
 * block in this file still grades the real doors); `machine` is a lib that answers with the machine’s
 * own failure; `throw` is a lib that breaks the house’s rule and throws instead of answering.
 */
let agentMode: 'ok' | 'machine' | 'throw' = 'ok';

/**
 * v524 — the docker the container door meets when the MACHINE failed: the client cannot even be summoned,
 * so the child never lives and the record carries a spawn error with no exit code. The real lane runs over
 * this seam, so the answer graded below is the answer production emits, not a body the test author typed.
 */
const DOCKER_IS_NOT_HERE = () => ({
  onData: () => {},
  onEnd: (l: (e: { code: number | null; signal: string | null; error?: string }) => void) => {
    setImmediate(() => l({ code: null, signal: null, error: 'spawn docker ENOENT' }));
  },
  kill: () => {},
});

vi.mock('@/lib/containerServer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/containerServer')>();
  return {
    ...actual,
    runContainerExec: async (...args: Parameters<typeof actual.runContainerExec>) => {
      if (agentMode === 'throw') throw new Error('spawn docker ENOENT');
      if (agentMode === 'machine') {
        return actual.runContainerExec(args[0], { ...args[1], spawnLike: DOCKER_IS_NOT_HERE });
      }
      return actual.runContainerExec(...args);
    },
  };
});

vi.mock('@/lib/buildServer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/buildServer')>();
  return {
    ...actual,
    runStudioBuildArc: async (...args: Parameters<typeof actual.runStudioBuildArc>) => {
      if (agentMode === 'throw') throw new Error('the build engine could not be summoned');
      if (agentMode === 'machine') {
        return { ok: false, reason: 'the container host refused the walk', failure: 'the-machine' as const };
      }
      return actual.runStudioBuildArc(...args);
    },
  };
});

vi.mock('@/lib/deployServer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deployServer')>();
  return {
    ...actual,
    runStudioDeployArc: async (...args: Parameters<typeof actual.runStudioDeployArc>) => {
      if (agentMode === 'throw') throw new Error('the records file could not be opened');
      if (agentMode === 'machine') {
        // The arc’s own honest shape when the sink refused: ok:true, the verdict is failed, and the
        // machine’s words name the disk. A 200 here would read as a deploy that was attempted.
        return {
          ok: true as const,
          status: 'failed' as const,
          reason: 'runtime was not recorded: the record did not land: ENOSPC: no space left on device',
          goal: 'verify the runtime',
          build: { status: 'completed', detail: 'build arc: 2/2 step(s) green' },
          detail: 'deploy arc: nothing recorded — failed at runtime',
          facts: [],
          unmeasured: [],
          deployReceipts: [],
          failure: 'the-machine' as const,
        };
      }
      return actual.runStudioDeployArc(...args);
    },
  };
});

vi.mock('@/lib/saveFsServer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/saveFsServer')>();
  return {
    ...actual,
    writeStudioSceneSave: (...args: Parameters<typeof actual.writeStudioSceneSave>) => {
      if (agentMode === 'machine') {
        return { ok: false, reason: 'EISDIR: illegal operation on a directory, read', failure: 'the-machine' as const };
      }
      return actual.writeStudioSceneSave(...args);
    },
  };
});

vi.mock('@/lib/worldSaveServer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/worldSaveServer')>();
  return {
    ...actual,
    writeWorldSave: (...args: Parameters<typeof actual.writeWorldSave>) => {
      if (agentMode === 'machine') {
        return { ok: false, reason: 'ENOSPC: no space left on device, write', failure: 'the-machine' as const };
      }
      return actual.writeWorldSave(...args);
    },
  };
});

/** v508 — every URL the stub was asked, so a test can say what the door ASKED, not only what it answered. */
const seen: string[] = [];

function stubService() {
  seen.length = 0;
  vi.stubGlobal(
    'fetch',
    async (input: string | URL, init?: { method?: string; body?: string }) => {
      const url = String(input);
      seen.push(url);
      if (mode === 'refuse') {
        return new Response(JSON.stringify({ error: 'down', message: 'the service is down' }), { status: 503 });
      }
      const ok = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status });
      // The READS first — each door's lib names the shape it needs to call the read a success.
      if (url.includes('/moderation/tally')) return ok({ total: 0, open: 0, byReason: {}, byStatus: {} });
      if (url.includes('/moderation/reports?')) return ok({ reports: [], limit: 20 });
      if (url.includes('/plans?creator=')) return ok({ plans: [], count: null, limit: 20 });
      if (url.includes('/subscriptions?subscriber=') || url.includes('/subscriptions?creator=')) {
        return ok({ subscriptions: [], totalsByPeriod: [], count: 0, limit: 20 });
      }
      if (url.includes('/tips?')) return ok({ tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 });
      if (url.includes('/likes?')) return ok({ count: 1, likes: [], liked: true });
      if (url.includes('/follows?follower=')) return ok({ following: [], count: 0, limit: 20, offset: 0 });
      if (url.includes('/audit?')) return ok({ ok: true, entries: [], count: 0, limit: 20, total: 0 });
      // Then the WRITES — a new row, an idempotent write, or a take-back, each with its own shape.
      if (url.includes('/moderation/reports/')) return ok({ reportId: 'r-1', status: 'acknowledged', moved: true });
      if (url.includes('/plans/')) {
        return ok(init?.method === 'PUT' ? { ok: true, priceCents: 500, period: 'month' } : { ok: true, retired: true });
      }
      if (url.includes('/subscriptions/')) return ok({ ok: true, ended: true });
      if (url.includes('/comments/')) return ok({ ok: true, removed: true });
      if (url.includes('/reports/')) return ok({ ok: true, withdrawn: true });
      if (url.includes('/plans')) return ok({ ok: true, plans: [{ planId: 'plan-1' }] }, 201);
      if (url.includes('/subscriptions')) return ok({ ok: true, subscriptions: [{ id: 's-1' }] }, 201);
      if (url.includes('/comments')) return ok({ ok: true, comments: [{ id: 'c-1' }], visible: 1 }, 201);
      if (url.includes('/reports')) return ok({ ok: true, reports: [{ id: 'r-1' }] }, 201);
      if (url.includes('/tips')) return ok({ ok: true, tips: [{ id: 't-1' }] }, 201);
      if (url.includes('/likes')) return ok({ ok: true, count: 1, liked: true });
      if (url.includes('/follows')) return ok({ ok: true, followerCount: 1, following: true });
      return ok({ ok: true });
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  agentMode = 'ok';
});

const claim = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };
const req = (path: string, init?: RequestInit) => new Request(`http://studio.test${path}`, init);
const jsonPost = (path: string, body: unknown) =>
  req(path, { method: 'POST', body: JSON.stringify(body) });

describe('the door contract — a read refusal’s STATUS (v499)', () => {
  it('the comments door answers 502', async () => {
    mode = 'refuse';
    stubService();
    expect((await commentsGet(req('/api/comments?author=acct-ada'))).status).toBe(502);
  });

  it('the reports door answers 502', async () => {
    mode = 'refuse';
    stubService();
    expect((await reportsGet(req('/api/reports?reporter=acct-ada'))).status).toBe(502);
  });

  it('the follows door answers 502', async () => {
    mode = 'refuse';
    stubService();
    expect((await followsGet(req('/api/follows?follower=acct-ada'))).status).toBe(502);
  });

  it('the economy door answers 502', async () => {
    mode = 'refuse';
    stubService();
    expect((await economyGet(req('/api/economy?account=acct-ada'))).status).toBe(502);
  });

  it('the moderation door answers 502', async () => {
    mode = 'refuse';
    stubService();
    expect((await moderationGet(req('/api/moderation?owner=acct-ada'))).status).toBe(502);
  });

  it('the tips door answers 502 — the same failure, the SAME number (v507)', async () => {
    mode = 'refuse';
    stubService();
    expect((await tipsGet(req('/api/tips?recipient=acct-ada'))).status).toBe(502);
  });

  it('the likes door answers 502 — the same failure, the SAME number (v507)', async () => {
    mode = 'refuse';
    stubService();
    expect((await likesGet(req('/api/likes?projectId=pub-1'))).status).toBe(502);
  });

  it('the audit door answers 502 — the same failure, the SAME number (v507)', async () => {
    mode = 'refuse';
    stubService();
    expect((await auditGet(req('/api/audit'))).status).toBe(502);
  });
});

describe('the door contract — the service that does not answer (v507)', () => {
  // The one failure that is not the service's own words: the call threw. Every door answers 503,
  // and only then — a door that answered 503 for a REFUSAL was claiming the service was down when all
  // it knew was that the answer was no good (v507).
  function stubDeadService() {
    vi.stubGlobal(
      'fetch',
      async () => {
        throw new Error('nexus-api unreachable');
      },
    );
  }

  it('a THROWN call is a 503 on the comments door', async () => {
    stubDeadService();
    expect((await commentsGet(req('/api/comments?author=acct-ada'))).status).toBe(503);
  });

  it('a THROWN call is a 503 on the reports door', async () => {
    stubDeadService();
    expect((await reportsGet(req('/api/reports?reporter=acct-ada'))).status).toBe(503);
  });

  it('a THROWN call is a 503 on the follows door', async () => {
    stubDeadService();
    expect((await followsGet(req('/api/follows?follower=acct-ada'))).status).toBe(503);
  });

  it('a THROWN call is a 503 on the economy door', async () => {
    stubDeadService();
    expect((await economyGet(req('/api/economy?account=acct-ada'))).status).toBe(503);
  });

  it('a THROWN call is a 503 on the moderation door', async () => {
    stubDeadService();
    expect((await moderationGet(req('/api/moderation?owner=acct-ada'))).status).toBe(503);
  });

  it('a THROWN call is a 503 on the tips door', async () => {
    stubDeadService();
    expect((await tipsGet(req('/api/tips?recipient=acct-ada'))).status).toBe(503);
  });

  it('a THROWN call is a 503 on the likes door', async () => {
    stubDeadService();
    expect((await likesGet(req('/api/likes?projectId=pub-1'))).status).toBe(503);
  });

  it('a THROWN call is a 503 on the audit door', async () => {
    stubDeadService();
    expect((await auditGet(req('/api/audit'))).status).toBe(503);
  });

  it('a THROWN call is a 503 on the plans door’s WRITE — the same rule on the verb that answers 201', async () => {
    // The plans door has no read: the plans READ is the economy door’s answer (v309), graded above. What
    // the plans door owns is the write, and it answers 201 for a new plan and 503 when the service did
    // not answer at all — the same rule, on the verb that used to answer 503 for a refusal too.
    stubDeadService();
    expect((await plansPost(jsonPost('/api/plans', { planId: 'plan-1', priceCents: 500, claim }))).status).toBe(503);
  });

  it('a THROWN call is a 503 on the subscriptions door’s write', async () => {
    stubDeadService();
    expect((await subsPost(jsonPost('/api/subscriptions', { planId: 'plan-1', claim }))).status).toBe(503);
  });
});

describe('the door contract — a BLANK account (v499, answered uniformly in v508)', () => {
  it('the comments door refuses a blank author before the service is asked', async () => {
    mode = 'ok';
    stubService();
    const res = await commentsGet(req('/api/comments?author=%20%20'));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the question names whose comments they are');
  });

  it('the reports door refuses a blank reporter before the service is asked', async () => {
    mode = 'ok';
    stubService();
    const res = await reportsGet(req('/api/reports?reporter=%20%20'));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the reports an account filed need that account to be named');
  });

  it('the follows door refuses a blank follower before the service is asked', async () => {
    mode = 'ok';
    stubService();
    const res = await followsGet(req('/api/follows?follower=%20%20'));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toContain('the follower must be named');
  });

  it('the economy door refuses a blank account before the service is asked', async () => {
    mode = 'ok';
    stubService();
    const res = await economyGet(req('/api/economy?account=%20%20'));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the economy belongs to an account, and this request names none');
  });

  it('the moderation door refuses a blank owner before the service is asked', async () => {
    mode = 'ok';
    stubService();
    const res = await moderationGet(req('/api/moderation?owner=%20%20'));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the desk belongs to an account, and this request names none');
  });

  it('the tips door refuses a blank recipient before the service is asked (v508)', async () => {
    mode = 'ok';
    stubService();
    const res = await tipsGet(req('/api/tips?recipient=%20%20'));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the question names who received the tips or who gave them');
    expect(seen, 'a name that is blank after trimming is not asked about at all').toHaveLength(0);
  });

  it('the likes door refuses a blank projectId before the service is asked (v508)', async () => {
    mode = 'ok';
    stubService();
    const res = await likesGet(req('/api/likes?projectId=%20%20'));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the projectId parameter is missing');
    expect(seen, 'a name that is blank after trimming is not asked about at all').toHaveLength(0);
  });

  it('the take-back doors refuse a blank claimer before the service is asked (v508)', async () => {
    mode = 'ok';
    stubService();
    const like = await unlike(req('/api/likes/pub-1?claimer=%20%20'), { params: Promise.resolve({ projectId: 'pub-1' }) });
    expect(like.status).toBe(400);
    const follow = await unfollow(req('/api/follows/acct-grace?claimer=%20%20'), { params: Promise.resolve({ accountId: 'acct-grace' }) });
    expect(follow.status).toBe(400);
    expect(seen, 'a name that is blank after trimming is not asked about at all').toHaveLength(0);
  });

  it('the take-back doors refuse a blank SEGMENT before the service is asked (v523)', async () => {
    // The claimer has been guarded since v508 and the name in the URL has not, so a segment of space made
    // each of these doors ask the COLLECTION door — `/comments/`, `/likes/`, `/follows/` — about nothing,
    // and answer with whatever that happens to return.
    mode = 'ok';
    stubService();
    const comment = await commentTakeBack(req('/api/comments/c-1?claimer=acct-ada'), { params: Promise.resolve({ commentId: ' ' }) });
    const like = await unlike(req('/api/likes/pub-1?claimer=acct-ada'), { params: Promise.resolve({ projectId: ' ' }) });
    const follow = await unfollow(req('/api/follows/acct-grace?claimer=acct-ada'), { params: Promise.resolve({ accountId: ' ' }) });
    for (const [door, res] of [['comments', comment], ['likes', like], ['follows', follow]] as const) {
      expect(res.status, door).toBe(400);
    }
    expect(seen, 'a name that is blank after trimming is not asked about at all').toHaveLength(0);
  });
});

describe('the door contract — a WRITE’s status (v499)', () => {
  it('a NEW row is a 201 on the comments door', async () => {
    mode = 'ok';
    stubService();
    expect((await commentsPost(jsonPost('/api/comments', { projectId: 'pub-1', body: 'hello', claim }))).status).toBe(201);
  });

  it('a NEW row is a 201 on the reports door', async () => {
    mode = 'ok';
    stubService();
    expect((await reportsPost(jsonPost('/api/reports', { projectId: 'pub-1', reason: 'spam', claim }))).status).toBe(201);
  });

  it('a NEW row is a 201 on the tips door', async () => {
    mode = 'ok';
    stubService();
    expect((await tipsPost(jsonPost('/api/tips', { recipientAccountId: 'acct-ada', amountCents: 500, claim }))).status).toBe(201);
  });

  it('a NEW row is a 201 on the plans door', async () => {
    mode = 'ok';
    stubService();
    expect((await plansPost(jsonPost('/api/plans', { planId: 'plan-1', priceCents: 500, claim }))).status).toBe(201);
  });

  it('a NEW row is a 201 on the subscriptions door', async () => {
    mode = 'ok';
    stubService();
    expect((await subsPost(jsonPost('/api/subscriptions', { planId: 'plan-1', claim }))).status).toBe(201);
  });

  it('an IDEMPOTENT write is a 200 on the likes door — liking twice is not two rows', async () => {
    mode = 'ok';
    stubService();
    expect((await likesPost(jsonPost('/api/likes', { projectId: 'pub-1', claim }))).status).toBe(200);
  });

  it('an IDEMPOTENT write is a 200 on the follows door — following twice is not two edges', async () => {
    mode = 'ok';
    stubService();
    expect((await followsPost(jsonPost('/api/follows', { accountId: 'acct-grace', claim }))).status).toBe(200);
  });

  it('an IDEMPOTENT write is a 200 on the moderation door — acknowledging twice is still one acknowledgement', async () => {
    mode = 'ok';
    stubService();
    expect((await moderationPost(jsonPost('/api/moderation?owner=acct-ada', { reportId: 'r-1' }))).status).toBe(200);
  });

  it('a TAKE-BACK is a 200 on every door that has one — the row stays, its standing changes', async () => {
    mode = 'ok';
    stubService();
    expect((await commentTakeBack(req('/api/comments/c-1?claimer=acct-ada'), { params: Promise.resolve({ commentId: 'c-1' }) })).status).toBe(200);
    expect((await reportsDelete(req('/api/reports?reportId=r-1&claimer=acct-ada'))).status).toBe(200);
    expect((await subsDelete(req('/api/subscriptions?subscriptionId=s-1&claimer=acct-ada'))).status).toBe(200);
    expect((await plansDelete(req('/api/plans?planId=plan-1&claimer=acct-ada'))).status).toBe(200);
    expect((await plansPut(req('/api/plans?planId=plan-1&claimer=acct-ada&price=500'))).status).toBe(200);
    expect((await unlike(req('/api/likes/pub-1?claimer=acct-ada'), { params: Promise.resolve({ projectId: 'pub-1' }) })).status).toBe(200);
    expect((await unfollow(req('/api/follows/acct-grace?claimer=acct-ada'), { params: Promise.resolve({ accountId: 'acct-grace' }) })).status).toBe(200);
  });
});

describe('the door contract — a PADDED name is the name (v508)', () => {
  // v521 corrected what this block used to claim — that the service never trims. It does: every social
  // service reads a name through `isBlank()` and then `trim()`. So the padding was never a wrong lookup;
  // the rule is the door’s own: a name blank after trimming names nothing, and the door refuses it with
  // its own sentence rather than forwarding an empty name the service answers as `invalid`, which v507
  // turns into a 502 — a number no browser can read as its own missing signature. v499 found four doors
  // forwarding the padding; v508 asks every door about the name the caller MEANT, and this keeps it that way.
  it('the tips door asks about the trimmed recipient, not the padding', async () => {
    mode = 'ok';
    stubService();
    await tipsGet(req('/api/tips?recipient=%20acct-ada%20'));
    expect(seen.some((u) => u.includes('recipient=acct-ada'))).toBe(true);
    expect(seen.some((u) => u.includes('%20acct-ada'))).toBe(false);
  });

  it('the tips door asks about the trimmed payer on the other side of the same door', async () => {
    mode = 'ok';
    stubService();
    await tipsGet(req('/api/tips?payer=%20acct-grace%20'));
    expect(seen.some((u) => u.includes('payer=acct-grace'))).toBe(true);
    expect(seen.some((u) => u.includes('%20acct-grace'))).toBe(false);
  });

  it('the likes door asks about the trimmed projectId, and the trimmed viewer', async () => {
    mode = 'ok';
    stubService();
    await likesGet(req('/api/likes?projectId=%20pub-1%20&viewer=%20acct-ada%20'));
    expect(seen.some((u) => u.includes('projectId=pub-1'))).toBe(true);
    expect(seen.some((u) => u.includes('viewer=acct-ada'))).toBe(true);
    expect(seen.some((u) => u.includes('%20pub-1'))).toBe(false);
  });

  it('the take-back doors ask about the trimmed claimer', async () => {
    mode = 'ok';
    stubService();
    await unlike(req('/api/likes/pub-1?claimer=%20acct-ada%20'), { params: Promise.resolve({ projectId: 'pub-1' }) });
    await unfollow(req('/api/follows/acct-grace?claimer=%20acct-ada%20'), { params: Promise.resolve({ accountId: 'acct-grace' }) });
    expect(seen.some((u) => u.includes('claimer=acct-ada'))).toBe(true);
    expect(seen.some((u) => u.includes('%20acct-ada'))).toBe(false);
  });

  it('the doors that always trimmed keep doing it — the rule is the whole house’s now', async () => {
    mode = 'ok';
    stubService();
    await commentsGet(req('/api/comments?author=%20acct-ada%20'));
    await reportsGet(req('/api/reports?reporter=%20acct-ada%20'));
    await followsGet(req('/api/follows?follower=%20acct-ada%20'));
    await economyGet(req('/api/economy?account=%20acct-ada%20'));
    await moderationGet(req('/api/moderation?owner=%20acct-ada%20'));
    for (const asked of seen) {
      expect(asked, 'no door asks about a padded name any more').not.toContain('%20acct-ada');
    }
  });
});

describe('the door contract — the doors that answer NOTHING about the service (v499)', () => {
  it('the build-arc and deploy doors answer 200 with an unplanned status for a goal no template matches', async () => {
    const goal = 'publish the artifact to the whole world';
    const build = await buildArcPost(jsonPost('/api/agent/build-arc', { goal }));
    expect(build.status).toBe(200);
    expect((await build.json()).status).toBe('unplanned');
    const deploy = await deployPost(jsonPost('/api/agent/deploy', { goal }));
    expect(deploy.status).toBe(200);
    expect((await deploy.json()).status).toBe('unplanned');
  });

  it('the container door refuses a body that is not JSON before docker is asked', async () => {
    const res = await containerPost(req('/api/agent/container', { method: 'POST', body: 'not json at all' }));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('body must be JSON');
  });

  it('the audit trail is never taken back — that door opens no DELETE and no POST', async () => {
    const audit = (await import('./audit/route')) as Record<string, unknown>;
    expect(typeof audit.GET).toBe('function');
    expect(audit.DELETE).toBeUndefined();
    expect(audit.POST).toBeUndefined();
  });
});


describe('the door contract — the AGENT doors, and WHOSE fault it was (v509)', () => {
  // v507 gave the service doors one rule and v508 gave them one name discipline; the agent doors kept
  // their author’s number. Every one of them answered 400 for `ok: false` — a refused ask and a failed
  // machine alike — and a lib that threw took the route down as a bare 500 with no sentence. Now the
  // status is derived from the answer’s kind (doorFailure.ts): the ask is a 400, the machine is a 503,
  // an answered door is a 200 — the same answer to the same question on every door in the house.
  it('a refused ASK is a 400 on every agent door — the door’s own sentence, before the machine is asked', async () => {
    agentMode = 'ok';
    // container: a malformed argv, refused before docker is asked at all
    const container = await containerPost(jsonPost('/api/agent/container', { argv: [] }));
    expect(container.status).toBe(400);
    expect((await container.json()).reason).toBe('argv must be a non-empty array of non-empty strings (no shell strings)');
    // the two disk doors: a name the store refuses, answered with the store’s own sentence
    const save = await saveFsPost(jsonPost('/api/agent/save-fs', { action: 'write', path: 'C:/escape.json', file: { a: 1 } }));
    expect(save.status).toBe(400);
    expect((await save.json()).reason).toContain('absolute path');
    const world = await worldSavesPost(jsonPost('/api/agent/world-saves', { action: 'write', path: 'C:/escape.json', file: { world: {} } }));
    expect(world.status).toBe(400);
    expect((await world.json()).reason).toContain('absolute path');
  });

  it('a failed MACHINE is a 503 on the container door — the shipped lane over a docker that cannot start', async () => {
    agentMode = 'machine';
    const res = await containerPost(jsonPost('/api/agent/container', { argv: ['node', '--version'] }));
    expect(res.status).toBe(503);
    const body = await res.json();
    // v524: the door ANSWERED — ok is true, no container ran, and the machine named itself. Before the
    // repair this same machine answered 200 with “container … → exit null”, and the stub below stood in
    // for a shape the lane never emits.
    expect(body.ok).toBe(true);
    expect(body.ran).toBe(false);
    expect(body.failure).toBe('the-machine');
    expect(body.detail).toContain('never started');
    expect(body.detail).toContain('spawn docker ENOENT');
  });

  it('a POLICY refusal is the door answering — 200, ran:false, the lane’s own sentence (v524)', async () => {
    // The other half of the same rule, pinned beside it: an argv the allowlist never named is the
    // caller’s to see, the lane answers in its own words, and no number is charged for it. The refusal
    // happens before the docker client is summoned, so this grades on a machine with or without docker.
    agentMode = 'ok';
    const res = await containerPost(jsonPost('/api/agent/container', { argv: ['ls', '-la'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ran).toBe(false);
    expect(body.failure).toBeUndefined();
    expect(body.detail).toContain('no allowlist rule matches');
  });

  it('a failed MACHINE is a 503 on the build-arc door', async () => {
    agentMode = 'machine';
    const res = await buildArcPost(jsonPost('/api/agent/build-arc', { goal: 'verify the runtime' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.failure).toBe('the-machine');
    expect(body.reason).toContain('the container host refused the walk');
  });

  it('a failed MACHINE is a 503 on the deploy door — even though the arc answered ok: true', async () => {
    // The deploy arc’s honest answer when the records sink refused is ok:true with the verdict
    // “failed” and the machine’s own words. A 200 for that reads as a deploy that was attempted.
    agentMode = 'machine';
    const res = await deployPost(jsonPost('/api/agent/deploy', { goal: 'verify the runtime' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('failed');
    expect(body.failure).toBe('the-machine');
    expect(body.reason).toContain('the record did not land');
  });

  it('a failed MACHINE is a 503 on the save-fs door — the same disk, the same number the scene lane earns', async () => {
    agentMode = 'machine';
    const res = await saveFsPost(jsonPost('/api/agent/save-fs', { action: 'write', path: 'last-saved', file: { a: 1 } }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.failure).toBe('the-machine');
    expect(body.reason).toContain('EISDIR');
  });

  it('a failed MACHINE is a 503 on the world-saves door', async () => {
    agentMode = 'machine';
    const res = await worldSavesPost(jsonPost('/api/agent/world-saves', { action: 'write', path: 'world-saved', file: { world: {} } }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.failure).toBe('the-machine');
    expect(body.reason).toContain('ENOSPC');
  });

  it('a lib that THROWS is the machine failing — 503 with the machine’s own words, on every arc door', async () => {
    // The house’s rule since v284: a lib answers a failed ask with a reason, never a thrown error. A
    // lib that throws anyway is news — and the door now says whose it was instead of dying as a bare 500.
    agentMode = 'throw';
    const container = await containerPost(jsonPost('/api/agent/container', { argv: ['node', '--version'] }));
    expect(container.status).toBe(503);
    expect((await container.json()).reason).toBe('the container exec threw instead of answering: spawn docker ENOENT');
    const build = await buildArcPost(jsonPost('/api/agent/build-arc', { goal: 'verify the runtime' }));
    expect(build.status).toBe(503);
    expect((await build.json()).reason).toBe('the build arc threw instead of answering: the build engine could not be summoned');
    const deploy = await deployPost(jsonPost('/api/agent/deploy', { goal: 'verify the runtime' }));
    expect(deploy.status).toBe(503);
    expect((await deploy.json()).reason).toBe('the deploy arc threw instead of answering: the records file could not be opened');
  });
});
