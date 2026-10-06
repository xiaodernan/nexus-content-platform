import { NextResponse } from 'next/server';

import { buildArcState, runStudioBuildArc } from '@/lib/buildServer';

/**
 * M6 v175 (ADR 0016 amendment 175): the dock's build face — the route that PLANS and walks
 * the build arc through the container wall. Node runtime on purpose: the arc's planner and
 * verifier live server-side (the ONE spawn-capable package and the runtime stay here); the
 * POST body may name a GOAL — never a step, never an argv. The planner invents nothing: it
 * selects among the server-pinned catalog, and the walk is still §28-gated per step.
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
  const answer = await runStudioBuildArc({ goal });
  return NextResponse.json(answer, { status: answer.ok ? 200 : 400 });
}
