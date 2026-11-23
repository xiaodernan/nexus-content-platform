/**
 * metadata 本地化门：中英各一句标题/描述，中文里不夹英文句子，英文里不夹汉字。
 * 纯读源码、零 provider、零网络；防止有人把两种语言再拼回一个字符串。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const PAGES = [
  'about-nexus',
  'bible/whisper',
  'ship',
  'pulse',
  'insight',
  'preview',
] as const;

const cjk = (s: string): boolean => /[\u3400-\u9fff]/u.test(s);
/** 品牌名与技术路径不算"夹英文"，其余连续 4 个以上拉丁字母算英文句子。 */
const latinSentence = (s: string): string[] =>
  (s.replace(/NEXUS|git|<projectId>|\/preview\//g, '').match(/[A-Za-z]{4,}/g) ?? []);

function source(page: string): string {
  return readFileSync(join(ROOT, 'apps/web/src/app', page, 'page.tsx'), 'utf8');
}
/** 只取 generateMetadata 函数体，避免把页面别处的 title: 也算进来。 */
function metadataBlock(src: string): string {
  const start = src.indexOf('export async function generateMetadata');
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end + 1);
}
function values(block: string, key: 'title' | 'description'): string[] {
  return [...block.matchAll(new RegExp(`${key}:\\s*'([^']*)'`, 'g'))].map((m) => m[1]!);
}

describe('metadata · 标题与描述按语言分离', () => {
  for (const page of PAGES) {
    it(`${page}：generateMetadata 两分支，中英各一句且不夹杂`, () => {
      const src = source(page);
      expect(src).toContain('export async function generateMetadata');
      expect(src).toContain('const locale = await getLocale()');
      expect(src).toContain("locale === 'zh'");

      const block = metadataBlock(src);
      const titles = values(block, 'title');
      const descriptions = values(block, 'description');
      expect(titles).toHaveLength(2);
      expect(descriptions).toHaveLength(2);

      for (const [key, strings] of [['title', titles], ['description', descriptions]] as const) {
        expect(strings.filter(cjk), `${page} ${key} 应恰好一句中文`).toHaveLength(1);
        expect(strings.filter((s) => !cjk(s)), `${page} ${key} 应恰好一句英文`).toHaveLength(1);
        const zh = strings.find(cjk)!;
        const en = strings.find((s) => !cjk(s))!;
        expect(latinSentence(zh), `${page} ${key} 中文串夹英文：${zh}`).toEqual([]);
        expect(cjk(en), `${page} ${key} 英文串夹汉字：${en}`).toBe(false);
      }
    });
  }
});
