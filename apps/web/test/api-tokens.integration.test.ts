import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desc, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createNode } from '@nexus/design-model';
import type { DesignDocument } from '@nexus/design-model';
import {
  API_ACCESS_RETENTION_DAYS,
  API_TOKEN_SCOPES,
  type ApiDesignPatchRequest,
  ApiTokenRecordSchema,
} from '@nexus/schemas';
import { createProject, loadDocument, saveDocument, softDeleteProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import {
  apiAccessBuckets,
  apiTokens,
  auditEvents,
  designNodes,
  pages,
  projects,
  snapshots,
  users,
} from '../src/server/db/schema';
// 路由本身也进这一份测试：第三片要证明的是"真的走一次 HTTP 处理器会留下一行账"，
// 只测 domain 里那个函数就等于没测接线的那一寸
import { GET as listProjectsRoute } from '../src/app/api/v1/projects/route';
import { GET as projectDetailRoute } from '../src/app/api/v1/projects/[projectId]/route';
import { listSnapshots } from '../src/server/domain/snapshots';
import {
  API_RATE_LIMIT_PER_MINUTE,
  API_WRITE_RATE_LIMIT_PER_MINUTE,
  TOKEN_PREFIX,
  apiDesignDocument,
  apiPatchDesign,
  apiProjectDetail,
  apiProjectList,
  apiAccessBucketOf,
  API_ACCESS_BUCKET_MS,
  authenticateApiToken,
  authorizeApiRequest,
  hashApiToken,
  listApiAccessSummary,
  recordApiAccess,
  type IssuedToken,
  issueApiToken,
  listApiTokens,
  newApiToken,
  revokeApiToken,
} from '../src/server/domain/api-tokens';

/**
 * §188 的真库那一半：这一片只有库知道答案的事。
 *
 * 纯单测证明代码内部自洽，证明不了这六件——
 *  ① 库里那一列存的确实是哈希而不是明文（写错了也能读出对的 record，所以只能在库这一侧验）；
 *  ② `last_used_at` 的分钟节流真的落在 SQL 上（去掉那一层 `if`，第二次调用就会把时间推到下一毫秒）；
 *  ③ 两条 CHECK（空 scope / 名单外 scope）与名称长度真的拦得住写入，而不只是界面不让填；
 *  ④ 吊销留行、用户注销时凭据跟着没（ON DELETE CASCADE）；
 *  ⑤ 跨人读取拿不到任何东西：列表、详情、文档三条路都按 token 的归属划边界；
 *  ⑥ 详情里那两个规模数字是现场从文档算的，改两个节点它就会动（不是快照也不是缓存）。
 * 外加 `authorizeApiRequest` 的判定顺序：scope 不够先 403，够了才轮得到限流的 429。
 *
 * 第二片（写端点）在这里证明的是七件，它们都不是"看代码能看出来"的：
 *  ⑦ 一条补丁真的落进库里（节点行数从 SQL 数出来），历史里多一条带补丁清单的 `ai` 快照，
 *    审计里多一行按凭据记的写入；
 *  ⑧ 其中一条 op 打不到 → **整份一条都不写**（事务），节点行数、快照条数、审计条数原地不动；
 *  ⑨ 删除类 op 在公网这一侧是**拒**而不是挂起（这一侧没人能点批准），被点名的那个节点还在；
 *  ⑩ 打完补丁过不了 `parseDocument` = 与 Studio 保存同一扇门，库里还是原来那一版；
 *  ⑪ 别人的项目递补丁：回的是"不存在"那一句，但越权尝试在审计里留了行；
 *  ⑫ 写桶与读桶是分开的：写满那一档之后 429 说的是"写"，同一枚凭据的读还能继续；
 *  ⑬ 库里那条 CHECK 现在真的认 `design:write`（生效约束从 `pg_catalog` 读回来与常量比），
 *    名单外的一格照样写不进去——换约束不是把门拆了。
 */

let ownerId: string;
let otherId: string;
let projectId: string;
const projectName = '公开 API 的样本';

const insertUser = async (handle: string, email: string): Promise<string> => {
  const rows = await getDb().insert(users).values({ displayName: handle, email, handle }).returning({ id: users.id });
  return rows[0]!.id;
};

const rawTokenRow = async (tokenHash: string) => {
  const [row] = await getDb().select().from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)).limit(1);
  return row ?? null;
};

const requestWith = (plaintext: string): Request =>
  new Request('http://localhost:3100/api/v1/projects', { headers: { authorization: `Bearer ${plaintext}` } });

/**
 * 节点数的独立读法：直接数库里那几页的行。
 * 拿 domain 里同一段 reduce 当期望值，就是"两处一起错也算对"——所以期望值来自 SQL。
 */
async function nodeRows(projectIdOf: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: rawSql<number>`count(*)::int` })
    .from(designNodes)
    .innerJoin(pages, eq(designNodes.pageId, pages.id))
    .where(eq(pages.projectId, projectIdOf));
  return row?.n ?? 0;
}

/**
 * 被库拒掉的那一句在 `cause` 里：drizzle 把外层 message 写成 "Failed query: ..."，
 * 约束名在原生错误上。所以断言要读的是整条链，而不是只看最外面那一层。
 */
async function expectRejected(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  const error = await promise.then(() => null).catch((e: unknown) => e);
  if (!error) throw new Error(`这一条本该被库拒掉，结果写进去了：${pattern}`);
  const text = [error, (error as { cause?: unknown }).cause]
    .map((part) => (part instanceof Error ? part.message : ''))
    .join(' ');
  expect(text).toMatch(pattern);
}

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const stamp = Date.now().toString(36);
  ownerId = await insertUser(`apia${stamp}`, `api-a+${stamp}@nexus.test`);
  otherId = await insertUser(`apib${stamp}`, `api-b+${stamp}@nexus.test`);
  projectId = (await createProject(ownerId, { name: projectName, kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(apiTokens).where(inArray(apiTokens.userId, [ownerId, otherId]));
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, otherId]));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

