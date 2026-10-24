import { NextResponse } from 'next/server';

import { buildArcState, runStudioBuildArc } from '@/lib/buildServer';
import { askDoorStatus, askOrMachineFailure } from '@/lib/doorFailure';

/**
 * M6 v175 (ADR 0016 amendment 175): the dock's build face — the route that PLANS and walks
 * the build arc through the container wall. Node runtime on purpose: the arc's planner and
 * verifier live server-side (the ONE spawn-capable package and the runtime stay here); the
 * POST body may name a GOAL — never a step, never an argv. The planner invents nothing: it
 * selects among the server-pinned catalog, and the walk is still §28-gated per step.
 *
 * v509 (ADR 0016 amendment 502): the status this door answers is READ off the answer’s failure kind
 * (doorFailure.ts), never picked here — a refused ask is a 400, a machine that failed is a 503, an
 * answered door is a 200 — and a lib that throws is answered with the machine’s own words instead of
 * taking the route down as a bare 500 with no sentence.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await buildArcState());
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
    // an empty body is FINE: the face plans for its own default goal
  }
  // v509: the status is derived, not picked — and a lib that THROWS is the machine failing, answered
  // with the machine’s own words rather than a bare 500.
  const answer = await askOrMachineFailure('the build arc', () => runStudioBuildArc({ goal }));
  return NextResponse.json(answer, { status: askDoorStatus(answer) });
}
