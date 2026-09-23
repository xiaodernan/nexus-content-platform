import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import type { AiRequest } from '@nexus/schemas';
import { createNode, createPage } from '@nexus/design-model';
import { assembleAiRequest } from '../src/server/ai/assemble';
import { mockProvider } from '../src/server/ai/mock';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §68 的落地半：AI 请求的上下文由服务端装配，客户端只报"我在哪、选了什么"。
 * 打真实 Postgres——装配要读文档、读世界、读角色，桩数据测不出"发出去的那一份到底多大"。
 */

let owner: string;
let other: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Assemble Owner', email: `asm+${Date.now()}@nexus.test` },
      { displayName: 'Assemble Other', email: `asm2+${Date.now()}@nexus.test` },
    ])
    .returning({ id: users.id });
  owner = rows[0]!.id;
  other = rows[1]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(projects).where(eq(projects.ownerId, other));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, other));
});

async function newProject(name: string, ownerId = owner): Promise<string> {
  return (await createProject(ownerId, { name, kind: 'website' })).id;
}

function aiRequest(
  projectId: string,
  prompt: string,
  document?: unknown,
  extra: Partial<AiRequest['context']> = {},
): AiRequest {
  return {
    requestId: 'req_assemble_test',
    intent: 'design-edit',
    prompt,
    modelClass: 'balanced',
    variants: 1,
    references: [],
    approvalPolicy: [],
    dryRun: false,
    context: {
      projectId,
      selection: [],
      selectionDigest: [],
      designSystemDigest: { tokens: [], components: [] },
      recentChanges: [],
      ...extra,
      ...(document === undefined ? {} : { document: document as Record<string, unknown> }),
    },
  };
}

