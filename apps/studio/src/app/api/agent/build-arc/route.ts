import { NextResponse } from 'next/server';

import { buildArcState, runStudioBuildArc } from '@/lib/buildServer';

/**
 * M6 v174 (ADR 0016 amendment 174): the dock's build face — the route that walks the ONE
 * pinned build arc through the container wall. Node runtime on purpose: the arc's verifier
 * is the exec-host container runner (the ONE spawn-capable package), server-side only; the
 * POST takes NO body — the arc is pinned data, so the browser cannot name a single argv.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await buildArcState());
}

export async function POST(): Promise<NextResponse> {
  const answer = await runStudioBuildArc();
  return NextResponse.json(answer, { status: answer.ok ? 200 : 400 });
}
