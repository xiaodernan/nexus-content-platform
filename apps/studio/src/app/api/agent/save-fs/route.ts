import { NextResponse } from 'next/server';

import { readStudioSceneSave, saveFsState, writeStudioSceneSave } from '@/lib/saveFsServer';

/**
 * M5 v184 (ADR 0016 amendment 184): the 3D panel's disk-save face — the route where a browser save
 * crosses into a REAL file on THIS server's disk. Node runtime on purpose: the runtime's fs-backed
 * SaveStore and node:fs live server-side. The POST body names an ACTION (`write` or `read`) and a
 * save PATH plus, for a write, the save FILE — every naming rule inside the path is the runtime
 * store's, not this route's; the route only dispatches. A refused name, a missing file and bytes
 * that are not a save file are all HONEST answers (`ok: false` + the store's own sentence), never
 * errors thrown at the client.
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
    return NextResponse.json({ ok: false, reason: 'the body is not JSON; this route answers { action: "write" | "read", ... }' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ ok: false, reason: 'the body is not an object; this route answers { action: "write" | "read", ... }' }, { status: 400 });
  }
  const action = (body as { action?: unknown }).action;
  if (action === 'write') {
    const { path, file } = body as { path?: unknown; file?: unknown };
    const answer = writeStudioSceneSave({ path, file });
    return NextResponse.json(answer, { status: answer.ok ? 200 : 400 });
  }
  if (action === 'read') {
    const { path } = body as { path?: unknown };
    const answer = readStudioSceneSave({ path });
    return NextResponse.json(answer, { status: answer.ok ? 200 : 400 });
  }
  return NextResponse.json(
    { ok: false, reason: `action is ${typeof action === 'string' ? `"${action}"` : String(action)}; this route speaks "write" and "read" only` },
    { status: 400 },
  );
}
