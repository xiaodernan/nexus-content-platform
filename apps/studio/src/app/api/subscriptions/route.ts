import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';
import { doorName } from '@/lib/doorName';

import { cancelSubscription, subscribeOnService } from '@/lib/planServer';

/**
 * M7 v301 (ADR 0016 amendment 301): `/api/subscriptions` — this Studio's door onto the service's
 * subscriptions.
 *
 * The service's address is server-side (the same hop `/api/publish` and `/api/likes` perform), so the
 * browser never learns where `services/nexus-api` lives.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'the body is not JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ ok: false, reason: 'the body is not an object' }, { status: 400 });
  }
  const { planId: planIdRaw, claim } = body as { planId?: unknown; claim?: unknown };
  // v521 — the ending half of this door reads both of its names through the blank rule; the subscribing
  // half asked the same two names of the body with a LENGTH check. One door, one rule, both halves.
  const planId = doorName(planIdRaw);
  if (planId === '') {
    return NextResponse.json({ ok: false, reason: 'the planId is missing' }, { status: 400 });
  }
  if (typeof claim !== 'object' || claim === null) {
    return NextResponse.json({ ok: false, reason: 'a subscription needs an account to hold it' }, { status: 400 });
  }
  const c = claim as { accountId?: unknown; handle?: unknown; assurance?: unknown; claimedAt?: unknown };
  // v521 — v511 read doorName’s rule as “a name only has to be a string”. The rule says the opposite: a name
  // blank after trimming is not a name. The service refused such a claim BY NAME, the refusal carried no
  // failure kind, and the door answered 502 for a subscriber whose device sent an empty account.
  const subscriber = doorName(c.accountId);
  if (subscriber === '') {
    return NextResponse.json(
      { ok: false, reason: 'a subscription needs an account to hold it' },
      { status: 400 },
    );
  }
  const answer = await subscribeOnService(planId, {
    accountId: subscriber,
    handle: typeof c.handle === 'string' ? c.handle : null,
    assurance: typeof c.assurance === 'string' ? c.assurance : null,
    claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
  });
  return NextResponse.json(answer, { status: answer.ok ? 201 : serviceFailureStatus(answer.failure) });
}

/**
 * END a subscription — the holder’s own.
 *
 * <p>The subscription id and the claimer travel in the query, the same way the studio’s other doors take a
 * claim (there is no session in this build — ADR 0018), and the service’s own words are passed through.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const subscriptionId = url.searchParams.get('subscriptionId');
  const claimer = url.searchParams.get('claimer');
  if (!subscriptionId || subscriptionId.trim() === '') {
    return NextResponse.json({ ok: false, reason: 'the subscriptionId is missing' }, { status: 400 });
  }
  if (!claimer || claimer.trim() === '') {
    return NextResponse.json(
      { ok: false, reason: 'ending a subscription needs the account that holds it' },
      { status: 400 },
    );
  }
  const answer = await cancelSubscription(subscriptionId.trim(), { accountId: claimer.trim() });
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
}
