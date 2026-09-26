import { describe, expect, it } from 'vitest';
import { agentLedgerFields, mentionNote, resolveAgent, findAgent, type AgentRosterEntry } from '../src/server/domain/agents';

/**
 * §112 名册解析的纯逻辑部分（不碰库）。
 *
 * 这片为什么值得单独一份：解析顺序、`@` 的写法差异、以及"没认出来的提及不许静默丢掉"
 * 都是**读代码看不出错、跑起来才错**的东西。集成测试读的是真名册，一旦库里那 13 行变了，
 * 断言就跟着漂；这里用一份手写的三名名册，把规则本身钉住。
 */

const ROSTER: AgentRosterEntry[] = [
  { key: 'design', name: 'Design Agent', responsibilities: ['规划并修改设计模型'], capabilities: ['design.read', 'design.patch'] },
  { key: 'qa', name: 'QA Agent', responsibilities: ['只提问题，不改设计文档'], capabilities: ['browser.read', 'test.run'] },
  { key: 'content', name: 'Content Agent', responsibilities: ['写与改文案'], capabilities: ['content.write'] },
];

describe('findAgent：提及的写法差异', () => {
  it('带 @、带尾缀 Agent、大写都认得', () => {
    for (const raw of ['design', '@design', '@Design', '@Design Agent', ' design ']) {
      expect(findAgent(ROSTER, raw)?.key).toBe('design');
    }
  });

  it('认不出就是 null，不猜一个"最像的"', () => {
    // 反向对照：把名册里真的有的 key 交给同一个函数，它是找得到的——
    // 于是上面那条 null 不是"整个函数永远返回 null"
    expect(findAgent(ROSTER, 'deisgn')).toBeNull();
    expect(findAgent(ROSTER, '')).toBeNull();
    expect(findAgent(ROSTER, undefined)).toBeNull();
    expect(findAgent(ROSTER, '@design')?.key).toBe('design');
  });
});

describe('resolveAgent：这一轮交给谁', () => {
  it('提示词里的 @qa 决定这一轮（不靠请求里那一栏）', () => {
    const r = resolveAgent(ROSTER, { prompt: '@qa 看一下这个按钮的高度' });
    expect(r.agent?.key).toBe('qa');
    expect(r.unknown).toEqual([]);
  });

  it('显式提名优先于提示词里的提及', () => {
    const r = resolveAgent(ROSTER, { agentKey: 'content', prompt: '@qa 看一下' });
    expect(r.agent?.key).toBe('content');
    // qa 也被点到了，它没有静默消失
    expect(r.ignored).toEqual(['qa']);
  });

  it('没提名时，批注里的 @design 也算', () => {
    const r = resolveAgent(ROSTER, { prompt: '这个区块太高了', annotations: ['这个按钮太大', '@design 顺手把圆角统一一下'] });
    expect(r.agent?.key).toBe('design');
  });

  it('三处都没有就是 null：不硬塞一个 Design Agent 当默认值', () => {
    const r = resolveAgent(ROSTER, { prompt: '把 hero 提高 30%' });
    expect(r.agent).toBeNull();
    expect(r.unknown).toEqual([]);
    expect(r.rosterEmpty).toBe(false);
  });

  it('点错了的名字要报出来，而不是当成"没人点过"', () => {
    const r = resolveAgent(ROSTER, { prompt: '@fy 帮忙改一下' });
    expect(r.agent).toBeNull();
    expect(r.unknown).toEqual(['@fy']);
  });

  it('提名是错的名字、提示词里有一位对的：用对的那位，同时把错的报出来', () => {
    const r = resolveAgent(ROSTER, { agentKey: 'deisgn', prompt: '@qa 检查' });
    expect(r.agent?.key).toBe('qa');
    expect(r.unknown).toEqual(['@deisgn']);
  });

  it('同一个名字点两次只算一次', () => {
    const r = resolveAgent(ROSTER, { prompt: '@qa 看看 @qa 顺便' });
    expect(r.agent?.key).toBe('qa');
    expect(r.ignored).toEqual([]);
  });

  it('名册是空的：这是"还没播种"，不是"谁都不认识"', () => {
    const r = resolveAgent([], { prompt: '@design 改一下' });
    expect(r.agent).toBeNull();
    expect(r.rosterEmpty).toBe(true);
    expect(r.unknown).toEqual(['@design']);
  });

  it('邮箱与 @media 这种不是提及的 @ 不会被当成点名', () => {
    // 正则要求 @ 前面是行首或空白：`a@b.com` 里的 @ 有前缀字母，不算
    const r = resolveAgent(ROSTER, { prompt: '联系 a@b.com 与邮箱someone@design.com' });
    expect(r.agent).toBeNull();
    expect(r.unknown).toEqual([]);
  });
});

describe('agentLedgerFields + mentionNote：账本那几栏与要说的一句', () => {
  const resolved = resolveAgent(ROSTER, { agentKey: 'qa', prompt: '@qa 检查 @design 也看看' });

  it('没人被点名时 agentKey 退回意图类别，agent 那一栏是 null', () => {
    const fields = agentLedgerFields(resolveAgent(ROSTER, { prompt: '改圆角' }), { fallbackKey: 'design-edit' });
    expect(fields.agentKey).toBe('design-edit');
    expect(fields.agent).toBeNull();
    expect(fields.askedAgentKey).toBeNull();
  });

  it('被点名时两边都写：agentKey 是名册 key，agent 带名字', () => {
    const fields = agentLedgerFields(resolved, { askedAgentKey: 'qa', fallbackKey: 'design-edit' });
    expect(fields.agentKey).toBe('qa');
    expect(fields.agent).toEqual({ key: 'qa', name: 'QA Agent' });
    expect(fields.ignoredMentions).toEqual(['design']);
  });

  it('提及没问题时 mentionNote 是 null——没话找话的提示没人读', () => {
    expect(mentionNote(agentLedgerFields(resolveAgent(ROSTER, { prompt: '@qa 看' }), { fallbackKey: 'x' }))).toBeNull();
  });

  it('点错了名字要说得出是哪几个', () => {
    const note = mentionNote({ agent: null, unknownMentions: ['@fy'], ignoredMentions: [], rosterEmpty: false });
    expect(note).toContain('@fy');
  });

  it('名册为空时说的是播种，不是"名册里没有 @design"', () => {
    const note = mentionNote({ agent: null, unknownMentions: ['@design'], ignoredMentions: [], rosterEmpty: true });
    expect(note).toContain('db:seed');
  });

  it('被忽略的那几位也报得出名字', () => {
    const note = mentionNote({ agent: { key: 'qa', name: 'QA Agent' }, unknownMentions: [], ignoredMentions: ['design'], rosterEmpty: false });
    expect(note).toContain('@design');
    expect(note).toContain('QA Agent');
  });
});
