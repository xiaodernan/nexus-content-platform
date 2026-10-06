import { NextResponse } from 'next/server';

import { containerLaneState, runContainerExec } from '@/lib/containerServer';

/**
 * M2 v172 (ADR 0016 amendment 172): the dock's container lane — the ONLY place the Studio
 * talks to docker. Node runtime on purpose: @nexus/exec-host (the ONE spawn-capable package)
 * runs here, server-side; the browser bundle imports nothing from it.
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
  const answer = await runContainerExec(body);
  return NextResponse.json(answer, { status: answer.ok ? 200 : 400 });
}