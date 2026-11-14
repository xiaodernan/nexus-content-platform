/**
 * §AILIVE-3 · 用真 provider 跑一轮 **design-edit 真链路**：
 *   GET / 拿 cookie → login/register → create project → GET 权威 document →
 *   POST /api/ai/run（design-edit 诉求，点名一个真实节点要改的字号）→
 *   拿真模型的响应，用 `verifyDesignPatches` 在内存里 dry-run 判定（ADR-0170）。
 *
 * ## 它证明什么、不证明什么（接手 8d6e1384 的半成品后据实正名）
 *
 * 证明：HTTP 层真走通——`capability=real`、`demoMode=false`、`model=gpt-6-sol`、
 * usage 是真 token；且真模型给出的 patches 经**与 Studio client 同一份** `applyPatch`
 * 内存 dry-run 后，每个 op 生效、点名的目标节点真被 touch、字号真变成诉求值。
 *
 * **不证明**补丁已落库。`POST /api/ai/run` 只把 patches 交回客户端（route.ts 的 `deliver`），
 * 落库是 Studio client 拿 patches 调 `applyPatch` 再发 `/design` 的活。本脚本是纯 HTTP、
 * 不走浏览器，所以库里 `design_nodes` 不变是 gate 的正常表现，不是 bug，也不是本片的判据。
 * 旧版在此处去读 `Eyebrow.fontSize` 谎称"persisted to DB"——请求改的却是 `Headline`，
 * 得到名不副实的 `[verify-FAIL]`。现在这段已被内存 dry-run 判据取代。
 *
 * 三态退出码（详见 `scripts/design-patch-verdict.mts`）：
 * - `applied`         → exit 0：真 · 设计生成走通，patches 合法且达成诉求。
 * - `honest-refusal`  → exit 0：0 patches 但 explanation 说清了为什么做不了（模型诚实边界，
 *                       `design_prompt.py` 规则 1/5 允许）。如实打印，**不谎报走通 ✓**。
 * - `invalid`         → exit 8：patches 造 id / 错页 / 没碰目标 / 字号不对 / 沉默失败 → 真红。
 *
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/live-design-smoke.mts --confirm-real
 * 默认拒绝执行（防意外计费），必须显式带 `--confirm-real`。
 */
import { verifyDesignPatches } from './design-patch-verdict.mjs';
import type { DesignDocument, DesignPatch } from '@nexus/creative-model';

const BASE = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';
const WANTED_FONT_SIZE = 28;
if (!process.argv.includes('--confirm-real')) { console.error('requires --confirm-real'); process.exit(2); }

