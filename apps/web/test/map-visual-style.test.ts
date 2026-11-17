import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §MAP-2 `/map` 世界全图——静态不变式。
 *
 * 判据：
 * 1. RSC-only；force-dynamic；metadata；getLocale 双语；
 * 2. 钩子守恒（data-map-root/locale/compass/section/link）；
 * 3. 门面类只认 .map-*（am-linkImplicit 只允许页脚2处）；§MAP-1 段全部定义；段内零 hex；forced-colors 收口；
 * 4. 双语 COPY（zh/en 同键）；所有 LABELS 有两个语言版本；
 * 5. 每个锚点都是仓库里真实存在的路由（不写占位路径）——/map 不允许虚构路由；
 * 6. map 不 import 客户端组件；零 fetch/provider 字面。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/map/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const MAP_START = globals.indexOf('§MAP-1');
if (MAP_START < 0) throw new Error('globals.css 里没有 §MAP-1 段');
const mapSegment = globals.slice(MAP_START);

const REQUIRED_ROUTES = ['/bible', '/bible/quiz', '/bible/well', '/about-nexus', '/', '/discover', '/marketplace', '/blocks', '/ship', '/analytics', '/credits', '/notifications', '/u', '/api-tokens', '/search', '/guide', '/insight', '/admin', '/admin/savings', '/onboarding'];

describe('§MAP-2 /map 世界全图', () => {
  it('RSC + force-dynamic + metadata + locale', () => {
    expect(page.slice(0, 60)).not.toContain('use client');
    expect(page).toContain('export const dynamic');
    expect(page).toContain('export const metadata');
    expect(page).toContain('getLocale');
  });

  it('双语 COPY 齐（zh/en 同键 + LABELS 中英两份）', () => {
    expect(page).toContain('zh: {');
    expect(page).toContain('en: {');
    for (const key of ['bible', 'quiz', 'well', 'about', 'home', 'discover', 'guide', 'insight']) {
      expect(page).toContain(`${key}: { zh:`);
    }
  });

  it('钩子守恒', () => {
    for (const hook of ['data-map-root', 'data-map-locale=', 'data-map-compass', 'data-map-section', 'data-map-link']) {
      expect(page, `map 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .map-*（页脚 am-linkImplicit 允许）', () => {
    const literals = [...page.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(10);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `Map 出现域外类：${tok}`).toMatch(/^(map-[A-Za-z0-9][A-Za-z0-9-]*|am-linkImplicit)$/);
      }
    }
  });

  it('§MAP-1 段：所需类全部定义；段内零 hex；forced-colors 收口', () => {
    expect(mapSegment.length).toBeGreaterThan(1200);
    expect(mapSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const cls of ['.map-root', '.map-title', '.map-kicker', '.map-compass', '.map-section', '.map-sectionHead', '.map-link', '.map-linkPath', '.map-linkLabel', '.map-foot']) {
      expect(mapSegment, `§MAP-1 段没有定义 ${cls}`).toContain(cls + ' {');
    }
    expect(mapSegment).toContain('@media (forced-colors: active)');
  });

  it('§MAP-1 段 var(--nexus-*) 全在 tokens.css 声明（零写死 hex）', () => {
    const used = [...new Set([...mapSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('列出的每个路由在本仓库真实存在（只认 src/app/<route> 映射）', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const APP = join(ROOT, 'apps/web/src/app');
    for (const route of REQUIRED_ROUTES) {
      const dir =
        route === '/'
          ? join(APP)
          : join(APP, route.slice(1));
      const direct = join(dir, 'page.tsx');
      expect(fs.existsSync(direct), `/map 里写了 ${route} 但 ${direct} 不存在`).toBe(true);
    }
  });

  it('零 fetch / provider 字面；纯 RSC（不走网络）', () => {
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('provider');
    expect(page).not.toContain('/api/');
  });
});
