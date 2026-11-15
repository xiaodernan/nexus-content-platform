import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §BIBLE-3 `BibleSearch.tsx` 典籍室「直达」——**静态那一寸**。
 *
 * 判据：
 * 1. 'use client' 保留；不带任何 fetch/provider 调用字面；
 * 2. 钩子 `data-bible-search-*` 守恒（root/input/count/results/hit/empty）；
 * 3. 数据源只认 `@/world-bible/generated`（正典，不手改副本）；
 * 4. 双语字典 zh+en 两份齐；
 * 5. 门面类只认 .bb-*，且 §BIBLE-1 段都有定义；
 * 6. §BIBLE-1 段零 hex；新增 `.bb-search*` ≥8 类零 hex（本地可证）；
 * 7. 正典行原文直达不走网络 — 命中数必为实数（`hitCount(hits.length)` 直接插值）。
 */
const ROOT = process.cwd();
const COMPONENT = join(ROOT, 'apps/web/src/components/BibleSearch.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');
const GENERATED = join(ROOT, 'apps/web/src/world-bible/generated.ts');

const component = readFileSync(COMPONENT, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const generated = readFileSync(GENERATED, 'utf8');

const BIBLE_START = globals.indexOf('§BIBLE-1');
const bbSegment = BIBLE_START >= 0 ? globals.slice(BIBLE_START) : '';

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§BIBLE-3 典籍室「直达」', () => {
  it('client 组件 + 零 provider/fetch 字面', () => {
    expect(component.slice(0, 80)).toContain('use client');
    expect(component).not.toContain('fetch(');
    expect(component).not.toContain('/api/');
    expect(component).not.toContain('provider');
  });

  it('数据源只认 @/world-bible/generated（正典，不手抄副本）', () => {
    expect(component).toContain("from '@/world-bible/generated'");
    expect(component).toContain('BIBLE_CHAPTERS');
    expect(generated).toContain('export const BIBLE_CHAPTERS');
    expect(generated).toContain('export const BIBLE_ECHOES');
  });

  it('双语字典齐（zh + en）', () => {
    expect(component).toContain('zh: {');
    expect(component).toContain('en: {');
    expect(component).toContain('placeholder:');
    expect(component).toContain('hitCount');
  });

  it('data 钩子守恒', () => {
    for (const hook of [
      'data-bible-search-root',
      'data-bible-search-input',
      'data-bible-search-count',
      'data-bible-search-results',
      'data-bible-search-hit',
      'data-bible-search-empty',
    ]) {
      expect(component, `BibleSearch 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .bb-*；无裸 Tailwind 原子类', () => {
    const literals = [...component.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(8);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `BibleSearch 出现域外类：${tok}`).toMatch(/^bb-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.bb-search* 全部在 §BIBLE-1 段定义；段内零 hex', () => {
    expect(bbSegment.length).toBeGreaterThan(0);
    expect(bbSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const cls of ['.bb-searchWrap', '.bb-searchBar', '.bb-searchInput', '.bb-searchResults', '.bb-searchHit', '.bb-searchHitLine', '.bb-searchHitTitle', '.bb-searchKicker']) {
      expect(bbSegment, `§BIBLE-1 没有定义 ${cls}`).toContain(cls + ' {');
    }
  });

  it('新增 token var() 全在 tokens.css 声明（零写死 hex）', () => {
    const usedTokens = [...new Set([...bbSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('命中计数是实数的那个数（不画 0 / 不伪造）', () => {
    expect(component).toContain('hitCount(hits.length)');
    expect(component).not.toContain('hitCount(0');
    expect(component).not.toContain('Math.max(hits');
  });
});
