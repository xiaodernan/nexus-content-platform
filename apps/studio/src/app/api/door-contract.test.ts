import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET as auditGet } from './audit/route';
import { GET as buildArcGet, POST as buildArcPost } from './agent/build-arc/route';
import { DELETE as commentTakeBack } from './comments/[commentId]/route';
import { GET as commentsGet, POST as commentsPost } from './comments/route';
import { POST as containerPost } from './agent/container/route';
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
 */

let mode: 'ok' | 'refuse' = 'ok';

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
  // The service never trims — zero `.trim()` in all of services/ — so a door that forwarded
  // “ acct-ada ” would ask about an account that does not exist and answer with an empty list that
  // reads as “this account has nothing”. v499 recorded four doors doing exactly that; v508 asks every
  // door about the name the caller MEANT, and this is the question that keeps it that way.
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
