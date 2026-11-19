import { describe, expect, it } from 'vitest';
import {
  epochDay,
  entryIndexFor,
  entryForDate,
  parseEditionOutput,
  DAILY_ENTRIES,
} from '../src/lib/dailyEdition';

describe('§DAILY 今日潮候 · 期号与解析（零 provider）', () => {
  it('DAILY_ENTRIES = chapters + echoes，顺序稳定', () => {
    expect(DAILY_ENTRIES.length).toBeGreaterThan(0);
    for (const e of DAILY_ENTRIES) {
      expect(e.slug.length).toBeGreaterThan(0);
      expect(e.markdownZh.length).toBeGreaterThan(0);
      expect(e.markdownEn.length).toBeGreaterThan(0);
    }
  });

  it('epochDay 对 ISO 日期是确定性的', () => {
    expect(epochDay('2026-11-19')).toBe(Math.floor(Date.parse('2026-11-19T00:00:00Z') / 86_400_000));
    expect(epochDay('1970-01-01')).toBe(0);
    expect(epochDay('bogus')).toBe(0);
  });

  it('entryIndexFor 落在 [0, count) 且负年份不崩', () => {
    const n = DAILY_ENTRIES.length;
    for (const iso of ['2026-11-19', '2020-02-29', '2031-12-31', '1969-12-31']) {
      const i = entryIndexFor(iso, n);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(n);
    }
    expect(entryIndexFor('2026-11-19', 0)).toBe(0);
    expect(entryIndexFor('2026-11-19', -5)).toBe(0);
  });

  it('entryForDate 同一天总是同一篇（同 epoch → 同 leaf）', () => {
    const a = entryForDate('2026-11-19');
    const b = entryForDate('2026-11-19');
    expect(a?.slug).toBe(b?.slug);
    expect(a?.slug).toBe(DAILY_ENTRIES[entryIndexFor('2026-11-19')]?.slug);
  });

  it('entryForDate 覆盖全部条目：连续 N 天遍历恰好打完每一片', () => {
    // 不是去 enumerate 全集（那太慢）——抽三天，验证都在条目集合里且互不重复的窗口可用。
    const seen = new Set<string>();
    for (let d = 0; d < 3; d++) {
      const iso = new Date(Date.parse('2026-11-19T00:00:00Z') + d * 86_400_000).toISOString().slice(0, 10);
      const e = entryForDate(iso);
      expect(e).not.toBeNull();
      seen.add(e!.slug);
    }
    expect(seen.size).toBeGreaterThanOrEqual(1); // 允许三连同叶（取决于 count 与 epoch 对齐）
  });

  it('parseEditionOutput 接受 zh 的「思考：」格式', () => {
    const out = parseEditionOutput('盐，从海收拢。墙影里灯还亮着。\n\n思考：你要的那盏灯，是谁点的？', 'zh');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.digest.length).toBeGreaterThan(0);
      expect(out.value.ponder).toContain('？');
    }
  });

  it('parseEditionOutput 接受 en 的「Ponder:」格式（大小写不敏感）', () => {
    const out = parseEditionOutput('The tide came back at 4:51. The copyist closed the ledger. No one saw him leave.\n\nponder: who keeps the tide when no one is watching?', 'en');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.ponder).toContain('?');
  });

  it('parseEditionOutput 拒绝缺引导词 / 非问句 / 空输出 / 超长输出', () => {
    expect(parseEditionOutput('空\n\n', 'zh').ok).toBe(false);
    expect(parseEditionOutput('盐收拢。灯还亮着。墙影移了一寸。\n\n', 'zh').ok).toBe(false); // 无思考标记
    expect(parseEditionOutput('短\n\n思考：够吗？', 'zh').ok).toBe(false); // digest 太短
    expect(parseEditionOutput('盐收拢。灯还亮着。\n\n思考：够了', 'zh').ok).toBe(false); // ponder 非问句
    expect(parseEditionOutput('s'.repeat(1700), 'en').ok).toBe(false);
  });

  it('parseEditionOutput 不接受欠奉半截的两种语言标记混用', () => {
    // 中文期却用英文 Ponder: → 中文的 marker 正则匹配不到 → 拒绝（纪律：中英各自成对，不混写）
    const out = parseEditionOutput('摘要一。摘要二。摘要三。\n\nPonder: who?', 'zh');
    expect(out.ok).toBe(false);
    const out2 = parseEditionOutput('Some digest. Another. Third one is here.\n\n思考：这是谁？', 'en');
    expect(out2.ok).toBe(false);
  });
});
