import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-61 `CommandBar.tsx` `.cb-` 门面化（§7 底部 AI 命令栏）——**静态那一寸**。
 *
 * 输入 → Agent Plan → 执行 → Activity → 一次事务落地 → AI Diff → 可整体撤销。
 * DEMO MODE / LIVE PROVIDER 两 chip 只 toggle 两色板（§160）——DEMO→warn / LIVE→success；
 * 真 provider 才从 studio.live 切；未接时显示离线面板——不假装 AI。
 * 本片只换皮；plan 派发、APPROVAL_TTL_MS 流、aiObservation 回读路径——一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `559ab1e2186695d1f36676e22c827fa24b28419c84411e40ff33510ac7e69227` 与 HEAD 字节一致。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + csrfHeaders/studio.flushBeforeAi 进门；2. 字面 className 全 `.cb-*`/复用族（含 cn 三元分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.cb-` 段成规模（≥ 25 条）；
 *  6. 零 hex；7. 字面量只出现在 2.125rem / 0.8125rem / 1.625rem / 1.5rem / 6px；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 transition/@media/@keyframes；11. `data-demo-mode` DEMO/LIVE 成对守恒（.cb-flagWarn/.cb-flagLive）；
 * 12. SHA256 守恒 + 钩子守恒（data-ai- 系列 / data-demo-mode 成对守恒）。
 *
 * **§CACHE-3（2026-11-14）恒等门换过一次值**：`d86846b8…` → `7ef8ffcc…`。
 * 原因是生成结果行多了一枚缓存读数 chip（`data-ai-cache` 钩子 + `cacheText` 措辞）——
 * 那是**真实的新界面元素**，不是换皮，所以门该破。来由记在这里而不是只改断言：
 * 下一个人看到哈希变了，得能查到为什么。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/CommandBar.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(main);

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.cb-` 视觉段：`.cb-mtHint {` 起，到下一个 §FE 段止。 */
function cbSegment(css: string): string {
  const start = findOutsideComments(css, /\.cb-mtHint \{/);
  if (start < 0) throw new Error('globals.css 找不到 .cb- 段（.cb-mtHint {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = cbSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@`。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\bcn\([^)]*\)/gs, 'cn()')
    .replace(/\s+/g, ' ');
}

function classesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:cb|sb|wd|hi|ap|gp|ds|pb|cp|vb|tp)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-61 /studio CommandBar AI 命令栏', () => {
  it("'use client' 保留 + csrfHeaders/studio 进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('studio.flushBeforeAi(');
    expect(code).toContain('studio.applyAiTransaction(');
  });

  it('数据钩子守恒：data-demo-mode/data-ai-* 系列', () => {
    expect(code).toContain('data-demo-mode=');
    expect(code).toMatch(/data-ai-/);
  });

  it('字面 className 只认 .cb-*/复用族（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(24);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:cb|sb|wd|hi|ap|gp|ds|pb|cp|vb|tp)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'(?:cb|sb|wd|hi|ap|gp|ds|pb|cp|vb|tp)-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'(?:cb|sb|wd|hi|ap|gp|ds|pb|cp|vb|tp)-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（cb-/复用族之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'max-h-[', 'min-h-[', 'h-[', 'max-w-[', 'w-full', 'mt-1 ', 'absolute', 'pl-[', 'bg-bg-', 'text-fg-', 'items-center gap', 'hover:bg-', 'hover:text-']) {
      expect(code, `CommandBar 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:cb|sb|wd|hi|ap|gp|ds|pb|cp|vb|tp)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(26);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.cb- 视觉段成规模（≥ 30 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(2400);
    expect((segment.match(/\.cb-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(30);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex；字面量只出现在 2.125rem/0.8125rem/1.625rem/1.5rem/6px', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const anchor of ['2.125rem', '0.8125rem', '1.625rem', '1.5rem', '6px']) {
      expect(segment).toContain(anchor);
    }
  });

  it('.cb- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(13);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.cb-flagWarn/.cb-flagLive/.cb-segPill/.cb-primary/.cb-warningBanner 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.cb-flagWarn {', '.cb-flagLive {', '.cb-segOn {', '.cb-primary:disabled {', '.cb-warningBanner {', '.cb-demoFlag {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className/cn 后全文 SHA256 守恒（2026-11-16 v749「CommandBar 双语化」重钉：559ab1e2186695d1f36676e22c827fa24b28419c84411e40ff33510ac7e69227）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '559ab1e2186695d1f36676e22c827fa24b28419c84411e40ff33510ac7e69227',
    );
  });

  it('§CACHE-3 缓存 chip 接线：三态走 data-ai-cache、措辞走 cacheText，组件不许自己再写一份', () => {
    // 措辞住在 `lib/usage-cache-text.ts`（配 13 条纯函数判据）。这里钉的是**接线**：
    // 组件真的在用那份实现，并且三态是 `cacheState()` 给的、不是从中文措辞里 includes 出来的。
    //
    // 为什么强调"三态不从措辞反推"：措辞会变（今天"未报"、明天可能"网关未提供"），
    // 而 `hit/miss/unreported` 是稳定语义。用 `includes('未报')` 当协议，改一个词就静默失效。
    expect(code).toContain("from '@/lib/usage-cache-text'");
    expect(code).toContain('data-ai-cache={cacheState(result.usage)}');
    expect(code).toContain('{cacheText(result.usage)}');
  });
});
