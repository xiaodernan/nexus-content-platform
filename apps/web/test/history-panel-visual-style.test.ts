import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-50 `HistoryPanel.tsx` `.hi-` 门面化（§27/§108 用户项目历史（Snapshot））——**静态那一寸**。
 *
 * 快照列表 + diff 派发 + compare/restore 双键 + 分支切换；行可带 ≤500 节点的 diff。
 * 本片只换皮；restore 二次确认流、jumpTo/DiffRow 数据源、search、collapsed 摊列全部不动。
 * cn 三元统一映射：entry kind badge(removed=warn/added=success)、entry source chip(ai→accent-2)、
 * compare/restore 共用 .hi-chipSm（on/off 双态）· entry current row → .hi-entryCurrent。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `3a3f9d024bc28f5d53e13062344cffed502aee6d412025f8c832fad6eb2eaf50` 与 HEAD 字节一致。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + studio.restore/compare/jumpTo/createSnapshot 依赖进门；2. 字面 className 全 `.hi-*`/`.wd-*`/`.gp-*`/`.pp-*`；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.hi-` 段成规模（≥ 50 条）；
 *  6. 零 hex；7. 字面量只出现在 px-[6px]→6px/py-[1px]→1px/gap-[1px]→1px/py-[3px]→3px/gap-[3px]→3px；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 transition/@media/@keyframes；11. focus-visible 锚（.hi-entryRow/.hi-entryRowBlack/.hi-cursorRow 所在行）；
 * 12. SHA256 守恒 + 钩子守恒（data-history-entry/data-history-diff/data-history-diff-list/data-snapshot-compare/data-snapshot-restore/data-branch 系列）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/HistoryPanel.tsx');
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

/** `.hi-` 视觉段：`.hi-rootCol {` 起，到下一个 §FE 段止。 */
function hiSegment(css: string): string {
  const start = findOutsideComments(css, /\.hi-rootCol \{/);
  if (start < 0) throw new Error('globals.css 找不到 .hi- 段（.hi-rootCol {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = hiSegment(globals);

/** 红 act：段头自己不计，段头测试（含 @media 等）自己的文案不计数。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\bcn\([^)]*\)/gs, 'cn()')
    .replace(/\s+/g, ' ');
}

function classesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:hi|wd|gp|pp)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-50 /studio HistoryPanel 历史与快照面板', () => {
  it("'use client' 保留 + studio.compareSnapshot/createSnapshot/restoreSnapshot/jumpTo 依赖链进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('studio.compareSnapshot(');
    expect(code).toContain('studio.createSnapshot(');
    expect(code).toContain('studio.restoreSnapshot(');
    expect(code).toContain('studio.jumpTo(');
    expect(code).toContain('studio.switchBranch(');
    expect(code).toContain('studio.createBranch(');
  });

  it('数据钩子守恒：data-history-entry/diff/diff-list/current 派系 + data-snapshot-compare/restore + data-branch', () => {
    for (const hook of [
      'data-history-diff=',
      'data-history-entry=',
      'data-history-diff-list=',
      'data-snapshot-compare=',
      'data-snapshot-restore=',
      'data-branch=',
      'data-branch-name=',
      'data-branch-current=',
    ]) {
      expect(code, `HistoryPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .hi-* / .wd-* / .gp-* / .pp-*（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(26);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:hi|wd|gp|pp)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'(?:hi|wd|gp|pp)-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'(?:hi|wd|gp|pp)-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（hi-/wd-/gp-/pp- 之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'gap-[', 'flex-[', 'pl-[', 'w-[', 'h-[', 'space-y', 'max-h-[', 'text-fg-', 'bg-bg-', 'border-[', 'rounded-[', 'accent-[', 'basis-']) {
      expect(code, `HistoryPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:hi|wd|gp|pp)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(35);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.hi- 视觉段成规模（≥ 50 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(7000);
    expect((segment.match(/\.hi-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(55);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex；字面量只出现在 1px/2px/3px/6px/1.625rem', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('padding: 1px 6px');
    expect(segment).toContain('padding-block: 2px');
    expect(segment).toContain('gap: 2px');
  });

  it('.hi- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(12);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.hi-chipSm 三态（ant-on/ant-off/restore-warn）定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.hi-antOn {', '.hi-antOff {', '.hi-restoreWarn {', '.hi-chipSm:disabled {', '.hi-entryCurrent {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className/cn 后全文 SHA256 守恒（零行为：3a3f9d024bc28f5d53e13062344cffed502aee6d412025f8c832fad6eb2eaf50）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '3a3f9d024bc28f5d53e13062344cffed502aee6d412025f8c832fad6eb2eaf50',
    );
  });
});
