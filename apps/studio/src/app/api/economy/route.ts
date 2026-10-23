import { NextResponse } from 'next/server';

import { readPlans, readReceivedSubscriptions, readSubscriptions } from '@/lib/economyServer';

/**
 * M7 v309 (ADR 0016 amendment 309): `/api/economy` — this Studio's door onto the creator economy.
 *
 * <p>v274 left this door as a PLACEHOLDER that answered "not built" (ADR 0018 blocked server endpoints),
 * and v301 built the service's plans and subscriptions — so the panel had been saying a true thing about
 * a feature that had since been built, which is the way a panel goes stale without anybody noticing.
 *
 * <p>The route is `force-dynamic`: the answer is a database read, and caching it would be storing a
 * system of record's contents in a place the next write cannot invalidate.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * READ the economy of one account: the subscriptions it holds and the plans it offers.
 *
 * <p>The account is named in the query. This build has no session (ADR 0018), so the account the device
 * holds is the claim the service compares — the same claim the take-down and the withdrawal name.
 *
 * <p>A failed read is NOT an empty economy: the panel says why it could not read, rather than showing
 * "no subscriptions" and being wrong.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const account = new URL(request.url).searchParams.get('account');
  if (!account || account.trim() === '') {
    return NextResponse.json(
      { ok: false, reason: 'the economy belongs to an account, and this request names none' },
      { status: 400 },
    );
  }
  const asked = Number(new URL(request.url).searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(asked) && asked > 0 ? Math.trunc(asked) : 20;
  // v392 — and the PAGES the three lists are read at, in rows. A negative or unparseable one is the
  // first window: the newest rows are the honest answer to a question about a page before the first.
  const askedSubs = Number(new URL(request.url).searchParams.get('offset') ?? '0');
  const askedReceived = Number(new URL(request.url).searchParams.get('receivedOffset') ?? '0');
  const askedPlans = Number(new URL(request.url).searchParams.get('plansOffset') ?? '0');
  const subsOffset = Number.isFinite(askedSubs) && askedSubs > 0 ? Math.trunc(askedSubs) : 0;
  const receivedOffset = Number.isFinite(askedReceived) && askedReceived > 0 ? Math.trunc(askedReceived) : 0;
  const plansOffset = Number.isFinite(askedPlans) && askedPlans > 0 ? Math.trunc(askedPlans) : 0;
  const [subscriptions, received, plans] = await Promise.all([
    readSubscriptions(account.trim(), limit, subsOffset),
    // v310 — the creator's other side: who backs me.
    readReceivedSubscriptions(account.trim(), limit, receivedOffset),
    readPlans(account.trim(), limit, plansOffset),
  ]);
  // The economy is only READABLE when both halves are: a panel that showed the plans and hid the
  // subscriptions would be showing half an account.
  if (!subscriptions.ok) {
    return NextResponse.json({ ok: false, reason: subscriptions.reason }, { status: 502 });
  }
  if (!received.ok) {
    return NextResponse.json({ ok: false, reason: received.reason }, { status: 502 });
  }
  if (!plans.ok) {
    return NextResponse.json({ ok: false, reason: plans.reason }, { status: 502 });
  }
  return NextResponse.json(
    {
      ok: true,
      subscriptions: subscriptions.subscriptions,
      // v368 — the totals, PER PERIOD: a monthly pledge and a yearly one do not add up to
      // anything a reader can act on.
      totalsByPeriod: subscriptions.totalsByPeriod ?? [],
      subscriptionCount: subscriptions.count,
      // v310 — the creator's other side.
      received: received.subscriptions,
      receivedTotalsByPeriod: received.totalsByPeriod ?? [],
      receivedCount: received.count,
      plans: plans.plans,
      planCount: plans.count,
      // v392 — and the windows these rows are FOR: the cap that was applied and the row each list
      // starts at, so the panel can say which rows it is showing and page from there.
      limit: subscriptions.limit,
      subscriptionOffset: subscriptions.offset,
      receivedOffset: received.offset,
      planOffset: plans.offset,
    },
    { status: 200 },
  );
}
