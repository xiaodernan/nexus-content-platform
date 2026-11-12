import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-33 `/admin/rate-limit` 限流闸诊断（§SEC 第三十五片）——**静态那一寸**。
 *
 * `page.tsx`：denied×2 + 诊断页（summary/scope 明写这台实例口径）。
 * `StatsPanel.tsx`（client）：4s 轮询 `/api/admin/rate-limit`（no-store）；驱动装法（in-process|redis）、
 * windowScope、wire 三态（na/up/pending/down）、fallbackCount 双态（null="没有本该共享却退回"）、
 * IP_RATE_RULES 两列对齐原样端出。
 *
 * 本片只换皮；wire 判据（WIRE_LABEL）、fallback 原因（REASON_LABEL）、rules 排序——一字不改。
 *
 * **剥 className 后全文 SHA256 守恒（EOL 无关）**：page=`a7cff6c8…`，panel=`6cc9b0b4…`。
 * redact 三步序与钉死常量一致。
 *
 * 判据不变式（12 门）：
 *  1. page.tsx server 组件 + denied×2 + role 闸门 + AdminNav current="rate-limit"；
 *  2. panel 保留 'use client' + `setInterval(…4000)` + `no-store` + isKnownShape 守卫进门；
 *  3. 字面 className 全 `.adm-*`/`.am-*`/`.ar-*`/`.rl-*`；4. 零裸 Tailwind 原子类；
 *  5. 用到的每个类都在 globals.css 有定义；6. `.rl-` 段成规模（≥ 5 条）；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 *  10. `.rl-` 段零 transition / @media；11. `.rl-ruleRoute` 锚 mono + `.ar-num` 锚 tabular-nums；
 *  12. SHA256 双文件守恒 + 数据钩子守恒（panel 12 个 data-ratelimit-*）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/admin/rate-limit/page.tsx');
const PANEL = join(ROOT, 'apps/web/src/app/admin/rate-limit/StatsPanel.tsx');
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

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.rl-` 视觉段：`.rl-dl {` 起，到下一个 §FE 段头止。 */
function rlSegment(css: string): string {
  const start = findOutsideComments(css, /\.rl-dl \{/);
  if (start < 0) throw new Error('globals.css 找不到 .rl- 段（.rl-dl {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = rlSegment(globals);

/** redact：EOL 归一（\r\n→\n）+ className 任意形态归一 @。与钉死常量一致。 */
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
    for (const m of line.matchAll(/\.((?:adm|am|ar|au|rl|tl|gw)-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-33 /admin/rate-limit 限流闸诊断', () => {
  it('page.tsx 是纯 server 组件 + denied×2 + role 闸门 + AdminNav current="rate-limit"', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).toContain("user.role !== 'admin'");
    expect(pageCode).toContain('<AdminNav current="rate-limit"');
    expect(pageCode).toContain('data-admin-denied="anonymous"');
    expect(pageCode).toContain('data-admin-denied="not-admin"');
    expect(pageCode).toContain('data-ratelimit-admin-root');
    expect(pageCode).toContain('<RateLimitStatsPanel');
  });

  it('panel 保留 client 指令 + 4s 轮询 + no-store + 回执形状守卫进门', () => {
    expect(panel.slice(0, 40)).toContain("'use client'");
    expect(panelCode).toContain('setInterval(() => void tick(), 4000)');
    expect(panelCode).toContain("cache: 'no-store'");
    expect(panelCode).toContain("fetch('/api/admin/rate-limit'");
    expect(panelCode).toContain("typeof body.driver !== 'string'");
  });

  it('数据钩子守恒：page 四组 + panel 十四组', () => {
    for (const hook of ['data-ratelimit-admin-root', 'data-ratelimit-summary', 'data-ratelimit-scope']) {
      expect(pageCode, `page 丢了钩子 ${hook}`).toContain(hook);
    }
    for (const hook of [
      'data-ratelimit-stats="error"',
      'data-ratelimit-stats="loading"',
      'data-ratelimit-stats="ready"',
      'data-ratelimit-driver=',
      'data-ratelimit-window-scope=',
      'data-ratelimit-wire=',
      'data-ratelimit-ceiling',
      'data-ratelimit-tracked',
      'data-ratelimit-prefix',
      'data-ratelimit-fallback=',
      'data-ratelimit-pruned',
      'data-ratelimit-deployment=',
      'data-ratelimit-rules',
      'data-ratelimit-scope-warning',
      'data-ratelimit-updated',
    ]) {
      expect(panelCode, `panel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('两个文件的字面 className 只认 .adm-*/.am-*/.ar-*/.rl-*', () => {
    let total = 0;
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(adm|am|ar|rl|tl)-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(24);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        const bad = cls.split(/\s+/).filter((t) => t && !/^(adm|am|ar|rl|tl)-/.test(t));
        expect(bad, `门面类之外还出现了：${bad.join(' ')}`).toEqual([]);
      }
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set(
      [...(pageCode + '\n' + panelCode).matchAll(/\b(?:adm|am|ar|rl|tl)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]),
    );
    expect(used.size).toBeGreaterThanOrEqual(14);
    const defined = frClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.rl- 视觉段成规模（≥ 5 条）且零 transition / @media', () => {
    expect(segment.length).toBeGreaterThan(200);
    expect((segment.match(/\.rl-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
  });

  it('零写死 hex（视觉段 + 两个文件都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.rl- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(6);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）；.rl-ruleRoute 锚 mono', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toMatch(/\.rl-ruleRoute \{[^}]*font-family: var\(--nexus-font-mono\)/);
  });

  it('focus-visible 锚仍定（.adm-navItem），.ar-num 锚 tabular-nums', () => {
    expect(globals).toContain('.adm-navItem:focus-visible');
    expect(globals).toMatch(/\.ar-num \{[^}]*font-variant-numeric: tabular-nums/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：page=a7cff6c8… · panel=6cc9b0b4…）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'a7cff6c8e8f5e52e22302d26288ca46df068181eb697e51c5b30decaf4234d54',
    );
    expect(createHash('sha256').update(redactClasses(panel)).digest('hex')).toBe(
      '6cc9b0b435c28aeca9a40e687c5e7a3f882a2a4c1b7159aa41737420f652e89e',
    );
  });
});
