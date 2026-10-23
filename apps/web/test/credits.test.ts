import { describe, expect, it } from 'vitest';
import {
  CREDIT_KINDS,
  CREDIT_KIND_LABELS,
  ENFORCED_PLAN_AXES,
  GENERATION_COST,
  PLAN_KEYS,
  PLAN_LIMITS,
  PLAN_MONTHLY_GRANTS,
  UNENFORCED_PLAN_AXES,
  balanceOf,
  concurrentPublishLimit,
  creditKindForAgentKey,
  isPlanKey,
  monthPeriod,
  humanBytes,
  pendingGrants,
  refusalFor,
  refusalForPublishSlot,
  refusalForStorage,
  storageLimitBytes,
  videoRenderQuota,
} from '../src/server/domain/credits';

/**
 * §133 / §134 的规则层单测。这一层是纯的，所以这些用例不需要库、不需要 provider。
 *
 * 写法的两条纪律（都是这个项目里吃过亏的地方）：
 * - **表格与实现对齐**：凡"每个档位 × 每一类额度都要有数"这种整体形状，钉成一条断言，
 *   漏一格就会红，而不是等界面读到 undefined 才炸；
 * - **反向对照要改变被对照的那个量**：每个负面断言旁边都要有一个"只改一个输入"的正面版本，
 *   否则那条断言可能只是恒真（比如一个永远返回同一类别的函数也能让"不是 video"通过）。
 */
describe('§134 五类额度与档位表（纯规则）', () => {
  it('五类就是 §134 原文点名的五类，顺序也是余额页读的顺序', () => {
    expect([...CREDIT_KINDS]).toEqual(['ai', 'image', 'video', 'compute', 'marketplace']);
    expect(CREDIT_KIND_LABELS.ai).toBe('AI credits');
    expect(CREDIT_KIND_LABELS.compute).toBe('Compute credits');
  });

  it('每一档对每一类都有发放数与上限——漏一格就不许绿', () => {
    for (const plan of PLAN_KEYS) {
      expect(Object.keys(PLAN_MONTHLY_GRANTS[plan]).sort()).toEqual([...CREDIT_KINDS].sort());
      expect(Object.keys(PLAN_LIMITS[plan]).length).toBe(3);
      for (const kind of CREDIT_KINDS) {
        if (kind === 'marketplace') {
          // marketplace 不发放额度，值为 0 占位
          expect(PLAN_MONTHLY_GRANTS[plan][kind]).toBe(0);
        } else {
          expect(PLAN_MONTHLY_GRANTS[plan][kind]).toBeGreaterThan(0);
        }
      }
    }
    // 反向对照：档位表里没有这一档，isPlanKey 要说不认（不是靠 PLAN_KEYS 恰好有它）
    expect(isPlanKey('free')).toBe(true);
    expect(isPlanKey('ultra')).toBe(false);
  });

  it('单价表覆盖五类，且都是正整数（marketplace 为 0 占位）', () => {
    expect(Object.keys(GENERATION_COST).sort()).toEqual([...CREDIT_KINDS].sort());
    for (const kind of CREDIT_KINDS) {
      if (kind === 'marketplace') {
        expect(GENERATION_COST[kind]).toBe(0);
      } else {
        expect(GENERATION_COST[kind]).toBeGreaterThan(0);
      }
    }
  });

  it('§133 那五件事两列合起来一格不多一格不少，今天有拦截方的是 AI usage / storage / generation / publishing', () => {
    // §133 原文列的五件事：AI usage / storage / generation / team collaboration / publishing。
    // 这条断言钉的是"已生效 + 还没拦截方 = 那五件事，一格不多一格不少"，
    // 挡的是那种把表格上的上限说成已生效的写法——storage 从下一列挪上来时，这里必须跟着改。
    const FIVE_AXES = ['aiUsage', 'storage', 'generation', 'teamCollaboration', 'publishing'];
    expect([...ENFORCED_PLAN_AXES, ...UNENFORCED_PLAN_AXES].sort()).toEqual([...FIVE_AXES].sort());
    // #196：generation 从下一列升上来——#191 落成的渲染链额度门（refusalForRun）是它的拦截方
    // #199：publishing 也升上来了——publishProject 落行前的名额门（refusalForPublishSlot）是它的拦截方
    expect(ENFORCED_PLAN_AXES).toEqual(['aiUsage', 'storage', 'generation', 'publishing']);
    expect(UNENFORCED_PLAN_AXES).toEqual(['teamCollaboration']);
  });
});

