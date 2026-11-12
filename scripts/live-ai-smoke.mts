/**
 * §AILIVE-2 — 真实 LLM 端到端 smoke（真组合：web → ai-service → 真 provider）。
 *
 * 这条用例不是把 provider 直接按在测试里——而是经过 **web 的真实入口**：
 * 注册 → 建项目 → /api/ai/run（web assemble 上下文 → provider 真调用 → 账本 → 通知）→
 * 回读 response 的 capability / usage / 文本。
 *
 * 为什么要它存在：单测里的 mock 与 DEMO 可以全绿，但都不证明组合在真网关下能活着。
 * 本仓库不造假 AI（§159），但 DEMO 一直不给验证"真实能力是否接通"的权限；这份脚本给：
 *   - 显式确认运营者授权（--confirm-real），否则退出 2 并只打印说明（防止意外计费）；
 *   - 一次请求只花一份 token（intent=freeform、prompt 是一个短问），不反复重试；
 *   - 输出 stdout JSON：answer/provider/model/tokensIn/tokensOut/capability；
 *   - 不断言回答内容——真实模型不是确定性的；断言的是 capability=real（接通了，不是 mock）。
 *
 *   npm run live:ai-smoke -- --confirm-real
 *
 * 预期输出：capability: "real"，provider: "openai-compatible"，model: "gpt-6-sol"
 * 且 explanation 是一段真英文/中文（非 mock 的固定字符串）。
 * 失败语义：
 *   - 2: 没给 --confirm-real（这不是失败，是拒绝未授权的计费）；
 *   - 3: 注册失败（返回码/未拿到 nexus_session）；
 *   - 4: 不能创建项目（返回码/未拿到 projectId）；
 *   - 5: /api/ai/run 拒绝了（403/429/4xx）；
 *   - 6: capability 不是 real（provider 链路断、配置漂了）；
 * 未 push。
 */
import { strict as assert } from 'node:assert';

const BASE = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';
const EMAIL_PREFIX = process.env.NEXUS_SMOKE_EMAIL_PREFIX ?? `live-ai-smoke`;
const PASSWORD = process.env.NEXUS_SMOKE_PASSWORD ?? 'smoke-password-2026-11-12';

const CONFIRM = process.argv.includes('--confirm-real');

if (!CONFIRM) {
  console.error(`拒绝执行：本脚本会向真实网关计费一次。确认授权后运行：
  npm run live:ai-smoke -- --confirm-real

它做的事：用 base=${BASE} 注册一个临时账号 → 建一个项目 → POST /api/ai/run（intent=freeform）
→ capability 必须为 'real' 才算通过。临时账号与项目不删除（CAS 太多次），如需清理请人工在 lib 里找到它们。`);
  process.exit(2);
}

const cookieStore = new Map<string, string>();

function collectCookies(res: Response, label: string) {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const raw of setCookies) {
    const [pair] = raw.split(';');
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
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    cookie: cookieHeader(),
  };
  const csrf = csrfToken();
  if (csrf) headers['x-csrf-token'] = csrf;
  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { res, text };
}

async function main() {
  // ── GET / — proxy 签发 nexus_csrf ─────────────────────────────────────────
  {
    const res = await fetch(BASE + '/');
    collectCookies(res, 'GET /');
    await res.text(); // drain
    if (!csrfToken()) throw new Error('GET / did not set nexus_csrf — proxy 可能未装或被覆盖');
  }

  // ── POST /api/auth/register — 造一个临时账号 ─────────────────────────────
  const email = `${EMAIL_PREFIX}-${Date.now()}@example.test`;
  {
    const { res, text } = await post('/api/auth/register', {
      email,
      password: PASSWORD,
      displayName: 'Live AI Smoke',
    });
    console.error(`[register] HTTP ${res.status} body=${text.slice(0, 200)}`);
    collectCookies(res, 'register');
    if (!res.ok && res.status !== 201 && res.status !== 200) {
      if (/email_taken/i.test(text)) {
        console.error('[register] email already exists — chose smoke prefix collision; try another minute');
      }
      process.exit(3);
    }
    if (!cookieStore.get('nexus_session')) throw new Error('no nexus_session after register');
  }

  // ── POST /api/projects — 建一个临时项目（供 AI assemble 读上下文）───────────
  let projectId = '';
  {
    const { res, text } = await post('/api/projects', {
      name: 'live-ai-smoke ' + Date.now(),
      kind: 'website',
    });
    console.error(`[create project] HTTP ${res.status} body=${text.slice(0, 300)}`);
    if (!res.ok) process.exit(4);
    try {
      const json = JSON.parse(text) as { id?: string; projectId?: string };
      projectId = json.id ?? json.projectId ?? '';
    } catch {
      projectId = '';
    }
    if (!projectId) throw new Error(`project created but id missing in response: ${text.slice(0, 120)}`);
  }

  // ── POST /api/ai/run — 真 provider 生成一次 ─────────────────────────────
  const { res, text } = await post('/api/ai/run', {
    requestId: `live-ai-${Date.now()}`,
    intent: 'freeform',
    prompt: '用一句话说清楚：WCAG AA 对正文对比度的最低要求。',
    modelClass: 'balanced',
    context: { projectId },
  });
  console.error(`[ai/run] HTTP ${res.status}`);
  if (res.status === 403 || res.status === 429) { process.exit(5); }
  if (!res.ok) { console.error(text.slice(0, 400)); process.exit(5); }

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(text) as Record<string, unknown>; } catch { /* keep {} */ }

  const capability = String((payload as { capability?: unknown }).capability ?? 'unknown');
  const provider = String((payload as { provider?: unknown }).provider ?? 'none');
  const model = String((payload as { model?: unknown }).model ?? 'unknown');
  const explanation = String((payload as { explanation?: unknown }).explanation ?? '');
  const usage = (payload as { usage?: Record<string, unknown> }).usage ?? {};

  console.log(JSON.stringify({ capability, provider, model, explanation, usage }, null, 2));
  assert.equal(capability, 'real', 'expected capability=real — provider 链路未接通或 web env 漂/env 没带');
  console.error('[live] 真实 provider 链路 ✓ (capability=real)');
  process.exit(0);
}

main().catch((err) => { console.error('[live] fatal:', err instanceof Error ? err.message : String(err)); process.exit(1); });