describe('assembleAiRequest（§67/§68：装配在服务端，文档不上线）', () => {
  it('发出去的是目录：带 designIndex 与字符数，不带整份文档', async () => {
    const id = await newProject('Assemble Wire');
    const result = await assembleAiRequest(aiRequest(id, 'Make the hero 30% taller.'), owner);
    if (!result.ok) throw new Error(`装配失败：${result.message}`);

    expect(result.wire.context.designIndex).toBeTruthy();
    expect(result.wire.context.designIndex?.totals.nodes).toBeGreaterThan(0);
    expect(result.wire.context.indexChars).toBeGreaterThan(0);
    expect(result.wire.context.budgetChars).toBeGreaterThan(0);
    // 这一条就是 §68 的全部内容：provider 侧的那一份里没有整份文档
    expect(result.wire.context.document).toBeUndefined();
    expect('document' in result.wire.context).toBe(false);
    // 目录确实比文档小，而且落在预算内
    expect(result.wire.context.indexChars!).toBeLessThanOrEqual(result.wire.context.budgetChars!);
    // 工具侧读的是权威文档本身，它不进报文；而且和目录出自同一次读取（两者必须互相对得上）
    expect(result.toolDocument.pages.length).toBe(result.wire.context.designIndex?.totals.pages);
  });

  it('代码目录随请求排序：命中理由带着，正文不在报文里（§69）', async () => {
    const id = await newProject('Assemble Code');
    const document = (await loadDocument(id))!;
    const page = createPage('结算页');
    document.pages.push(page);
    document.activePageId = page.id;
    const root = page.nodes[page.rootId]!;
    const region = createNode({ type: 'code', name: '优惠券倒计时', parentId: root.id });
    region.code = {
      language: 'tsx',
      readOnly: false,
      content: 'export function CouponCountdown() {\n  return <b>十分钟后可领</b>;\n}\nconst INTERVAL_MS = 60_000;\n',
    };
    page.nodes[region.id] = region;
    root.children.push(region.id);
    await saveDocument(id, document);

    const result = await assembleAiRequest(
      aiRequest(id, '把结算页的优惠券倒计时改短一点', undefined, { pageId: page.id, selection: [region.id] }),
      owner,
    );
    if (!result.ok) throw new Error(`装配失败：${result.message}`);
    const digest = result.wire.context.codeDigest;
    expect(digest).toBeTruthy();
    expect(digest!.files.length).toBeGreaterThan(0);
    expect(digest!.files.length).toBeLessThanOrEqual(digest!.totals.files);
    // 选中的 code-only 区域排第一：位置比措辞更可靠地指向要动的文件
    expect(digest!.files[0]!.reasons).toContain('选中节点');
    expect(digest!.files[0]!.path).toContain(region.id);
    // 命中理由说人话：为什么是这几份文件，读的人能核对
    expect(digest!.files.some((file) => file.reasons.some((reason) => reason.includes('结算页')))).toBe(true);
    // 目录里是符号名与位置，不是代码正文——那半句 §68 在代码这边同样成立
    const wire = JSON.stringify(result.wire.context);
    expect(wire).toContain('CouponCountdown');
    expect(wire).not.toContain('十分钟后可领');
    expect(wire).not.toContain('60_000');
    expect(wire).not.toContain('return <b>');
    expect(digest!.query).toBe('把结算页的优惠券倒计时改短一点');
    expect(digest!.mode).toBeNull();
  });

  it('关键词与位置都没命中时发空目录，不发一份看起来相关的猜测', async () => {
    const id = await newProject('Assemble Code Miss');
    const result = await assembleAiRequest(aiRequest(id, 'zzz 不存在的名字 qqq'), owner);
    if (!result.ok) throw new Error(`装配失败：${result.message}`);
    const digest = result.wire.context.codeDigest!;
    expect(digest.files).toEqual([]);
    expect(digest.omittedFiles).toBe(digest.totals.files);
    expect(digest.trimmed.join(' ')).toContain('没有任何文件命中');
  });

  it('客户端塞整份文档会被拒，而不是被静默忽略', async () => {
    const id = await newProject('Assemble Client Doc');
    const result = await assembleAiRequest(aiRequest(id, 'make it cinematic', { pages: [] }), owner);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('不该通过');
    expect(result.status).toBe(400);
    expect(result.code).toBe('context_document_not_allowed');
    expect(result.message).toContain('§68');
  });

  it('别人的项目：404，不泄露它的目录有多大', async () => {
    const id = await newProject('Assemble Foreign');
    const result = await assembleAiRequest(aiRequest(id, 'make it cinematic'), other);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('不该通过');
    expect(result.status).toBe(404);
    expect(result.code).toBe('project_not_found');
  });

  it('不存在或已删除的项目：装配不出目录就如实报错，不给空目录', async () => {
    const id = await newProject('Assemble Deleted');
    await getDb().update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, id));
    const result = await assembleAiRequest(aiRequest(id, 'make it cinematic'), owner);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('不该通过');
    expect([404, 409]).toContain(result.status);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('只发目录时 DEMO MODE 仍能产出补丁，并交代这次发出去的是什么', async () => {
    const id = await newProject('Assemble Demo Run');
    const assembled = await assembleAiRequest(aiRequest(id, 'make it cinematic'), owner);
    if (!assembled.ok) throw new Error(`装配失败：${assembled.message}`);

    const response = await mockProvider.run(assembled.wire, { document: assembled.toolDocument });
    expect(response.error).toBeUndefined();
    expect(response.capability).toBe('demo');
    // 配色配方要读整份文档的 token 表：证明"上下文发目录 + 工具读权威文档"这条路真的通
    expect(response.patches.flatMap((p) => p.ops).some((op) => op.op === 'setToken')).toBe(true);
    const contextLine = response.activities.find((a) => a.stage === 'context');
    expect(contextLine?.summary).toContain('发给模型的是目录');
    expect(contextLine?.summary).toContain(`${assembled.wire.context.indexChars} 字符`);
  });

  it('工具侧也没有文档时：说清楚缺的是哪一份，而不是崩或假成功', async () => {
    const id = await newProject('Assemble No Tool Doc');
    const assembled = await assembleAiRequest(aiRequest(id, 'make it cinematic'), owner);
    if (!assembled.ok) throw new Error(`装配失败：${assembled.message}`);

    const response = await mockProvider.run(assembled.wire);
    expect(response.patches).toHaveLength(0);
    expect(response.error?.code).toBe('invalid-context');
    expect(response.error?.message).toContain('权威文档');
  });
});
