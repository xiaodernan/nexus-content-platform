import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-76 `storyboard/page.tsx` 原子清零——叠加 `.ss-*`（§FE-8 已门面化）——**静态那一寸**。
 * §40 × §56：读的是发布那一刻钉住的分镜（迁移 0046，ADR-0009 口径），不是工作稿——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `5d9e9168178f720680f3f44ddde64d2618f13db9dc7909ecce8350bae6e4a941` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/n/[handle]/[slug]/storyboard/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const code = strip(main);

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

const start = findOutsideComments(globals, /\.ss-narrow \{/);
if (start < 0) throw new Error('.ss-narrow 段缺失');
const rest = globals.slice(start);
const segEnd = rest.search(/\/\* ── §/);
const segment = segEnd > 0 ? rest.slice(0, segEnd) : rest;

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\s+/g, ' ');
}

describe('§FE-76 /n/[handle]/[slug]/storyboard 公开分镜页原子清零', () => {
  it('读钉住的分镜：StoryboardDocumentSchema / CAMERA_LABELS / VisitMeter 进门', () => {
    expect(code).toContain('StoryboardDocumentSchema');
    expect(code).toContain('CAMERA_LABELS');
    expect(code).toContain('<VisitMeter');
  });

  it('数据钩子守恒：data-storyboard-* 全套', () => {
    for (const hook of ['data-storyboard="none"', 'data-storyboard="broken"', 'data-storyboard="live"', 'data-storyboard-back', 'data-storyboard-none-reason', 'data-storyboard-issue', 'data-storyboard-title', 'data-storyboard-source', 'data-storyboard-pinned', 'data-storyboard-shot', 'data-storyboard-shot-meta', 'data-storyboard-shot-prompt', 'data-storyboard-shot-refs', 'data-storyboard-empty', 'data-storyboard-total', 'data-storyboard-notes', 'data-storyboard-notice']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .ss-*（无裸数字原子）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(26);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^ss-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 text-[ / max-w-[ / px-6 / py-16 / whitespace-pre-wrap / font-semibold / rounded / border-[）', () => {
    for (const re of ['text-[', 'max-w-[', 'px-6', 'py-16', 'py-8', 'gap-1', 'gap-2', 'gap-3', 'gap-4', 'font-semibold', 'rounded', 'border-[', 'bg-bg-', 'whitespace-pre-wrap', 'font-mono', 'mx-auto', 'flex-col', 'text-1', 'text-fg-', 'text-danger-ink', 'text-accent-2-ink', 'items-baseline', 'justify-between']) {
      expect(code, `storyboard page 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bss-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = new Set([...globals.matchAll(/\.(ss-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('§FE-76 视觉追加段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(500);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('§FE-76 视觉追加段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：5d9e9168178f720680f3f44ddde64d2618f13db9dc7909ecce8350bae6e4a941）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '5d9e9168178f720680f3f44ddde64d2618f13db9dc7909ecce8350bae6e4a941',
    );
  });
});
