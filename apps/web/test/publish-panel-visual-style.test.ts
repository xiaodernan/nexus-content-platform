import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-54 `PublishPanel.tsx` `.pb-` 门面化（§57 Publish）——**静态那一寸**。
 *
 * §179 的门禁（`analyzeHealth`）就是这里的数字来源；§163 项目频道发布链路上推来的
 * `build.status` / `preview.status` 画成两行——两行只在真的收到过事件时出现。
 * 本片只换皮；发布 dispatch / popover-dismiss / HealthWatch 派生、ARIA/钩子 — 一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `71037cfe7b5f0ba44fd152400c4a92ed232811f306b1b3d188503efa653dd5c1` 与 HEAD 字节一致。
 *
 * **§GATE-2（2026-11-14）这条门换过一次值，理由要留在这里**：上一版是
 * `5ad0738084b4e86b5201d24da1c71149c8bd65d0ac6ce830a6885167908142b8`，在提交
 * `33212785`（并轨收官尾巴）里失效——那次给 PublishPanel 加了**预检结果四行**
 * （`data-publish-preflight-outcome` / `data-publish-ai-ready` 两个钩子就是那时落地的）。
 * 那是真实的新行为，不是换皮，所以恒等门该破。破的时候没人来签字，因为
 * `not-found-visual-style.test.ts` 里的活体死循环让 `verify:fe-gates` 在字母序
 * `n` 处永久挂死，`p` 开头的这一套从来没被执行过——**死循环的代价不只是慢，是遮蔽**。
 * 死循环已修（§GATE-2），这一条按实际字节把欠的签字补上。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + PANEL_ID + popover-dismiss 进门；2. 字面 className 全 `.pb-*`/复用（含 cn 三元分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.pb-` 段成规模（≥ 20 条）；
 *  6. 零 hex；7. **`.pb-popPanel` 是本片唯一带 @media 的类（Tailwind max-[520px]: 逐字节播进来）**；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 transition/@keyframes；@media 只许 `520px` 一档；11. `.pb-publishBtn` 三档守恒：Idle(border-strong)/Live(brand 透明)/focus-visible；
 * 12. SHA256 守恒 + 钩子守恒（data-publish-open/ping-refresh/aria-controls/publication.visibility）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/PublishPanel.tsx');
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

/** `.pb-` 视觉段：`.pb-faint11m2 {` 起，到下一个 §FE 段止。 */
function pbSegment(css: string): string {
  const start = findOutsideComments(css, /\.pb-faint11m2 \{/);
  if (start < 0) throw new Error('globals.css 找不到 .pb- 段（.pb-faint11m2 {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = pbSegment(globals);

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
    for (const m of line.matchAll(/\.((?:pb|sb|wd|hi|ap|gp|hi|ds)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-54 /studio PublishPanel 发布面板', () => {
  it("'use client' 保留 + PANEL_ID + popover-dismiss 依赖进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain("PANEL_ID = 'nexus-publish-panel'");
    expect(code).toContain('usePopoverDismiss');
    expect(code).toContain("'private'");
  });

  it('数据钩子守恒：data-publish-open/ping 系系列', () => {
    expect(code).toContain('data-publish-open');
    expect(code).toContain('aria-controls={open ? PANEL_ID : undefined}');
  });

  it('字面 className 只认 .pb-*/复用族（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(18);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:pb|sb|wd|hi|ap|gp|ds)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'(?:pb|sb|wd|hi|ap|gp)-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'(?:pb|sb|wd|hi|ap|gp)-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（pb-/复用族之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'max-h-[', 'w-[', 'absolute right-0', 'top-[', 'max-w-', 'space-y-[', 'rounded-[', 'bg-bg-', 'text-fg-', 'shadow-2xl']) {
      expect(code, `PublishPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:pb|sb|wd|hi|ap|gp|ds)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.pb- 视觉段成规模（≥ 20 条）且零 transition / @keyframes / @media', () => {
    expect(segment.length).toBeGreaterThan(1200);
    // @media 只允许 520px 那一档（Tailwind max-[520px] 的逐字节播进来）
    const medias = segment.match(/@media\s*\(([^)]+)\)/g) ?? [];
    for (const m of medias) {
      expect(m, '.pb- 段只许 max-width: 520px 一档 @media').toContain('max-width: 520px');
    }
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
  });

  it('零写死 hex；.pb-popPanel 是 72vh+shadow lg+min(440px, 100vw-24px)，:520px 的 fixed 位全带', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('max-height: 72vh');
    expect(segment).toContain('width: min(440px, calc(100vw - 24px))');
    expect(segment).toContain('position: fixed');
    expect(segment).toContain('box-shadow: var(--nexus-shadow-lg)');
  });

  it('.pb- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(9);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.pb-publishBtn Live/Idle 双态 + focus-visible 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.pb-publishBtn.pb-publishLive {', '.pb-publishBtn.pb-publishIdle {', '.pb-publishBtn:focus-visible {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className/cn 后全文 SHA256 守恒（2026-11-15 v739「PublishPanel 双语化」重钉：71037cfe7b5f0ba44fd152400c4a92ed232811f306b1b3d188503efa653dd5c1）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '71037cfe7b5f0ba44fd152400c4a92ed232811f306b1b3d188503efa653dd5c1',
    );
  });
});
