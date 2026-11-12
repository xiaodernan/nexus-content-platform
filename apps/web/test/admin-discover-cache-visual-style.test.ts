import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-36 `/admin/discover-cache` 发现页缓存态势（§SC-43/SC-44/SC-45/SC-46/SC-47）——**静态那一寸**。
 *
 * `page.tsx`：denied×2 + AdminNav（denied 分支复用 `.adm-*`，titleLg 的 24px 标题/壳层迁入 `.am-*`）。
 * `DiscoverPanel.tsx`（client）：4s 轮询 `/api/admin/discover-cache`、visibilitychange 封印；
 * `bus:null` 中立档、命中率分母 0、水位线/全局世代/洪潮/上游降级/耗时 P99 ——全部复用 `.gw-*`/`.dc-*`。
 * 本片只换皮：`dc-busCard`/`dc-ledgerRow`/`dc-ledgerGrid` 等 SC-43 原语保持冻结。
 *
 * **剥 className 后全文 SHA256 守恒（EOL 无关）**：page=`2f1974be…`，panel=`25cdf8a1…`。
 * redact 三步序与钉死常量一致。
 *
 * 判据不变式（12 门）：
 *  1. page.tsx server 组件 + denied×2 + role 闸门 + AdminNav current="discover-cache"；
 *  2. panel 保留 'use client' + 4s 轮询 + visibilitychange + isKnownReadout 进门；
 *  3. 字面 className 全 `.gw-*`/`.dc-*`/`.adm-*`/`.am-*`/`.ar-*`；4. 零裸 Tailwind 原子类；
 *  5. 用到的每个类都在 globals.css 有定义；6. SC-43 原语九件（gw-grid/card/kpiLabel/kpiValue/kpiHint/dot*、dc-busCard/Head/Detail/Hint/note/ledgerGrid/ledgerRow）齐全；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. `.dc-ledgerRow` 原样（flex baseline/between、border-top）；
 * 10. `.gw-skeleton` 自带 5.75rem（无 h-[92px] 残留）；11. SHA256 双文件守恒；12. 钩子守恒（panel 11+ 处）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/admin/discover-cache/page.tsx');
const PANEL = join(ROOT, 'apps/web/src/app/admin/discover-cache/DiscoverPanel.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const panel = readFileSync(PANEL, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pageCode = strip(page);
const panelCode = strip(panel);

/** redact：EOL 归一 + className 任意形态归一 @。与钉死常量一致。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

function frClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:gw|dc|adm|am|ar|au|rl|tl)-[A-Za-z0-9-]+)\s*[,{]/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-36 /admin/discover-cache 发现页缓存态势', () => {
  it('page.tsx 是纯 server 组件 + denied×2 + role 闸门 + AdminNav current="discover-cache"', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).toContain("user.role !== 'admin'");
    expect(pageCode).toContain('<AdminNav current="discover-cache"');
    expect(pageCode).toContain('<DiscoverPanel');
    expect(pageCode).toContain('data-discover-cache-root');
    expect(pageCode).toContain('data-discover-cache-scope');
  });

  it('panel 保留 client 指令 + 4s 轮询 + visibilitychange + isKnownReadout 进门', () => {
    expect(panel.slice(0, 40)).toContain("'use client'");
    expect(panelCode).toContain('const POLL_MS = 4000');
    expect(panelCode).toContain("document.addEventListener('visibilitychange'");
    expect(panelCode).toContain('pollAllowed(document.visibilityState)');
    expect(panelCode).toContain('isKnownReadout(body)');
    expect(panelCode).toContain("cache: 'no-store'");
  });

  it('数据钩子守恒：loading/error/ready/KPI/bus/generation/epoch/waves/stale/load timing', () => {
    for (const hook of [
      'data-discover-cache-loading',
      'data-discover-cache-error',
      'data-discover-cache-ready',
      'data-discover-kpi=',
      'data-discover-bus=',
      'data-discover-bus-attached=',
      'data-discover-bus-ledger',
      'data-discover-errors-note',
      'data-discover-bus-null',
      'data-discover-generation',
      'data-discover-generation-note',
      'data-discover-epoch',
      'data-discover-epoch-note',
      'data-discover-waves-headline',
      'data-discover-waves',
      'data-discover-waves-note',
      'data-discover-stale',
      'data-discover-stale-note',
      'data-discover-load-headline',
      'data-discover-load-timing',
      'data-discover-load-samples',
      'data-discover-load-note',
      'data-discover-cache-footer',
    ]) {
      expect(panelCode, `panel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .gw-*/.dc-*/.adm-*/.am-*/.ar-*', () => {
    let total = 0;
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(gw|dc|adm|am|ar|au|rl|tl)-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(30);
  });

  it('零裸 Tailwind 原子类（gw-/dc- 除外）', () => {
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        const bad = cls.split(/\s+/).filter((t) => t && !/^(gw|dc|adm|am|ar|tl)-/.test(t));
        expect(bad, `门面类之外还出现了：${bad.join(' ')}`).toEqual([]);
      }
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set(
      [...(pageCode + '\n' + panelCode).matchAll(/\b(?:gw|dc|adm|am|ar|au|rl|tl)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]),
    );
    expect(used.size).toBeGreaterThanOrEqual(24);
    const defined = frClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('零写死 hex + 零新增颜色 token（SC-43 冻结：颜色只走 token-mix）', () => {
    expect(pageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(globals).not.toMatch(/--nexus-color-disc-\w*\s*:/);
  });

  it('.dc- 段引用的每个 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const seg = globals.slice(globals.indexOf('.dc-busCard {'), globals.indexOf('@keyframes', globals.indexOf('.dc-busCard {')));
    const used = [...new Set([...seg.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(6);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('SC-43 `.gw-*`/`.dc-*` 九原语冻结；`.dc-ledgerRow` 原样（flex baseline/between、border-top）', () => {
    for (const sel of ['.gw-grid', '.gw-card', '.gw-kpiLabel', '.gw-kpiValue', '.gw-kpiHint', '.gw-pill', '.dc-busCard', '.dc-busHead', '.dc-busDetail', '.dc-note', '.dc-ledgerGrid', '.dc-ledgerRow']) {
      expect(globals).toContain(sel);
    }
    expect(globals).toMatch(/\.dc-ledgerRow \{[^}]*justify-content: space-between/);
    expect(globals).toMatch(/\.dc-ledgerRow \{[^}]*border-top:/);
  });

  it('.gw-skeleton 自带 5.75rem（无 h-[92px] 残留）；.dc-ledgerLabel/.dc-busHeadline 有定义', () => {
    expect(globals).toMatch(/\.gw-skeleton \{[^}]*height: 5\.75rem/);
    expect(panelCode).not.toContain('h-[92px]');
    expect(globals).toContain('.dc-ledgerLabel {');
    expect(globals).toContain('.dc-busHeadline {');
  });

  it('mon 三元守恒：gw-ident / am-mutedText 由同一三元拼出', () => {
    expect(panelCode).toMatch(/className=\{mono \? 'gw-ident' : 'am-mutedText'\}/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：page=2f1974be… · panel=25cdf8a1…）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '2f1974be810eaef6cf0c82f65027adc7a386a113641665cc987a172d7738d399',
    );
    expect(createHash('sha256').update(redactClasses(panel)).digest('hex')).toBe(
      '25cdf8a11f726713e8039c7fa239428bfcc135408cf01c072e5b8b028abc315e',
    );
  });
});
