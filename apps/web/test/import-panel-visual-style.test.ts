import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-89 `ImportPanel.tsx` `.ip-` 门面化——§144 NO LOCK-IN 反向那一寸——**静态那一寸**。
 * 装回来必须零改：每一个数字来自服务端回执；拒收逐条列 issues；资产失败点名；不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `741a5c91de6b93015d8ddd4a4aedc0025eda55867812b5a81140ded2bb208948` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/ImportPanel.tsx');
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

const start = findOutsideComments(globals, /\.ip-root \{/);
if (start < 0) throw new Error('.ip- 段缺失');
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

describe('§FE-89 /components ImportPanel 导入面板', () => {
  it("'use client' 保留 + csrfHeaders/router 进门；POST /api/projects/import 守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('useRouter()');
    expect(code).toContain('/api/projects/import');
    expect(code).toContain('FormData(');
  });

  it('数据钩子守恒：data-import-* 全套', () => {
    for (const hook of ['data-import-root', 'data-import-hint', 'data-import-file', 'data-import-busy', 'data-import-receipt', 'data-import-open=', 'data-import-composition', 'data-import-asset-failures', 'data-import-storyboard-notes', 'data-import-character-notes', 'data-import-refused', 'data-import-refusal-reason', 'data-import-refusal-issues']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .ip-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(20);
    for (const cls of literals) expect(cls).toMatch(/^ip-[A-Za-z0-9-]+$/);
  });

  it('零裸 Tailwind（含 file:/mt-*/mb-*/text-[/ml-2/disabled:opacity/flex-wrap）', () => {
    for (const re of ['file:mr-', 'file:rounded', 'file:bg-', 'mt-1', 'mt-2', 'mb-1', 'mb-[', 'text-[', 'text-1', 'text-fg-', 'text-warn-ink', 'text-danger-ink', 'text-accent-2-ink', 'ml-2', 'font-mono', 'disabled:opacity-', 'flex-wrap']) {
      expect(code, `ImportPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bip-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(17);
    const defined = new Set([...globals.matchAll(/\.(ip-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.ip- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(600);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.ip- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：741a5c91de6b93015d8ddd4a4aedc0025eda55867812b5a81140ded2bb208948）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '741a5c91de6b93015d8ddd4a4aedc0025eda55867812b5a81140ded2bb208948',
    );
  });
});