async function run() {
  const session = new Map<string, string>();
  const collect = (label: string, res: Response) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [p] = raw.split(';');
      if (!p) continue;
      const e = p.indexOf('=');
      if (e > 0) session.set(p.slice(0, e).trim(), p.slice(e + 1).trim());
    }
    console.error(`[cook] ${label} <- ${[...session.keys()].join(',')}`);
  };
  const post = async (path: string, body: unknown) => {
    const h: Record<string, string> = { 'content-type': 'application/json', cookie: [...session].map(([k, v]) => `${k}=${v}`).join('; ') };
    const csrf = session.get('nexus_csrf');
    if (csrf) h['x-csrf-token'] = csrf;
    const r = await fetch(BASE + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
    return { r, text: await r.text() };
  };

  // 1. GET / 获取 cookie
  { const r = await fetch(BASE + '/'); collect('GET /', r); await r.text(); }
  // 尝试复用持久的 session（避免吃 IP 限流）
  const SMOKE_EMAIL = 'live-ai-smoke-1794477197284@example.test';
  const SMOKE_PW = 'smoke-password-2026-11-12';
  let loggedIn = false;
  { const h: Record<string, string> = { 'content-type': 'application/json', cookie: [...session].map(([k, v]) => `${k}=${v}`).join('; ') };
    const csrf = session.get('nexus_csrf');
    if (csrf) h['x-csrf-token'] = csrf;
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: h, body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PW }) });
    const text = await r.text();
    console.error(`[login ${r.status}] ${text.slice(0,160)}`);
    if (r.ok) { collect('login', r); loggedIn = true; }
  }
  if (!loggedIn) {
    // 2. 注册临时账号（只有登录失败才走）
    const email = `design-smoke-${Date.now()}@example.test`;
    {
      const { r, text } = await post('/api/auth/register', { email, password: SMOKE_PW, displayName: 'Design Smoke' });
      console.error(`[register ${r.status}] ${text.slice(0, 200)}`);
      collect('register', r);
      if (!r.ok) process.exit(3);
    }
  }

  // 3. 建项目
  let projectId = '';
  { const { r, text } = await post('/api/projects', { name: 'design-smoke ' + Date.now(), kind: 'website' }); console.error(`[project ${r.status}]`); collect('project', r); if (!r.ok) process.exit(4); const json = JSON.parse(text) as { projectId?: string }; projectId = json.projectId ?? ''; if (!projectId) throw new Error('projectId missing'); }

  // 4. 拿当前文档（看根 frame 实际 id）——这份就是内存 dry-run 的权威输入
  let document: DesignDocument;
  { const h: Record<string, string> = { cookie: [...session].map(([k, v]) => `${k}=${v}`).join('; ') }; const r = await fetch(`${BASE}/api/projects/${projectId}`, { headers: h }); const text = await r.text(); console.error('[doc GET] http', r.status); if (!r.ok) { console.error(text.slice(0,300)); process.exit(5); } document = (JSON.parse(text).document) as DesignDocument; }
  const activePage = document.pages?.[0];
  console.error(`[design doc] activePage=${activePage?.name} nodes=${activePage?.nodes ? Object.keys(activePage.nodes).length : 0}`);
  if (activePage?.nodes) {
    for (const [id, n] of Object.entries(activePage.nodes)) {
      console.error(`  node=${id} type=${n.type} name=${n.name}`);
    }
  }

  // 5. 请求一条真正的修改指令——点名一个真实文字节点，要求改它的字号。
  //    targetNodeId 同时是"请求点名"与"dry-run 验证"的唯一目标，杜绝旧版"改 Headline 验 Eyebrow"的错位。
  const heroEntry = activePage?.nodes ? Object.entries(activePage.nodes).find(([, n]) => {
    return n.type === 'text' && n.name === 'Headline';
  }) ?? Object.entries(activePage.nodes).find(([, n]) => n.type === 'text') : null;
  const targetNodeId = heroEntry ? heroEntry[0] : null;
  const targetFontSizeBefore = targetNodeId ? activePage?.nodes?.[targetNodeId]?.typography?.fontSize ?? null : null;
  console.error(`[ai/run submit; targetNode=${targetNodeId} fontSizeBefore=${targetFontSizeBefore}]`);
  const { r, text } = await post('/api/ai/run', {
    requestId: `design-smoke-${Date.now()}`,
    intent: 'design-edit',
    prompt: targetNodeId
      ? `把 id 为 ${targetNodeId} 的节点字号改为 ${WANTED_FONT_SIZE}px（用 set op 改 typography.fontSize）`
      : `把页面第一个文字节点的 fontSize 改为 ${WANTED_FONT_SIZE}`,
    modelClass: 'balanced',
    context: { projectId, pageId: activePage?.id, selection: targetNodeId ? [targetNodeId] : [] },
  });
  console.error(`[ai/run ${r.status}]`);
  if (!r.ok) { console.error(text.slice(0, 400)); process.exit(6); }
  const j = JSON.parse(text);
  console.log('capability:', j.capability, 'provider:', j.provider, 'model:', j.model, 'patches:', (j.patches ?? []).length, 'demoMode:', j.usage?.demoMode);
  console.log('explanation:', j.explanation);
  console.log('usage:', JSON.stringify(j.usage ?? {}));
  // 契约门：不是真 provider 就直接判红，别拿假绿糊弄
  if (j.capability !== 'real' || j.usage?.demoMode !== false) process.exit(7);

  // 6. 内存 dry-run 判据（取代旧版"查库看落库"那段）——与 Studio client 同一份 applyPatch
  const verdict = verifyDesignPatches(document, (j.patches ?? []) as DesignPatch[], targetNodeId, j.explanation ?? '', {
    expectedFontSize: WANTED_FONT_SIZE,
  });
  console.error('[verdict]', JSON.stringify(verdict));

  if (verdict.kind === 'applied') {
    console.error(`[design-smoke] 真 · design-edit 走通 ✓ capability=real + demoMode=false + ${verdict.patchCount} patches 内存 dry-run 生效（touched=${verdict.touchedNodeIds.join(',')} fontSize=${verdict.targetFontSize}）`);
    process.exit(0);
  }
  if (verdict.kind === 'honest-refusal') {
    // 0 patches 且说清了原因：模型诚实拒改，是合法终态。如实打印，绝不谎报"走通 ✓"。
    console.error(`[design-smoke] 链路真通但模型诚实拒改（0 patches）：${verdict.explanation}`);
    process.exit(0);
  }
  // invalid：造 id / 错页 / 没碰目标 / 字号不对 / 沉默失败 —— 真红
  console.error('[design-smoke-FAIL] patches 内存 dry-run 未过判据：');
  for (const reason of verdict.reasons) console.error(`  · ${reason}`);
  console.error('[boundary] 本片只验 HTTP 层 + 内存 dry-run；Studio client applyPatch→/design 落库、浏览器 Run→Screenshot 仍欠（ADR-0170 诚实边界）。');
  process.exit(8);
}

run().catch((e) => { console.error('[live] fatal:', e instanceof Error ? e.message : e); process.exit(1); });
