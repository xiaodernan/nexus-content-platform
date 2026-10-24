import { NextResponse } from 'next/server';

import { askDoorStatus } from '@/lib/doorFailure';
import { readWorldSave, worldSaveState, writeWorldSave } from '@/lib/worldSaveServer';

/**
 * M4 v191 (ADR 0016 amendment 191): the world panel's disk-persistence face — the route where a
 * browser world save crosses into a REAL file on THIS server's disk. Node runtime on purpose: the
 * fs-backed SaveStore and node:fs live server-side. The POST body names an ACTION (`write` or
 * `read`) and a save PATH plus, for a write, the save FILE the engine's own `save()` produced —
 * every naming rule inside a path is the runtime store's, not this route's; the route only
 * dispatches. A refused name, a missing file and bytes that are not a world save are all HONEST
 * answers (`ok: false` + the store's own sentence), never errors thrown at the client.
 *
 * v509 (ADR 0016 amendment 502): that totality is exactly why this route needs no catch of its own —
 * every failure arrives as an ANSWER carrying its kind (doorFailure.ts), and the status is read off the
 * kind: a refused name or a file that is not a world save is the ask (400), a device error is the machine (503).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(worldSaveState());
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'the body is not JSON; this route answers { action: "write" | "read", ... }' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ ok: false, reason: 'the body is not an object; this route answers { action: "write" | "read", ... }' }, { status: 400 });
  }
  const action = (body as { action?: unknown }).action;
  if (action === 'write') {
    const { path, file } = body as { path?: unknown; file?: unknown };
    const answer = writeWorldSave({ path, file });
    return NextResponse.json(answer, { status: askDoorStatus(answer) });
  }
  if (action === 'read') {
    const { path } = body as { path?: unknown };
    const answer = readWorldSave({ path });
    return NextResponse.json(answer, { status: askDoorStatus(answer) });
  }
  return NextResponse.json(
    { ok: false, reason: `action is ${typeof action === 'string' ? `"${action}"` : String(action)}; this route speaks "write" and "read" only` },
    { status: 400 },
  );
}
