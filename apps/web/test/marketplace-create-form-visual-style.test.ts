import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-84 `MarketplaceCreateForm.tsx` `.mfc-` 门面化——§127 上架表单——**静态那一寸**。
 * 预览资产从所选项目挑（`/api/projects/<id>/assets`）；没选项目也能上架「挂牌」——不动谓词与渐进语义。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `051c4b9bd002602eadd8d96689cc691ace4f0b3837a0d5e7da1701c8b538fcbe` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/marketplace/MarketplaceCreateForm.tsx');
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

const start = findOutsideComments(globals, /\.mfc-card \{/);
if (start < 0) throw new Error('.mfc- 段缺失');
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

describe('§FE-84 /marketplace MarketplaceCreateForm 上架表单', () => {
  it("'use client' 保留 + csrfHeaders/router 进门；POST /api/marketplace 守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('useRouter()');
    expect(code).toContain('/api/marketplace');
    expect(code).toContain('/api/projects/');
  });

  it('数据钩子守恒：data-marketplace-create-* 全套', () => {
    for (const hook of ['data-marketplace-create', 'data-marketplace-create-type', 'data-marketplace-create-visibility', 'data-marketplace-create-title', 'data-marketplace-create-price', 'data-marketplace-create-description', 'data-marketplace-create-tags', 'data-marketplace-create-project', 'data-marketplace-create-preview', 'data-marketplace-create-submit', 'data-marketplace-create-message']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .mfc-* / .mk-h16', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(15);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^(?:mfc|mk)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 sm:grid-cols-2/sm:col-span-2/rounded bg-bg-2/text-[）', () => {
    for (const re of ['sm:grid-cols-2', 'sm:col-span-2', 'rounded ', 'rounded-[', 'bg-bg-2', 'text-[', 'text-12', 'text-11', 'mt-2', 'mt-1', 'gap-2', 'grid ', 'font-medium', 'disabled:opacity-']) {
      expect(code, `MarketplaceCreateForm 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:mfc|mk)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(10);
    const defined = new Set([...globals.matchAll(/\.((?:mfc|mk)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.mfc- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(400);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.mfc- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：051c4b9bd002602eadd8d96689cc691ace4f0b3837a0d5e7da1701c8b538fcbe）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '051c4b9bd002602eadd8d96689cc691ace4f0b3837a0d5e7da1701c8b538fcbe',
    );
  });
});
