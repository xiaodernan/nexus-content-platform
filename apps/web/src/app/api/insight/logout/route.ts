import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
  const store = await cookies();
  store.set('nexus-insight', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return NextResponse.json({ ok: true });
}