describe('签发：库里面没有明文', () => {
  it('token_hash 存的是 SHA-256，hint 是随机段前 8 位，record 过契约', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: 'CI 拉取', scopes: ['projects:read'] });
    expect(ApiTokenRecordSchema.safeParse(issued.record).success).toBe(true);
    expect(issued.token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(issued.record.hint).toBe(issued.token.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 8));

    const row = await rawTokenRow(hashApiToken(issued.token));
    expect(row, '按哈希查不到那一行：那"按哈希鉴权"就是句空话').not.toBeNull();
    expect(row!.userId).toBe(ownerId);
    expect(row!.tokenHash).not.toContain(issued.token.slice(-8));
    // 反向对照：库里那一列如果直接写明文，这行就红（哈希稳定但相等）
    expect(row!.tokenHash).toBe(hashApiToken(issued.token));
    expect(row!.revokedAt).toBeNull();
    expect(row!.expiresAt).toBeNull(); // 不填有效期就是不过期，服务端不替人设一个他不知道的期限
    expect(issued.record.id).toBe(row!.id);
  });

  it('名称与 scope 由库兜底：空名、空 scope、名单外的 scope 都写不进去', async () => {
    await expect(issueApiToken({ userId: ownerId, name: '   ', scopes: ['projects:read'] })).rejects.toThrow(/名称/);
    await expect(issueApiToken({ userId: ownerId, name: 'x', scopes: [] as never[] })).rejects.toThrow(/scope/);
    // 下面三条走的是绕过 domain 的裸插入：证明拦人的是库上的 CHECK，不是只有 JS 在挡
    const bare = { userId: ownerId, name: '裸写', tokenHash: hashApiToken(newApiToken()), hint: 'abcd1234' };
    await expectRejected(
      // 名单外的例子必须真的在名单外：`projects:write` 2026-10-08 起是合法值（§188 建/删项目），
      // 拿它当反例会让这条用例在库里"竟然拒了合法值"或"居然放行了"两个方向上给出假信号
      getDb().insert(apiTokens).values({ ...bare, scopes: ['projects:delete'] as never }),
      /api_tokens_scopes_known|violates check/,
    );
    await expectRejected(
      getDb().insert(apiTokens).values({ ...bare, tokenHash: hashApiToken(newApiToken()), scopes: [] }),
      /api_tokens_scopes_not_empty|violates check/,
    );
    await expectRejected(
      getDb()
        .insert(apiTokens)
        .values({ ...bare, tokenHash: hashApiToken(newApiToken()), scopes: ['projects:read'], name: 'x'.repeat(61) }),
      /api_tokens_name_length|violates check/,
    );
  });

  it('同一枚凭据不能发两次（唯一索引建在哈希那一列上）', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '重复', scopes: ['projects:read'] });
    await expectRejected(
      getDb()
        .insert(apiTokens)
        .values({
          userId: otherId,
          name: '抄来的',
          tokenHash: hashApiToken(issued.token),
          hint: 'abcd1234',
          scopes: ['projects:read'],
        }),
      /api_tokens_hash_key|duplicate key/,
    );
  });
});

describe('鉴权：四种失败各说各的话', () => {
  it('没带头 / 形状不对 / 库里没有，三句是不同的原因', async () => {
    const none = await authenticateApiToken(null);
    expect(none.ok).toBe(false);
    if (none.ok) return;
    expect(none.message).toMatch(/缺少 Authorization/);
    const cookie = await authenticateApiToken('not-a-token-at-all');
    expect(cookie.ok).toBe(false);
    if (cookie.ok) return;
    expect(cookie.status).toBe(401);
    expect(cookie.error).toBe('invalid_token');
    expect(cookie.message).toMatch(/会话 cookie/);

    const ghost = await authenticateApiToken(newApiToken());
    expect(ghost.ok).toBe(false);
    if (ghost.ok) return;
    expect(ghost.error).toBe('invalid_token');
    expect(ghost.message).toMatch(/库里没有这枚凭据/);
  });

  it('成功那一路会写 last_used_at，一分钟内的第二次不重写', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '节流', scopes: ['projects:read', 'design:read'] });
    const first = await authenticateApiToken(issued.token);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.userId).toBe(ownerId);
    expect(first.token.scopes).toEqual(['projects:read', 'design:read']);

    const written = (await rawTokenRow(hashApiToken(issued.token)))!.lastUsedAt;
    expect(written, '鉴权成功却没记下使用时间：那"最近使用"这一列是空的').not.toBeNull();
    // 反向对照：去掉节流那一层 if，这里会被推到下一毫秒
    await authenticateApiToken(issued.token);
    await authenticateApiToken(issued.token);
    const after = (await rawTokenRow(hashApiToken(issued.token)))!.lastUsedAt;
    expect(after?.toISOString()).toBe(written!.toISOString());
    // 而"分钟级"不是"永远不写"：把上次记录推到两分钟前，下一次调用就该更新
    await getDb()
      .update(apiTokens)
      .set({ lastUsedAt: new Date(Date.now() - 120_000) })
      .where(eq(apiTokens.id, issued.record.id));
    await authenticateApiToken(issued.token);
    const moved = (await rawTokenRow(hashApiToken(issued.token)))!.lastUsedAt;
    expect(moved!.getTime()).toBeGreaterThan(written!.getTime());
  });

  it('吊销是留行打时间戳：第二次吊销说"先前已经吊销了"，而凭据从此只能拿 401', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '要吊销', scopes: ['projects:read'] });
    const before = Date.now();
    const revoked = await revokeApiToken(issued.record.id, ownerId);
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    expect(revoked.note).toBeUndefined();
    expect(revoked.record.revokedAt).not.toBeNull();
    expect(new Date(revoked.record.revokedAt!).getTime()).toBeGreaterThanOrEqual(before - 1000);
    // 行还在（那是"它存在过、被吊销了"的账）
    expect(await rawTokenRow(hashApiToken(issued.token))).not.toBeNull();

    const again = await revokeApiToken(issued.record.id, ownerId);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.note, '第二次吊销什么都没变，界面要拿到这一句').toMatch(/先前已经吊销/);

    const dead = await authenticateApiToken(issued.token);
    expect(dead.ok).toBe(false);
    if (dead.ok) return;
    expect(dead.error).toBe('revoked_token');
    expect(dead.message).toContain(revoked.record.revokedAt!);
  });

  it('到期是 401 expired_token，而且那句带着到期时间', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '短命', scopes: ['projects:read'], expiresInDays: 1 });
    expect((await authenticateApiToken(issued.token)).ok).toBe(true);
    const past = new Date(Date.now() - 60_000);
    await getDb().update(apiTokens).set({ expiresAt: past }).where(eq(apiTokens.id, issued.record.id));
    const expired = await authenticateApiToken(issued.token);
    expect(expired.ok).toBe(false);
    if (expired.ok) return;
    expect(expired.error).toBe('expired_token');
    expect(expired.message).toContain(past.toISOString());
    // 反向对照：过期判定如果写成"吊销"那一类，界面上就没法区分"到期"和"被吊销"
    expect(expired.error).not.toBe('revoked_token');
  });

  it('吊销的归属：别人的 token id 在这里是 not-found，不是"存在但不给你"', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '别人的', scopes: ['projects:read'] });
    const stolen = await revokeApiToken(issued.record.id, otherId);
    expect(stolen.ok).toBe(false);
    expect((await rawTokenRow(hashApiToken(issued.token)))!.revokedAt).toBeNull();
  });

  it('人注销时凭据跟着没（ON DELETE CASCADE）', async () => {
    const stamp = Date.now().toString(36);
    const tempUser = await insertUser(`apic${stamp}`, `api-c+${stamp}@nexus.test`);
    const issued = await issueApiToken({ userId: tempUser, name: '随人走', scopes: ['projects:read'] });
    expect(await rawTokenRow(hashApiToken(issued.token))).not.toBeNull();
    await getDb().delete(users).where(eq(users.id, tempUser));
    expect(await rawTokenRow(hashApiToken(issued.token))).toBeNull();
  });
});

