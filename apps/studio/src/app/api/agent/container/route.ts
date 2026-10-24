import { NextResponse } from 'next/server';

import { containerLaneState, runContainerExec } from '@/lib/containerServer';
import { askDoorStatus, askOrMachineFailure } from '@/lib/doorFailure';

/**
 * M2 v172 (ADR 0016 amendment 172): the dock's container lane — the ONLY place the Studio
 * talks to docker. Node runtime on purpose: @nexus/exec-host (the ONE spawn-capable package)
 * runs here, server-side; the browser bundle imports nothing from it.
 *
 * v509 (ADR 0016 amendment 502): the status this door answers is READ off the answer’s failure kind
 * (doorFailure.ts), never picked here — a refused ask is a 400, a machine that failed is a 503, an
 * answered door is a 200 — and a lib that throws is answered with the machine’s own words instead of
 * taking the route down as a bare 500 with no sentence.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await containerLaneState());
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'body must be JSON' }, { status: 400 });
  }
  // v509: the status is derived, not picked — and a lib that THROWS is the machine failing, answered
  // with the machine’s own words rather than a bare 500.
  const answer = await askOrMachineFailure('the container exec', () => runContainerExec(body));
  return NextResponse.json(answer, { status: askDoorStatus(answer) });
}