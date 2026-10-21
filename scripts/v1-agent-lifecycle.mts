import { performance } from 'node:perf_hooks';
import { getDb } from '../apps/web/src/server/db/client';
import { users } from '../apps/web/src/server/db/schema';
import { issueApiToken } from '../apps/web/src/server/domain/api-tokens';

/**
 * **外部 Agent 的完整生命周期**（M8 那一格缺的"证明"）。
 *
 * M8 那些片（v1 读/写、访问账、编码协商、MCP server、建删发布对外）都是**分片**做的，
 * 每片各有各的集成测试 ⇒ **但没有任何一条见证证明"一枚 Bearer 凭据从头走到尾真能成"**。
 * 这一份就是那条见证：真凭据、真 HTTP、真库，把一个外部 Agent 真正要走的五步走一遍：
 *
 *   ① 建项目（`POST /api/v1/projects`）
 *   ② 改设计（`PATCH /api/v1/projects/<id>/design`）
 *   ③ 读回（`GET /api/v1/projects/<id>/design`）——**断言第 ② 步的改动真的在里面**
 *   ④ 发布（`POST /api/v1/projects/<id>/publish`，unlisted）
 *   ⑤ 删除（`DELETE /api/v1/projects/<id>?confirm=<项目名>`）
 *
 * **顺带量每一步的耗时**（那是外部 Agent 的体感：一步多少毫秒）。
 *
 * **前提**：有一个跑着的 web server（NEXUS_WEB_URL，默认 http://localhost:3100）
 * 与一个能连的库（NEXUS_DATABASE_URL）。
 * 用法：`NEXUS_DATABASE_URL=... npx tsx scripts/v1-agent-lifecycle.mts`
 */
const base = (process.env.NEXUS_WEB_URL ?? 'http://localhost:3100').replace(/\/$/, '');
const db = getDb();

const steps: Array<{ name: string; ms: number; status: number; note: string }> = [];

async function call(
  name: string,
  path: string,
  init: { method: string; body?: unknown; token?: string },
): Promise<{ status: number; body: any; ms: number }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const t0 = performance.now();
  const res = await fetch(`${base}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const ms = performance.now() - t0;
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  steps.push({ name, ms, status: res.status, note: '' });
  return { status: res.status, body, ms };
}

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) {
    console.error(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${label}${detail ? ` —— ${detail}` : ''}`);
  }
}

// ── 0. 一个用户 + 一枚真凭据 ─────────────────────────────────────────────
const email = `v1-lifecycle-${Date.now()}@nexus.test`;
const [user] = await db
  .insert(users)
  .values({ displayName: 'V1 Lifecycle Probe', email })
  .returning({ id: users.id });
const userId = user!.id;
const scopes = ['projects:read', 'projects:write', 'design:read', 'design:write', 'publish:write'] as const;
const issued = await issueApiToken({ userId, name: '生命周期见证', scopes: [...scopes] });
const token = issued.token;
console.log(`真凭据已签发（scope ${scopes.join(' / ')}）\n`);

try {
  // ① 建项目
  const projectName = `外部Agent见证 ${Date.now().toString(36)}`;
  const created = await call('① 建项目', '/api/v1/projects', {
    method: 'POST',
    body: { name: projectName, kind: 'website' },
    token,
  });
  check('① 建项目回 201', created.status === 201, `拿到 ${created.status}`);
  const projectId = created.body?.id as string;
  check('① 回执里有项目 id', typeof projectId === 'string' && projectId.length > 0);

  // ② 改设计（一次补丁：加一个节点并改一个属性）
  const design = await call('② 读设计', `/api/v1/projects/${projectId}/design`, { method: 'GET', token });
  check('② 读设计回 200', design.status === 200, `拿到 ${design.status}`);
  const pageId = design.body?.document?.pages?.[0]?.id as string;
  const rootId = design.body?.document?.pages?.[0]?.rootId as string;
  check('② 回执里有页面与根节点', !!pageId && !!rootId);

  const patched = await call('② 改设计', `/api/v1/projects/${projectId}/design`, {
    method: 'PATCH',
    body: {
      summary: '见证：改根节点名字',
      ops: [{ op: 'set', nodeId: rootId, path: 'name', value: '见证过的根' }],
    },
    token,
  });
  check('② 改设计回 200', patched.status === 200, `拿到 ${patched.status}`);

  // ③ 读回 —— **断言第 ② 步的改动真的在里面**
  const after = await call('③ 读回', `/api/v1/projects/${projectId}/design`, { method: 'GET', token });
  check('③ 读回回 200', after.status === 200, `拿到 ${after.status}`);
  const nameNow = after.body?.document?.pages?.[0]?.nodes?.[rootId]?.name;
  check('③ 第 ② 步的改动真的在文档里', nameNow === '见证过的根', `读回来的是「${String(nameNow)}」`);

  // ④ 发布（unlisted）
  const published = await call('④ 发布', `/api/v1/projects/${projectId}/publish`, {
    method: 'POST',
    body: { visibility: 'unlisted' },
    token,
  });
  check('④ 发布回 201/200', published.status === 200 || published.status === 201, `拿到 ${published.status}`);
  check('④ 回执里有发布路径', typeof published.body?.path === 'string' && published.body.path.length > 0, String(published.body?.path));

  // ⑤ 删除（确认词逐字）
  const deleted = await call('⑤ 删除', `/api/v1/projects/${projectId}?confirm=${encodeURIComponent(projectName)}`, {
    method: 'DELETE',
    token,
  });
  check('⑤ 删除回 200', deleted.status === 200, `拿到 ${deleted.status}`);

  // ⑤ 之后：详情读不到
  const gone = await call('⑤ 读已删', `/api/v1/projects/${projectId}`, { method: 'GET', token });
  check('⑤ 删掉之后读详情是 404', gone.status === 404, `拿到 ${gone.status}`);
} finally {
  // 清理：先硬删这个用户名下的项目行（软删只打标记，行还在 ⇒ 用户的 FK 删不掉），
  // 再删用户（项目删干净后子表跟着级联删）
  const { projects } = await import('../apps/web/src/server/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.delete(projects).where(eq(projects.ownerId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

console.log('\n每一步的耗时（外部 Agent 的体感）：');
for (const s of steps) {
  console.log(`  ${s.name.padEnd(12)} ${s.ms.toFixed(0).padStart(6)}ms  (HTTP ${s.status})`);
}
console.log(
  process.exitCode === 1
    ? '\n⇒ 有一步没过（上面带 ✗ 的那几条）'
    : '\n⇒ 外部 Agent 的完整生命周期走通了：建 → 改 → 读回 → 发布 → 删，每一步都有回执，每一步都有耗时',
);
process.exit(process.exitCode ?? 0);
