import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-CODEX 「设定集」（`/world/<project>/codex`）—— z 纸面投影页面的成品判据。
 *
 * 判据不变式：
 *  1. RSC-only（零 'use client'）；有 metadata；
 *  2. 只作者可见（requireUser + projectVisibleTo + notFound）；
 *  3. 数据仅来自 loadWorld / listCharacters / buildChronicle（确定性投影、零 provider、零写库）；
 *  4. 空态如实；每个 .cdx-* 都在 globals.css 有定义；var() 全在 tokens.css；
 *  5. 字面 className 仅 .cdx-* / .am-linkImplicit；
 *  6. 零写死 hex；var(--nexus-*) 全在 tokens.css；
 *  7. data-codex-* 钩子守恒；
 *  8. forced-colors 有收口；9. SHA256 钉死。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/world/[projectId]/codex/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
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
const CDX_START = findOutsideComments(globals, /\.cdx-root \{/);
if (CDX_START < 0) throw new Error('globals.css 里没有 .cdx-* 段');
const rest = globals.slice(CDX_START);
const restNoComments = cssNoComments(rest);
const TO_END = restNoComments.search(/\/\* ─{5,}/);
const cdxSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-CODEX /world/<project>/codex 设定集', () => {
  it('RSC + metadata + 只作者可见 + 不写库', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain('export const dynamic');
    expect(code).toContain('export const metadata');
    expect(code).toContain('requireUser()');
    expect(code).toContain('projectVisibleTo(projectId');
    expect(code).toContain('notFound()');
    expect(code).not.toContain('getDb()');
  });

  it('只读投影（loadWorld + listCharacters + buildChronicle），无穷落其他域', () => {
    expect(code).toContain('loadWorld(');
    expect(code).toContain('listCharacters(');
    expect(code).toContain('buildChronicle(');
    expect(code).not.toMatch(/from '@\/server\/(ai|llm|provider)/);
  });

  it('空态如实（九类都落模板 → 内容如实为空、编年/人物同样如实为空）', () => {
    expect(code).toContain('data-codex-empty=');
    expect(code).toContain('data-codex-empty-chronicle');
    expect(code).toContain('data-codex-empty-cast');
    expect(code).toContain('还没人动笔');
  });

  it('字面 className 只认 .cdx-* 与 .am-linkImplicit', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(18);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `codex 出现域外类：${tok}`).toMatch(/^(cdx-[A-Za-z0-9][A-Za-z0-9-]*|am-linkImplicit)/);
      }
    }
  });

  it('.cdx-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    const used = new Set<string>();
    for (const cls of literals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    expect(used.size).toBeGreaterThanOrEqual(30);
    const defined = new Set([...globals.matchAll(/\.((?:(?:cdx|am)-[A-Za-z0-9-]+|am-linkImplicit))(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.cdx-root');
    expect(forced).toContain('.cdx-paraFirst');
    expect(forced).toContain('.cdx-chapter');
  });

  it('零写死 hex；var(--nexus-*) 全在 tokens.css 声明', () => {
    expect(cdxSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...cdxSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(12);
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('数据钩子守恒（root/kicker/lede/toc/chapter/cast/foot）', () => {
    for (const hook of ['data-codex-root', 'data-codex-kicker', 'data-codex-lede', 'data-codex-summary', 'data-codex-toc-item=', 'data-codex-chapter=', 'data-codex-cast-entry=', 'data-codex-foot', 'data-codex-back-graph']) {
      expect(code, `codex 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'd9682fddb990646007c5a77cf4b76212fb59db844fb28c9d696d340f7548f0e2',
    );
  });
});
