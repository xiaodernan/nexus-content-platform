const BASE = 'http://localhost:3100';
const jar = new Map<string, string>();
const cookieLine = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
const mergeSetCookies = (res: Response) => {
  const set = (res.headers as any).getSetCookie // Node 18.14+ / undici
    ? (res.headers as any).getSetCookie()
    : [res.headers.get('set-cookie') ?? ''].filter(Boolean);
  for (const sc of set) {
    const [pair] = sc.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
};
const probe = async (method: string, path: string, body?: unknown) => {
  const headers: Record<string, string> = { cookie: cookieLine() };
  const csrf = jar.get('nexus_csrf');
  if (csrf) headers['x-csrf-token'] = csrf;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  mergeSetCookies(res);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text) } catch { /* html */ }
  return { status: res.status, json, text };
};
const home = await probe('GET', '/');
console.log('GET /', home.status, 'csrf?', jar.has('nexus_csrf'));
const email = `probe-${Date.now().toString(36)}@example.com`;
const reg = await probe('POST', '/api/auth/register', { email, password: 'Probe-4242', displayName: 'probe' });
console.log('register:', reg.status);
const q = await probe('POST', '/api/bible/q', { question: '第四十一次大会之后，盐灯守灵日记记了什么？', locale: 'zh' });
console.log('q status:', q.status);
console.log('q body:', JSON.stringify(q.json).slice(0, 400));
