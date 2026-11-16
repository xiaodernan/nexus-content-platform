import { describe, expect, it } from 'vitest';
import { buildCreatorDigest, AGENT_NARRATE_SYSTEM_PROMPT } from '../src/server/domain/analytics-agent-ai';
import type { CreatorFact } from '../src/server/domain/analytics-agent';
import type { Finding } from '../src/server/domain/analytics-agent';

/**
 * §169-AI · 创作者 digest 构造纯函数门：
 * - digest 是大模型唯一的数据源；任何/个人字段都不进来 —— 这条门死的东西就是它；
 * - 所有数字必须原样透传（模型被禁止重算）。
 */
const fact: CreatorFact = {
  projectName: 'Demo World',
  description: 'a world you can walk',
  hasCoverImage: true,
  visibility: 'public',
  moderation: 'clear',
  publishedAt: '2026-10-20T00:00:00.000Z',
  daysSincePublish: 28,
  hasGame: false,
  numbers: {
    views: 4212,
    opensToday: 3,
    visitors: 780,
    visitorsToday: 2,
    likes: 33,
    remixes: 2,
    followers: 12,
    completion: { avgPct: 58.4, over: 210 },
    playTimeMs: 1_800_000,
    cappedReports: 0,
    selfOnly: false,
    botOpens: 300,
    botVisitors: 100,
    completedVisitors: 21,
    botCompletions: 4,
    selfCompleted: false,
  } as never,
};

const findings: Finding[] = [
  { area: 'title', evidence: '项目名 25 字（短名 ≥ 8 字才有「点」钩）', conclusion: '埋点可能漏了', action: '按下「编辑标题」改一个更短、钩子先行的名字' },
];

describe('§169-AI buildCreatorDigest', () => {
  it('包含所有关键数字（原样而不重算）', () => {
    const out = buildCreatorDigest(fact, findings);
    expect(out).toContain('views=4212');
    expect(out).toContain('visitors=780');
    expect(out).toContain('botOpens=300');
    expect(out).toContain('selfOnly=false');
    expect(out).toContain('finding#1 area=title');
    expect(out).toContain('END OF FACT DIGEST');
  });

  it('不含任何个人标识字段（/user/email/ip）', () => {
    const out = buildCreatorDigest(fact, findings);
    expect(out).not.toContain('@nexus.local');
    expect(out).not.toContain('userId');
    expect(out).not.toContain('email');
    expect(out).not.toContain('uid');
  });

  it('selfOnly=true 时数字被如实照实贴出（不是被抹掉）', () => {
    const onlyYou = { ...fact, numbers: { ...fact.numbers, selfOnly: true, selfCompleted: true } };
    const out = buildCreatorDigest(onlyYou, findings);
    expect(out).toContain('selfOnly=true');
    expect(out).toContain('selfCompleted=true');
  });

  it('系统提示词写死了 aggregate-only 禁区', () => {
    expect(AGENT_NARRATE_SYSTEM_PROMPT).toContain('Never invent data');
    expect(AGENT_NARRATE_SYSTEM_PROMPT).toContain('只有作者自己');
    expect(AGENT_NARRATE_SYSTEM_PROMPT).toContain('One action only');
  });
});
