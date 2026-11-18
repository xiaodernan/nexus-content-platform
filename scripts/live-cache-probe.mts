/**
 * §AILIVE-5 · 缓存亲和实况探针（web → ai-service → aizzz.xyz）
 *
 * 本脚本的目的不是证明响应质量——而是量化「同一 Session 多次调用同一任务」场景下
 * provider 的缓存命中率（prompt_cache_key 常量 + 流式 SSE 前缀）。
 *
 * 做法：register 一个临时用户 → create 临时项目 → 连续 POST /api/ai/run 三次（prompt 必须**字节级一致**），
 * 读出 provider 原样透传的 usage.cachedTokens + cacheReported，打印三次的比值。
 *
 * --confirm-real 才会真计费任何 token。
 */
import { strict as assert } from 'node:assert';

const BASE = process.env.NEXUS_WEB_URL ?? 'http://127.0.0.1:3100';
const PASSWORD = process.env.NEXUS_SMOKE_PASSWORD ?? 'smoke-password-2026-11-18';
const CONFIRM = process.argv.includes('--confirm-real');

if (!CONFIRM) {
  console.error(`拒绝执行：本脚本会真的烧掉 provider 的 token 做 cache-probe。授权后这样跑：
  npm run live:cache-probe -- --confirm-real

它做的事：注册临时账号 → 建临时项目 → 同一个 prompt 连打 3 次 /api/ai/run → 报每个响应里 provider 的 cached_tokens。
缓存键由 apps/ai-service 的 sticky_prompt_cache 传输输写（system+user byte-hash），不改模型输出。`);
  process.exit(2);
}

const cookieStore = new Map<string, string>();

function collectCookies(res: Response, label: string) {
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(';')[0];
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    cookieStore.set(name, value);
    console.error(`[cookie] ${label} <- ${name}`);
  }
}
function cookieHeader(): string {
  return [...cookieStore].map(([k, v]) => `${k}=${v}`).join('; ');
}
function csrfToken(): string | undefined {
  return cookieStore.get('nexus_csrf');
}

async function post(path: string, body: unknown): Promise<{ res: Response; text: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', cookie: cookieHeader() };
  const csrf = csrfToken();
  if (csrf) headers['x-csrf-token'] = csrf;
  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { res, text };
}

const PROMPT = '用一句话说清楚：WCAG AA 对正文对比度的最低要求。';

async function main(): Promise<void> {
  // 0) GET / for nexus_csrf
  {
    const res = await fetch(BASE + '/');
    collectCookies(res, 'GET /');
    await res.text();
  }
  // 1) register
  const email = `live-cache-${Date.now()}@example.test`;
  {
    const { res, text } = await post('/api/auth/register', { email, password: PASSWORD, displayName: 'Live Cache Probe' });
    console.error(`[register] HTTP ${res.status} body=${text.slice(0, 160)}`);
    collectCookies(res, 'register');
    if (!res.ok && res.status !== 200 && res.status !== 201) process.exit(3);
  }
  // 2) create project
  let projectId = '';
  {
    const { res, text } = await post('/api/projects', { name: 'live-cache-probe ' + Date.now(), kind: 'website' });
    console.error(`[create project] HTTP ${res.status}`);
    const json = JSON.parse(text) as { id?: string; projectId?: string };
    projectId = json.id ?? json.projectId ?? '';
    if (!projectId) process.exit(4);
  }
  // 3) three identical /api/ai/run calls
  const results: Array<{ cachedTokens: number | null; tokensIn: number; step: number }> = [];
  for (let i = 1; i <= 3; i += 1) {
    const { res, text } = await post('/api/ai/run', {
      requestId: `live-cache-${i}-${Date.now()}`,
      intent: 'freeform',
      prompt: PROMPT,
      modelClass: 'balanced',
      context: { projectId },
    });
    if (!res.ok) {
      console.error(`[probe ${i}] HTTP ${res.status}: ${text.slice(0, 200)}`);
      process.exit(5);
    }
    const payload = JSON.parse(text) as { usage?: { cachedTokens?: number | null; tokensIn?: number } };
    const u = payload.usage ?? {};
    const cachedTokens = typeof u.cachedTokens === 'number' ? u.cachedTokens : null;
    const tokensIn = typeof u.tokensIn === 'number' ? u.tokensIn : 0;
    console.log(`call-${i}: tokensIn=${tokensIn}  cachedTokens=${cachedTokens}`);
    results.push({ cachedTokens, tokensIn, step: i });
  }
  // 4) scoring: call-1 可能为 0（channel miss），call-2/call-3 应该 > 0
  const c1 = results[0]?.cachedTokens ?? null;
  const c2 = results[1]?.cachedTokens ?? null;
  const c3 = results[2]?.cachedTokens ?? null;
  console.log(JSON.stringify({ call1: c1, call2: c2, call3: c3 }, null, 2));
  if (c2 !== null && c2 > 0) {
    console.error('[live] stream-cache latched after first call ✓');
    process.exit(0);
  }
  console.error('[live] cache did NOT latch — distributor may have rebalanced the channel after retry');
  process.exit(6);
}

main().catch((err) => {
  console.error('[live] fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
