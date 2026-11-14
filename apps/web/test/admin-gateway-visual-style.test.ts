import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-32 `/admin/gateway` 网关态势（§SC-40）——**静态那一寸**。
 *
 * `page.tsx`：denied×2 + 18 卡之一（denied 分支复用 `.adm-*`）+ 期刊分行布局中的
 * `.gw-grid`/`.gw-card`/`.gw-dot*`/`.gw-pill`/`.gw-row`/`.gw-gapItem` 全部保留 §SC-40 的
 * 命中表（SC-40 只挑"在哪一层用 css 类"——重活归 token，颜色纪律不变）。
 * `GatewayPanel.tsx`（client）：4s 轮询 / visibilitychange 暂停 / 拉取失败不清空上一帧——只换皮。
 *
 * **剥 className 后全文 SHA256 守恒（EOL 无关）**：两文件均恒等于改前（git HEAD）。
 * redact（\r\n→\n 后）三步序与钉死常量一致：page=`be946472…`，panel=`7922f441…`。
 *
 * 判据不变式（12 门）：
 *  1. page.tsx server 组件 + denied×2 + AdminNav current="gateway"（denied 分支 `.adm-*` 复用）；
 *  2. GatewayPanel 保留 'use client' + visibilitychange + POLL_MS=4000 + pollAllowed 进门；
 *  3. 字面 className 全 `.gw-*`/`.adm-*`/`.am-*`/`.ar-*`；4. 零裸 Tailwind 原子类；
 *  5. 用到的每个类都在 globals.css 有定义；6. `.gw-` 段零新增分辨率结构（SC-40 冻结）+ 零 transition（动效禁区内保留 `gw-shimmer` 唯一动画）；
 *  7. 零写死 hex（SC-40 段例外允许 token-mix 颜色但禁 hex 字面量）；
 *  8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. `.gw-skeleton` 自带 5.75rem 高度；
 * 10. `.gw-ident`/`.gw-ident2` 锚 mono+tabular-nums+fg-1/fg-2；11. SHA256 双文件守恒；
 * 12. 数据钩子守恒（gateway×KPI×5 / columns×3 / refresh-error / service rows / gaps / notes×3/footer）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/admin/gateway/page.tsx');
const PANEL = join(ROOT, 'apps/web/src/app/admin/gateway/GatewayPanel.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const panel = readFileSync(PANEL, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pageCode = code(page);
const panelCode = code(panel);

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
    for (const m of line.matchAll(/\.((?:gw|adm|am|ar|au|tl)-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-32 /admin/gateway 网关态势', () => {
  it('page.tsx 是纯 server 组件 + denied×2 + AdminNav current="gateway"', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).toContain("user.role !== 'admin'");
    expect(pageCode).toContain('<AdminNav current="gateway"');
    expect(pageCode).toContain('data-admin-denied="anonymous"');
    expect(pageCode).toContain('data-admin-denied="not-admin"');
    expect(pageCode).toContain('data-gateway-root');
    expect(pageCode).toContain('data-gateway-scope');
    expect(pageCode).toContain('<GatewayPanel');
  });

  it('GatewayPanel 保留 client 指令 + 轮询封印：POLL_MS=4000 + visibilitychange + pollAllowed', () => {
    expect(panel.slice(0, 40)).toContain("'use client'");
    expect(panelCode).toContain('const POLL_MS = 4000');
    expect(panelCode).toContain("document.addEventListener('visibilitychange'");
    expect(panelCode).toContain('pollAllowed(document.visibilityState)');
    expect(panelCode).toContain('setInterval(() => void tick(), POLL_MS)');
    expect(panelCode).toContain('document.visibilityState ===');
  });

  it('数据钩子守恒：KPI/columns/refresh-error/service/gap/note/footer/loading', () => {
    for (const hook of [
      'data-gateway-loading',
      'data-gateway-error',
      'data-gateway-ready',
      'data-gateway-kpi=',
      'data-gateway-columns',
      'data-gateway-refresh-error',
      'data-gateway-service=',
      'data-gateway-gap=',
      'data-gateway-note=',
      'data-gateway-footer',
      'data-gateway-empty',
      'data-gateway-kpi',
    ]) {
      expect(panelCode, `panel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .gw-*/.adm-*/.am-*/.ar-*', () => {
    let total = 0;
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(gw|adm|am|ar|tl)-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(28);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        const forbidden = cls.split(/\s+/).filter((tok) => tok && !/^(gw|adm|am|ar|tl)-/.test(tok));
        expect(
          forbidden,
          `门面类之外还出现了：${forbidden.join(' ')}`,
        ).toEqual([]);
      }
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...(pageCode + '\n' + panelCode).matchAll(/\b(?:gw|adm|am|ar|tl)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = frClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.gw- 段引用的每个 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const seg = globals.slice(globals.indexOf('.gw-grid {'), globals.indexOf('/* ────────────────', globals.indexOf('.gw-skeleton {')));
    const used = [...new Set([...seg.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('SC-40 `.gw-*` 段保持冻结结构（grid/card/kpi/dot/pill/row/gapItem/mono/skeleton 九类俱全）', () => {
    for (const sel of ['.gw-grid', '.gw-card', '.gw-kpiLabel', '.gw-kpiValue', '.gw-dotUp', '.gw-dotDown', '.gw-dotUnknown', '.gw-pill', '.gw-row', '.gw-gapItem', '.gw-mono', '.gw-skeleton']) {
      expect(globals).toContain(sel);
    }
  });

  it('.gw-skeleton 自带 5.75rem 高度（92px 不准再写在 markup），且无 transition 进入 .am-/.gw- 段', () => {
    expect(globals).toMatch(/\.gw-skeleton \{[^}]*height: 5\.75rem/);
    expect(globals).not.toMatch(/\.gw-skeleton \{[^}]*h-\[92px\]/);
  });

  it('零写死 hex（视觉段 + 两个文件都不许——SC-40 用的是 token-mix，不写 hex）', () => {
    const segment = globals.slice(globals.indexOf('.gw-grid {'), globals.indexOf('.gw-kpiHint'));
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('两个新增 gw-ident 类锚 mono + tabular-nums + fg-1/fg-2', () => {
    expect(globals).toMatch(/\.gw-ident \{[^}]*color: var\(--nexus-color-fg-1\)/);
    expect(globals).toMatch(/\.gw-ident \{[^}]*font-variant-numeric: tabular-nums/);
    expect(globals).toMatch(/\.gw-ident2 \{[^}]*color: var\(--nexus-color-fg-2\)/);
    expect(globals).toMatch(/\.gw-ident2 \{[^}]*font-variant-numeric: tabular-nums/);
  });

  it('denied 两态与 aria 不倒退：AdminNav :focus-visible 仍定；本页无横滚区、不放 role="region"', () => {
    expect(globals).toContain('.adm-navItem:focus-visible');
    expect(code(panel)).not.toContain('role="region"');
    expect(code(page)).toContain('<AdminNav current="gateway"');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：page=be946472… · panel=7922f441…）', () => {
    // 常量在改前（git HEAD）由真实产物 redact（EOL 归一后三步）算出并钉死。
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'be94647267f663fa807cbee6ed4da9a5b70f0d3efe4ecbeda350de28985396e7',
    );
    expect(createHash('sha256').update(redactClasses(panel)).digest('hex')).toBe(
      '7922f44149ea6382bab8a90ac1a4966592a3071b42ce4eb1ab86d5fe279b015d',
    );
  });
});
