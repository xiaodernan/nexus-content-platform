import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { recordTaskUsage, startTask } from '../src/server/domain/agent-tasks';
import { projectSavings } from '../src/server/domain/savings';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §v699 节省账单的数据库读侧集成：两行 usage（一行新账本带 cachedTokens、
 * 一行旧账本缺该字段）+ 三门行为（项目 owner / 别人的项目 / 无效 id）。
 */

let owner: string;
let stranger: string;
let projectId: string;
const configured = {
  provider: 'openai-compatible',
  model: 'gpt-6-sol',
  modelClass: 'balanced',
  tokensIn: 1000,
  tokensOut: 60,
  cachedTokens: 700,
  cacheReported: true,
  costBasis: 'configured',
  costUsd: 0.002,
  latencyMs: 50,
  toolCalls: 0,
  demoMode: false,
  reasoningTokens: 0,
};
/** 模拟 v692 之前写的账本行（usage jsonb 里没有 cachedTokens 键）——直接 SQL 写，recordTaskUsage 会被 zod default 补 0 */
const insertLegacyRowDirectly = async (startedId: string) => {
  const db = getDb();
  const { sql } = await import('drizzle-orm');
  await db.execute(
    sql`update agent_tasks set usage = ${JSON.stringify({
      provider: 'openai-compatible',
      model: 'gpt-6-sol',
      modelClass: 'balanced',
      tokensIn: 2000,
      tokensOut: 80,
      costUsd: 0.001,
      costBasis: 'unknown',
      toolCalls: 0,
      demoMode: false,
      latencyMs: 42,
    })}::jsonb where id::text = ${startedId}`,
  );
};

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now().toString(36);
  const [a] = await db
    .insert(users)
    .values({ displayName: 'Savings Owner', email: `savings-owner+${stamp}@nexus.test` })
    .returning({ id: users.id });
  const [b] = await db
    .insert(users)
    .values({ displayName: 'Savings Stranger', email: `savings-stranger+${stamp}@nexus.test` })
    .returning({ id: users.id });
  owner = a!.id;
  stranger = b!.id;
  projectId = (await createProject(owner, { name: '节省账单', kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, stranger));
});

const addTask = async (usage: unknown | null) => {
  const started = await startTask({
    projectId,
    agentKey: 'design-edit',
    createdById: owner,
    capability: 'real',
    input: { prompt: '缓存一下' },
  });
  if (usage !== null) await recordTaskUsage(started.id, usage);
  return started.id;
};

describe('projectSavings · 真库累计', () => {
  it('新账两行（1 新 usage 带 cachedTokens + 1 旧账缺该字段）被正确聚合，legacy 行不算成 0 命中', async () => {
    await addTask(configured);
    const legacyId = await startTask({
      projectId,
      agentKey: 'design-edit',
      createdById: owner,
      capability: 'real',
      input: { prompt: '旧账本行' },
    });
    await insertLegacyRowDirectly(legacyId.id);
    const result = await projectSavings(projectId, owner);
    expect(result).not.toBeNull();
    // 该项目至少有：1 新账 + 1 旧账 = 2 turns（可能更多历史任务，但新建的这两行一定在内）
    expect(result!.turns).toBeGreaterThanOrEqual(2);
    expect(result!.cachedTokens).toBeGreaterThanOrEqual(700);
    expect(result!.tokensIn).toBeGreaterThanOrEqual(1000);
    // hitRate 只允许在有分母时计算
    expect(result!.hitRate).not.toBeNull();
    expect(result!.hitRate!).toBeGreaterThan(0);
    expect(result!.legacyRows).toBeGreaterThanOrEqual(1);
  });

  it('别人的项目拿 NULL，不需要 404 也不给账', async () => {
    expect(await projectSavings(projectId, stranger)).toBeNull();
  });

  it('坏 uuid 返回 NULL', async () => {
    expect(await projectSavings('not-a-uuid', owner)).toBeNull();
  });

  it('没跑过任何 AI 的空项目：turns=0、hitRate=null，不渲染 0% 冒充', async () => {
    const db = getDb();
    const stamp = Date.now().toString(36);
    const [u] = await db
      .insert(users)
      .values({ displayName: 'Savings Empty', email: `savings-empty+${stamp}@nexus.test` })
      .returning({ id: users.id });
    const p = (await createProject(u!.id, { name: '空账单', kind: 'website' })).id;
    const result = await projectSavings(p, u!.id);
    expect(result).not.toBeNull();
    expect(result!.turns).toBe(0);
    expect(result!.hitRate).toBeNull();
    await db.delete(projects).where(eq(projects.ownerId, u!.id));
    await db.delete(users).where(eq(users.id, u!.id));
  });
});
