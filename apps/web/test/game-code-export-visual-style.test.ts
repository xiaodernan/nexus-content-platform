import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-64 `GameCodeExport.tsx` `.ge-` 门面化（§60 Game Code 导出面板）——**静态那一寸**。
 *
 * 用户真 provider（生成代码）可导出的地方：「一键导出到游戏引擎」的入口（与 ExportPanel 并行，两路到 SE 的运送）。
 * 本片只换皮：fetch / CSRF / download blob / 引擎 adapter 派发全部一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `f208051649d8e884e9befeece3aeaa422219ad87724132fab1d391898d2391da` 与 HEAD 字节一致。
 *
 * 判据不变式（10 门）：
 *  1. 'use client' 保留 + csrfHeaders 进门；2. 字面 className 全 `.ge-*`/复用族；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.ge-` 段成规模（≥ 5 条）；
 *  6. 零 hex（amber 本色数据 → color-mix warn 系）；7. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；
 *  8. 零 transition/@media/@keyframes；9. 零新增颜色 token；
 * 10. SHA256 守恒 + 钩子守恒（data-game-code-* 系列）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/GameCodeExport.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(main);

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.ge-` 视觉段：`.ge-warnBanner {` 起，到下一个 §FE 段止。 */
function geSegment(css: string): string {
  const start = findOutsideComments(css, /\.ge-warnBanner \{/);
  if (start < 0) throw new Error('globals.css 找不到 .ge- 段（.ge-warnBanner {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = geSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\s+/g, ' ');
}

function classesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:ge|sb|wd|cp|rp|hi|gp|pb|ap)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-64 /studio GameCodeExport 游戏代码导出面板', () => {
  it("'use client' 保留 + saveBlob 进门（本片未引入 CSRF headers，download 直存页面）", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('saveBlob(');
  });

  it('数据钩子守恒：game-code-* 系列', () => {
    expect(code).toContain('data-game-code');
  });

  it('字面 className 只认 .ge-*/复用族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(10);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:ge|sb|wd|cp|rp|hi|gp|pb|ap)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind', () => {
    for (const re of ['amber-', 'emerald-', 'rounded-[', 'bg-bg-', 'text-fg-', 'mt-', 'list-disc ']) {
      expect(code, `GameCodeExport 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:ge|sb|wd|cp|rp|hi|gp|pb|ap)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(10);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.ge- 视觉段存在且零 @media / transition / @keyframes；零 hex（warn 系全部 color-mix）', () => {
    expect(segment.length).toBeGreaterThan(600);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('color-mix(in srgb, var(--nexus-color-warn) 30%, transparent)');
    expect(segment).toContain('color-mix(in srgb, var(--nexus-color-warn) 10%, transparent)');
  });

  it('.ge- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(3);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.ge-warnBanner/.ge-listFaint/.ge-listDanger/.ge-wrapMt2 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.ge-warnBanner {', '.ge-listFaint {', '.ge-listFaintMt2 {', '.ge-listDanger {', '.ge-wrapMt2 {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className 后全文 SHA256 守恒（2026-11-14 v735「GameCodeExport 双语化」重钉：f208051649d8e884e9befeece3aeaa422219ad87724132fab1d391898d2391da）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'f208051649d8e884e9befeece3aeaa422219ad87724132fab1d391898d2391da',
    );
  });
});
