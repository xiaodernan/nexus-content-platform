import { NextResponse } from 'next/server';

import { subscribeOnService } from '@/lib/planServer';

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
  const { planId, claim } = body as { planId?: unknown; claim?: unknown };
  if (typeof planId !== 'string' || planId.length === 0) {
    return NextResponse.json({ ok: false, reason: 'the planId is missing' }, { status: 400 });
  }
  if (typeof claim !== 'object' || claim === null) {
    return NextResponse.json({ ok: false, reason: 'a subscription needs an account to hold it' }, { status: 400 });
  }
  const c = claim as { accountId?: unknown; handle?: unknown; assurance?: unknown; claimedAt?: unknown };
  if (typeof c.accountId !== 'string' || c.accountId.length === 0) {
    return NextResponse.json({ ok: false, reason: 'a subscription needs an account to hold it' }, { status: 400 });
  }
  const answer = await subscribeOnService(planId, {
    accountId: c.accountId,
    handle: typeof c.handle === 'string' ? c.handle : null,
    assurance: typeof c.assurance === 'string' ? c.assurance : null,
    claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
  });
  return NextResponse.json(answer, { status: answer.ok ? 201 : 503 });
}
