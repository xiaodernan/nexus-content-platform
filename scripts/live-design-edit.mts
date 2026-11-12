/**
 * §AILIVE-4 · 真 provider 端到端设计编辑验证——走 web → ai-service → 真 provider 的整条链路，
 * 要求对一个指定的文字节点产出**非空的 set 字号补丁**（fontSize=36），并核对 ai 调用契约。
 *
 * 这不是 dry-run，也不是只看 HTTP 200——它做 6 件事：
 *  1. 注册 throwaway 账号 → 建项目 → GET /api/projects/<id> 读到根 frame 的文字节点（Eyebrow/Headline）；
 *  2. POST /api/ai/run，`intent="design-edit"`、`selection=[<the nodeId>]`；
 *  3. 断言 `capability="real"`、`demoMode=false`、`patches.length > 0`；
 *  4. 校验每个 patch 是 `{op, nodeId, path, value}` 或 `{op: "set", ...}` 形状，nodeId 命中选中的那一条；
 *  5. 查库确认同一个 project 里 agent_tasks 有一行 status=succeeded；
 *  6. **打印补丁摘要与模型解释**——它必须真带出正确的 id 和 36（不是幻觉数字）。
 * 效果不好就说不好，§159 不伪造。
 *
 * 跑法：
 *   npm run tsx -- scripts/live-design-edit.mts --confirm-real
 *
 * 默认拒跑（`--confirm-real`）。走 ~1-2 次真调用（实际只一次 /api/ai/run），不会爆预算。
 */
import postgres from 'postgres';

const BASE = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';
const SMOKE_EMAIL = `design-edit-${Date.now()}@example.test`;
const SMOKE_PW = 'Design!Smoke!2026-11-12';

if (!process.argv.includes('--confirm-real')) {
  console.error('requires --confirm-real');
  process.exit(2);
}

