import { describe, expect, it } from 'vitest';
import { cacheShare, cacheState, cacheText, cacheTotal } from '@/lib/usage-cache-text';

/**
 * §CACHE-3 缓存读数翻译层。
 *
 * 这几句话会原样出现在任务账本上，**措辞就是承诺**。所以这里钉的不是"字符串长什么样"，
 * 而是三条互不冒充的事实：
 *
 * 1. 网关没报的时候，界面不能把它说成"命中 0"（那是编一个读数）；
 * 2. 报了 0 的时候，界面不能说成"没数据"（那是丢掉一条真实信息）；
 * 3. 有占比的时候分母必须是 `tokensIn`（OpenAI 的 `prompt_tokens` 含 `cached_tokens`，
 *    缓存那一段只是打折，不是不计费）。
 */
describe('§CACHE-3 cacheText：三档互不冒充', () => {
  it('没报 → 说"未报"，不出现任何数字（0 也不许出现）', () => {
    const text = cacheText({ tokensIn: 5000, cachedTokens: 0, cacheReported: false });
    expect(text).toBe('缓存读数未报');
    expect(text).not.toMatch(/\d/);
  });

  it('报了 0 → 说"未命中"，这是冷启动而不是缺数据', () => {
    expect(cacheText({ tokensIn: 5000, cachedTokens: 0, cacheReported: true })).toBe('缓存未命中');
  });

  it('报了 N → 给 N 与占比，分母是 tokensIn', () => {
    expect(cacheText({ tokensIn: 7410, cachedTokens: 7168, cacheReported: true })).toBe('缓存命中 7168·97%');
  });

  it('占比四舍五入到整数：5389/5603 = 96.2% → 96%', () => {
    expect(cacheShare({ tokensIn: 5603, cachedTokens: 5389, cacheReported: true })).toBe(96);
  });

  it('tokensIn 为 0 时不给占比也不给 %（0 做分母算出来的数是编的）', () => {
    expect(cacheShare({ tokensIn: 0, cachedTokens: 700, cacheReported: true })).toBeNull();
    expect(cacheText({ tokensIn: 0, cachedTokens: 700, cacheReported: true })).toBe('缓存命中 700');
  });

  it('没报时 cacheShare 是 null 而不是 0 —— 0% 是一句具体的谎', () => {
    expect(cacheShare({ tokensIn: 5000, cachedTokens: 0, cacheReported: false })).toBeNull();
  });

  it('应用级缓存整段复用：cached === tokensIn → 100%', () => {
    expect(cacheText({ tokensIn: 22846, cachedTokens: 22846, cacheReported: true })).toBe('缓存命中 22846·100%');
  });

  it('负数被当作 0 处理而不是算出负占比（脏数据不许画成负命中率）', () => {
    expect(cacheShare({ tokensIn: 1000, cachedTokens: -5, cacheReported: true })).toBe(0);
  });
});

describe('§CACHE-3 cacheState：三态是语义，不是措辞', () => {
  it('没报 → unreported（与"命中 0"是不同状态）', () => {
    expect(cacheState({ tokensIn: 5000, cachedTokens: 0, cacheReported: false })).toBe('unreported');
  });

  it('报了 0 → miss', () => {
    expect(cacheState({ tokensIn: 5000, cachedTokens: 0, cacheReported: true })).toBe('miss');
  });

  it('报了 N>0 → hit', () => {
    expect(cacheState({ tokensIn: 7410, cachedTokens: 7168, cacheReported: true })).toBe('hit');
  });

  it('三态与三句措辞一一对应（改措辞不该改状态）', () => {
    const cases: Array<[Parameters<typeof cacheState>[0], 'hit' | 'miss' | 'unreported']> = [
      [{ tokensIn: 1, cachedTokens: 0, cacheReported: false }, 'unreported'],
      [{ tokensIn: 1, cachedTokens: 0, cacheReported: true }, 'miss'],
      [{ tokensIn: 1, cachedTokens: 1, cacheReported: true }, 'hit'],
    ];
    for (const [usage, state] of cases) {
      expect(cacheState(usage)).toBe(state);
      // 每个状态都有且只有一句话——不是空串、也不是同一句
      expect(cacheText(usage).length).toBeGreaterThan(0);
    }
    const texts = cases.map(([usage]) => cacheText(usage));
    expect(new Set(texts).size).toBe(3);
  });
});

describe('§CACHE-3 cacheTotal：分母只算报过账的行', () => {
  it('DEMO 行不进门：它不经过模型，没有网关可问', () => {
    const total = cacheTotal([
      { tokensIn: 1000, cachedTokens: 900, cacheReported: true, demoMode: true },
      { tokensIn: 2000, cachedTokens: 1000, cacheReported: true },
    ]);
    expect(total).toEqual({ rows: 1, cached: 1000, prompt: 2000, share: 50 });
  });

  it('没报的行不进门：把"没报"按 0 加进分母会凭空拉低命中率', () => {
    const total = cacheTotal([
      { tokensIn: 1000, cachedTokens: 800, cacheReported: true },
      // 下面这一行如果被算进去，share 会从 80% 掉到 26%——那是在用缺失伪造更差的读数
      { tokensIn: 21000, cachedTokens: 0, cacheReported: false },
    ]);
    expect(total.rows).toBe(1);
    expect(total.share).toBe(80);
  });

  it('一行都没报 → rows=0 且 share=null，调用方据此说"没有读数"而不是画 0%', () => {
    const total = cacheTotal([{ tokensIn: 1000, cachedTokens: 0, cacheReported: false }]);
    expect(total).toEqual({ rows: 0, cached: 0, prompt: 0, share: null });
  });

  it('空账本不炸', () => {
    expect(cacheTotal([])).toEqual({ rows: 0, cached: 0, prompt: 0, share: null });
  });

  it('报过数但确实一次没命中 → rows>0 且 share=0（这是信息，不是缺失）', () => {
    const total = cacheTotal([
      { tokensIn: 1000, cachedTokens: 0, cacheReported: true },
      { tokensIn: 1000, cachedTokens: 0, cacheReported: true },
    ]);
    expect(total).toEqual({ rows: 2, cached: 0, prompt: 2000, share: 0 });
  });
});
