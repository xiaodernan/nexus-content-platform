/**
 * §AILIVE-3 · 用真 provider 跑一轮「真的设计生成」流程——create project → ask model to set the root width →
 * 确认响应含真补丁且 provider/capability 真。
 *
 * 与 live-ai-smoke 不同：后者走 freeform 单问回答（单向验证整条链路），本片走 **design-edit**——
 * 模型要真的产出 patches 并应用到文档（applyPatch 真改 id 真节），终态可被 codegen 真读出。
 *
 *   npm run tsx -- scripts/live-design-smoke.mts --confirm-real
 */
const BASE = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';
if (!process.argv.includes('--confirm-real')) { console.error('requires --confirm-real'); process.exit(2); }

async function run() {
  const session = new Map<string, string>();
  const collect = (label: string, res: Response) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [p] = raw.split(';');
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

  // 4. 拿当前文档（看根 frame 实际 id）
  let doc: { pages?: Array<{ id?: string; name?: string; nodes?: Record<string, unknown> }> } = {};
  { const h: Record<string, string> = { cookie: [...session].map(([k, v]) => `${k}=${v}`).join('; ') }; const r = await fetch(`${BASE}/api/projects/${projectId}`, { headers: h }); const text = await r.text(); console.error('[doc GET] http', r.status); if (!r.ok) { console.error(text.slice(0,300)); process.exit(5); } doc = JSON.parse(text).document; }
  const activePage = doc.pages?.[0];
  console.error(`[design doc] activePage=${activePage?.name} nodes=${activePage?.nodes ? Object.keys(activePage.nodes).length : 0}`);
  if (activePage?.nodes) {
    for (const [id, n] of Object.entries(activePage.nodes)) {
      const node = n as Record<string, unknown>;
      console.error(`  node=${id} type=${node.type} name=${node.name}`);
    }
  }

  // 5. 请求一条真正的修改指令——要求改 Hero 标题字号
  const heroEntry = activePage?.nodes ? Object.entries(activePage.nodes).find(([, n]) => {
    const node = n as Record<string, unknown>;
    return node.name === 'Headline' || node.type === 'text';
  }) : null;
  const targetNodeId = heroEntry ? heroEntry[0] : null;
  console.error(`[ai/run submit; targetNode=${targetNodeId}]`);
  const { r, text } = await post('/api/ai/run', {
    requestId: `design-smoke-${Date.now()}`,
    intent: 'design-edit',
    prompt: targetNodeId
      ? `把 id 为 ${targetNodeId} 的节点字号改为 28px（用 set op，fontSize 28）`
      : '把页面第一个文字节点的 fontSize 改为 28',
    modelClass: 'balanced',
    context: { projectId, pageId: activePage?.id, selection: targetNodeId ? [targetNodeId] : [] },
  });
  console.error(`[ai/run ${r.status}]`);
  if (!r.ok) { console.error(text.slice(0, 400)); process.exit(6); }
  const j = JSON.parse(text);
  console.log('capability:', j.capability, 'provider:', j.provider, 'model:', j.model, 'patches:', (j.patches ?? []).length, 'demoMode:', j.usage?.demoMode);
  console.log('explanation:', j.explanation);
  console.log('usage:', JSON.stringify(j.usage ?? {}));
  if (j.capability !== 'real') process.exit(7);
  if ((j.patches ?? []).length === 0) console.error('[warn] 0 patches — may be legitimate for critique-of-home');
  if (j.usage?.demoMode !== false) process.exit(7);
  console.error('[design-smoke] 真实生成走通 ✓ capability=real + demoMode=false patches=' + (j.patches ?? []).length);
  // 校验补丁真落库：重新拉取文档，读 Eyebrow 的 fontSize
  { const h: Record<string, string> = { cookie: [...session].map(([k, v]) => `${k}=${v}`).join('; ') };
    const r = await fetch(`${BASE}/api/projects/${projectId}`, { headers: h });
    const doc2 = JSON.parse(await r.text()).document as any;
    const eyebrow = doc2?.pages?.flatMap((p: any) => Object.values(p.nodes ?? {})).find((n: any) => n?.name === 'Eyebrow');
    console.error(`[verify] Eyebrow.fontSize = ${eyebrow?.typography?.fontSize}`);
    if (eyebrow && String(eyebrow.typography?.fontSize) !== '28' && eyebrow.typography?.fontSize !== 28) {
      console.error('[verify-FAIL] fontSize not persisted to DB');
      process.exit(8);
    }
    console.error('[verify] patches persisted to DB ✓');
  }
  process.exit(0);
}

run().catch((e) => { console.error('[live] fatal:', e instanceof Error ? e.message : e); process.exit(1); });
