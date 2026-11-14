import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-EPH「世界切片」（`/world/<project>/ephemeris`）—— v709 门面判据。
 *
 * 判据不变式：
 *  1. RSC-only + metadata + force-dynamic；只作者可见（requireUser + projectVisibleTo + notFound）；
 *  2. 数据零 provider、零写库（loadWorld + buildEphemeris from lib/ephemeris）；
 *  3. 空态如实；所有钩子都标 data-ephemeris-*；
 *  4. 字面 className 仅 .eph-* 族（含 data-…… 钩子）；
 *  5. 零 hex；var(--nexus-*) 全在 tokens.css；
 *  6. forced-colors 收口；7. SHA256 钉死。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/world/[projectId]/ephemeris/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');
const LIB = join(ROOT, 'apps/web/src/lib/ephemeris.ts');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const lib = readFileSync(LIB, 'utf8');
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
const EPH_START = findOutsideComments(globals, /\.eph-root \{/);
if (EPH_START < 0) throw new Error('globals.css 里没有 .eph-* 段');
const rest = globals.slice(EPH_START);
const restNoComments = cssNoComments(rest);
const TO_END = restNoComments.search(/\/\* ─{5,}/);
const ephSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-EPH /world/<project>/ephemeris 世界切片', () => {
  it('RSC + 只作者可见 + 零 provider + 零写库', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain('requireUser()');
    expect(code).toContain('projectVisibleTo(projectId');
    expect(code).toContain('notFound()');
    expect(code).not.toContain('getDb()');
    expect(code).toContain('buildEphemeris(');
    expect(lib).not.toContain('getDb()');
    expect(lib).not.toContain('openai');
    expect(lib).not.toContain('fetch(');
    expect(lib).not.toContain('crypto.getRandomValues');
    expect(lib).not.toContain('Math.random');
    expect(lib).toContain('EPHEMERIS_DAYS = 360');
  });

  it('data-* 钩子守恒', () => {
    for (const hook of ['data-ephemeris-root', 'data-ephemeris-kicker', 'data-ephemeris-lede', 'data-ephemeris-footnote', 'data-ephemeris-counts', 'data-ephemeris-empty', 'data-ephemeris-calendar', 'data-ephemeris-day=', 'data-ephemeris-flow', 'data-ephemeris-entry=', 'data-ephemeris-day-section=', 'data-ephemeris-kind']) {
      expect(code, `ephemeris 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .eph-* 族（含 .eph-* 变体）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(14);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `ephemeris 出现域外类：${tok}`).toMatch(/^(eph|am)-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('.eph-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    const used = new Set<string>();
    for (const cls of literals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = new Set([...globals.matchAll(/\.((?:eph|am)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.eph-root');
    expect(forced).toContain('.eph-hero');
    expect(forced).toContain('.eph-entry');
  });

  it('零写死 hex；var(--nexus-*) 全在 tokens.css', () => {
    expect(ephSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...ephSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'a88b9c1d676cc24c2a8f4e11659ecc0bfdb0d74be5e772bbd94ae7ad1a86f7a8',
    );
  });
});
