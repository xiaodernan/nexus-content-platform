import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-93 `ProjectDescriptionEditor.tsx` `.pe-`/`.adp-` 复用——§49 项目简介——**静态那一寸**。
 * 展开后才显示输入框；九个项目如果每个常驻 textarea 这一屏没法看——不动。空串="清空"而非"没改"——不动。
 * 本片零新毛坯类：复用 §FE-87/91 的 `.adp-*`/`.pe-*`；唯一新增 `.pe-monoHint`（计数器）与 `.adp-btnSm:disabled`（禁用态补齐）。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `15830c42919d01e746852a3dc53e349604c3e6f7c604891afbad08be8308df9b` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/ProjectDescriptionEditor.tsx');
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

describe('§FE-93 /components ProjectDescriptionEditor 项目简介（复用 .pe-/.adp-）', () => {
  it("'use client' 保留 + csrfHeaders/router 进门；PATCH /api/projects/<id> 守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain("method: 'PATCH'");
    expect(code).toContain('/api/projects/${projectId}');
  });

  it('数据钩子守恒：data-project-desc-* 全套', () => {
    for (const hook of ['data-project-desc-row={projectId}', 'data-project-desc={', 'data-project-desc-edit={projectId}', 'data-project-desc-input={projectId}', 'data-project-desc-save={projectId}', 'data-project-desc-clear={projectId}', 'data-project-desc-cancel={projectId}', 'data-project-desc-notice={projectId}']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .pe-*/.adp-*（零新毛坯家族）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(11);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^(?:pe|adp)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind', () => {
    for (const re of ['rounded-[', 'flex-col', 'items-center', 'text-11', 'text-12', 'text-fg-', 'bg-bg-', 'bg-accent-', 'disabled:opacity-', 'hover:bg-', 'hover:text-', 'font-mono', 'gap-2']) {
      expect(code, `ProjectDescriptionEditor 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('复用的 .pe-*/.adp-* 类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:pe|adp)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(9);
    const defined = new Set([...globals.matchAll(/\.((?:pe|adp)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.pe-monoHint 与 .adp-btnSm:disabled 新增件 token 合规', () => {
    const i = globals.indexOf('.pe-monoHint {');
    expect(i).toBeGreaterThan(0);
    const seg = globals.slice(Math.max(0, i - 200), i + 400);
    expect(seg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const used = [...new Set([...globals.slice(i - 200, i + 400).matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：15830c42919d01e746852a3dc53e349604c3e6f7c604891afbad08be8308df9b）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '15830c42919d01e746852a3dc53e349604c3e6f7c604891afbad08be8308df9b',
    );
  });
});
