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
  creditKindForAgentKey,
  isPlanKey,
  monthPeriod,
  pendingGrants,
  refusalFor,
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
describe('§134 四类额度与档位表（纯规则）', () => {
  it('四类就是 §134 原文点名的四类，顺序也是余额页读的顺序', () => {
    expect([...CREDIT_KINDS]).toEqual(['ai', 'image', 'video', 'compute']);
    expect(CREDIT_KIND_LABELS.ai).toBe('AI credits');
    expect(CREDIT_KIND_LABELS.compute).toBe('Compute credits');
  });

  it('每一档对每一类都有发放数与上限——漏一格就不许绿', () => {
    for (const plan of PLAN_KEYS) {
      expect(Object.keys(PLAN_MONTHLY_GRANTS[plan]).sort()).toEqual([...CREDIT_KINDS].sort());
      expect(Object.keys(PLAN_LIMITS[plan]).length).toBe(3);
      for (const kind of CREDIT_KINDS) {
        expect(PLAN_MONTHLY_GRANTS[plan][kind]).toBeGreaterThan(0);
      }
    }
    // 反向对照：档位表里没有这一档，isPlanKey 要说不认（不是靠 PLAN_KEYS 恰好有它）
    expect(isPlanKey('free')).toBe(true);
    expect(isPlanKey('ultra')).toBe(false);
  });

  it('单价表覆盖四类，且都是正整数', () => {
    expect(Object.keys(GENERATION_COST).sort()).toEqual([...CREDIT_KINDS].sort());
    for (const kind of CREDIT_KINDS) expect(GENERATION_COST[kind]).toBeGreaterThan(0);
  });

  it('§133 那五件事里，只有 AI usage 这一格今天真的有拦截方', () => {
    // §133 原文列的五件事：AI usage / storage / generation / team collaboration / publishing。
    // 这条断言钉的是"已生效 + 还没拦截方 = 那五件事，一格不多一格不少"，
    // 挡的是那种把表格上的上限说成已生效的写法。
    const FIVE_AXES = ['aiUsage', 'storage', 'generation', 'teamCollaboration', 'publishing'];
    expect([...ENFORCED_PLAN_AXES, ...UNENFORCED_PLAN_AXES].sort()).toEqual([...FIVE_AXES].sort());
    expect(ENFORCED_PLAN_AXES).toEqual(['aiUsage']);
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
    expect(all.map((g) => g.kind)).toEqual([...CREDIT_KINDS]);
    expect(all[0]?.delta).toBe(PLAN_MONTHLY_GRANTS.free.ai);
    expect(all[0]?.reason).toContain('2026-09');
    // 反向对照：只把 ai 记成已发，回来的必须少了 ai 那一行，其它三行不动
    const minusAi = pendingGrants('free', '2026-09', new Set(['ai']));
    expect(minusAi.map((g) => g.kind)).toEqual(['image', 'video', 'compute']);
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
