import { describe, expect, it } from 'vitest';
import { llmPlannerEnabled, tryLlmPlan, PLANNER_FALLBACK } from '../src/server/agent/runtime';
import type { AiChatResult } from '../src/server/ai/client';
import type { AgentPlan } from '@nexus/schemas';

/**
 * §PLAN-1 接线层判据（无数据库）：`tryLlmPlan` 收一个可注入的 chat 函数，
 * 这里用假 chat 把"真模型规划成功 / 失败 / 坏形状 / 抛错"四条分支逐条钉住。
 * 真模型本体由 .plan-live 脚本用 gpt-6.2-sol 单独验证。
 */

const okChat = (text: string) => (async () => ({
  ok: true,
  response: {
    requestId: 'x', capability: 'real', provider: 'fake', model: 'gpt-6.2-sol',
    text, usage: { provider: 'fake', model: 'gpt-6.2-sol', tokensIn: 1, tokensOut: 1, cachedTokens: 0, cacheReported: false, latencyMs: 1, toolCalls: 1, demoMode: false },
  } as const,
  orchestration: null,
})) as unknown as typeof import('../src/server/ai/client').chatWithCharacter;

const failChat = (() => async () => ({
  ok: false, status: 503, error: { code: 'provider-failed', message: 'down', retryable: true }, orchestration: null,
})) as unknown as typeof import('../src/server/ai/client').chatWithCharacter;

const throwChat = (() => async () => { throw new Error('network'); }) as unknown as typeof import('../src/server/ai/client').chatWithCharacter;

const ALL = ['context','seo-audit','qa-audit','report','game','combat','level','playtest','code'];

describe('§PLAN-1 规划器接线（无 I/O，注入假 chat）', () => {
  it('开关：显式 1 开 / 0 关；未设置时生产默认开、测试默认关（隔离现有 demo 判据）', () => {
    expect(llmPlannerEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(llmPlannerEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(llmPlannerEnabled({ NODE_ENV: 'test', NEXUS_AGENT_LLM_PLANNER: '1' })).toBe(true);
    expect(llmPlannerEnabled({ NODE_ENV: 'production', NEXUS_AGENT_LLM_PLANNER: '0' })).toBe(false);
    expect(llmPlannerEnabled({ NEXUS_AGENT_LLM_PLANNER: ' 1 ' })).toBe(true);
  });

  it('确定性回退标签恒为 demo（诚实标注，§160）', () => {
    expect(PLANNER_FALLBACK).toBe('demo');
  });

  it('真模型合法回执 → 产出可执行计划', async () => {
    const plan = await tryLlmPlan('上架体检', 'rpg', okChat(JSON.stringify({ order: ALL, titles: {}, risks: [] })));
    expect(plan).not.toBeNull();
    expect(plan!.tasks.map((t) => t.id)).toEqual(ALL);
  });

  it('模型只挑子集 → 计划比全量短且顺序照 order', async () => {
    const plan = await tryLlmPlan('体检', 'rpg', okChat(JSON.stringify({ order: ['qa-audit', 'context'], titles: { context: '先盘点' }, risks: ['注意额度'] })));
    expect(plan!.tasks.map((t) => t.id)).toEqual(['qa-audit', 'context']);
    expect(plan!.tasks.find((t) => t.id === 'context')!.title).toBe('先盘点');
    expect(plan!.risks).toContain('注意额度');
  });

  it('provider 不可用 → null（调用方据此回退 demo）', async () => {
    expect(await tryLlmPlan('体检', 'rpg', failChat)).toBeNull();
  });

  it('坏形状回执（含造步骤）→ null', async () => {
    expect(await tryLlmPlan('体检', 'rpg', okChat('{"order":["context","teleport"]}'))).toBeNull();
  });

  it('网络抛错 → null，不让一次规划失败拖垮整条编排', async () => {
    expect(await tryLlmPlan('体检', 'rpg', throwChat)).toBeNull();
  });

  it('真实 chat 请求带规划专用 system 与当前目标', async () => {
    let captured: { system?: string; user?: string } | null = null;
    const spy = (async (req: { system: string; user: string }) => {
      captured = { system: req.system, user: req.user };
      return (await okChat(JSON.stringify({ order: ['context'] }))({ requestId: 'x', system: '', user: '', modelClass: 'balanced' }));
    }) as unknown as typeof import('../src/server/ai/client').chatWithCharacter;
    await tryLlmPlan('我的特别目标', 'rpg', spy);
    expect(captured).not.toBeNull();
    expect(captured!.system).toContain('任务规划器');
    expect(captured!.user).toContain('我的特别目标');
  });
});
