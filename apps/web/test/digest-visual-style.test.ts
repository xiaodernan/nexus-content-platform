import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-DG「世界速览」（`/world/<project>/digest`）—— v710 §A 展望的落地判据。
 *
 * 判据不变量：
 *  1. RSC-only + metadata + force-dynamic；只有作者可见（requireUser + projectVisibleTo + notFound）；
 *  2. 数据零 provider、零写库（loadWorld + buildChronicle + buildEraTies + buildEphemeris）；
 *  3. 空世界如实空白：世界读不出来时不画任何计数（dg-empty 页）；空纶元 / 空 lore 各自如实空白；
 *  4. 「最近」的口径确定性：namedEras（未标纶元剔除）取时间序尾两枚；lore 按 updatedAt 倒序、平局 title/id 兜底——不做「重要度」算法；
 *  5. 字面 className 只认 .dg-* 族（含 &lt;am-linkImplicit&gt;）；
 *  6. 零 hex；var(--nexus-*) 全在 tokens.css；
 *  7. forced-colors 收口；8. SHA256 钉死。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/world/[projectId]/digest/page.tsx');
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
const DG_START = findOutsideComments(globals, /\.dg-empty \{/);
if (DG_START < 0) throw new Error('globals.css 里没有 .dg-* 段');
const rest = globals.slice(DG_START);
const restNoComments = cssNoComments(rest);
const TO_END = restNoComments.search(/\/\* ─{5,}/);
const dgSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-DG /world/<project>/digest 世界速览', () => {
  it('RSC + 仅作者可见 + 零 provider + 零写库', () => {
    expect(code).not.toContain('use client');
    expect(code).not.toContain('getDb()');
    expect(code).toContain('requireUser()');
    expect(code).toContain('projectVisibleTo(projectId');
    expect(code).toContain('notFound()');
    expect(code).toContain('buildChronicle(');
    expect(code).toContain('buildEraTies(');
    expect(code).toContain('buildEphemeris(');
    // 不许在这里写库/调 provider/起随机
    expect(code).not.toContain('Math.random');
    expect(code).not.toContain('fetch(');
    expect(code).not.toContain('openai');
  });

  it('世界读不出来 ⇒ 如实空白，不画任何数字（dg-empty 页）', () => {
    expect(code).toContain('data-digest-empty');
    expect(code).toContain('data-digest-empty-studio');
    expect(code).toContain('const worldOk = world && world.ok ? world.document : null');
    // 空 lore / 空纶元各自如实空白
    expect(code).toContain('data-digest-eras-empty');
    expect(code).toContain('data-digest-lore-empty');
    // 未标纶元不计入「最近两条」
    expect(code).toContain('namedEras');
    expect(code).toContain('UNLABELED_ERA');
  });

  it('data-digest-* 钩子守恒', () => {
    for (const hook of [
      'data-digest-root', 'data-digest-kicker', 'data-digest-lede', 'data-digest-footnote',
      'data-digest-counts', 'data-digest-quad',
      'data-digest-quad-constellation', 'data-digest-quad-chronicle', 'data-digest-quad-codex', 'data-digest-quad-ephemeris',
      'data-digest-eras', 'data-digest-era=', 'data-digest-lore', 'data-digest-lore-item=',
      'data-digest-open-chronicle', 'data-digest-open-codex', 'data-digest-open-constellation', 'data-digest-open-tide',
      'data-digest-back-graph', 'data-digest-foot',
    ]) {
      expect(code, `digest 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .dg-* 族（含 am-linkImplicit）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(20);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `digest 出现域外类：${tok}`).toMatch(/^(dg|am)-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('.dg-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    const used = new Set<string>();
    for (const cls of literals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    expect(used.size).toBeGreaterThanOrEqual(25);
    const defined = new Set([...globals.matchAll(/\.((?:dg|am)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.dg-root');
    expect(forced).toContain('.dg-quad');
    expect(forced).toContain('.dg-loreRow');
  });

  it('零写死 hex；var(--nexus-*) 全在 tokens.css', () => {
    expect(dgSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...dgSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'c8b7a73a750fe8bd1893c17f00f6c03b3d58a4211f0269e10a415965f0d71e83',
    );
  });
});