async function run() {
  const session = new Map<string, string>();
  const collect = (label: string, res: Response) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [p] = raw.split(';');
      const e = p.indexOf('=');
      if (e > 0) session.set(p.slice(0, e).trim(), p.slice(e + 1).trim());
    }
  };
  const post = async (path: string, body: unknown) => {
    const h: Record<string, string> = { 'content-type': 'application/json', cookie: [...session].map(([k, v]) => `${k}=${v}`).join('; ') };
    const csrf = session.get('nexus_csrf');
    if (csrf) h['x-csrf-token'] = csrf;
    const r = await fetch(BASE + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
    return { r, text: await r.text() };
  };

  // 1. GET /
  { const r = await fetch(BASE + '/'); collect('GET /', r); await r.text(); }
  // 2. register throwaway
  let projectId = '';
  {
    const { r, text } = await post('/api/auth/register', { email: SMOKE_EMAIL, password: SMOKE_PW, displayName: 'AI Edit Smoke' });
    console.error(`[register ${r.status}] ${text.slice(0, 140)}`);
    collect('register', r);
    if (!r.ok) process.exit(3);
    const { r: projectCreate, text: projectText } = await post('/api/projects', { name: 'live-ai-edit-smoke ' + Date.now(), kind: 'website' });
    console.error(`[project ${projectCreate.status}] ${projectText.slice(0, 140)}`);
    collect('project', projectCreate);
    if (!projectCreate.ok) process.exit(4);
    const parsed = JSON.parse(projectText) as { projectId?: string };
    projectId = parsed.projectId ?? '';
    if (!projectId) throw new Error('projectId missing');
  }

  // 3. 读取文档，挑第一个文字节点（通常是 Eyebrow，若没有再用 Headline）
  let pick: { nodeId: string; name: string; pageId: string } | null = null;
  { const r = await fetch(`${BASE}/api/projects/${projectId}`, {
      headers: { cookie: [...session].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    const text = await r.text();
    const doc = JSON.parse(text).document;
    console.error('[doc GET] http', r.status, 'pages:', doc.pages?.length);
    const nodes = (doc.pages?.[0]?.nodes ?? {}) as Record<string, { id?: string; name?: string; type?: string; typography?: { fontSize?: number | string } }>;
    for (const [id, n] of Object.entries(nodes)) {
      if (n.type === 'text') { pick = { nodeId: id, name: n.name ?? '?', pageId: doc.pages[0].id }; break; }
    }
    if (!pick) throw new Error('text node not found — ???');
    console.error(`[pick] ${pick.name} -> ${pick.nodeId}`);
  }

  // 4. 触发 /api/ai/run：把它的 fontSize 从当前值调到 36
  const { r, text } = await post('/api/ai/run', {
    requestId: `design-edit-${Date.now()}`,
    intent: 'design-edit',
    prompt: `把 id 为 ${pick.nodeId} 的 ${pick.name} 文字节点 fontSize 改成 36，用 set op 写 typography.fontSize`,
    modelClass: 'balanced',
    context: { projectId, pageId: pick.pageId, selection: [pick.nodeId] },
  });
  console.error(`[ai/run ${r.status}]`);
  if (!r.ok) { console.error(text.slice(0, 600)); process.exit(5); }
  const j = JSON.parse(text) as {
    capability: string; provider: string; model: string;
    patches?: Array<{ pageId?: string; ops?: Array<{ op?: string; nodeId?: string; path?: string; value?: unknown }> }>;
    demoMode?: boolean;
    usage?: { demoMode?: boolean };
    explanation?: string;
  };
  const flatOps = (j.patches ?? []).flatMap((p) => Array.isArray(p.ops) ? p.ops : []);
  console.log(JSON.stringify({
    capability: j.capability, provider: j.provider, model: j.model,
    patches: flatOps.map((op) => ({ op: op.op, nodeId: op.nodeId, path: op.path, value: op.value })),
    explanation: j.explanation?.slice(0, 240),
    usage: j.usage,
  }, null, 2));

  // 5. 契约断言
  if (j.capability !== 'real') { console.error('[FAIL] capability not real'); process.exit(6); }
  if (j.usage?.demoMode !== false) { console.error('[FAIL] demoMode not false'); process.exit(6); }
  if (flatOps.length === 0) {
    console.error('[FAIL] 0 patches from real provider — likely selected wrong node or model declined; see explanation above');
    process.exit(7);
  }
  const touching = flatOps.filter((op) => op?.nodeId === pick.nodeId);
  console.error(`[ops] total=${flatOps.length} touchesSelectedNode=${touching.length}`);
  if (touching.length === 0) {
    console.error(`[FAIL] ops did not touch selected node (wanted ${pick.nodeId}); ops=${JSON.stringify(flatOps).slice(0, 400)}`);
    process.exit(7);
  }
  const setOps = touching.filter((op) => op?.op === 'set' && op?.path === 'typography.fontSize' && op?.value === 36);
  if (setOps.length === 0) {
    console.error(`[FAIL] no set op with path=typography.fontSize value=36; actual ops=${JSON.stringify(touching).slice(0, 400)}`);
    process.exit(7);
  }

  // 6. 查库确认 ledger 里有这个 task
  const sql = postgres('postgres://nexus:nexus_dev_only@127.0.0.1:55433/nexus', { max: 1 });
  const tasks = await sql`
    select id, capability, status, requires_approval, agent_key, created_at
      from agent_tasks
     where project_id = ${projectId}::uuid
     order by created_at desc
     limit 3
  `;
  for (const t of tasks) {
    console.log(`agent_tasks id=${t.id} cap=${t.capability} status=${t.status} approval=${t.requires_approval} agent=${t.agent_key}`);
  }
  await sql.end({ timeout: 5 });
  if (tasks.length === 0) { console.error('[FAIL] no agent_tasks row'); process.exit(7); }
  if (tasks[0].status !== 'succeeded') { console.error(`[FAIL] task status=${tasks[0].status}, not succeeded`); process.exit(7); }
  console.log(`[OK] real provider declared design-edit: capability=real patches=${(j.patches ?? []).length} ops=${flatOps.length} ledger-succeeded`);
  process.exit(0);
}

run().catch((e) => { console.error('[fail]', e instanceof Error ? e.message : e); process.exit(1); });
