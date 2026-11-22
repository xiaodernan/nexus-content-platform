/**
 * §PROOF-CHARACTER-CHAT · 2026-11-18
 * 目的：在真环境里走通「访客注册 → 建项目 → 建角色 →  PATCH 档案 → 角色对话」全链路，
 * 且拿到新透传的 usage.cachedTokens，验证角色聊天图对真模型的调用 + 前缀缓存。
 *
 * 不落任何 key；只走 HTTP。COOKIE 手工持有（cookie jar 最小实现）。
 */
const BASE = process.env.NEXUS_BASE_URL ?? 'http://127.0.0.1:3100';

const jar = new Map<string, string>();
const cookieLine = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
const mergeSetCookies = (res: Response) => {
  const setCookies = typeof (res.headers as any).getSetCookie === 'function' ? (res.headers as any).getSetCookie() : [];
  for (const sc of setCookies ?? []) {
    const [pair] = sc.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
};
const call = async (method: string, path: string, body?: unknown) => {
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
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
};

// 0) 建 cookie / CSRF（guest 也行，但本次走注册→真正项目语料）
const home = await call('GET', '/');
console.log('GET /', home.status, 'csrf?', jar.has('nexus_csrf'));

// 1) 注册
const email = `probe-${Date.now().toString(36)}@example.com`;
const reg = await call('POST', '/api/auth/register', { email, password: 'Probe-4242', displayName: 'probe' });
console.log('register:', reg.status);

// 2) 建项目
const proj = await call('POST', '/api/projects', { name: '灵语 · 端口探针', kind: 'website' });
const projectId = proj.json?.projectId;
console.log('project:', proj.status, projectId);

// 3) 建角色
const chr = await call('POST', `/api/projects/${projectId}/characters`, { name: '阿栀' });
const characterId = chr.json?.character?.id ?? chr.json?.characters?.[0]?.id ?? chr.json?.id;
console.log('character:', chr.status, characterId);

// 4) PATCH 档案：只给足前端 prompt 要的字段，其余走 zod 默认
const profile = {
  name: '阿栀',
  appearance: '深蓝围裙，发间别一枝干透的海草。背影陌生，声音熟。',
  personality: '寡言、认死理、只认海风里的早晚。欠谁的签收单都要查到最后一笔。',
  backstory: '雾港码头陶人，守着一盏不灭的灯十多年。没结过婚，没搬过家。谁家有信没签收，她记得比收件人自己还清楚。',
  goals: ['把潮汐表背完', '守住雾港灯塔常亮'],
  fears: ['被调离码头', '闻错盐'],
  relationships: [{ target: '父亲', kind: 'blood', note: '四十年没有说话，但她替他把每一笔账都对过。' }],
  voice: { register: '低平、短句、偶尔念英文词', pace: '慢', catchphrases: ['记下了', '盐里有数'], notes: '声音不大，凡是她说的话不是大声就是没有下文。' },
  visualIdentity: { palette: ['#0B1D2A', '#D8D2C4'], silhouette: '围裙 + 手井小', motifs: ['海草', '盐粒', '灯'], referenceAssetId: null },
};
const patch = await call('PATCH', `/api/projects/${projectId}/characters/${characterId}`, { profile });
console.log('patch profile:', patch.status);

// 5) 两问：第一次冷，第二次同问 + 第三问换问
const q1 = await call('POST', `/api/projects/${projectId}/characters/${characterId}/chat`, { message: '你还记得我么？我五岁没等到回信。', locale: 'zh' });
console.log('chat#1:', q1.status, 'verified:', q1.json?.verified, 'usage:', JSON.stringify(q1.json?.usage), 'reply:', String(q1.json?.reply ?? q1.text).slice(0, 120));
const q2 = await call('POST', `/api/projects/${projectId}/characters/${characterId}/chat`, { message: '你还记得我么？我五岁没等到回信。', locale: 'zh' });
console.log('chat#2:', q2.status, 'verified:', q2.json?.verified, 'usage:', JSON.stringify(q2.json?.usage), 'reply:', String(q2.json?.reply ?? q2.text).slice(0, 120));
const q3 = await call('POST', `/api/projects/${projectId}/characters/${characterId}/chat`, { message: '雾港最里屋那一盏常亮的灯，是你和谁点的？', locale: 'zh' });
console.log('chat#3:', q3.status, 'verified:', q3.json?.verified, 'usage:', JSON.stringify(q3.json?.usage), 'reply:', String(q3.json?.reply ?? q3.text).slice(0, 120));
const q4 = await call('POST', `/api/projects/${projectId}/characters/${characterId}/chat`, { message: '雾港最里屋那一盏常亮的灯，是你和谁点的？', locale: 'zh' });
console.log('chat#4:', q4.status, 'verified:', q4.json?.verified, 'usage:', JSON.stringify(q4.json?.usage), 'reply:', String(q4.json?.reply ?? q4.text).slice(0, 120));

console.log('DONE', { projectId, characterId });
