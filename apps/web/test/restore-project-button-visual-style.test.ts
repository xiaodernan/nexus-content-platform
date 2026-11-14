import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-94 `RestoreProjectButton.tsx` `.adp-` 复用——§74 回收站恢复——**静态那一寸**。
 * 一句话动作，不需要审批门；成功后不写"已恢复"（列表会因 refresh 少掉这一行，留下来会是假状态）——不动。
 * 本片零新 CSS：复用 §FE-87/93 的 `.adp-row/.adp-btnSm/.adp-note`。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `f080d95f579f468f26a5021c62cc017c27fac888f9482685ba8d14a25bd33256` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/RestoreProjectButton.tsx');
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

describe('§FE-94 /components RestoreProjectButton 回收站恢复（复用 .adp-）', () => {
  it("'use client' 保留 + csrfHeaders/router 进门；POST /api/projects/<id>/restore 守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('/restore');
    expect(code).toContain("method: 'POST'");
  });

  it('数据钩子守恒：data-restore-project / data-restore-notice', () => {
    expect(code).toContain('data-restore-project={projectId}');
    expect(code).toContain('data-restore-notice={projectId}');
  });

  it('字面 className 只认复用族 .adp-*（零新类）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(3);
    for (const cls of literals) expect(cls).toMatch(/^adp-[A-Za-z0-9-]+$/);
  });

  it('零裸 Tailwind', () => {
    for (const re of ['flex ', 'items-center', 'rounded-[', 'hover:', 'disabled:opacity-', 'text-11', 'text-fg-', 'gap-2']) {
      expect(code, `RestoreProjectButton 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('复用的 .adp-* 类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\badp-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(3);
    const defined = new Set([...globals.matchAll(/\.(adp-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('复用族 token 声明过', () => {
    const i = globals.indexOf('.adp-card {');
    const end = globals.indexOf('/* ── §FE-88', i);
    const segment = globals.slice(i, end > 0 ? end : i + 3000);
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：f080d95f579f468f26a5021c62cc017c27fac888f9482685ba8d14a25bd33256）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'f080d95f579f468f26a5021c62cc017c27fac888f9482685ba8d14a25bd33256',
    );
  });
});
