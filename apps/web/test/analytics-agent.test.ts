import { describe, expect, it } from 'vitest';
import { analyzeCreatorFacts, type CreatorFact, type Finding } from '../src/server/domain/analytics-agent';

/**
 * §169 的那份"为什么没人看"的规则表。
 *
 * 这一片值得逐条钉住的不是"有没有输出"，而是**什么时候不该输出**：
 * 一个分析工具最坏的样子是把"今天没有数据"讲成"你的作品有问题"，
 * 或者在作品根本没被公开的情况下教人改标题。所以每条规则都配一个反向对照。
 */

function numbers(over: Partial<CreatorFact['numbers']> = {}): CreatorFact['numbers'] {
  return {
    views: 40,
    opensToday: 3,
    visitors: 12,
    visitorsToday: 2,
    likes: 1,
    remixes: 0,
    // 基线是"一份什么都齐的作品"：连关注都有，才能把下面那条"有赞无关"的规则单独测出来
    followers: 1,
    completion: { avgPct: 72, over: 9 },
    playTimeMs: 640_000,
    cappedReports: 0,
    selfOnly: false,
    botOpens: 0,
    botVisitors: 0,
    ...over,
  };
}

function fact(over: Partial<CreatorFact> = {}): CreatorFact {
  return {
    projectName: '一份给设计师的排版检查表',
    description: '检查间距、字号层级与对比度，五分钟走完一版设计稿。',
    hasCoverImage: true,
    visibility: 'public',
    moderation: 'clear',
    publishedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    daysSincePublish: 20,
    numbers: numbers(),
    ...over,
  };
}

const areas = (out: Finding[]) => out.map((f) => f.area);

describe('analyzeCreatorFacts：一份都齐的作品不该被挑刺', () => {
  it('标题合适 / 有简介 / 有封面 / 公开且过审 / 有访客且看完过半 → 零条发现', () => {
    expect(analyzeCreatorFacts(fact())).toEqual([]);
  });

  it('每条发现都必须同时给出事实、结论与动作（不许留空着的那一栏）', () => {
    const out = analyzeCreatorFacts(fact({ projectName: '未命名项目', description: null, hasCoverImage: false }));
    expect(out.length).toBeGreaterThan(0);
    for (const finding of out) {
      expect(finding.evidence.trim().length).toBeGreaterThan(0);
      expect(finding.conclusion.trim().length).toBeGreaterThan(0);
      expect(finding.action.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('先问能不能被看到', () => {
  it('审核没过：这一条排在最前，因为它让后面的转化率建议失去意义', () => {
    const out = analyzeCreatorFacts(fact({ moderation: 'review', projectName: '未命名项目' }));
    expect(out[0]?.area).toBe('settings');
    expect(out[0]?.evidence).toContain('review');
    // pending / review 不能被讲成"被搜索挡掉"：今天全平台搜索只挡 rejected 那一档，
    // 把"还没裁决"讲成"被惩罚"是这条规则最容易编出来的谎
    expect(out[0]?.conclusion).toContain('不是"没人看"的直接原因');
  });

  it('被驳回时说的才是"入口被关掉"', () => {
    const out = analyzeCreatorFacts(fact({ moderation: 'rejected' }));
    expect(out[0]?.evidence).toContain('驳回');
    expect(out[0]?.conclusion).toContain('不会出现在全平台搜索');
  });

  it('过审的同一份事实里没有这一条（反向对照）', () => {
    expect(areas(analyzeCreatorFacts(fact()))).not.toContain('settings');
  });

  it('仅链接可见：说清"没人看"是这个设置的预期结果', () => {
    const out = analyzeCreatorFacts(fact({ visibility: 'unlisted' }));
    expect(out.some((f) => f.area === 'settings' && f.evidence.includes('仅链接可见'))).toBe(true);
  });
});

describe('流量那一条的三种口径不能混', () => {
  it('零访客且发布已久 → 问题在"没被看到"', () => {
    const out = analyzeCreatorFacts(fact({ numbers: numbers({ visitors: 0, views: 0 }), daysSincePublish: 30 }));
    const traffic = out.find((f) => f.area === 'traffic');
    expect(traffic?.evidence).toContain('发布 30 天');
    expect(traffic?.conclusion).toContain('没有被看到');
  });

  it('零访客但刚发布 → 同一件事说成"现在下结论太早"，不教人改标题', () => {
    const out = analyzeCreatorFacts(fact({ numbers: numbers({ visitors: 0, views: 0 }), daysSincePublish: 2 }));
    expect(out.find((f) => f.area === 'traffic')?.conclusion).toContain('太早');
  });

  it('访客只有作者自己 → 既不说"没人看"也不说"有人在看"', () => {
    const out = analyzeCreatorFacts(fact({ numbers: numbers({ visitors: 1, views: 9, selfOnly: true }) }));
    const traffic = out.find((f) => f.area === 'traffic');
    expect(traffic?.evidence).toContain('都是你本人');
    expect(traffic?.conclusion).toContain('不能当成');
    // 反向：这一条与"零访客"那条互斥，同时挂两句就是自相矛盾
    expect(traffic?.evidence).not.toContain('独立访客 0 人');
  });
});

describe('留下来的那部分人', () => {
  it('平均只看到 30% → Retention 那条带着这个数', () => {
    const out = analyzeCreatorFacts(fact({ numbers: numbers({ completion: { avgPct: 30, over: 6 } }) }));
    expect(out.find((f) => f.area === 'retention')?.evidence).toContain('30%');
  });

  it('看完过半时不硬凑这一条（反向对照）', () => {
    expect(areas(analyzeCreatorFacts(fact()))).not.toContain('retention');
  });

  it('没有心跳就说"没采到"，不拿 views 换算一个百分比出来', () => {
    const out = analyzeCreatorFacts(fact({ numbers: numbers({ completion: null, playTimeMs: null }) }));
    const retention = out.filter((f) => f.area === 'retention');
    expect(retention.length).toBe(2);
    expect(JSON.stringify(retention)).toContain('没有采到');
    expect(JSON.stringify(retention)).toContain('不拿 views 换算');
  });
});

describe('门面三件与沉淀', () => {
  it('名字过长会被截断，正常长度不提这件事', () => {
    const long = '一个'.repeat(40);
    expect(long.length).toBeGreaterThan(60);
    expect(analyzeCreatorFacts(fact({ projectName: long }))[0]?.area).toBe('title');
    expect(areas(analyzeCreatorFacts(fact({ projectName: '排版检查表' })))).not.toContain('title');
  });

  it('没封面 → 说清 og:image 不放、分享卡片是裸的', () => {
    const out = analyzeCreatorFacts(fact({ hasCoverImage: false }));
    expect(out.find((f) => f.area === 'thumbnail')?.evidence).toContain('og:image');
  });

  it('简介过长只提醒截断，不要求删掉', () => {
    const out = analyzeCreatorFacts(fact({ description: `一句话简介。${'补充'.repeat(150)}` }));
    expect(out.find((f) => f.area === 'description')?.action).toContain('前 200 字');
  });

  it('有人点赞但没人关注 → 缺的是"接下来还有什么"', () => {
    const out = analyzeCreatorFacts(fact({ numbers: numbers({ likes: 3, followers: 0 }) }));
    expect(out.some((f) => f.area === 'traffic' && f.evidence.includes('3 次点赞'))).toBe(true);
    // 反向对照：有人关注时这一条不该出现
    expect(areas(analyzeCreatorFacts(fact({ numbers: numbers({ likes: 3, followers: 2 }) })))).not.toContain('traffic');
  });
});
