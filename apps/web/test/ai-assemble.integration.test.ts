import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import type { AiRequest } from '@nexus/schemas';
import { assembleAiRequest } from '../src/server/ai/assemble';
import { mockProvider } from '../src/server/ai/mock';
import { createProject } from '../src/server/domain/projects';
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

function aiRequest(projectId: string, prompt: string, document?: unknown): AiRequest {
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
    // 工具侧读的是权威文档本身，它不进报文
    expect(result.toolDocument?.pages.length).toBeGreaterThan(0);
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

    const response = await mockProvider.run(assembled.wire, { document: assembled.toolDocument ?? undefined });
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
