/**
 * §AILIVE-5 · 完整闭环：AI 产出的补丁真的落到库里并被重新读到。
 *
 * 这是整个链路的最后一次：前四片证明（1）provider 接通（2）请求会真走起来的 CSRF→session
 * →项目→provider→ledger（3）patch 回了正确的 ops（4）agent_tasks 行记到 succeeded。
 * 但补丁**未被落库**——/api/ai/run 只是把 patches 发回给客户端，真正 apply 走 `PATCH /design`。
 * 本片把那一段也走通，形成 **supervisor 能当场验证** 的闭环：
 *
 *   AI 真生 → patches 叙述（op 同行） → /design POST → 文档的 Eyebrow fontSize 真的变成 36 →
 *   同一次请求里 GET /api/projects/<id> 能读到 36
 *
 * 跑法：
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/live-design-apply.mts --confirm-real
 */
const BASE = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';
const SMOKE_EMAIL = `design-apply-${Date.now()}@example.test`;
const SMOKE_PW = 'Design!Apply!2026-11-12';

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
  const post = async (path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST') => {
    const h: Record<string, string> = { 'content-type': 'application/json', cookie: [...session].map(([k, v]) => `${k}=${v}`).join('; ') };
    const csrf = session.get('nexus_csrf');
    if (csrf) h['x-csrf-token'] = csrf;
    const r = await fetch(BASE + path, { method, headers: h, body: JSON.stringify(body) });
    return { r, text: await r.text() };
  };

  // 1. GET /
  { const r = await fetch(BASE + '/'); collect('GET /', r); await r.text(); }

  // 2. register throwaway + create project
  let projectId = '';
  {
    const { r, text } = await post('/api/auth/register', { email: SMOKE_EMAIL, password: SMOKE_PW, displayName: 'AI Apply Smoke' });
    console.error(`[register ${r.status}]`);
    collect('register', r);
    if (!r.ok) process.exit(3);
    const { r: create, text: createText } = await post('/api/projects', { name: 'design-apply ' + Date.now(), kind: 'website' });
    collect('project', create);
    if (!create.ok) { console.error(createText.slice(0, 300)); process.exit(4); }
    const parsed = JSON.parse(createText) as { projectId?: string };
    projectId = parsed.projectId ?? '';
    if (!projectId) throw new Error('projectId missing');
  }

  // 3. 拿文档，选第一个 text 节点
  let pick: { nodeId: string; pageId: string; name: string; fontSize: number | string } | null = null;
  {
    const r = await fetch(`${BASE}/api/projects/${projectId}`, {
      headers: { cookie: [...session].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    const doc = JSON.parse(await r.text()).document;
    for (const p of doc.pages ?? []) {
      for (const [id, n] of Object.entries<any>(p.nodes ?? {})) {
        if (n?.type === 'text' || n?.typography) {
          pick = { nodeId: id, pageId: p.id, name: n.name ?? '?', fontSize: n.typography?.fontSize ?? 'unknown' };
          break;
        }
      }
      if (pick) break;
    }
    if (!pick) throw new Error('no text node in document');
  }
  console.error(`[pick] ${pick.name} ${pick.nodeId} current=${pick.fontSize}`);

  // 4. AI 生成补丁
  const { r: ai, text: aiText } = await post('/api/ai/run', {
    requestId: `design-apply-${Date.now()}`,
    intent: 'design-edit',
    prompt: `把 id 为 ${pick.nodeId} 的 ${pick.name} fontSize 改成 36，用 set op 写 typography.fontSize`,
    modelClass: 'balanced',
    context: { projectId, pageId: pick.pageId, selection: [pick.nodeId] },
  });
  console.error(`[ai/run ${ai.status}]`);
  if (!ai.ok) { console.error(aiText.slice(0, 600)); process.exit(5); }
  const aiJson = JSON.parse(aiText);
  console.log(JSON.stringify({
    capability: aiJson.capability,
    provider: aiJson.provider, model: aiJson.model,
    patchesFlat: (aiJson.patches ?? []).map((p: any) => ({ pageId: p.pageId, opsCount: (p.ops ?? []).length, ops: (p.ops ?? []).map((op: any) => ({ op: op.op, nodeId: op.nodeId, path: op.path, value: op.value })) })),
    explanation: aiJson.explanation?.slice(0, 240),
  }, null, 2));

  const patches = aiJson.patches ?? [];
  if (patches.length === 0) { console.error('[FAIL] 0 patches'); process.exit(7); }

  // 5. Apply 补丁：PATCH /api/projects/<id>/design
  const { r: save, text: saveText } = await post(`/api/projects/${projectId}/design`, { patches }, 'PATCH');
  console.error(`[design ${save.status}] ${saveText.slice(0, 160)}`);
  if (!save.ok) { console.error(saveText.slice(0, 400)); process.exit(8); }

  // 6. 再次读文档，确认改动已落库
  {
    const r = await fetch(`${BASE}/api/projects/${projectId}`, {
      headers: { cookie: [...session].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    const doc = JSON.parse(await r.text()).document;
    const node = doc.pages?.[0]?.nodes?.[pick.nodeId];
    const after = node?.typography?.fontSize;
    console.log(`[after] ${pick.name} fontSize = ${after}`);
    if (String(after) !== '36') {
      console.error(`[FAIL] fontSize not persisted — was ${pick.fontSize}, expected 36, got ${after}`);
      process.exit(9);
    }
    console.log('[OK] real provider → patches → applied → persisted: all 5 hops green');
  }
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
