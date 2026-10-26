import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';
import { doorName } from '@/lib/doorName';

import { readFiledReports, reportOnService, withdrawReport } from '@/lib/reportServer';

/**
 * M7 v296 (ADR 0016 amendment 296): `/api/reports` — this Studio's door onto the service's reports.
 *
 * The service's address is server-side (the same hop `/api/publish` and `/api/likes` perform), so the
 * browser never learns where `services/nexus-api` lives.
 *
 * The route is `force-dynamic`: the answer is a database read, and caching it would be storing a system of
 * record's contents in a place the next write cannot invalidate.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * READ the reports this account filed — the reporter's own view of their complaints.
 *
 * <p>The account is named in the query: this build has no session (ADR 0018), so the account the device
 * holds is the claim the service compares — the same claim the take-down and the withdrawal name.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const reporter = new URL(request.url).searchParams.get('reporter');
  if (!reporter || reporter.trim() === '') {
    return NextResponse.json(
      { ok: false, reason: 'the reports an account filed need that account to be named' },
      { status: 400 },
    );
  }
  const asked = Number(new URL(request.url).searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(asked) && asked > 0 ? Math.trunc(asked) : 20;
  // v382 — the offset pages past the newest rows. A negative or nonsense one is clamped to the first
  // page rather than refused: the window it names does not exist, and the newest rows are the honest
  // answer to a question about a page before the first.
  const from = Number(new URL(request.url).searchParams.get('offset') ?? '0');
  const offset = Number.isFinite(from) ? Math.max(Math.trunc(from), 0) : 0;
  const answer = await readFiledReports(reporter.trim(), offset, limit);
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
}

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
  const { projectId: projectIdRaw, reason: reasonRaw, detail, claim } = body as {
    projectId?: unknown;
    reason?: unknown;
    detail?: unknown;
    claim?: unknown;
  };
  // v521 — the publication reported on is a NAME, so it is asked about through the rule the query names
  // already kept. The REASON is not a name but it is a closed set, and the service reads it with
  // isBlank(): a reason of only space is no reason, and this door says so with its own sentence.
  const projectId = doorName(projectIdRaw);
  if (projectId === '') {
    return NextResponse.json({ ok: false, reason: 'the projectId is missing' }, { status: 400 });
  }
  if (typeof reasonRaw !== 'string' || reasonRaw.trim().length === 0) {
    return NextResponse.json(
      { ok: false, reason: 'a report needs a reason: one of spam, harassment, illegal, other' },
      { status: 400 },
    );
  }
  if (typeof claim !== 'object' || claim === null) {
    // The service refuses an authorless report BY NAME, and this route does not invent an author.
    return NextResponse.json(
      { ok: false, reason: 'a report needs an account: a report with no reporter cannot be followed up' },
      { status: 400 },
    );
  }
  const c = claim as { accountId?: unknown; handle?: unknown; assurance?: unknown; claimedAt?: unknown };
  // v521 — v511 read this check as doorName's rule saying a name needs only to be a string. The rule says
  // the opposite: a name blank after trimming is not a name. The service refuses such a claim BY NAME, its
  // refusal carries no failure kind, and the door answered 502 for a reporter nobody can follow up.
  const accountId = doorName(c.accountId);
  if (accountId === '') {
    return NextResponse.json(
      { ok: false, reason: 'a report needs an account: a report with no reporter cannot be followed up' },
      { status: 400 },
    );
  }
  const answer = await reportOnService(
    projectId,
    // The REASON is a closed-set value, not a name: it is blank-checked on trimmed bytes and forwarded as
    // sent, so the set the service matches against still sees the caller’s own spelling.
    reasonRaw,
    // DETAIL is DATA: the caller’s own bytes, forwarded as sent.
    typeof detail === 'string' ? detail : '',
    {
      accountId,
      handle: typeof c.handle === 'string' ? c.handle : null,
      assurance: typeof c.assurance === 'string' ? c.assurance : null,
      claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
    },
  );
  return NextResponse.json(answer, { status: answer.ok ? 201 : serviceFailureStatus(answer.failure) });
}

/**
 * WITHDRAW a report — the reporter's own, and only theirs.
 *
 * <p>The service answers 403 for somebody else's report, and this route passes the refusal's own words
 * through: a panel that turned it into a generic error would be hiding the rule that was broken.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const reportId = url.searchParams.get('reportId');
  const claimer = url.searchParams.get('claimer');
  if (!reportId || reportId.trim() === '') {
    return NextResponse.json({ ok: false, reason: 'the report needs an id to be withdrawn' }, { status: 400 });
  }
  if (!claimer || claimer.trim() === '') {
    return NextResponse.json(
      { ok: false, reason: 'a withdrawal needs an account: a report can only be withdrawn by the account that filed it' },
      { status: 400 },
    );
  }
  const answer = await withdrawReport(reportId.trim(), claimer.trim());
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
}