describe('videoRenderQuota：§133 generation 那一格在 render 链上的呈现（#196）', () => {
  it('free 档：每月 5 点、一次 5 点 → 余额 5 点时还可渲 1 次', () => {
    const view = videoRenderQuota('free', 5);
    expect(view.plan).toBe('free');
    expect(view.planLabel).toBe('Free');
    expect(view.monthlyGrant).toBe(PLAN_MONTHLY_GRANTS.free.video);
    expect(view.costPerRender).toBe(GENERATION_COST.video);
    expect(view.balance).toBe(5);
    expect(view.rendersLeft).toBe(1);
  });

  it('余额不是一次的整数倍时向下取整（3 点够不了一次，不能四舍五入成 1）', () => {
    expect(videoRenderQuota('free', 3).rendersLeft).toBe(0);
    expect(videoRenderQuota('free', 9).rendersLeft).toBe(1);
    expect(videoRenderQuota('pro', 83).rendersLeft).toBe(16);
  });

  it('负数余额夹到 0，不显示"-1 次"', () => {
    expect(videoRenderQuota('free', -5).rendersLeft).toBe(0);
    expect(videoRenderQuota('free', 0).rendersLeft).toBe(0);
  });

  it('每一档的呈现都直接转述发放表与成本表——展示与门不许有两份数', () => {
    for (const plan of PLAN_KEYS) {
      const granted = PLAN_MONTHLY_GRANTS[plan].video;
      const view = videoRenderQuota(plan, granted);
      expect(view.monthlyGrant).toBe(granted);
      expect(view.costPerRender).toBe(GENERATION_COST.video);
      // 刚发完的这个月：还可渲次数 = 发放数 / 单次成本（向下取整）
      expect(view.rendersLeft).toBe(Math.floor(granted / GENERATION_COST.video));
    }
  });
});

describe('§134 一次生成算在哪一类上', () => {
  it('带 video / image 字样的 agent 走对应额度，其余一律按 AI 计', () => {
    expect(creditKindForAgentKey('video-agent')).toBe('video');
    expect(creditKindForAgentKey('Storyboard Agent')).toBe('video');
    expect(creditKindForAgentKey('image-studio')).toBe('image');
    expect(creditKindForAgentKey('cover-maker')).toBe('image');
    expect(creditKindForAgentKey('design-agent')).toBe('ai');
  });

  it('反向对照：把关键字削掉一个字，类别必须翻回 ai——证明命中靠的是子串而不是恒返回某一类', () => {
    // 反例要"整个关键字消失"才成立：`videos-agent` 仍然算 video，因为 `video` 就是 `videos` 的子串。
    // 上一版拿它当反例，跑出来是红的——那是测试写错，不是分派写错。
    expect(creditKindForAgentKey('video-agent')).toBe('video');
    expect(creditKindForAgentKey('vide-agent')).toBe('ai');
    expect(creditKindForAgentKey('film-agent')).toBe('video');
    expect(creditKindForAgentKey('filn-agent')).toBe('ai');
    expect(creditKindForAgentKey('image-agent')).toBe('image');
    expect(creditKindForAgentKey('mage-agent')).toBe('ai');
    expect(creditKindForAgentKey('videos-agent')).toBe('video');
  });
});

