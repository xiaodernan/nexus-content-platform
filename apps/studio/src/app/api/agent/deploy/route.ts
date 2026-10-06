import { NextResponse } from 'next/server';

import { deployArcState, runStudioDeployArc } from '@/lib/deployServer';

/**
 * M6 v177 (ADR 0016 amendment 177): the dock's deploy face — the route that walks a green
 * build arc's measured facts through the ONE deploy.record door into THIS server's records
 * file. Node runtime on purpose: the runtime, the container verifier and the node:fs sink
 * all live server-side; the POST body may name a GOAL — never a step, never an argv, never
 * a fact. Deploy means what am. 176 says: the engine's own words become a durable record,
 * one §28 gate per fact. It is NOT a push or a publish.
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
  const answer = await runStudioDeployArc({ goal });
  return NextResponse.json(answer, { status: answer.ok ? 200 : 400 });
}
