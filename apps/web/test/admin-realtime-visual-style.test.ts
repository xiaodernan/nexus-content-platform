import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-27 `/admin/realtime` 实时总线诊断入口（§163）——**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * `page.tsx`：denied×2（anonymous/not-admin）+ 诊断页（summary/scope 写死多实例口径）。
 * `StatsPanel.tsx`（'use client'）：轮询 `/api/admin/realtime`（no-store，4s），`isKnownStats`
 * 守卫；「此刻/启动那次」wireReady 分行、in-memory 写"不适用"、ai-service capability 段
 * （§SC-79）原样。页面只换皮，文案/判据/轮询/四分格（wire/java/breakers/actuator/ai）一字不改。
 *
 * **剥 className 后全文 SHA256 守恒**：两文件均恒等于改前（git HEAD）。
 * redact 三步序与钉死常量一致：page=`09b484f7…`，panel=`f66b4716…`。
 *
 * 判据不变式（13 门）：
 *  1. page.tsx server 组件 + denied×2 + role 闸门 + AdminNav current="realtime"；
 *  2. panel 保留 'use client'；`setInterval(…4000)`、`isKnownStats`、`cache: 'no-store'` 进门；
 *  3. 字面 className 全 `.adm-*`/`.ar-*`；4. 零裸 Tailwind 原子类；
 *  5. 用到的每个类都在 globals.css 有定义（双家族）；6. `.ar-` 段成规模（≥ 14 条）；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. `.ar-` 段零 transition / @media；11. ar-capabilityReal = var(--nexus-color-success)；
 * 12. SHA256 双文件守恒；13. 数据钩子守恒（panel 20+ 个 data-realtime- 系/data-java- 系/data-ai- 系）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/admin/realtime/page.tsx');
const PANEL = join(ROOT, 'apps/web/src/app/admin/realtime/StatsPanel.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const panel = readFileSync(PANEL, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const panelCode = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.ar-` 视觉段：`.ar-errorNote {` 起，到下一个 §FE 段头止。 */
function arSegment(css: string): string {
  const start = findOutsideComments(css, /\.ar-errorNote \{/);
  if (start < 0) throw new Error('globals.css 找不到 .ar- 段（.ar-errorNote {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = arSegment(globals);

/** redact：className 任意形态归一 @；与钉死常量那次一致。 */
function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

function frClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:adm|ar)-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-27 /admin/realtime 实时总线诊断', () => {
  it('page.tsx 是纯 server 组件 + denied×2 + role 闸门 + AdminNav current="realtime"', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).toContain("user.role !== 'admin'");
    expect(pageCode).toContain('data-admin-denied="anonymous"');
    expect(pageCode).toContain('data-admin-denied="not-admin"');
    expect(pageCode).toContain('<AdminNav current="realtime"');
    expect(pageCode).toContain('<RealtimeStatsPanel');
    expect(pageCode).not.toContain('onClick=');
  });

  it('panel 保留 client 指令；轮询与守卫原样：setInterval(4000) · isKnownStats · no-store', () => {
    expect(panel.slice(0, 40)).toContain("'use client'");
    expect(panelCode).toContain('setInterval(() => void tick(), 4000)');
    expect(panelCode).toContain('isKnownStats(body)');
    expect(panelCode).toContain("cache: 'no-store'");
    expect(panelCode).toContain("fetch('/api/admin/realtime'");
  });

  it('两个文件的字面 className 只认 .adm-*/.ar-*', () => {
    let total = 0;
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(adm|ar)-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(28);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        expect(cls).not.toMatch(
          /\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|text-fg-|text-danger-|text-success|bg-|flex\b|grid\b|gap-|items-|min-h-|max-w-\[|whitespace-|tabular-nums|md:|sm:|lg:|hover:|font-|rounded-|border-t|border-\[|pt-)\b/,
        );
      }
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...(pageCode + '\n' + panelCode).matchAll(/\b(?:adm|ar)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = frClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.ar- 视觉段成规模（≥ 14 条视觉类）', () => {
    expect(segment.length).toBeGreaterThan(300);
    expect((segment.match(/\.ar-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(14);
  });

  it('零写死 hex（视觉段 + 两个文件都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.ar- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('.ar- 段零 transition / @media（诊断表盘无动效）', () => {
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
  });

  it('ar-capabilityReal = var(--nexus-color-success)（capability=real 那一格）', () => {
    expect(segment).toMatch(/\.ar-capabilityReal \{[^}]*color: var\(--nexus-color-success\)/);
    expect(panelCode).toContain("'ar-capabilityReal'");
  });

  it('数据钩子守恒：panel 20+ 个 data-realtime-*/data-java-*/data-ai-*', () => {
    for (const hook of [
      'data-realtime-stats',
      'data-realtime-driver',
      'data-realtime-instance',
      'data-realtime-wire',
      'data-realtime-wire-boot',
      'data-realtime-errors',
      'data-realtime-errors-by-reason',
      'data-realtime-subscribers',
      'data-realtime-error-note',
      'data-realtime-updated',
      'data-java-wire',
      'data-java-breaker-name',
      'data-java-breaker-buffered',
      'data-java-breaker-failed',
      'data-java-breaker-rate',
      'data-java-actuator-row',
      'data-ai-capability-row',
      'data-ai-capability="missing"',
    ]) {
      expect(panelCode, `panel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('剥 className 后全文 SHA256 守恒（零行为：page=09b484f7… · panel=f66b4716…）', () => {
    // 常量在改前（git HEAD）由真实产物 redact 算出并钉死；此门保证除 className 外一字节未动。
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '09b484f797ec273cd78066933b94eb8412876def654d732fd108411ebdaf4008',
    );
    expect(createHash('sha256').update(redactClasses(panel)).digest('hex')).toBe(
      'f66b471627e00200fc66b3eb9bc0a0fbb5dc56154d65239c4f6c3357050b25ed',
    );
  });
});
