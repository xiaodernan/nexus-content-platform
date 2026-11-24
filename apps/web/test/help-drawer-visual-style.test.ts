import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §SG-3 Studio「帮助 · Help」内置说明书抽屉（`InAppGuide.tsx`）§v788 —— 静的那一寸。
 *
 * 判据：
 * 1. 'use client' 保留；零 fetch / provider / API 调用字面；
 * 2. 正文真值只认 `@/lib/guideCopy`（与 /guide 页同一份字典，不许出现第二份副本）；
 * 3. 双语（locale 透传；zh/en 骨架各一份文案）；
 * 4. data-help-* 钩子守恒（drawer/close/search/hit-count/toc/content/empty）；
 * 5. 门面类只认 .tsg-*；§SG-2 段全部定义且零 hex；
 * 6. 视觉段 var(--nexus-*) 全在 tokens.css 声明；
 * 7. 关闭键绑定 Escape 与 F1；命中计数 = hits.length（实数，不画 0）。
 * 8. 检索真值在纯函数 guideSearch；空结果给短词/目录/清空三条出路。
 */
const ROOT = process.cwd();
const COMPONENT = join(ROOT, 'apps/web/src/components/InAppGuide.tsx');
const GUIDE_COPY = join(ROOT, 'apps/web/src/lib/guideCopy.ts');
const GUIDE_SEARCH = join(ROOT, 'apps/web/src/lib/guideSearch.ts');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const component = readFileSync(COMPONENT, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const dictSrc = readFileSync(GUIDE_COPY, 'utf8');
const searchSrc = readFileSync(GUIDE_SEARCH, 'utf8');

const SG_START = globals.indexOf('§SG-2');
if (SG_START < 0) throw new Error('globals.css 里没有 §SG-2 段');
const sgSegment = globals.slice(SG_START);

describe('§SG-3 Studio 帮助抽屉（§SG-1 组件 / §SG-2 视觉段）', () => {
  it('use client 保留；零 provider/fetch 字面', () => {
    expect(component.slice(0, 40)).toContain('use client');
    expect(component).not.toContain('fetch(');
    expect(component).not.toContain('/api/');
    expect(component).not.toContain('provider');
  });

  it('正文真值只认 @/lib/guideCopy（/guide 页与抽屉同一份字典）', () => {
    expect(component).toContain("from '@/lib/guideCopy'");
    expect(component).toContain('GUIDE_COPY');
    expect(dictSrc).toContain('export const GUIDE_COPY');
    // 十三节目录都在字典里，不在组件里另抄一份。
    for (const n of ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬']) {
      expect(dictSrc).toContain(n);
      expect(component).not.toContain(n);
    }
  });

  it('data-help-* 钩子守恒', () => {
    for (const hook of [
      'data-help-drawer',
      'data-help-close',
      'data-help-search',
      'data-help-hit-count',
      'data-help-toc',
      'data-help-content',
      'data-help-empty',
      'data-help-clear-search',
      'data-help-full-guide',
    ]) {
      expect(component, `InAppGuide 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('关闭键绑定 Escape 与 F1', () => {
    expect(component).toContain("'Escape'");
    expect(component).toContain("'F1'");
  });

  it('字面 className 只认 .tsg-*；无裸 Tailwind 原子类', () => {
    const literals = [...component.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(10);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `InAppGuide 出现域外类：${tok}`).toMatch(/^tsg-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.tsg-* 全部在 §SG-2 段定义；段内零 hex', () => {
    expect(sgSegment.length).toBeGreaterThan(0);
    expect(sgSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const cls of [
      '.tsg-drawer',
      '.tsg-head',
      '.tsg-kicker',
      '.tsg-title',
      '.tsg-close',
      '.tsg-searchRow',
      '.tsg-search',
      '.tsg-empty',
      '.tsg-clearSearch',
      '.tsg-hitCount',
      '.tsg-body',
      '.tsg-toc',
      '.tsg-tocLink',
      '.tsg-content',
      '.tsg-section',
      '.tsg-sectionHeading',
      '.tsg-para',
      '.tsg-foot',
      '.tsg-fullGuide',
    ]) {
      expect(sgSegment, `§SG-2 段没有定义 ${cls}`).toContain(cls + ' {');
    }
  });

  it('§SG-2 视觉段 var(--nexus-*) 全在 tokens.css 声明（零写死 hex）', () => {
    const used = [...new Set([...sgSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('检索委托纯函数；空结果明确给出短词、目录与清空出路', () => {
    expect(component).toContain("from '@/lib/guideSearch'");
    expect(component).toContain('searchGuideSections(copy.sections, query)');
    expect(searchSrc).toContain('export function searchGuideSections');
    expect(searchSrc).not.toMatch(/\bfetch\s*\(|\bchatWith|provider|\/api\//);
    expect(component).toContain('data-help-clear-search');
    expect(component).toContain('更短的关键词');
    expect(component).toContain('shorter keyword');
    expect(component).toContain('目录');
    expect(component).toContain('table of contents');
  });

  it('目录只指向当前命中；完整指南保留 structurally valid project context', () => {
    expect(component).toContain('{hits.map((section) => (');
    expect(component).toContain('href={`#${section.anchor}`}');
    expect(component).toContain('id={section.anchor}');
    expect(component).toContain('data-guide-section={section.anchor}');
    expect(component).toContain('projectId?: string');
    expect(component).toContain('/guide?project=${encodeURIComponent(projectId)}');
    expect(component).toContain('data-help-full-guide');
    expect(sgSegment).toContain('.tsg-fullGuide:focus-visible');
  });

  it('命中计数是实数（hits.length 直接插值，不画 0 / 不伪造满分）', () => {
    expect(component).toContain('{hits.length} / {copy.sections.length}');
    expect(component).not.toContain('Math.max(hits');
    expect(component).not.toContain('/ {copy.sections.length} + 1');
  });
});
