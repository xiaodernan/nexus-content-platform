import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-92 `ProjectDeleteCard.tsx` `.adp-` 复用——§74 删除项目——**静态那一寸**。
 * 确认词=左边显示的名字（服务端比原值）；删后收藏者点开是 404，但快照/发布记录/评论还在——不动。
 * 本片零新 CSS：与 §FE-87 注销面板共享 `.adp-*` 语义族（确认型破坏动作卡）。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `92c28cc1d88fb1b57b28db9c7169f0690c0cc49c7a84c19593d0b7198f2c8bcc` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/ProjectDeleteCard.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const code = strip(main);

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\s+/g, ' ');
}

describe('§FE-92 /components ProjectDeleteCard 删除项目（复用 §FE-87 .adp-）', () => {
  it("'use client' 保留 + csrfHeaders/router 进门；DELETE /api/projects/<id> 守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain("method: 'DELETE'");
    expect(code).toContain('/api/projects/${projectId}');
  });

  it('数据钩子守恒：data-project-delete* 全套', () => {
    for (const hook of ['data-project-delete={projectId}', 'data-project-delete-card={projectId}', 'data-project-delete-expected={projectId}', 'data-project-delete-input={projectId}', 'data-project-delete-confirm={projectId}', 'data-project-delete-cancel={projectId}', 'data-project-delete-notice={projectId}']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认复用族 .adp-*（零新类）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(9);
    for (const cls of literals) expect(cls).toMatch(/^adp-[A-Za-z0-9-]+$/);
  });

  it('零裸 Tailwind', () => {
    for (const re of ['rounded-[', 'w-[', 'placeholder:', 'hover:', 'disabled:opacity-', 'text-11', 'text-12', 'text-fg-', 'flex-col', 'items-center', 'bg-bg-', 'bg-accent-']) {
      expect(code, `ProjectDeleteCard 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('复用的 .adp-* 类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\badp-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(8);
    const defined = new Set([...globals.matchAll(/\.(adp-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('复用族 .adp- 视觉段 token 全声明过', () => {
    const start = globals.indexOf('.adp-card {');
    expect(start).toBeGreaterThan(0);
    const end = globals.indexOf('/* ── §FE-88', start) > 0 ? globals.indexOf('/* ── §FE-88', start) : globals.length;
    const segment = globals.slice(start, end);
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：92c28cc1d88fb1b57b28db9c7169f0690c0cc49c7a84c19593d0b7198f2c8bcc）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '92c28cc1d88fb1b57b28db9c7169f0690c0cc49c7a84c19593d0b7198f2c8bcc',
    );
  });
});
