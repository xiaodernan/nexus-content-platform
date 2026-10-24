import { NextResponse } from 'next/server';

import { askDoorStatus } from '@/lib/doorFailure';
import { deleteStudioSceneSave, readStudioSceneSave, renameStudioSceneSave, saveFsState, writeStudioSceneSave } from '@/lib/saveFsServer';

/**
 * M5 v184 (ADR 0016 amendment 184): the 3D panel's disk-save face — the route where a browser save
 * crosses into a REAL file on THIS server's disk. Node runtime on purpose: the runtime's fs-backed
 * SaveStore and node:fs live server-side. The POST body names an ACTION (`write`, `read`, or —
 * v186 — `delete` or `rename`) and a save PATH plus, for a write, the save FILE and, for a rename,
 * the new name — every naming rule inside a path is the runtime store's, not this route's; the
 * route only dispatches. A refused name, a missing file and bytes that are not a save file are all
 * HONEST answers (`ok: false` + the store's own sentence), never errors thrown at the client.
 *
 * v509 (ADR 0016 amendment 502): that totality is exactly why this route needs no catch of its own —
 * every failure arrives as an ANSWER carrying its kind (doorFailure.ts), and the status is read off the
 * kind: a refused name or a file that is not a save is the ask (400), a device error is the machine (503).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(saveFsState());
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'the body is not JSON; this route answers { action: "write" | "read" | "delete" | "rename", ... }' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ ok: false, reason: 'the body is not an object; this route answers { action: "write" | "read" | "delete" | "rename", ... }' }, { status: 400 });
  }
  const action = (body as { action?: unknown }).action;
  if (action === 'write') {
    const { path, file } = body as { path?: unknown; file?: unknown };
    const answer = writeStudioSceneSave({ path, file });
    return NextResponse.json(answer, { status: askDoorStatus(answer) });
  }
  if (action === 'read') {
    const { path } = body as { path?: unknown };
    const answer = readStudioSceneSave({ path });
    return NextResponse.json(answer, { status: askDoorStatus(answer) });
  }
  if (action === 'delete') {
    const { path } = body as { path?: unknown };
    const answer = deleteStudioSceneSave({ path });
    return NextResponse.json(answer, { status: askDoorStatus(answer) });
  }
  if (action === 'rename') {
    const { from, to } = body as { from?: unknown; to?: unknown };
    const answer = renameStudioSceneSave({ from, to });
    return NextResponse.json(answer, { status: askDoorStatus(answer) });
  }
  return NextResponse.json(
    { ok: false, reason: `action is ${typeof action === 'string' ? `"${action}"` : String(action)}; this route speaks "write", "read", "delete" and "rename" only` },
    { status: 400 },
  );
}