describe('端点唯一的入口：scope 不够到限流', () => {
  it('带 design:read 才读得到设计文档那一格；缺它的凭据先撞 403', async () => {
    const narrow = await issueApiToken({ userId: ownerId, name: '只给清单', scopes: ['projects:read'] });
    const denied = await authorizeApiRequest(requestWith(narrow.token), 'design:read');
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.status).toBe(403);
    expect(denied.error).toBe('insufficient_scope');
    expect(denied.message).toContain('projects:read'); // 说清楚这枚凭据到底有什么
    expect(denied.message).toContain('design:read');

    const wide = await issueApiToken({ userId: ownerId, name: '两格都给', scopes: ['projects:read', 'design:read'] });
    const ok = await authorizeApiRequest(requestWith(wide.token), 'design:read');
    expect(ok.ok).toBe(true);
  });

  it('每分钟额度是真的那个数：超过它就 429，并说等几秒', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '限流', scopes: ['projects:read'] });
    for (let i = 0; i < API_RATE_LIMIT_PER_MINUTE; i += 1) {
      const within = await authorizeApiRequest(requestWith(issued.token), 'projects:read');
      expect(within.ok, `第 ${i + 1} 次就拒了：额度不是每分钟 ${API_RATE_LIMIT_PER_MINUTE}`).toBe(true);
    }
    const over = await authorizeApiRequest(requestWith(issued.token), 'projects:read');
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.status).toBe(429);
    expect(over.message).toContain(String(API_RATE_LIMIT_PER_MINUTE));
  });
});

