/**
 * §I18N-ZH-KICKER · 中文界面的挂牌不许是纯英文（2026-11-23）。
 *
 * 用户第八点：「中文模式下全部内容统一中文……不要中英夹杂」。
 * 2026-11-23 的 world-quests 像素目验抓到：英文页 kicker 还是「世界委托关员…」（那是数据，
 * 数据不翻译是对的），但中文页顶上挂着 `COMMISSIONS`；顺手全 src 一扫，又有 8 处同类：
 *   admin console / SHIP LOG / DIGEST / CHECKUP / NETWORK / CHRONICLE /
 *   public observatory / public observatory · 123
 * 它们都是 2–3 个单词的小挂牌，用户第一眼就看见，属于最刺眼的夹杂。
 *
 * 本门与 `i18n-en-purity.test.ts`（en 块零 CJK）是一对：那边管「英文页不漏中文」，
 * 这边管「中文页不挂英文」。判据故意简单、有牙：
 *   zh 块里每个 `kicker: '…'` 都必须含汉字，除非是 `§` 开头的内部章节标记
 *   （§WORLD-INDEX 之类给开发者看的锚，不是用户可见文案）。
 * 合法保留的产品名/技术名（Studio / AI / gpt-6.2-sol / StateGraph…）都与汉字并列，
 * 所以天然过门——本门不误伤「AI 深读 · gpt-6.2-sol」这类真双语但以中文为主的挂牌。
 *
 * 变异臂：把某一处改回纯英文，本门必须红并报出 file:line。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SRC = join(ROOT, 'apps', 'web', 'src');
const CJK = /[\u3400-\u9fff]/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      sourceFiles(p, out);
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

type Bad = { where: string; value: string };

function pureEnglishKickers(): { files: number; kickers: number; bad: Bad[] } {
  const bad: Bad[] = [];
  let files = 0;
  let kickers = 0;
  for (const file of sourceFiles(SRC)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const zhStart = lines.findIndex((l) => /^\s{2}zh:\s*\{/.test(l));
    const enStart = lines.findIndex((l, i) => i > zhStart && /^\s{2}en:\s*\{/.test(l));
    if (zhStart < 0 || enStart < 0) continue;
    files += 1;
    for (let i = zhStart + 1; i < enStart; i++) {
      const line = lines[i];
      if (!line) continue;
      for (const m of line.matchAll(/kicker:\s*'([^']*)'/g)) {
        const value = m[1] ?? '';
        kickers += 1;
        if (CJK.test(value) || value.startsWith('§')) continue;
        bad.push({ where: `${relative(ROOT, file).split('\\').join('/')}:${i + 1}`, value });
      }
    }
  }
  return { files, kickers, bad };
}

describe('§I18N-ZH-KICKER 中文界面的挂牌不许是纯英文', () => {
  const { files, kickers, bad } = pureEnglishKickers();

  it('扫描面不是空的：门确实扫到了中文文案块和 kicker（否则下面会假绿）', () => {
    expect(files).toBeGreaterThanOrEqual(20);
    expect(kickers).toBeGreaterThanOrEqual(20);
  });

  it('每个 zh 块的 kicker 都含汉字，或以 § 开头（内部锚）', () => {
    expect(
      bad.map((b) => `${b.where} kicker='${b.value}' —— 中文界面挂了纯英文`),
      `${bad.length} 处英文挂牌：${bad.map((b) => `${b.where} '${b.value}'`).join('；')}`,
    ).toEqual([]);
  });

  it('反例：把 admin 的挂牌换成纯英文，门必须红（钉住它不是恒真）', () => {
    const admin = join(SRC, 'app', 'admin', 'page.tsx');
    expect(existsSync(admin)).toBe(true);
    const lines = readFileSync(admin, 'utf8').split(/\r?\n/);
    const zhStart = lines.findIndex((l) => /^\s{2}zh:\s*\{/.test(l));
    const enStart = lines.findIndex((l, i) => i > zhStart && /^\s{2}en:\s*\{/.test(l));
    const zhKicker = lines.slice(zhStart + 1, enStart).join('\n').match(/kicker:\s*'([^']*)'/)?.[1] ?? '';
    expect(CJK.test(zhKicker), `admin 中文挂牌当前应含汉字，实测 '${zhKicker}'`).toBe(true);
    expect(CJK.test('admin console')).toBe(false); // 假说：这个判据确实会把旧值判红
  });
});
