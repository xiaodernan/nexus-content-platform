import { NextResponse } from 'next/server';

import { offerOnService, retirePlan } from '@/lib/planServer';

/**
 * M7 v301 (ADR 0016 amendment 301): `/api/plans` — this Studio's door onto the service's plans.
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
  const { planId, priceCents, currency, period, claim } = body as {
    planId?: unknown;
    priceCents?: unknown;
    currency?: unknown;
    period?: unknown;
    claim?: unknown;
  };
  if (typeof planId !== 'string' || planId.length === 0) {
    return NextResponse.json({ ok: false, reason: 'the planId is missing' }, { status: 400 });
  }
  if (typeof priceCents !== 'number' || !Number.isFinite(priceCents)) {
    return NextResponse.json({ ok: false, reason: 'the priceCents is missing' }, { status: 400 });
  }
  if (typeof claim !== 'object' || claim === null) {
    return NextResponse.json({ ok: false, reason: 'a plan needs an account to offer it' }, { status: 400 });
  }
  const c = claim as { accountId?: unknown; handle?: unknown; assurance?: unknown; claimedAt?: unknown };
  if (typeof c.accountId !== 'string' || c.accountId.length === 0) {
    return NextResponse.json({ ok: false, reason: 'a plan needs an account to offer it' }, { status: 400 });
  }
  const answer = await offerOnService(
    planId,
    Math.floor(priceCents),
    typeof currency === 'string' ? currency : 'CNY',
    typeof period === 'string' ? period : 'month',
    {
      accountId: c.accountId,
      handle: typeof c.handle === 'string' ? c.handle : null,
      assurance: typeof c.assurance === 'string' ? c.assurance : null,
      claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
    },
  );
  return NextResponse.json(answer, { status: answer.ok ? 201 : 503 });

}

/**
 * RETIRE a plan — the creator’s own.
 *
 * <p>The plan id and the claimer travel in the query, the same way the studio’s other doors take a claim
 * (there is no session in this build — ADR 0018), and the service’s own words are passed through: a refusal
 * that loses its reason is a refusal that has to be run again to learn anything.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const planId = url.searchParams.get('planId');
  const claimer = url.searchParams.get('claimer');
  if (!planId || planId.trim() === '') {
    return NextResponse.json({ ok: false, reason: 'the planId is missing' }, { status: 400 });
  }
  if (!claimer || claimer.trim() === '') {
    return NextResponse.json(
      { ok: false, reason: 'retiring a plan needs the account that offers it' },
      { status: 400 },
    );
  }
  const answer = await retirePlan(planId.trim(), { accountId: claimer.trim() });
  return NextResponse.json(answer, { status: answer.ok ? 200 : 502 });
}
