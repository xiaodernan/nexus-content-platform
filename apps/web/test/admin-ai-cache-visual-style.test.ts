import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §CACHE-2 `/admin/ai-cache` 缓存读数页——**静态那一寸**。
 *
 * 测的是四类会静默腐坏的东西（与 `admin-discover-cache-visual-style.test.ts` 同一套纪律）：
 * 1. 门禁：page 是 server 组件、denied×2、role 闸门、route 也是同一道门；
 * 2. 轮询：4s、后台暂停、失败保留上一帧；
 * 3. 门面类：只认 `gw-|cx-|adm-|am-|ar-`，且每个都在 globals.css 有定义；
 * 4. token：`cx-` 段引用的每个 `var(--nexus-*)` 都在 tokens.css 声明过，零写死 hex。
 *
 * 另加两条这一页特有的**诚实判据**：
 * - `appCache: null` 必须有独立分支（`data-ai-cache-app-null`），不许画成四个 0；
 * - 没有样本时条形图不画（`cx-barEmpty`），否则一根空条会读成 0%。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/admin/ai-cache/page.tsx');
const PANEL = join(ROOT, 'apps/web/src/app/admin/ai-cache/AiCachePanel.tsx');
const VIEW = join(ROOT, 'apps/web/src/app/admin/ai-cache/cache-view.ts');
const ROUTE = join(ROOT, 'apps/web/src/app/api/admin/ai-cache/route.ts');
const NAV = join(ROOT, 'apps/web/src/components/AdminNav.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const panel = readFileSync(PANEL, 'utf8');
const view = readFileSync(VIEW, 'utf8');
const route = readFileSync(ROUTE, 'utf8');
const nav = readFileSync(NAV, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pageCode = strip(page);
const panelCode = strip(panel);

function definedClasses(css: string): Set<string> {
  const out = new Set<string>();
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const line of noComments.split('\n')) {
    for (const match of line.matchAll(/\.((?:gw|cx|adm|am|ar)-[A-Za-z0-9-]+)\s*[,{:@]/g)) out.add(match[1]!);
  }
  return out;
}

describe('§CACHE-2 /admin/ai-cache 门禁与轮询', () => {
  it('page 是纯 server 组件：denied×2 + role 闸门 + AdminNav current="ai-cache"', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).toContain("user.role !== 'admin'");
    expect(pageCode).toContain('<AdminNav current="ai-cache"');
    expect(pageCode).toContain('<AiCachePanel');
    expect(pageCode).toContain('data-ai-cache-root');
    expect(pageCode).toContain('data-ai-cache-scope');
  });

  it('route 是同一道门 + no-store + 失败原样端出原因', () => {
    expect(route).toContain("currentUserOrNull()");
    expect(route).toContain("user.role !== 'admin'");
    expect(route).toContain("jsonError(401");
    expect(route).toContain("jsonError(403");
    expect(route).toContain("jsonError(503");
    expect(route).toContain("'cache-control': 'no-store'");
    // 不把三种失败合并成一句话
    expect(route).toContain('result.error');
  });

  it('panel：4s 轮询 + 后台暂停 + 失败保留上一帧 + 形状不认识就当作没测到', () => {
    expect(panel.slice(0, 40)).toContain("'use client'");
    expect(panelCode).toContain('const POLL_MS = 4000');
    expect(panelCode).toContain("document.addEventListener('visibilitychange'");
    expect(panelCode).toContain('isKnownReadout(body)');
    expect(panelCode).toContain("cache: 'no-store'");
    // 失败只 setError，不 setReadout(null) —— 注释里写着"保留上一帧"
    expect(panelCode).toContain('保留上一帧');
  });

  it('管理台导航里有这一页（名单收在 LINKS 一处）', () => {
    expect(nav).toContain("{ key: 'ai-cache', href: '/admin/ai-cache', label: '缓存读数' }");
  });
});

