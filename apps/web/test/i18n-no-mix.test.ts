/**
 * §I18N-NO-MIX · 首页门面文案的「不中英夹杂」门（2026-11-21）。
 *
 * 用户第八点：中文模式全中文、英文模式全英文，不许中英夹杂。
 * 首页 HOME_TXT 是登录后的第一屏，此处若出现「快速上手 · QUICK START」这种
 * 两种语言并列，用户一眼就看到。本门做两件事：
 *  1. en 块零 CJK（英文模式不漏中文）；
 *  2. 两块都不出现「中文 · English」/「English · 中文」的对照式夹杂
 *     （这种 `·` 并列是本项目过去夹杂的典型形状，真实文案里 `·` 只用于
 *      中文并列或数字分隔，不会一侧是 ≥3 字母的英文单词）。
 *
 * 合法保留：Ctrl+K / Mac / Provider / healthz / Studio / Agent / Mock /
 * NEXUS_AI_SERVICE_URL / ai-service / web / key / demo 等——它们是快捷键名、
 * 产品名、端点名和技术标识，不翻译成中文是所有产品的通行做法，不算夹杂。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = readFileSync(join(__dirname, '../src/app/page.tsx'), 'utf-8');

function localeBlock(locale: 'zh' | 'en'): string {
  const marker = locale === 'zh' ? '  zh: {' : '  en: {';
  const start = PAGE.indexOf(marker);
  expect(start, `HOME_TXT.${locale} 块必须存在`).toBeGreaterThan(-1);
  const tail = PAGE.slice(start + marker.length);
  const end = locale === 'zh' ? tail.indexOf('  en: {') : tail.indexOf('} as const;');
  expect(end, `HOME_TXT.${locale} 块必须闭合`).toBeGreaterThan(-1);
  return tail.slice(0, end);
}

const CJK = /[\u3400-\u9fff]/;
// 「中文 · English」或「English · 中文」：一侧 CJK，另一侧独立英文词（≥3 字母）。
const MIX_ZH_EN = /[\u3400-\u9fff]\s*·\s*[A-Za-z]{3,}|[A-Za-z]{3,}\s*·\s*[\u3400-\u9fff]/;

describe('§I18N-NO-MIX 首页文案不中英夹杂', () => {
  it('英文模式零中文字符', () => {
    const en = localeBlock('en');
    const cjkLines = en.split('\n').filter((line) => CJK.test(line));
    expect(cjkLines, `en 块出现中文：${cjkLines.join(' | ')}`).toHaveLength(0);
  });

  it('中文与英文块都不出现「中文 · English」对照式夹杂', () => {
    for (const locale of ['zh', 'en'] as const) {
      const block = localeBlock(locale);
      const mixed = block.split('\n').filter((line) => MIX_ZH_EN.test(line));
      expect(mixed, `${locale} 块出现中英并列：${mixed.join(' | ')}`).toHaveLength(0);
    }
  });

  it('quickStartKicker 各语言只有一种语言', () => {
    const zh = localeBlock('zh');
    const en = localeBlock('en');
    const zhKicker = zh.match(/quickStartKicker:\s*'([^']*)'/)?.[1] ?? '';
    const enKicker = en.match(/quickStartKicker:\s*'([^']*)'/)?.[1] ?? '';
    expect(zhKicker).toBe('快速上手');
    expect(enKicker).toBe('QUICK START');
  });
});
