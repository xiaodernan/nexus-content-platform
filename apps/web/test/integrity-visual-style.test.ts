import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-IC「世界体检」（`/world/<project>/integrity`）——确定性指标卡的门面判据。
 *
 * 判据不变量：
 *  1. RSC + metadata + force-dynamic；仅作者可见（requireUser + projectVisibleTo + notFound）；
 *  2. 数据零 provider、零写库、零随机（loadWorld + buildChronicle + buildConstellation）；
 *  3. 空世界如实空白：世界读不出来 ⇒ 不画任何指标（ic-empty 页），不悄悄给 0 分；
 *  4. 每一张卡都是真数（authored/skeleton/thin/untagged/order-clash/unresolved 队），
 *    order-clash 只认 story/history 且 order 相同（非空 era 才算）；
 *  5. 字面 className 只认 .ic-* 族（含 am-linkImplicit）；
 *  6. 零 hex；var(--nexus-*) 全在 tokens.css；
 *  7. forced-colors 收口；8. SHA256 钉死。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/world/[projectId]/integrity/page.tsx');
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
const IC_START = findOutsideComments(globals, /\.ic-empty \{/);
if (IC_START < 0) throw new Error('globals.css 里没有 .ic-* 段');
const rest = globals.slice(IC_START);
const restNoComments = cssNoComments(rest);
const TO_END = restNoComments.search(/\/\* ─{5,}/);
const icSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-IC /world/<project>/integrity 世界体检', () => {
  it('RSC + 仅作者可见 + 零 provider + 零随机 + 零写库', () => {
    expect(code).not.toContain('use client');
    expect(code).not.toContain('getDb()');
    expect(code).not.toContain('Math.random');
    expect(code).not.toContain('fetch(');
    expect(code).not.toContain('openai');
    expect(code).toContain('requireUser()');
    expect(code).toContain('projectVisibleTo(projectId');
    expect(code).toContain('notFound()');
    expect(code).toContain('buildChronicle(');
    expect(code).toContain('buildConstellation(');
  });

  it('空世界如实空白：世界读不出来 ⇒ 不画任何指标（ic-empty 页）', () => {
    expect(code).toContain('data-integrity-empty');
    expect(code).toContain('data-integrity-empty-studio');
    expect(code).toContain('if (!world || !world.ok)');
  });

  it('data-integrity-* 钩子守恒', () => {
    for (const hook of [
      'data-integrity-root', 'data-integrity-kicker', 'data-integrity-lede', 'data-integrity-footnote',
      'data-integrity-card=', 'data-integrity-go=', 'data-integrity-back-graph',
      'data-integrity-open-digest', 'data-integrity-open-tide', 'data-integrity-foot',
    ]) {
      expect(code, `integrity 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .ic-* 族（含 am-linkImplicit）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(16);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `integrity 出现域外类：${tok}`).toMatch(/^(ic|am)-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('.ic-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    const used = new Set<string>();
    for (const cls of literals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    expect(used.size).toBeGreaterThanOrEqual(19);
    const defined = new Set([...globals.matchAll(/\.((?:ic|am)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.ic-root');
    expect(forced).toContain('.ic-card');
  });

  it('零写死 hex；var(--nexus-*) 全在 tokens.css', () => {
    expect(icSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...icSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '6bcc65cd06253673ed0f74e99526e81851ebf215a6e53031bf3f080d57745e9a',
    );
  });
});
