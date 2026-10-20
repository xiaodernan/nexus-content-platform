import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readEconomy } from './economyLane';

function makeFetch(handler: (url: string) => Response) {
  return vi.fn(async (url: string) => handler(url)) as unknown as typeof fetch;
}

describe('economyLane — readEconomy (M8 v274)', () => {
  it('asks the Studio\'s own door', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/economy');
      return new Response(JSON.stringify({ ok: true, subscriptions: [], tips: [] }), { status: 200 });
    });
    const answer = await readEconomy(fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.subscriptions).toEqual([]);
    expect(answer.tips).toEqual([]);
  });

  it('a 503 carries the service\'s reason, not a status code', async () => {
    const answer = await readEconomy(
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'server not built' }), { status: 503 })),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('server not built');
  });

  it('a 503 with no body still says what it was', async () => {
    const answer = await readEconomy(makeFetch(() => new Response('', { status: 503 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the economy answered HTTP 503');
  });

  it('something that is not JSON is a reason', async () => {
    const answer = await readEconomy(makeFetch(() => new Response('<html>no</html>', { status: 200 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the economy answered something that is not JSON');
  });

  it('a body with no arrays is a reason', async () => {
    const answer = await readEconomy(makeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the economy answered with no subscriptions or tips');
  });

  it('a thrown fetch answers with the error\'s message', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    const answer = await readEconomy(fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
  });

  it('maps valid subscription and tip arrays into rows', async () => {
    const body = {
      ok: true,
      subscriptions: [{ creatorId: 'acct-ada', planId: 'pro', priceCents: 1500, currency: 'CNY', active: true, subscribedAt: 1, expiresAt: null }],
      tips: [{ recipientId: 'acct-ada', amountCents: 500, message: 'thanks', anonymous: false }],
    };
    const answer = await readEconomy(makeFetch(() => new Response(JSON.stringify(body), { status: 200 })));
    expect(answer.ok).toBe(true);
    const subs = answer.subscriptions ?? [];
    const tips = answer.tips ?? [];
    expect(subs).toHaveLength(1);
    expect(subs[0]!.planId).toBe('pro');
    expect(tips).toHaveLength(1);
    expect(tips[0]!.amountText).toBe('¥5.00');
  });

  it('drops malformed rows and keeps valid ones', async () => {
    const body = {
      ok: true,
      subscriptions: [{ creatorId: 'acct-ada', planId: 'good', priceCents: 1000, currency: 'CNY', active: true, subscribedAt: 1, expiresAt: null }, { planId: '' }],
      tips: [{ recipientId: 'acct-ada', amountCents: 500, message: '', anonymous: false }, { recipientId: '' }],
    };
    const answer = await readEconomy(makeFetch(() => new Response(JSON.stringify(body), { status: 200 })));
    expect(answer.ok).toBe(true);
    const subs = answer.subscriptions ?? [];
    const tips = answer.tips ?? [];
    expect(subs).toHaveLength(1);
    expect(tips).toHaveLength(1);
  });
});