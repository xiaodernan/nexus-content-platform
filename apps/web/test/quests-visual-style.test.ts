import { createHash } from 'node:crypto';

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readStable } from './helpers/stable-text';

/**
 * §FE-WQ「世界委托」（`/world/<project>/quests`）—— §WORLD-QUEST 的落地判据。
 *
 * 判据不变量：
 *  1. RSC-only + metadata + force-dynamic；仅作者可见（requireUser + projectVisibleTo + notFound）；
 *  2. 数据零 provider、零写库、零随机（loadWorld + listCharacters + buildQuestBoard）；
 *  3. 空世界如实引导落第一条；世界读不出来如实空白，不画任何数字；
 *  4. 字面 className 只认 .wq-* 族（含 am-linkImplicit）；
 *  5. 零 hex；var(--nexus-*) 全在 tokens.css；
 *  6. forced-colors 收口；7. SHA256 钉死。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/world/[projectId]/quests/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readStable(PAGE);
const globals = readStable(GLOBALS);
const tokens = readStable(TOKENS);
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}
const WQ_START = findOutsideComments(globals, /\.wq-empty \{/);
if (WQ_START < 0) throw new Error('globals.css 里没有 .wq-* 段');
const rest = globals.slice(WQ_START);
const restNoComments = rest.replace(/\/\*[\s\S]*?\*\//g, '');
const TO_END = restNoComments.search(/\/\* ─{5,}/);
const wqSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-WQ /world/<project>/quests 世界委托', () => {
  it('RSC + 仅作者可见 + 零 provider + 零写库 + 零随机', () => {
    expect(code).not.toContain('use client');
    expect(code).not.toContain('getDb()');
    expect(code).toContain('requireUser()');
    expect(code).toContain('projectVisibleTo(projectId');
    expect(code).toContain('notFound()');
    expect(code).toContain('buildQuestBoard(');
    expect(code).not.toContain('Math.random');
    expect(code).not.toContain('fetch(');
    expect(code).not.toContain('openai');
  });

  it('空世界引导落第一条；读不出来如实空白', () => {
    expect(code).toContain('board.emptyWorld');
    expect(code).toContain('data-quests-empty-world');
    expect(code).toContain('data-quests-empty');
    expect(code).toContain('data-quests-empty-studio');
  });

  it('data-quests-* 钩子守恒', () => {
    for (const hook of [
      'data-quests-root', 'data-quests-kicker', 'data-quests-lede', 'data-quests-footnote', 'data-quests-day',
      'data-quests-today', 'data-quests-card', 'data-quests-today-empty',
      'data-quests-rest', 'data-quests-row', 'data-quests-row-go', 'data-quests-rest-empty',
      'data-quests-closed', 'data-quests-closed-item', 'data-quests-closed-empty',
      'data-quests-not-started', 'data-quests-notstarted-item',
      'data-quests-sample', 'data-quests-go',
      'data-quests-foot', 'data-quests-back-graph', 'data-quests-open-integrity', 'data-quests-open-network',
    ]) {
      expect(code, `quests 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .wq-* 族（含 am-linkImplicit）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(20);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `quests 出现域外类：${tok}`).toMatch(/^(wq|am)-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('.wq-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    const used = new Set<string>();
    for (const cls of literals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    expect(used.size).toBeGreaterThanOrEqual(25);
    const defined = new Set([...globals.matchAll(/\.((?:wq|am)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.wq-root');
    expect(forced).toContain('.wq-card');
    expect(forced).toContain('.wq-row');
  });

  it('零写死 hex；var(--nexus-*) 全在 tokens.css', () => {
    expect(wqSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...wqSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('中英字典各含全部九类委托（不靠一侧漏译）', () => {
    for (const key of [
      'skeleton: {', 'thin: {', 'untagged: {', "'order-clash': {",
      'unresolved: {', 'isolated: {', "'cut-vertex': {", "'empty-palette': {",
      "'lonely-character': {",
    ]) {
      const hits = code.split(key).length - 1;
      expect(hits, `委托字典缺类：${key}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('SHA256 钉死（本线字节；2026-11-22 第九类「独行人物」新增中英两张卡）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'c60ba88de13c73f109c678d345c6c391a92d203742b5b3db2697fdd3973e1e2e',
    );
  });
});
