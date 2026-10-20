import { NextResponse } from 'next/server';

/**
 * M8 v274 (ADR 0016 amendment 274): `/api/economy` — this Studio's door onto the
 * creator-economy service (which does not exist yet; ADR 0018 blocks accounts/
 * sessions/tokens, so there is no server to call).
 *
 * The route is `force-dynamic` and answers with a REASON, not an error, so the
 * panel can say "the economy door is not built" honestly rather than throwing.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, reason: 'the economy door is not built: server endpoints require ADR 0018 (accounts, sessions, tokens)' },
    { status: 503 },
  );
}