import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { readCostLedger } from '../src/server/domain/costLedger';
import { startTask, recordTaskUsage } from '../src/server/domain/agent-tasks';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { agentTasks, projects, users } from '../src/server/db/schema';

/**
 * §COST-1 wire 集成：costLedger 读到的是 task 行里 `usage` 列真实报过账的东西——
 * 一次带 costBasis='configured'（真按表计价） + 一次带池外 unknown + 一次没写 usage 的 legacy。
 * 144 行对账本说"没法判断"，这一片给 judge 一份带三种口径混合的真数据验一下。
 */

let ownerId: string;
let projectId: string;

const configuredUsage = {
  provider: 'openai-compatible',
  model: 'gpt-6-sol',
  modelClass: 'balanced',
  tokensIn: 40,
  tokensOut: 10,
  cachedTokens: 8,
  cacheReported: true,
  costBasis: 'configured',
  costUsd: 0.00042,
  latencyMs: 100,
  toolCalls: 1,
  demoMode: false,
};

const unknownUsage = { ...configuredUsage, costBasis: 'unknown', costUsd: 0 };

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now().toString(36);
  const [u] = await db
    .insert(users)
    .values({ displayName: 'Cost Judge', email: `cost+${stamp}@nexus.test`, handle: `cost${stamp}` })
    .returning({ id: users.id });
  ownerId = u!.id;
  projectId = (await createProject(ownerId, { name: '成本账本', kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

const startAndRecord = async (usage: unknown) => {
  const started = await startTask({
    projectId,
    agentKey: 'design-edit',
    createdById: ownerId,
    capability: 'real',
    input: { prompt: '哈希一下' },
  });
  if (usage !== null) await recordTaskUsage(started.id, usage);
  return started.id;
};

describe('readCostLedger · 真库对账', () => {
  it('按 costBasis 拆开：configured / unknown / legacy 三档各自成队', async () => {
    await startAndRecord(configuredUsage);
    await startAndRecord(unknownUsage);
    await startAndRecord(null);

    const ledger = await readCostLedger(24);
    expect(ledger.rows).toBeGreaterThanOrEqual(3);
    expect(ledger.byBasis.find((r) => r.basis === 'configured')).toBeDefined();
    expect(ledger.byBasis.find((r) => r.basis === 'unknown')).toBeDefined();
    expect(ledger.byBasis.find((r) => r.basis === 'legacy')).toBeDefined();

    const configured = ledger.byBasis.find((r) => r.basis === 'configured')!;
    expect(configured.n).toBeGreaterThanOrEqual(1);
    expect(configured.sumUsd).toBeGreaterThan(0);
    expect(configured.cachedSharePct).not.toBeNull();

    const unknown = ledger.byBasis.find((r) => r.basis === 'unknown')!;
    expect(unknown.n).toBeGreaterThanOrEqual(1);
    expect(unknown.sumUsd).toBe(0);
  });

  it('只读不写：这一页不记任何 usage', async () => {
    // 读之前先记一行 exact-known 的行，再读一次，确认是同一批列举里的东西
    const before = (await readCostLedger(24)).rows;
    const id = await startAndRecord(configuredUsage);
    const after = (await readCostLedger(24)).rows;
    expect(after).toBe(before + 1);
    // 读操作本身没新写任何 usage —— 把刚才那条可见删掉，列表不变
    const db = getDb();
    await db.delete(agentTasks).where(eq(agentTasks.id, id));
    expect((await readCostLedger(24)).rows).toBe(before);
  });
});