describe('§134 余额、发放与拒绝', () => {
  it('余额就是这一类流水的和，正负都算，别的类不影响它', () => {
    const rows = [
      { kind: 'ai' as const, delta: 100 },
      { kind: 'ai' as const, delta: -1 },
      { kind: 'image' as const, delta: 20 },
      { kind: 'image' as const, delta: -2 },
    ];
    expect(balanceOf(rows, 'ai')).toBe(99);
    // 反向对照：只改 image 那一行，ai 的余额不许动
    expect(balanceOf([...rows.slice(0, 2), { kind: 'image', delta: 999 }], 'ai')).toBe(99);
    expect(balanceOf(rows, 'video')).toBe(0);
  });

  it('月份键用 UTC，跨年那几个小时不许按本地时区记', () => {
    expect(monthPeriod(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01');
    // 2026-12-31T23:30Z 在东八区已经是 2027-01-01 早上：按 UTC 记才是 2026-12
    expect(monthPeriod(new Date(Date.UTC(2026, 11, 31, 23, 30)))).toBe('2026-12');
    expect(monthPeriod(new Date(Date.UTC(2027, 0, 1, 0, 30)))).toBe('2027-01');
  });

  it('发过的类不再发，没发过的补齐', () => {
    const all = pendingGrants('free', '2026-09', new Set());
    // marketplace grant 是 0，被 pendingGrants 过滤掉了，只剩 4 类；顺序跟随 CREDIT_KINDS
    const expectedKinds = [...CREDIT_KINDS].filter((k) => PLAN_MONTHLY_GRANTS.free[k] > 0);
    expect(all.map((g) => g.kind)).toEqual(expectedKinds);
    expect(all[0]?.delta).toBe(PLAN_MONTHLY_GRANTS.free.ai);
    expect(all[0]?.reason).toContain('2026-09');
    // 反向对照：只把 ai 记成已发，回来的必须少了 ai 那一行，其它三行不动
    const minusAi = pendingGrants('free', '2026-09', new Set(['ai']));
    expect(minusAi.map((g) => g.kind)).toEqual(expectedKinds.filter((k) => k !== 'ai'));
    expect(pendingGrants('free', '2026-09', new Set(CREDIT_KINDS))).toEqual([]);
  });

  it('点不够就不许跑，且拒绝的话里带着两个数字', () => {
    const broke = refusalFor({ kind: 'ai', cost: 1, balance: 0 });
    expect(broke).toContain('1 点');
    expect(broke).toContain('0 点');
    expect(broke).toContain('AI credits');
    // 反向对照：只把余额从 0 改成 1，同一条检查必须放行
    expect(refusalFor({ kind: 'ai', cost: 1, balance: 1 })).toBeNull();
    // 一次要 5 点的视频，4 点余额仍然被拒（不是"大于 0 就放行"）
    expect(refusalFor({ kind: 'video', cost: GENERATION_COST.video, balance: GENERATION_COST.video - 1 })).not.toBeNull();
    expect(refusalFor({ kind: 'video', cost: GENERATION_COST.video, balance: GENERATION_COST.video })).toBeNull();
  });
});

describe('§133 storage 那一格：放不下就拒绝新写入，拒绝的话里带数字', () => {
  it('五档的上限都是同一处 1024 进制换算出来的，且随档位单调递增', () => {
    expect(storageLimitBytes('free')).toBe(200 * 1024 * 1024);
    expect(storageLimitBytes('enterprise')).toBe(204800 * 1024 * 1024);
    for (let i = 1; i < PLAN_KEYS.length; i += 1) {
      expect(storageLimitBytes(PLAN_KEYS[i]!)).toBeGreaterThan(storageLimitBytes(PLAN_KEYS[i - 1]!));
    }
  });

  it('刚好放得下就放行，多 1 个字节就拒（边界在 used + incoming 上，不在单个数上）', () => {
    const limit = storageLimitBytes('free');
    expect(refusalForStorage({ plan: 'free', usedBytes: limit - 10, incomingBytes: 10 })).toBeNull();
    const over = refusalForStorage({ plan: 'free', usedBytes: limit - 10, incomingBytes: 11 });
    expect(over).not.toBeNull();
    // 拒绝的话必须自带数字：用户得知道该删一点还是删很多
    expect(over).toContain('Free 档上限 200MB');
    expect(over).toContain('已用');
    expect(over).toContain('这一次还要');
    // 同一个用量，换到上限更大的档位就不再被拒——证明看的是档位，而不是"有没有占地方"
    expect(refusalForStorage({ plan: 'pro', usedBytes: limit - 10, incomingBytes: 11 })).toBeNull();
  });

  it('storage 进了"真的会拦"那一列，就从"还没拦截方"那一列里出去，两列加起来仍是 §133 那五件事', () => {
    expect((ENFORCED_PLAN_AXES as readonly string[]).includes('storage')).toBe(true);
    expect((UNENFORCED_PLAN_AXES as readonly string[]).includes('storage')).toBe(false);
    expect([...ENFORCED_PLAN_AXES, ...UNENFORCED_PLAN_AXES].sort()).toEqual([
      'aiUsage',
      'generation',
      'publishing',
      'storage',
      'teamCollaboration',
    ]);
    // 同一件事不许同时出现在两列里（界面上那一段读的就是这两列）
    for (const axis of ENFORCED_PLAN_AXES) {
      expect((UNENFORCED_PLAN_AXES as readonly string[]).includes(axis)).toBe(false);
    }
  });

  it('给人看的字节数保留一位小数——它只用于显示，比较一律用字节', () => {
    expect(humanBytes(200 * 1024 * 1024)).toBe('200MB');
    expect(humanBytes(1536 * 1024)).toBe('1.5MB');
  });
});


describe('refusalForPublishSlot：§133 publishing 那一格的准入闸（#199）', () => {
  it('五档的名额都直接转述 PLAN_LIMITS，且随档位单调递增', () => {
    expect(concurrentPublishLimit('free')).toBe(1);
    expect(concurrentPublishLimit('pro')).toBe(5);
    for (let i = 1; i < PLAN_KEYS.length; i += 1) {
      expect(concurrentPublishLimit(PLAN_KEYS[i]!)).toBeGreaterThan(concurrentPublishLimit(PLAN_KEYS[i - 1]!));
    }
  });

  it('没满就放行；正好占满才拒（边界在 activeCount 上，带数字的拒绝话）', () => {
    // free 档上限 1：0 个挂着 → 放行
    expect(refusalForPublishSlot({ plan: 'free', activeCount: 0 })).toBeNull();
    // 1 个挂着（不含本次这个项目自己）→ 拒，且话里带着档位、上限与当前数
    const refusal = refusalForPublishSlot({ plan: 'free', activeCount: 1 });
    expect(refusal).not.toBeNull();
    expect(refusal).toContain('Free 档同时最多公开发 1 个项目');
    expect(refusal).toContain('现在已有 1 个挂着');
    // 同一个占用换到名额更大的档位就放行——证明看的是档位，不是"发过就没有"
    expect(refusalForPublishSlot({ plan: 'studio', activeCount: 1 })).toBeNull();
  });

  it('反向对照：把 activeCount 减一个，同一个 free 档就从拒变放行', () => {
    expect(refusalForPublishSlot({ plan: 'free', activeCount: 1 })).not.toBeNull();
    expect(refusalForPublishSlot({ plan: 'free', activeCount: 0 })).toBeNull();
  });

  it('publishing 进了"真的会拦"那一列，teamCollaboration 是唯一还没有拦截方的那格', () => {
    expect((ENFORCED_PLAN_AXES as readonly string[]).includes('publishing')).toBe(true);
    expect(UNENFORCED_PLAN_AXES).toEqual(['teamCollaboration']);
  });
});
