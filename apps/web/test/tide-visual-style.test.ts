import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-TD「世界潮汐」（`/world/<project>/tide`）—— v710 §B 引擎片的门面判据。
 *
 * 判据不变量：
 *  1. RSC-only + metadata + force-dynamic；仅作者可见（requireUser + projectVisibleTo + notFound）；
 *  2. 数据零 provider、零写库、零随机（loadWorld + buildTide from lib/tide）；
 *  3. 诚实空态：世界读不出来 ⇒ 零数字（td-empty 页）；声明区未声明 ⇒ 指引文案、不装演；
 *  4. 五个扰模只是真演算（lib/tide.ts），severity 不参与计数；
 *  5. 字面 className 只认 .td-* 族（含 am-linkImplicit）；
 *  6. 零 hex；var(--nexus-*) 全在 tokens.css；
 *  7. forced-colors 收口；8. SHA256 钉死。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/world/[projectId]/tide/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');
const LIB = join(ROOT, 'apps/web/src/lib/tide.ts');

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
const TD_START = findOutsideComments(globals, /\.td-empty \{/);
if (TD_START < 0) throw new Error('globals.css 里没有 .td-* 段');
const rest = globals.slice(TD_START);
const restNoComments = cssNoComments(rest);
const TO_END = restNoComments.search(/\/\* ─{5,}/);
const tdSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-TD /world/<project>/tide 世界潮汐', () => {
  it('RSC + 仅作者可见 + 零 provider + 零随机 + 零写库', () => {
    expect(code).not.toContain('use client');
    expect(code).not.toContain('getDb()');
    expect(code).not.toContain('fetch(');
    expect(code).not.toContain('Math.random');
    expect(code).not.toContain('openai');
    expect(code).toContain('requireUser()');
    expect(code).toContain('projectVisibleTo(projectId');
    expect(code).toContain('notFound()');
    expect(code).toContain('buildTide(');
    expect(lib).not.toContain('getDb()');
    expect(lib).not.toContain('openai');
    expect(lib).not.toContain('fetch(');
    expect(lib).not.toContain('crypto.getRandomValues');
    expect(lib).not.toContain('Math.random');
    expect(lib).toContain('EROSION_BODY_LIMIT = 120');
    expect(lib).toContain("TIDE_PRESSURE_KINDS = ['drought', 'progeny', 'inflation', 'erosion', 'murmur']");
  });

  it('诚实空态：世界读不出来 ⇒ 不画数字；声明区未声明 ⇒ 指引不装演', () => {
    expect(code).toContain('data-tide-empty');
    expect(code).toContain('data-tide-empty-studio');
    expect(code).toContain('data-tide-decl-empty');
    expect(code).toContain('const worldOk = world && world.ok ? world.document : null');
    // severity 不参与计数——引擎只把它当作者着墨（判据钉在 lib）
    expect(lib).toContain('**不参与任何计数**');
  });

  it('data-tide-* 钩子守恒', () => {
    for (const hook of [
      'data-tide-root', 'data-tide-kicker', 'data-tide-lede', 'data-tide-footnote',
      'data-tide-panel', 'data-tide-decl=', 'data-tide-invalid=',
      'data-tide-rules', 'data-tide-rule=', 'data-tide-rule-hits=', 'data-tide-rule-kinds=',
      'data-tide-foot', 'data-tide-back-graph', 'data-tide-open-digest', 'data-tide-open-codex',
    ]) {
      expect(code, `tide 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .td-* 族（含 am-linkImplicit）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(15);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `tide 出现域外类：${tok}`).toMatch(/^(td|am)-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('.td-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    const used = new Set<string>();
    for (const cls of literals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    expect(used.size).toBeGreaterThanOrEqual(24);
    const defined = new Set([...globals.matchAll(/\.((?:td|am)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.td-root');
    expect(forced).toContain('.td-ruleRow');
  });

  it('零写死 hex；var(--nexus-*) 全在 tokens.css', () => {
    expect(tdSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...tdSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'c4edc46ad4cbbebacd124f7a0811ef05a7927654c5b88a6476b8c5836c9817da',
    );
  });
});
