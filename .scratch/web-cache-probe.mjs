const BASE = 'http://127.0.0.1:3400';
const cookieStore = new Map();
function remember(res, label) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    cookieStore.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function cookie() {
  return [...cookieStore].map(([k, v]) => `${k}=${v}`).join('; ');
}
function csrf() {
  return cookieStore.get('nexus_csrf');
}
async function post(path, body) {
  const headers = { 'content-type': 'application/json', cookie: cookie() };
  const t = csrf();
  if (t) headers['x-csrf-token'] = t;
  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { res, text };
}
const EMAIL = `live-cache-${Date.now()}@example.test`;
const PW = 'smoke-password-2026-11-13';

{ const r = await fetch(BASE + '/'); const t = await r.text(); remember(r, 'root'); }
console.error('[root] csrf =', csrf() ? 'present' : 'missing');

{ const { res, text } = await post('/api/auth/register', { email: EMAIL, password: PW, displayName: 'Cache Probe' });
  console.error('[register] HTTP', res.status, text.slice(0, 120));
  remember(res, 'register'); }

const { res: pres, text: ptext } = await post('/api/projects', { name: 'cache-probe ' + Date.now(), kind: 'website' });
console.error('[project] HTTP', pres.status, ptext.slice(0, 120));
remember(pres, 'project');
const pj = JSON.parse(ptext);
const projectId = pj.id ?? pj.projectId;
if (!projectId) throw new Error('project id missing: ' + ptext.slice(0, 200));

async function run(label) {
  const t0 = Date.now();
  const { res, text } = await post('/api/ai/run', {
    requestId: `probe-${Date.now()}-${label}`,
    intent: 'freeform',
    prompt: '用一句话说明：NEXUS Studio 的设计模型是什么。',
    modelClass: 'balanced',
    context: { projectId },
  });
  const ms = Date.now() - t0;
  const body = JSON.parse(text);
  console.log(`[${label}] HTTP ${res.status} (${ms}ms) capability=${body.capability} tokensIn=${body.usage?.tokensIn} cachedTokens=${body.usage?.cachedTokens} explanation=${String(body.explanation).slice(0, 30)}`);
}
await run('cold');
await run('warm #1');
await run('warm #2');
