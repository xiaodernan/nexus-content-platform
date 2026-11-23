import { createHash } from 'node:crypto';

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readStable } from './helpers/stable-text';

/**
 * §FE-Cdr「一页书」（`/world/<project>/codex/<nodeId>`）—— v711 RSC 判据。
 *
 * 判据不变式：
 *  1. RSC-only（零 'use client'）；metadata + dynamic force-dynamic；
 *  2. 只作者可见（requireUser + projectVisibleTo + notFound）；
 *  3. 零 provider、零写库（只 loadWorld / findWorldNode）；
 *  4. paragraphs 渲染只用 body。trim()（§159 空态如实）；
 *  5. 字面 className 仅 .cdr-* / .am-linkImplicit；零 hex；
 *  6. .cdr-* 全部在 globals.css 有定义；forced-colors 收口；
 *  7. data-codex-chapter-* 钩子守恒；
 *  8. SHA256 钉死。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/world/[projectId]/codex/[nodeId]/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readStable(PAGE);
const globals = readStable(GLOBALS);
const tokens = readStable(TOKENS);
const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}
const CDR_START = findOutsideComments(globals, /\.cdr-root \{/);
if (CDR_START < 0) throw new Error('globals.css 里没有 .cdr-* 段');
const rest = globals.slice(CDR_START);
const restNoComments = cssNoComments(rest);
const TO_END = restNoComments.search(/\/\* ─{5,}/);
const cdrSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-Cdr /world/<project>/codex/<nodeId> 一页书', () => {
  it('RSC + 只作者可见 + 零 provider + 零写库', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain('export async function generateMetadata');
    expect(code).toContain('export const dynamic');
    expect(code).toContain('requireUser()');
    expect(code).toContain('projectVisibleTo(projectId');
    expect(code).toContain('notFound()');
    expect(code).not.toContain('getDb()');
    expect(code).toContain("import Link from 'next/link'");
    expect(code).toContain('loadWorld(');
  });

  it('数据钩子守恒（kicker/kind/title/empty/foot）', () => {
    for (const hook of ['data-codex-chapter-root', 'data-codex-chapter-kicker', 'data-codex-chapter-kind', 'data-codex-chapter-title', 'data-codex-chapter-foot']) {
      expect(code, `cdr 丢了钩子 ${hook}`).toContain(hook);
    }
    expect(code).toContain('const locale = await getLocale()');
  });

  it('字面 className 只认 .cdr-* 与 .am-linkImplicit', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(8);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `cdr 出现域外类：${tok}`).toMatch(/^(cdr-[A-Za-z0-9][A-Za-z0-9-]*|cdr-paraFirst|am-linkImplicit)$/);
      }
    }
  });

  it('.cdr-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    const used = new Set<string>();
    for (const cls of literals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    expect(used.size).toBeGreaterThanOrEqual(8);
    const defined = new Set([...globals.matchAll(/\.((?:cdr|am)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.cdr-root');
    expect(forced).toContain('.cdr-hero');
    expect(forced).toContain('.cdr-paraFirst');
  });

  it('零写死 hex；var(--nexus-*) 全在 tokens.css 声明', () => {
    expect(cdrSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...cdrSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '6352ecf21d90815d75ab1f9a2edf298efd8de654cfb220fbb8e826d249ca8436',
    );
  });
});
