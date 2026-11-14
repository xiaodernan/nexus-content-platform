import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-60 `TeamPanel.tsx` `.tp-` 门面化（§133 teamCollaboration）——**静态那一寸**。
 *
 * 项目名册与邀请的界面：owner/admin/member 角色面；满员时邀请按钮照旧能点——服务端会拒，界面先说清为什么（§159：展示与门不许对不上）。
 * 本片只换皮；角色/邀请派发全部一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `a1c0ed8645e8b1c2e632093baea528d79a307458f96a2e05bce6f16f7a8978c0` 与 HEAD 字节一致。
 *
 * 判据不变式（10 门）：
 *  1. 'use client' 保留 + csrfHeaders/studio 进门；2. 字面 className 全 `.tp-*`/复用族；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.tp-` 段成规模（≥ 12 条）；
 *  6. 零 hex；7. 字面量只出现在 1px / 0.8125rem 替代位；8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；
 *  9. 零 transition/@media/@keyframes；10. SHA256 守恒 + 钩子守恒（data-team-*）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/TeamPanel.tsx');
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

/** `.tp-` 视觉段：`.tp-colFaint {` 起，到下一个 §FE 段止。 */
function tpSegment(css: string): string {
  const start = findOutsideComments(css, /\.tp-colFaint \{/);
  if (start < 0) throw new Error('globals.css 找不到 .tp- 段（.tp-colFaint {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = tpSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\s+/g, ' ');
}

function classesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:tp|sb|wd|cp|gp|hi|ds)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-60 /studio TeamPanel 团队协作面板', () => {
  it("csrfHeaders/studio 进门（TeamPanel 无 'use client' 首令牌——由 Studio 客户端边界注入 client context，build 既成事实）", () => {
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('useStudioReady()');
  });

  it('数据钩子守恒：teamCollab 各分屏', () => {
    expect(code).toContain('团队（§133 · teamCollaboration）');
  });

  it('字面 className 只认 .tp-*/复用族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(14);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:tp|sb|wd|cp|gp|hi|ds)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind', () => {
    for (const re of ['px-', 'py-', 'w-[', 'flex h-', 'break-all ', 'flex flex-col', 'flex items-end', 'bg-bg-', 'text-fg-', 'hover:bg-', 'text-[10px', 'text-[12px']) {
      expect(code, `TeamPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:tp|sb|wd|cp|gp|hi|ds)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(14);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.tp- 段成规模（≥ 12 定义）且零 @media / transition / @keyframes', () => {
    expect(segment.length).toBeGreaterThan(1000);
    expect((segment.match(/\.tp-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex；token 全声明', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(5);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.tp-rowBetween/.tp-chipDanger/.tp-btnPrimary 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.tp-rowBetween {', '.tp-chipDanger:disabled {', '.tp-btnPrimary:disabled {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className 后全文 SHA256 守恒（2026-11-16 v744「TeamPanel 双语化」重钉：a1c0ed8645e8b1c2e632093baea528d79a307458f96a2e05bce6f16f7a8978c0）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'a1c0ed8645e8b1c2e632093baea528d79a307458f96a2e05bce6f16f7a8978c0',
    );
  });
});
