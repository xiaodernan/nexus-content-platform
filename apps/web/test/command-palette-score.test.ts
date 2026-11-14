import { describe, expect, it } from 'vitest';
import { PALETTE_COMMANDS } from '@/lib/command-palette/commands';
import { rank, scoreText } from '@/lib/command-palette/score';

/**
 * §CP-1 命令面板的匹配与排序——**纯函数那一寸**。
 *
 * 这一片最容易"看起来能用、实际上排得很奇怪"：模糊搜索的坏实现不会报错，只会把正确的
 * 候选排到第五位，而用户会以为自己记错了页面名。所以下面的判据全部钉**具体分数关系**
 * 与**具体区间下标**，不钉"能匹配上"这种含糊结论。
 *
 * 六组判据：
 *  1. 子序列是硬门槛：顺序不对就是 null，不是 0 分；
 *  2. 空查询不过滤（保留声明顺序），不是"什么都没匹配上"；
 *  3. 前缀 > 词边界 > 散落；连续 > 分散；
 *  4. 两趟贪心取优（`a_x_ab` 要拿到尾部的连续命中，而不是头部的散落命中）；
 *  5. 高亮区间是真的下标（`slice` 出来就是命中的那几个字）；
 *  6. 排序是**全序**：同分不抖，键盘落点才稳。
 */
describe('§CP-1 scoreText', () => {
  it('子序列是硬门槛：字符顺序不对返回 null（不是 0 分）', () => {
    expect(scoreText('zz', '额度')).toBeNull();
    // '度额' 在 '额度' 里存在但顺序反了——模糊搜索不该把这种算命中
    expect(scoreText('度额', '额度')).toBeNull();
  });

  it('空查询返回 0 分 + 空区间（不过滤，保留声明顺序）', () => {
    expect(scoreText('', '发现')).toEqual({ score: 0, ranges: [] });
    expect(scoreText('   ', '发现')).toEqual({ score: 0, ranges: [] });
  });

  it('前缀命中 > 词边界命中 > 散落命中', () => {
    const prefix = scoreText('an', 'Analytics')!;
    const boundary = scoreText('an', 'my-analytics')!;
    const scattered = scoreText('an', 'banxna')!;
    expect(prefix.score).toBeGreaterThan(boundary.score);
    expect(boundary.score).toBeGreaterThan(scattered.score);
  });

  it('连续命中比分散命中值钱（同为 2 个字符）', () => {
    const consecutive = scoreText('ab', 'ab_x')!;
    const split = scoreText('ab', 'a_x_b')!;
    expect(consecutive.score).toBeGreaterThan(split.score);
  });

  it('两趟贪心取优：`a_x_ab` 的 `ab` 要拿到尾部那一对连续字符', () => {
    // 单趟「最左优先」会拿 a(0) b(5)，丢掉连续加成；反扫会拿到 a(4) b(5)。
    const match = scoreText('ab', 'a_x_ab')!;
    expect(match.ranges).toEqual([{ start: 4, end: 6 }]);
  });

  it('高亮区间是真的下标：ASCII 与中文都按 slice 取就是命中的字', () => {
    const ascii = scoreText('ana', 'Analytics')!;
    expect(ascii.ranges).toEqual([{ start: 0, end: 3 }]);
    const text = 'Analytics';
    expect(ascii.ranges.map((r) => text.slice(r.start, r.end)).join('')).toBe('Ana');

    const cjk = scoreText('数据', '创作数据')!;
    expect(cjk.ranges).toEqual([{ start: 2, end: 4 }]);
    expect('创作数据'.slice(2, 4)).toBe('数据');
  });

  it('相邻命中合并成一个区间（少几个 <mark>）', () => {
    expect(scoreText('abc', 'abcdef')!.ranges).toEqual([{ start: 0, end: 3 }]);
    // 中间断开的不能合并
    expect(scoreText('ac', 'abc')!.ranges).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ]);
  });

  it('大小写不敏感，但词边界按原串判（小驼峰也算一个词的开头）', () => {
    expect(scoreText('API', 'api 令牌')!.score).toBe(scoreText('api', 'api 令牌')!.score);
    // camelCase：首个命中落在驼峰转折处，比落在一串小写中间高
    const camel = scoreText('t', 'apiToken')!;
    const plain = scoreText('t', 'apitokenx')!;
    expect(camel.score).toBeGreaterThan(plain.score);
  });
});

describe('§CP-1 rank', () => {
  it('空查询按声明顺序全量返回（16 条），首条是首页', () => {
    const out = rank(PALETTE_COMMANDS, '');
    expect(out).toHaveLength(PALETTE_COMMANDS.length);
    expect(out[0]!.item.id).toBe('home');
    expect(out.every((entry) => entry.score === 0 && entry.ranges.length === 0)).toBe(true);
  });

  it('中文查询落到正确命令：「数据」→ 创作数据 排第一', () => {
    const out = rank(PALETTE_COMMANDS, '数据');
    expect(out[0]!.item.id).toBe('analytics');
  });

  it('英文关键词命中：标题里没有 token 字样也能找到 API 令牌，且不给假高亮', () => {
    const out = rank(PALETTE_COMMANDS, 'token');
    const first = out[0]!;
    expect(first.item.id).toBe('api-tokens');
    expect(first.viaKeyword).toBe(true);
    // 关键词命中不在标题里，没有任何可高亮的字符——画一个区间就是在骗人
    expect(first.ranges).toEqual([]);
  });

  it('标题命中永远压过关键词命中（关键词要付折扣）', () => {
    // '市场' 是标题（市场），'market' 只出现在 keywords 里
    const byLabel = rank(PALETTE_COMMANDS, '市场');
    expect(byLabel[0]!.item.id).toBe('marketplace');
    expect(byLabel[0]!.viaKeyword).toBe(false);
    const byKeyword = rank(PALETTE_COMMANDS, 'market');
    expect(byKeyword[0]!.item.id).toBe('marketplace');
    expect(byKeyword[0]!.viaKeyword).toBe(true);
  });

  it('匹配不上就是空数组，不退回"猜你想看"', () => {
    expect(rank(PALETTE_COMMANDS, 'zzzzz')).toEqual([]);
  });

  it('limit 生效且默认上限 40（候选集小于上限时不会截断）', () => {
    expect(rank(PALETTE_COMMANDS, '', { limit: 3 })).toHaveLength(3);
    expect(rank(PALETTE_COMMANDS, '').length).toBeLessThanOrEqual(40);
  });

  it('排序是全序：同一份输入两次排出来逐条相同（键盘落点才稳）', () => {
    const a = rank(PALETTE_COMMANDS, 'a').map((entry) => entry.item.id);
    const b = rank(PALETTE_COMMANDS, 'a').map((entry) => entry.item.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // 没有重复项
  });

  it('boost 只在同分时起作用，不会把一条更低分的匹配顶到前面', () => {
    const items = [
      { id: 'exact', label: '数据' },
      { id: 'loose', label: '数一数二据' },
    ];
    const boosted = rank(items, '数据', { boost: (item) => (item.id === 'loose' ? 999 : 0) });
    expect(boosted[0]!.item.id).toBe('exact');
  });

  it('同分时短标题在前（更贴近用户想敲的那个词）', () => {
    const items = [
      { id: 'long', label: '市场工单列表' },
      { id: 'short', label: '市场' },
    ];
    // 两者都以前缀命中，分数相同；长度决定次序
    const out = rank(items, '市场');
    expect(out[0]!.item.id).toBe('short');
  });
});