describe('读取边界：别人的项目连条数都不给', () => {
  it('列表按归属过滤；拿别人的 id 问详情与文档都是 null', async () => {
    const mine = await apiProjectList(ownerId);
    expect(mine.map((p) => p.id)).toContain(projectId);
    expect(mine.every((p) => p.updatedAt.endsWith('Z'))).toBe(true);

    expect(await apiProjectList(otherId)).toEqual([]);
    expect(await apiProjectDetail(otherId, projectId)).toBeNull();
    expect(await apiDesignDocument(otherId, projectId)).toBeNull();
    // 反向对照：不存在的项目与别人的项目是同一个答案，不给"存在但看不到"留侧信道
    const nowhere = '00000000-0000-0000-0000-000000000000';
    expect(await apiProjectDetail(otherId, nowhere)).toBeNull();
    expect(await apiDesignDocument(ownerId, nowhere)).toBeNull();
  });

  it('详情里的规模是现场算的：加两个节点它就会动', async () => {
    const document = await loadDocument(projectId);
    expect(document).not.toBeNull();
    const doc = document as DesignDocument;
    const page = doc.pages[0]!;
    const root = page.nodes[page.rootId]!;

    const before = await apiProjectDetail(ownerId, projectId);
    expect(before!.pageCount).toBe(doc.pages.length);
    expect(before!.nodeCount).toBe(await nodeRows(projectId));

    for (const name of ['甲', '乙']) {
      const node = createNode({ type: 'text', name, text: name, parentId: root.id });
      page.nodes[node.id] = node;
      root.children = [...root.children, node.id];
    }
    await saveDocument(projectId, doc);

    const after = await apiProjectDetail(ownerId, projectId);
    expect(after!.nodeCount).toBe(before!.nodeCount + 2);
    expect(after!.pageCount).toBe(before!.pageCount);

    const design = await apiDesignDocument(ownerId, projectId);
    expect(design!.source).toBe('database');
    expect(design!.nodeCount).toBe(after!.nodeCount);
    // 交回的是库里那一份，不是任何调用方递进来的东西
    const reread = await loadDocument(projectId);
    expect(Object.keys((reread as DesignDocument).pages[0]!.nodes).length).toBe(after!.nodeCount);
  });

  it('软删的项目从列表与详情里都消失（但行还在）', async () => {
    const temp = (await createProject(ownerId, { name: '删掉的样本', kind: 'website' })).id;
    expect((await apiProjectList(ownerId)).map((p) => p.id)).toContain(temp);
    const deleted = await softDeleteProject(ownerId, temp, '删掉的样本');
    expect(deleted.ok).toBe(true);
    expect((await apiProjectList(ownerId)).map((p) => p.id)).not.toContain(temp);
    expect(await apiProjectDetail(ownerId, temp)).toBeNull();
    expect(await apiDesignDocument(ownerId, temp)).toBeNull();
    // 反向对照：不是"读不到"，是软删——行确实还在库里，只是 API 不再给
    expect((await getDb().select({ id: projects.id }).from(projects).where(eq(projects.id, temp)).limit(1)).length).toBe(1);
  });

  it('列表按更新时间倒序，且 record 里的时间都是 ISO 字符串', async () => {
    const rows = await apiProjectList(ownerId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < rows.length; i += 1) {
      expect(new Date(rows[i - 1]!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(rows[i]!.updatedAt).getTime());
    }
    const tokens = await listApiTokens(ownerId);
    expect(tokens.length).toBeGreaterThan(0);
    // 倒序同样管凭据列表：最新发的那一枚排在最前
    expect(new Date(tokens[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(tokens[tokens.length - 1]!.createdAt).getTime());
    for (const record of tokens) expect(ApiTokenRecordSchema.safeParse(record).success).toBe(true);
  });
});

/** 凭据 → apiPatchDesign 要的那一层归属：写成一处，别在每个用例里重打一遍 */
function ownerOf(issued: IssuedToken, as: string) {
  return { userId: as, tokenId: issued.record.id, tokenHint: issued.record.hint };
}

/** 活动页与它的根节点：pageId / parentId 从库里那一份现取，不写死任何 id */
async function activePage(of: string) {
  const doc = (await loadDocument(of)) as DesignDocument;
  const page = doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0]!;
  return { doc, page, root: page.nodes[page.rootId]! };
}

/** 一条形状合法的 insert 补丁；每个用例只改自己要试的那一处 */
function insertPatch(pageId: string, parentId: string, name: string) {
  const node = createNode({ type: 'text', name, text: name, parentId });
  const patch = {
    summary: `加上「${name}」`,
    pageId,
    ops: [{ op: 'insert' as const, node: node as unknown as Record<string, unknown>, parentId }],
  } satisfies ApiDesignPatchRequest;
  return { node, patch };
}

/** 写端点留下的那几行审计（成功与拒都有），按时间倒序回来 */
async function patchAudits() {
  return getDb().select().from(auditEvents).where(eq(auditEvents.action, 'api.design.patch')).orderBy(desc(auditEvents.id));
}

describe('公开补丁：一次调用是一个事务，四种拒法都发生在写之前', () => {
  it('一条 insert 落进库里：多一个节点、多一条带补丁清单的 ai 历史、多一行按凭据记的审计', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '写补丁', scopes: ['design:write'] });
    const { doc, page, root } = await activePage(projectId);
    const { node, patch } = insertPatch(page.id, root.id, '凭据写的');
    const nodesBefore = await nodeRows(projectId);
    const nodesInPageBefore = Object.keys(page.nodes).length;
    const snapsBefore = (await listSnapshots(projectId)).length;
    const auditsBefore = (await patchAudits()).length;

    const outcome = await apiPatchDesign(ownerOf(issued, ownerId), projectId, patch);
    expect(outcome.ok, outcome.ok ? '' : outcome.message).toBe(true);
    if (!outcome.ok) return;
    const r = outcome.result;
    expect(r.appliedOps).toBe(1);
    expect(r.touchedNodeIds).toEqual(expect.arrayContaining([node.id, root.id]));
    // 回执里那两个规模是现场从打完补丁的文档算的，与库里的行数对得上
    expect(r.nodeCount).toBe(doc.pages.reduce((sum, p) => sum + Object.keys(p.nodes).length, 0) + 1);
    expect(r.pageCount).toBe(doc.pages.length);
    expect(r.snapshotId).not.toBeNull();
    expect(r.historyRecorded).toBe(true);
    expect(r.source).toBe('database');
    // 事务之后的三步（历史、语料、审计）失败只能报进 warnings，不能把已经提交的写变成 500：
    // 含 insert 的补丁重发一次就是两个节点，不是幂等写
    expect(r.warnings, `补丁写成了但事后步骤丢了：${r.warnings.join('；')}`).toEqual([]);

    // 节点行数从 SQL 数出来，不信 domain 自己算的那一份
    expect(await nodeRows(projectId)).toBe(nodesBefore + 1);
    const reread = (await loadDocument(projectId)) as DesignDocument;
    const rereadPage = reread.pages.find((p) => p.id === page.id)!;
    const landed = rereadPage.nodes[node.id];
    expect(landed, '读回来没有这个节点：那句"多一个节点"是空的').toBeDefined();
    expect(landed!.text).toBe('凭据写的');
    expect(landed!.parentId).toBe(root.id);
    expect(rereadPage.nodes[root.id]!.children).toContain(node.id);
    expect(Object.keys(rereadPage.nodes).length).toBe(nodesInPageBefore + 1);

    const [snap] = await getDb().select().from(snapshots).where(eq(snapshots.id, r.snapshotId!)).limit(1);
    expect(snap, '回执里的 snapshotId 在库里查不到行').not.toBeUndefined();
    expect(snap!.source).toBe('ai');
    expect(snap!.label).toContain(issued.record.hint); // 历史面板要认得出是哪一枚凭据写的
    const manifest = snap!.patch as { ops?: { node?: { id?: string } }[] } | null;
    expect(manifest?.ops?.[0]?.node?.id, '历史里没有补丁清单：AI Diff 那一格就没东西可展示（§151）').toBe(node.id);
    expect((await listSnapshots(projectId)).length).toBe(snapsBefore + 1);

    const audits = await patchAudits();
    expect(audits.length).toBe(auditsBefore + 1);
    expect(audits[0]!.actorId).toBe(ownerId);
    expect(audits[0]!.targetId).toBe(projectId);
    expect(audits[0]!.allowed).toBe(true);
    const detail = audits[0]!.detail as { tokenId: string; appliedOps: number; snapshotId: string | null };
    expect(detail.tokenId, '审计没记是哪一枚凭据：那"谁改的"还是问不出来').toBe(issued.record.id);
    expect(detail.appliedOps).toBe(1);
    expect(detail.snapshotId).toBe(r.snapshotId);
  });

  it('一份补丁里有一条打不到：整条都不写，节点行数、历史条数、审计条数原地不动', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '半打不到', scopes: ['design:write'] });
    const { page, root } = await activePage(projectId);
    const { node, patch } = insertPatch(page.id, root.id, '打不到就不写');
    const nodesBefore = await nodeRows(projectId);
    const snapsBefore = (await listSnapshots(projectId)).length;
    const auditsBefore = (await patchAudits()).length;

    const outcome = await apiPatchDesign(ownerOf(issued, ownerId), projectId, {
      ...patch,
      ops: [...patch.ops, { op: 'set', nodeId: 'no-such-node', path: 'text', value: '这一条打不到' }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(409);
    expect(outcome.error).toBe('ops_skipped');
    expect(outcome.message).toMatch(/一条都没写/);
    expect(outcome.message).toMatch(/no-such-node/); // 说得出是第几条、为什么
    expect(await nodeRows(projectId)).toBe(nodesBefore);
    const reread = (await loadDocument(projectId)) as DesignDocument;
    expect(reread.pages.find((p) => p.id === page.id)!.nodes[node.id], '第一条明明写进去了：那 skip 就不是"一条都不写"').toBeUndefined();
    expect((await listSnapshots(projectId)).length).toBe(snapsBefore);
    expect((await patchAudits()).length).toBe(auditsBefore);
  });

  it('删除类 op 是拒不是挂起：409 approval_required，理由带着名字，被点名的节点还在库里', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '想删东西', scopes: ['design:write'] });
    const { page, root } = await activePage(projectId);
    const { node, patch } = insertPatch(page.id, root.id, '先写进来再试删');
    expect((await apiPatchDesign(ownerOf(issued, ownerId), projectId, patch)).ok).toBe(true);
    const nodesBefore = await nodeRows(projectId);
    const auditsBefore = (await patchAudits()).length;

    const outcome = await apiPatchDesign(ownerOf(issued, ownerId), projectId, {
      summary: '删掉刚写进来的那一节',
      pageId: page.id,
      ops: [{ op: 'remove', nodeId: node.id }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(409);
    expect(outcome.error).toBe('approval_required');
    expect(outcome.message).toMatch(/没有人可以批准/);
    expect(outcome.message).toMatch(/Studio/);
    expect(outcome.message).toContain(node.name); // 理由是"删除「先写进来再试删」"，不是裸 uuid
    // 反向对照：拒的那一次什么都没带走
    const reread = (await loadDocument(projectId)) as DesignDocument;
    expect(reread.pages.find((p) => p.id === page.id)!.nodes[node.id]).toBeDefined();
    expect(await nodeRows(projectId)).toBe(nodesBefore);

    const audits = await patchAudits();
    expect(audits.length).toBe(auditsBefore + 1); // §74 的决定要留行：响应是瞬时的，账不是
    expect(audits[0]!.allowed).toBe(false);
    const detail = audits[0]!.detail as { reason: string; refusedOps: string[] };
    expect(detail.reason).toBe('approval_required');
    expect(detail.refusedOps.join('；')).toContain(node.name);
  });

  it('打完补丁过不了 parseDocument：那是与 Studio 保存同一道门，400 且库里还是原来那一版', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '空页根', scopes: ['design:write'] });
    const { doc, page } = await activePage(projectId);
    const nodesBefore = await nodeRows(projectId);
    const snapsBefore = (await listSnapshots(projectId)).length;

    const outcome = await apiPatchDesign(ownerOf(issued, ownerId), projectId, {
      summary: '加一页没有根节点的',
      pageId: page.id,
      ops: [
        {
          op: 'addPage',
          page: { id: `page-${Date.now().toString(36)}`, name: '没有根的页', rootId: 'no-such-root', nodes: {}, width: 1200, height: 800 },
        },
      ],
    });
    expect(outcome.ok, outcome.ok ? '这一条居然写进去了：那道门在公网这一侧没生效' : outcome.message).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(400);
    expect(outcome.error).toBe('document_rejected');
    expect(outcome.message).toMatch(/同一道门/);
    expect(outcome.message).toMatch(/empty-page/);
    expect(await nodeRows(projectId)).toBe(nodesBefore);
    const reread = (await loadDocument(projectId)) as DesignDocument;
    expect(reread.pages.length).toBe(doc.pages.length); // 页没落库，重新读出来还是原来那一版
    expect(reread.pages.some((p) => p.name === '没有根的页')).toBe(false);
    expect((await listSnapshots(projectId)).length).toBe(snapsBefore);
  });

  it('别人的项目递补丁：回的是"不存在"那一句，但越权尝试在审计里留了行', async () => {
    const issued = await issueApiToken({ userId: otherId, name: '想改别人的', scopes: ['design:write'] });
    const { page, root } = await activePage(projectId);
    const { patch } = insertPatch(page.id, root.id, '不该出现的');
    const nodesBefore = await nodeRows(projectId);
    const nil = '00000000-0000-0000-0000-000000000000';

    const stolen = await apiPatchDesign(ownerOf(issued, otherId), projectId, patch);
    expect(stolen.ok).toBe(false);
    if (stolen.ok) return;
    expect(stolen.status).toBe(404);
    expect(stolen.error).toBe('project_not_found');
    // 反向对照：不存在的项目与别人的项目回同一类答案，不给"存在但看不到"留侧信道
    const nowhere = await apiPatchDesign(ownerOf(issued, otherId), nil, patch);
    expect(nowhere.ok).toBe(false);
    if (nowhere.ok) return;
    expect(nowhere.status).toBe(stolen.status);
    expect(nowhere.error).toBe(stolen.error);
    expect(stolen.message).not.toMatch(/存在|别人的/);

    expect(await nodeRows(projectId)).toBe(nodesBefore);
    const refused = (await patchAudits()).filter((a) => a.actorId === otherId && !a.allowed);
    // 两次尝试各留一行：一次冲着别人的项目，一次冲着根本不存在的项目。
    // 用 find 拿"最新那一行"是不成立的断言——那正好是第二次尝试，targetId 是 nil uuid
    const onMine = refused.filter((a) => a.targetId === projectId);
    const onNowhere = refused.filter((a) => a.targetId === nil);
    expect(onMine.length, '越权尝试没留行：§80 那张表又是空的').toBe(1);
    expect(onNowhere.length, '对不存在的项目递补丁一句"不存在"就打发了，账里什么都没有').toBe(1);
    expect((onMine[0]!.detail as { reason: string }).reason).toBe('not_owner');
    expect((onMine[0]!.detail as { tokenId: string }).tokenId).toBe(issued.record.id);
    expect((onNowhere[0]!.detail as { reason: string }).reason).toBe('not_owner');
  });

  it('缺 design:write 的凭据过不了那一格：先 403，说清楚这枚凭据有什么、缺什么', async () => {
    const narrow = await issueApiToken({ userId: ownerId, name: '只有读', scopes: ['projects:read'] });
    const denied = await authorizeApiRequest(requestWith(narrow.token), 'design:write');
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.status).toBe(403);
    expect(denied.error).toBe('insufficient_scope');
    expect(denied.message).toContain('projects:read');
    expect(denied.message).toContain('design:write');
    expect(denied.message).toMatch(/重新发一枚/); // 给的是出路，不是一句"权限不足"
  });

  it('写满那一档之后 429 说的是"写"，而同一枚凭据的读还能继续（两个桶是分开的）', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '两个桶', scopes: ['projects:read', 'design:write'] });
    for (let i = 0; i < API_WRITE_RATE_LIMIT_PER_MINUTE; i += 1) {
      const within = await authorizeApiRequest(requestWith(issued.token), 'design:write');
      expect(within.ok, `第 ${i + 1} 次就拒了：写这一档不是每分钟 ${API_WRITE_RATE_LIMIT_PER_MINUTE}`).toBe(true);
    }
    const over = await authorizeApiRequest(requestWith(issued.token), 'design:write');
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.status).toBe(429);
    expect(over.error).toBe('rate_limited');
    expect(over.message).toMatch(/^写/);
    expect(over.message).toContain(String(API_WRITE_RATE_LIMIT_PER_MINUTE));
    expect(over.message).not.toContain(String(API_RATE_LIMIT_PER_MINUTE)); // 别把读的额度报给写的人
    // 这一句才是"两个桶"的证据：写桶打满了，读桶在同一次调用里还能用
    const readStillWorks = await authorizeApiRequest(requestWith(issued.token), 'projects:read');
    expect(readStillWorks.ok, '写桶打满把读桶一起拖死了：那两个桶其实是同一个').toBe(true);
  });

  it('库里生效的那条 CHECK 现在认 design:write，而名单外的一格照样进不去', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '只给写', scopes: ['design:write'] });
    const row = await rawTokenRow(hashApiToken(issued.token));
    expect(row!.scopes).toEqual(['design:write']);

    // 生效约束从 pg_catalog 读回来：迁移文件里写的不是拦人的那一条，库里这条才是
    const rows = (await getDb().execute(
      rawSql`select pg_get_constraintdef(c.oid) as def
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        where t.relname = 'api_tokens' and c.conname = 'api_tokens_scopes_known'`,
    )) as unknown as { def: string }[];
    expect(rows.length, 'pg_catalog 里没有那条 CHECK：约束没建上，比对是在比空集').toBe(1);
    const literal = rows[0]!.def.match(/ARRAY\[([^\]]*)\]/);
    const inside = literal?.[1];
    if (!inside) throw new Error(`生效约束里读不出 ARRAY[...]：${rows[0]!.def}`);
    const inDb = [...inside.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
    expect(inDb.length, '生效约束的名单是空的').toBeGreaterThan(0);
    expect(inDb.sort()).toEqual([...API_TOKEN_SCOPES].sort());

    // 反向对照：换约束不是把门拆了——名单外的一格仍然写不进去
    await expectRejected(
      getDb()
        .insert(apiTokens)
        .values({ userId: ownerId, name: '越界', tokenHash: hashApiToken(newApiToken()), hint: 'abcd1234', scopes: ['design:delete'] as never }),
      /api_tokens_scopes_known|violates check/,
    );
  });

  it('同一枚凭据并发两次 PATCH：两个节点都在——后写的不许悄悄吃掉先写的', async () => {
    // 三轮：一次绿可能是运气，这一条测的是锁的时序（把 lockProjectWrites 挪到读之后就该红）
    const issued = await issueApiToken({ userId: ownerId, name: '并发', scopes: ['design:write'] });
    for (let round = 0; round < 3; round += 1) {
      const { page, root } = await activePage(projectId);
      const a = insertPatch(page.id, root.id, `并发甲${round}`);
      const b = insertPatch(page.id, root.id, `并发乙${round}`);
      const before = await nodeRows(projectId);
      const both = await Promise.all([
        apiPatchDesign(ownerOf(issued, ownerId), projectId, a.patch),
        apiPatchDesign(ownerOf(issued, ownerId), projectId, b.patch),
      ]);
      for (const outcome of both) expect(outcome.ok, outcome.ok ? '' : outcome.message).toBe(true);
      // 回执自己那一份：两条补丁各自只碰了自己的节点，谁也没顺手把对方写掉
      const touched = both.map((o) => (o.ok ? o.result.touchedNodeIds : []));
      expect(touched[0]).toEqual(expect.arrayContaining([a.node.id, root.id]));
      expect(touched[0]!.slice().sort()).toEqual([a.node.id, root.id].slice().sort());
      const after = (await loadDocument(projectId)) as DesignDocument;
      const nodes = after.pages.find((p) => p.id === page.id)!.nodes;
      expect(Object.keys(nodes), `第 ${round + 1} 轮丢了节点：读—改—写没有串行化`).toEqual(
        expect.arrayContaining([a.node.id, b.node.id]),
      );
      expect(await nodeRows(projectId)).toBe(before + 2);
    }
  });
});

