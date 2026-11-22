import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ──BIBLE-ANCHOR-ECHO `/bible/anchors` 锚句回放（cont. 181）
 *
 *  1. page 是 RSC（无 'use client'；客户端游戏组件单独放在 components/）
 *  2. metadata + force-dynamic + getLocale + 双语 COPY
 *  3. className 只允许 .ae-*（page + component）
 *  4. .ae-* 全部被 globals.css 定义；forced-colors 有回退
 *  5. 数据来自 `anchors.generated.ts`（由 scripts/gen-anchor-echo.mts 生成、
 *     `npm run verify:anchor-echo` 字节验证，正典仍是唯一真值）
 *  6. 零 provider、零 fetch——纯客户端引擎 + localStorage 最佳成绩
 */
const ROOT = process.cwd();
const REAL = join(ROOT, 'apps/web/src/app/bible/anchors/page.tsx');
const GAME = join(ROOT, 'apps/web/src/components/AnchorEcho.tsx');
const DATA = join(ROOT, 'apps/web/src/world-bible/anchors.generated.ts');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(REAL, 'utf8');
const game = readFileSync(GAME, 'utf8');
const data = readFileSync(DATA, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const gameCode = game.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const AE_START = globals.indexOf('.ae-root');
if (AE_START < 0) throw new Error('globals.css 里没有 .ae-* 段');
const rest = globals.slice(AE_START);
const restNoComments = rest.replace(/\/\*[\s\S]*?\*\//g, '');
const aeSegment = restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const classLiterals = [
  ...[...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!),
  ...[...gameCode.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!),
  ...[...gameCode.matchAll(/className=\{`([^`]*)`\}/g)].map((m) => m[1]!),
];

describe('──BIBLE-ANCHOR-ECHO /bible/anchors 锚句回放', () => {
  it('RSC page 骨架 + game 是 client 组件 + 零 provider/fetch', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain('export const dynamic');
    expect(code).toContain('export const metadata');
    expect(code).toContain('import { getLocale');
    expect(gameCode).toContain('use client');
    expect(gameCode).toContain("from '@/world-bible/anchors.generated'");
    expect(gameCode).not.toContain('/api/');
    expect(gameCode).not.toContain('fetch(');
    expect(gameCode).toContain('localStorage');
  });

  it('中英 COPY 同构 + 8 轮 + 本地最佳', () => {
    expect(code.indexOf('zh: {')).toBeGreaterThan(0);
    expect(code.indexOf('en: {')).toBeGreaterThan(0);
    expect(gameCode).toContain('ROUNDS = 8');
    expect(gameCode).toContain('nexus.anchorEcho.best');
  });

  it('className 只允许 .ae-*', () => {
    expect(classLiterals.length).toBeGreaterThanOrEqual(16);
    for (const cls of classLiterals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `/bible/anchors 出现非 .ae-*/.bb-* 类：${tok}`).toMatch(/^(ae|bb)-[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.ae-* 全部收在 globals.css 且 forced-colors 有回退；零十六进制；token 全部认识', () => {
    const used = new Set<string>();
    for (const cls of classLiterals) for (const tok of cls.split(/\s+/).filter(Boolean)) used.add(tok);
    const defined = new Set([...globals.matchAll(/\.((?:ae|bb)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没定义 ${cls}`).toContain(cls);
    expect(aeSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...aeSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(8);
    for (const token of usedTokens) expect(tokens, `tokens.css 不认识 ${token}`).toContain(token);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.ae-line');
    expect(forced).toContain('.ae-optionCorrect');
    expect(forced).toContain('.ae-title');
  });

  it('数据来自生成器且字节可验证：锚句成对、数量与 verify:world-bible 一致', () => {
    const count = (data.match(/"zh": /g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(100);
    expect(data).toContain('"en"');
    expect(data).toContain('"refZh"');
    expect(data).toContain('"refEn"');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['gen:anchor-echo']).toContain('gen-anchor-echo');
    expect(pkg.scripts?.['verify:anchor-echo']).toContain('--check');
  });

  it('data-anchor-echo-* 钩子成对', () => {
    for (const hook of ['data-anchor-echo-root', 'data-anchor-echo-question', 'data-anchor-echo-options']) {
      expect(gameCode).toContain(hook);
    }
    expect(code).toContain('data-anchor-echo-page');
  });

  // 2026-11-22 重钉：metadata 去并列英文（中文模式不夹杂）；两处注释 111 → 1317
  // （E100–E218 重新进入题库后的真实锚句数）。DOM/类名未动。
  it('SHA256 钉死：page / game', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '6ad64d3bbef5dbf2904a45df246ff1a566b457623b03587965f1d84e13ac471b',
    );
    expect(createHash('sha256').update(redactClasses(game)).digest('hex')).toBe(
      '856716cea896a3341a956f0ae459a3f09bd8ec486f09ba6e7fe4a6294b9620ac',
    );
  });
});