describe('§CACHE-2 /admin/ai-cache 门面类与 token', () => {
  it('className 字面量只出现 gw-/cx-/adm-/am-/ar- 门面类', () => {
    let total = 0;
    for (const source of [pageCode, panelCode]) {
      for (const match of source.matchAll(/className="([^"]*)"/g)) {
        total += 1;
        for (const token of match[1]!.split(/\s+/).filter(Boolean)) {
          expect(token, `出现了非门面类：${token}`).toMatch(/^(gw|cx|adm|am|ar)-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(20);
  });

  it('组件里出现的每个门面类都在 globals.css 有定义', () => {
    const used = new Set(
      [...(pageCode + '\n' + panelCode).matchAll(/\b(?:gw|cx|adm|am|ar)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]),
    );
    expect(used.size).toBeGreaterThanOrEqual(22);
    const defined = definedClasses(globals);
    for (const name of used) {
      expect(defined, `globals.css 没有定义 .${name}`).toContain(name);
    }
  });

  it('零写死 hex（page / panel / view 三份都算）', () => {
    for (const source of [pageCode, panelCode, strip(view)]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it('cx- 段引用的每个 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const start = globals.indexOf('.cx-verdict {');
    expect(start).toBeGreaterThan(0);
    const end = globals.indexOf('@media (prefers-reduced-motion: reduce)', start);
    expect(end).toBeGreaterThan(start);
    const segment = globals.slice(start, end);
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(18);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('cx- 段有 reduced-motion 归零与 forced-colors 回退', () => {
    const start = globals.indexOf('.cx-verdict {');
    const segment = globals.slice(start);
    expect(segment).toContain('@media (prefers-reduced-motion: reduce)');
    expect(segment).toContain('.cx-verdict { animation: none; }');
    expect(segment).toContain('@media (forced-colors: active)');
    expect(segment).toContain('.cx-barFirst { background: Highlight; }');
  });

  it('分段条不靠颜色单独传意：两段各有图例文字与 role="img" 的读数', () => {
    expect(panelCode).toContain('role="img"');
    expect(panelCode).toContain('aria-label={`${first} ');
    expect(panelCode).toContain('cx-legendDotFirst');
    expect(panelCode).toContain('cx-legendDotSecond');
  });
});

describe('§CACHE-2 /admin/ai-cache 诚实分支', () => {
  it('appCache 为 null 有独立分支（不是四个 0）', () => {
    expect(panelCode).toContain('data-ai-cache-app-null');
    expect(panelCode).toContain('这一格不是"0 命中"');
    expect(panelCode).toContain('{appCache ? (');
  });

  it('没有样本时不画条（空条会读成 0%）', () => {
    expect(panelCode).toContain('cx-barEmpty');
    expect(panelCode).toContain('没有样本，不画比例');
  });

  it('判定卡把结论前置，且左条颜色随判定变（文字仍中性）', () => {
    expect(panelCode).toContain('data-ai-cache-verdict={verdict}');
    expect(panelCode).toContain('cx-verdictHeadline');
    expect(globals).toMatch(/\.cx-verdict\[data-ai-cache-verdict='good'\] \{ border-left-color: var\(--nexus-color-success\)/);
    expect(globals).toMatch(/\.cx-verdict\[data-ai-cache-verdict='cold'\] \{ border-left-color: var\(--nexus-color-danger\)/);
  });

  it('数据钩子守恒（e2e / 视觉回归靠它们定位）', () => {
    for (const hook of [
      'data-ai-cache-loading',
      'data-ai-cache-error',
      'data-ai-cache-ready',
      'data-ai-cache-kpi=',
      'data-ai-cache-verdict=',
      'data-ai-cache-verdict-tag=',
      'data-ai-cache-prefix',
      'data-ai-cache-prefix-note',
      'data-ai-cache-capacity-note',
      'data-ai-cache-app',
      'data-ai-cache-app-note',
      'data-ai-cache-provider',
      'data-ai-cache-provider-note',
      'data-ai-cache-refresh-error',
      'data-ai-cache-footer',
    ]) {
      expect(panelCode, `panel 丢了钩子 ${hook}`).toContain(hook);
    }
  });
});
