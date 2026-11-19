import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { startTask } from '../src/server/domain/agent-tasks';
import { readRenderCountTotals } from '../src/server/domain/llm-savings-admin';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { agentTasks, projects, users } from '../src/server/db/schema';

/**
 * §admin 渲染账的数据库读侧集成：video.render 行 input jsonb 被求和（非法/缺键行不炸整表，计 0）。
 * 为了不限历史垃圾，全程用前后 Δ 断言，绝不假定库里初始是 0。
 */

let owner: string;
let projectId: string;
const insertedIds: string[] = [];

const insertRender = async (input: unknown) => {
  const started = await startTask({
    projectId,
    agentKey: 'video.render',
    createdById: owner,
    capability: 'real',
    input,
  });
  insertedIds.push(started.id);
  return started.id;
};

const insertDirect = async (inputJson: string, agentKey = 'video.render') => {
  const db = getDb();
  const { sql } = await import('drizzle-orm');
  const rows = await db.execute(
    sql`insert into agent_tasks (project_id, agent_key, status, capability, attempt, input, created_by, started_at, requires_approval)
        values (${projectId}::uuid, ${agentKey}, 'succeeded'::task_status, 'real'::capability_status, 1, ${inputJson}::jsonb, ${owner}::uuid, now(), false)
        returning id`,
  );
  const rowsArr = Array.isArray(rows) ? rows : (rows as { rows: Array<{ id: string }> }).rows ?? [];
  const id = rowsArr[0]?.id;
  if (!id) throw new Error('直接插 video.render 行失败');
  insertedIds.push(id as string);
  return id as string;
};

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now().toString(36);
  const [a] = await db
    .insert(users)
    .values({ displayName: 'Render Ledger Owner', email: `render-ledger+${stamp}@nexus.test` })
    .returning({ id: users.id });
  owner = a!.id;
  projectId = (await createProject(owner, { name: '渲染账集成', kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  for (const id of insertedIds) {
    await db.delete(agentTasks).where(eq(agentTasks.id, id));
  }
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

describe('readRenderCountTotals · 真库聚合（前后 Δ）', () => {
  it('两条完整 video.render 行 + 一条缺 characterPortraitCount 的老行：三项全计入、portraits 不伪造', async () => {
    const before = await readRenderCountTotals();
    await insertRender({
      shots: 12,
      totalMs: 24000,
      cardCount: 3,
      sourceReferenceCount: 6,
      characterPortraitCount: 3,
    });
    await insertRender({
      shots: 8,
      totalMs: 16000,
      cardCount: 8,
      sourceReferenceCount: 2,
      characterPortraitCount: 1,
    });
    // 老行：缺 characterPortraitCount；sourceReferenceCount 按 NULL 计（sum 忽略 NULL）
    await insertDirect(JSON.stringify({ shots: 2, totalMs: 4000, cardCount: 1, sourceReferenceCount: 1 }));

    const after = await readRenderCountTotals();
    expect(after.renders - before.renders).toBe(3);
    expect(after.shots - before.shots).toBe(22);
    expect(after.cardCount - before.cardCount).toBe(12);
    expect(after.sourceReferenceCount - before.sourceReferenceCount).toBe(9);
    expect(after.characterPortraitCount - before.characterPortraitCount).toBe(4);
  });

  it('design-edit 行混入不污染 video.render 聚合', async () => {
    const before = await readRenderCountTotals();
    await startTask({
      projectId,
      agentKey: 'design-edit',
      createdById: owner,
      capability: 'real',
      input: { shots: 999, cardCount: 999, sourceReferenceCount: 999, characterPortraitCount: 999 },
    });
    const after = await readRenderCountTotals();
    expect(after.renders).toBe(before.renders);
    expect(after.shots).toBe(before.shots);
  });

  it('坏形状行（字符/字符串 shots）不炸整个查询，按 0 计入', async () => {
    const before = await readRenderCountTotals();
    await insertDirect(JSON.stringify({ shots: 'banana', cardCount: {}, sourceReferenceCount: true, characterPortraitCount: [1] }));
    const after = await readRenderCountTotals();
    expect(after.renders - before.renders).toBe(1);
    expect(after.shots - before.shots).toBe(0);
    expect(after.cardCount - before.cardCount).toBe(0);
    expect(after.sourceReferenceCount - before.sourceReferenceCount).toBe(0);
    expect(after.characterPortraitCount - before.characterPortraitCount).toBe(0);
  });

  it('input 不是对象（整串 JSON string）也不炸：按 0 计入', async () => {
    const before = await readRenderCountTotals();
    await insertDirect('"a string not an object"');
    const after = await readRenderCountTotals();
    expect(after.renders - before.renders).toBe(1);
    expect(after.shots - before.shots).toBe(0);
  });
});
