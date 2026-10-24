import { NextResponse } from 'next/server';

import { deployArcState, runStudioDeployArc } from '@/lib/deployServer';
import { askDoorStatus, askOrMachineFailure } from '@/lib/doorFailure';

/**
 * M6 v177 (ADR 0016 amendment 177): the dock's deploy face — the route that walks a green
 * build arc's measured facts through the ONE deploy.record door into THIS server's records
 * file. Node runtime on purpose: the runtime, the container verifier and the node:fs sink
 * all live server-side; the POST body may name a GOAL — never a step, never an argv, never
 * a fact. Deploy means what am. 176 says: the engine's own words become a durable record,
 * one §28 gate per fact. It is NOT a push or a publish.
 *
 * v509 (ADR 0016 amendment 502): the status this door answers is READ off the answer’s failure kind
 * (doorFailure.ts), never picked here — a refused ask is a 400, a machine that failed is a 503, an
 * answered door is a 200 — and a lib that throws is answered with the machine’s own words instead of
 * taking the route down as a bare 500 with no sentence.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await deployArcState());
}

export async function POST(request: Request): Promise<NextResponse> {
  let goal: string | undefined;
  try {
    const body: unknown = await request.json();
    if (typeof body === 'object' && body !== null && 'goal' in body) {
      const g = (body as { goal?: unknown }).goal;
      if (g !== undefined && typeof g !== 'string') {
        return NextResponse.json({ ok: false, reason: 'goal must be a string (a goal, never argv)' }, { status: 400 });
      }
      goal = g;
    }
  } catch {
    // an empty body is FINE: the face deploys its default goal's arc
  }
  // v509: the status is derived, not picked — and a lib that THROWS is the machine failing, answered
  // with the machine’s own words rather than a bare 500.
  const answer = await askOrMachineFailure('the deploy arc', () => runStudioDeployArc({ goal }));
  return NextResponse.json(answer, { status: askDoorStatus(answer) });
}
