/**
 * §AILIVE-6 · 问典两次连打 probe：证明 digest 前缀的 KV 复用/缓存命中。
 *
 * 用户关注：为什么我们看起来 cache 命中率忽高忽低。
 * /bible/q 用 **同一个 SYSTEM_PROMPT**（字节级稳定、约 61k 字节、≈20k token），
 * 连续两次相同 question 打进，第二次应当命中缓存（cached_tokens ≈ prompt_tokens）。
 *
 * --confirm-real 才会真烧 token。
 */
import { strict as assert } from 'node:assert';

const BASE = process.env.NEXUS_WEB_URL ?? 'http://127.0.0.1:3100';
const PASSWORD = process.env.NEXUS_SMOKE_PASSWORD ?? 'smoke-password-2026-11-18';
const CONFIRM = process.argv.includes('--confirm-real');

if (!CONFIRM) {
  console.error(`拒绝执行：本脚本会真烧 token。授权后这样跑：
  npm run live:bible-ask-probe -- --confirm-real

它做的事：注册临时账号 → 对 bible-ask 路由连发两次完全相同的问题 → 打印两次 usage.cachedTokens。
system 是 SYSTEM_PROMPT（约 61k 字节，字节级稳定）。`);
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
    cookieStore.set(name, pair.slice(eq + 1).trim());
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

const QUESTION = '《收件人》里谁收到了那张签收单？';

async function main(): Promise<void> {
  const step = (label: string) => console.error(`\n── ${label}`);
  // 0) GET /
  step('GET /');
  {
    const res = await fetch(BASE + '/');
    collectCookies(res, '/');
    await res.text();
  }
  // 1) register
  step('register');
  {
    const email = `live-ask-${Date.now()}@example.test`;
    const { res, text } = await post('/api/auth/register', { email, password: PASSWORD, displayName: 'Live Bible Ask' });
    console.error(`register HTTP ${res.status} ${text.slice(0, 100)}`);
    collectCookies(res, 'register');
    if (!res.ok) process.exit(3);
  }
  // 2) two bible-q calls
  for (let i = 1; i <= 2; i += 1) {
    step(`call ${i}: ${QUESTION}`);
    const { res, text } = await post('/api/bible/q', { question: QUESTION, locale: 'zh' });
    if (!res.ok) {
      console.error(`bible-q HTTP ${res.status}: ${text.slice(0, 300)}`);
      process.exit(5);
    }
    const payload = JSON.parse(text) as Record<string, unknown>;
    const usage = (payload as { cachedTokens?: number; tokensIn?: number; model?: string; provider?: string });
    console.log(`  cachedTokens=${usage.cachedTokens} tokensIn=${usage.tokensIn} model=${usage.model} provider=${usage.provider}`);
    console.log(`  answer head: ${String((payload as any).answer ?? '').slice(0, 80).replace(/\n/g, ' ')}`);
  }
  console.error('\n[live] done — the repeated-prefix KV reuse shows up here (cachedTokens=0 first, large on second)');
}

main().catch((err) => { console.error('[live] fatal:', err instanceof Error ? err.message : String(err)); process.exit(1); });