/**
 * §188 第三片：访问账。这一本答的是「哪一枚凭据在什么时候读了哪一份文档」——
 * 第一片只有 `last_used_at`（一个时间、分钟级、说不出读了什么），写有 `audit_events`，读没有。
 *
 * 这里证明的是四件纯看代码看不出来的事：
 *  ⑲ 一分钟里 40 次读同一格**只买得起一行**（`calls` 是 40），换到下一分钟才多一行。
 *     这一条是「读接口不许变成写接口」那根纪律在新账本上的形状——去掉切桶，40 次就是 40 行。
 *  ⑳ 桶不是整分钟就写不进去：那条 CHECK 是这张表唯一挡住「每次调用写一行」的地方。
 *  㑑 真走一次 v1 处理器：200 的那一次留下一行、端点名与项目对得上；404 的那一次什么都不留
 *     （读不到的东西不许出现在「读过什么」里）。
 *  㑒 面板那一份摘要按（端点, 项目）聚合、认得出项目名，且别人名下的凭据一条都不在里面；
 *     超出保留期的行会在下一次新建桶时被清掉，窗口内的不动。
 */
describe('访问账：哪一枚凭据在什么时候读了哪一份文档', () => {
  /** 期望值从库里数出来，不经过 domain 里那条 SQL——两处一起错也算对就没有意义 */
  const ledgerRows = async (tokenId: string) => {
    const rows = await getDb().select().from(apiAccessBuckets).where(eq(apiAccessBuckets.tokenId, tokenId));
    return rows.sort((a, b) =>
      `${a.bucket.toISOString()}|${a.endpoint}|${a.projectId}`.localeCompare(`${b.bucket.toISOString()}|${b.endpoint}|${b.projectId}`),
    );
  };
  /**
   * 用例锚在「当前的这一分钟」与「下一分钟」上，而不是 `Date.now()` 上：
   * 拿运行时刻当锚点的话，跑在第 59 秒与跑在第 01 秒会给出两个答案。
   */
  const minuteA = apiAccessBucketOf(new Date());
  const minuteB = new Date(minuteA.getTime() + API_ACCESS_BUCKET_MS);
  const DAY_MS = 86_400_000;

  it('一分钟里 40 次读同一格只有一行，calls 是 40；换分钟才是新的一行', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '账本·同分钟', scopes: ['projects:read'] });
    const tokenId = issued.record.id;
    const created: boolean[] = [];
    for (let i = 0; i < 40; i += 1) {
      // 同一分钟里往后错 987 毫秒：40 次调用跨不到下一分钟，但每次都真的取了一次时间
      created.push(await recordApiAccess({ tokenId, endpoint: 'GET /api/v1/projects', at: new Date(minuteA.getTime() + i * 987) }));
    }
    const rows = await ledgerRows(tokenId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.calls).toBe(40);
    expect(rows[0]!.bucket.toISOString()).toBe(minuteA.toISOString());
    // 40 次里只有第一次新建了行。这一句挡住「每次都写一行」那条退路：那样 40 次就是 40 行
    expect(created.filter((c) => c)).toEqual([true]);
    expect(created.filter((c) => !c)).toHaveLength(39);

    await recordApiAccess({ tokenId, endpoint: 'GET /api/v1/projects', at: minuteB });
    const after = await ledgerRows(tokenId);
    expect(after).toHaveLength(2);
    expect(after.map((r) => r.calls).sort((x, y) => x - y)).toEqual([1, 40]);
  });

  it('两份文档、两个端点各记各的行；集合类那一格落在空串上', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '账本·分维度', scopes: ['projects:read'] });
    const tokenId = issued.record.id;
    const second = (await createProject(ownerId, { name: '公开 API 的样本二', kind: 'website' })).id;
    await recordApiAccess({ tokenId, endpoint: 'GET /api/v1/projects/[projectId]', projectId, at: minuteA });
    await recordApiAccess({ tokenId, endpoint: 'GET /api/v1/projects/[projectId]', projectId: second, at: minuteA });
    await recordApiAccess({ tokenId, endpoint: 'PATCH /api/v1/projects/[projectId]/design', projectId, at: minuteA });
    await recordApiAccess({ tokenId, endpoint: 'GET /api/v1/projects', at: minuteA });
    const keys = (await ledgerRows(tokenId)).map((r) => `${r.endpoint}|${r.projectId}`).sort();
    // 期望值也走同一个 sort：手排的顺序在「/ 比 | 小」这件事上是错的，而这一格要看的
    // 是「四个维度各有一行」，不是某一行人坐在第几个位置。
    expect(keys).toEqual(
      [
        'GET /api/v1/projects|',
        `GET /api/v1/projects/[projectId]|${projectId}`,
        `GET /api/v1/projects/[projectId]|${second}`,
        `PATCH /api/v1/projects/[projectId]/design|${projectId}`,
      ].sort(),
    );
  });

  it('桶不是整分钟就写不进去：那条 CHECK 是这张表唯一的防线', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '账本·整分钟', scopes: ['projects:read'] });
    await expectRejected(
      getDb()
        .insert(apiAccessBuckets)
        .values({
          tokenId: issued.record.id,
          endpoint: 'GET /api/v1/projects',
          projectId: '',
          bucket: new Date(minuteA.getTime() + 1_000),
          lastSeen: new Date(),
          calls: 1,
        }),
      /api_access_buckets_bucket_is_minute/,
    );
    // 对照：同一格换成整分钟就写得进去，否则上面那条红可能只是字段名写错了
    await getDb()
      .insert(apiAccessBuckets)
      .values({
        tokenId: issued.record.id,
        endpoint: 'GET /api/v1/projects',
        projectId: '',
        bucket: minuteA,
        lastSeen: new Date(),
        calls: 1,
      });
    expect(await ledgerRows(issued.record.id)).toHaveLength(1);
  });

  it('真走一次 v1 处理器：200 留下一行且说得出端点，404 什么都不留', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '账本·走路由', scopes: ['projects:read'] });
    const bearer = (path: string) =>
      new Request(`http://localhost:3100${path}`, { headers: { authorization: `Bearer ${issued.token}` } });

    const ok = await listProjectsRoute(bearer('/api/v1/projects'));
    expect(ok.status).toBe(200);
    const rows = await ledgerRows(issued.record.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.endpoint).toBe('GET /api/v1/projects');
    expect(rows[0]!.projectId).toBe('');

    // 一个不存在的项目 id：处理器在返回 404 之前就走完了，账上不该多出一行
    const ghost = '00000000-0000-4000-8000-000000000000';
    const missing = await projectDetailRoute(bearer(`/api/v1/projects/${ghost}`), {
      params: Promise.resolve({ projectId: ghost }),
    });
    expect(missing.status).toBe(404);
    const after = await ledgerRows(issued.record.id);
    expect(after).toHaveLength(1);
    expect(after.map((r) => r.endpoint)).toEqual(['GET /api/v1/projects']);
  });

  it('面板那一份摘要：按（端点, 项目）聚合、认得出项目名，别人名下的凭据一条都不在里面', async () => {
    const mine = await issueApiToken({ userId: ownerId, name: '账本·摘要', scopes: ['projects:read'] });
    const theirs = await issueApiToken({ userId: otherId, name: '账本·别人的', scopes: ['projects:read'] });
    // 同一份文档两次读落在两个分钟桶里：聚合之后应该是一条 calls=2
    await recordApiAccess({ tokenId: mine.record.id, endpoint: 'GET /api/v1/projects/[projectId]', projectId, at: minuteA });
    await recordApiAccess({ tokenId: mine.record.id, endpoint: 'GET /api/v1/projects/[projectId]', projectId, at: minuteB });
    await recordApiAccess({ tokenId: mine.record.id, endpoint: 'GET /api/v1/projects', at: minuteA });
    await recordApiAccess({ tokenId: theirs.record.id, endpoint: 'GET /api/v1/projects', at: minuteA });

    const entries = await listApiAccessSummary(ownerId);
    const mineRows = entries.filter((e) => e.tokenId === mine.record.id);
    expect(mineRows).toHaveLength(2);
    const detail = mineRows.find((e) => e.endpoint === 'GET /api/v1/projects/[projectId]');
    expect(detail?.calls).toBe(2);
    // 面板要说得出「哪个项目」，不是只摊一个 uuid
    expect(detail?.projectName).toBe(projectName);
    expect(detail?.projectId).toBe(projectId);
    // 别人那枚凭据真的读过东西（下面那条对照证明它有自己的行），但不在这个人的摘要里
    expect(entries.some((e) => e.tokenId === theirs.record.id)).toBe(false);
    expect(await ledgerRows(theirs.record.id)).toHaveLength(1);

    // 每枚凭据最多列几条是界面那一格的宽度上限，不是一句装饰
    const capped = await listApiAccessSummary(ownerId, 1);
    expect(capped.filter((e) => e.tokenId === mine.record.id)).toHaveLength(1);
  });

  it('超出保留期的行在下一次新建桶时被清掉，窗口内的不动', async () => {
    const issued = await issueApiToken({ userId: ownerId, name: '账本·保留期', scopes: ['projects:read'] });
    const tokenId = issued.record.id;
    const seed = (at: Date) =>
      getDb()
        .insert(apiAccessBuckets)
        .values({ tokenId, endpoint: 'GET /api/v1/projects', projectId: '', bucket: at, lastSeen: at, calls: 1 });
    const stale = new Date(minuteA.getTime() - (API_ACCESS_RETENTION_DAYS + 5) * DAY_MS);
    const recent = new Date(minuteA.getTime() - DAY_MS);
    await seed(stale);
    await seed(recent);
    expect(await ledgerRows(tokenId)).toHaveLength(2);

    const fresh = new Date(minuteA.getTime() + 2 * API_ACCESS_BUCKET_MS);
    expect(await recordApiAccess({ tokenId, endpoint: 'GET /api/v1/projects', at: fresh })).toBe(true);
    const kept = (await ledgerRows(tokenId)).map((r) => r.bucket.toISOString()).sort();
    expect(kept).toEqual([recent.toISOString(), fresh.toISOString()].sort());
    // 被清掉的只有过期那一行：把删除条件写宽（比如忘了 where 时间）会连窗口内的一起没
    expect(kept).not.toContain(stale.toISOString());
  });
});
