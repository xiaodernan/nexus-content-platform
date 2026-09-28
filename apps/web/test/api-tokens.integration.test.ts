import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createNode } from '@nexus/design-model';
import type { DesignDocument } from '@nexus/design-model';
import { ApiTokenRecordSchema } from '@nexus/schemas';
import { createProject, loadDocument, saveDocument, softDeleteProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { apiTokens, designNodes, pages, projects, users } from '../src/server/db/schema';
import {
  API_RATE_LIMIT_PER_MINUTE,
  TOKEN_PREFIX,
  apiDesignDocument,
  apiProjectDetail,
  apiProjectList,
  authenticateApiToken,
  authorizeApiRequest,
  hashApiToken,
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
      getDb().insert(apiTokens).values({ ...bare, scopes: ['projects:write'] as never }),
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
