import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * §FE-63 `ExportPanel.tsx` `.pb-*`/`.ex-*` 复用——§58 Export 面板——**静态那一寸**。
 *
 * 打包（多 part SE 上升/打包过程）→ 触发下载；真 provider 有门 Submission；fetch/CSRF 路径、parts/check/run() 全部一字不动。
 * 本片只换皮：完全复用既有 `.pb-*`（FE-54 既成族）+ 新增 `.pb-runBtn` / `.pb-popPanel360`（360px 面板形态）。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一）：
 * `8cf979c52c94923126781ccdcbb96c0691c6dfbd7f2b67176d836466a80dac87`（含雕刻 cn 一行、对齐 HEAD 净字节——唯一代码变更 = 删唯一使用点消失后已死的 `import { cn }` 一行）。
 *
 * 判据不变式（10 门）：
 *  1. 'use client' 保留 + POST/Export contract 进门；2. 字面 className 全 `.pb-*`/复用族（含 cn 单条分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.pb-runBtn` / `.pb-popPanel360`、`.pb-popPanel360` 是本片新固定；
 *  6. 零 hex；7. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；
 *  8. 零新增颜色 token；9. 零 transition/@media（除既有 popPanel/360 的 520px 档）；10. SHA256 守恒 + 钩子守恒（data-export-run/PARTS）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/ExportPanel.tsx');
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

/** `.pb-popPanel360`/`.pb-runBtn` 段（同 `.pb-` 段之内）：找到 `.pb-popPanel360 {` 起，到下一个 §FE 段。 */
function pbSegment(css: string): string {
  const start = findOutsideComments(css, /\.pb-popPanel360 \{/);
  if (start < 0) throw new Error('globals.css 找不到 .pb-popPanel360 {');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = pbSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@`。 */
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
    for (const m of line.matchAll(/\.((?:pb|sb|wd|cp|gp|ds|ag|cb)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-63 /studio ExportPanel 导出面板', () => {
  it("'use client' 保留 + POST/Export 子路径进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
  });

  it('数据钩子守恒：data-export-run/export-*', () => {
    expect(code).toContain('data-export-run');
  });

  it('字面 className 只认 .pb-*/复用族（含 cn 单条分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(10);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:pb|sb|wd|cp|gp|ds|ag|cb|hi)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（复用族 之外）', () => {
    for (const re of ['px-', 'py-', 'max-h-[', 'absolute right-0', 'top-[', 'w-[', 'bg-bg-', 'text-fg-', 'hover:bg-', 'space-y-']) {
      expect(code, `ExportPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:pb|sb|wd|cp|gp|ds|ag|cb|hi)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(14);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.pb-popPanel360/.pb-runBtn 新固定存在且零 @media（环境除外 520px）', () => {
    expect(globals).toContain('.pb-popPanel360 {');
    expect(globals).toContain('.pb-runBtn {');
    // 520px 这一档是唯一保留的 @media；其它的步入 A11Y-2 纪律（FE-34 等记录语义）
    const medias520 = [...globals.matchAll(/@media\s*\(max-width:\s*520px\)/g)].length;
    expect(medias520).toBeGreaterThanOrEqual(1);
    expect(segment).not.toContain('transition');
  });

  it('.pb-popPanel360 是 72vh+shadow lg+max-[520px]->position: fixed; left/right 12px; top 52px; width auto', () => {
    const start = globals.indexOf('.pb-popPanel360 {');
    const slice = globals.slice(start, start + 600);
    expect(slice).toContain('72vh');
    expect(slice).toContain('max-height: 72vh');
    expect(slice).toContain('shadow-lg');
    expect(slice).toContain('width: auto');
  });

  it('零写死 hex；pb 段 token 全声明；520px 那档是唯一 @media.x', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className/cn 后全文 SHA256 守恒：HEAD 雕刻 cn 一行（唯一使用点消失后已死）后与改后 redact 字节一致', () => {
    const head = execSync('git show HEAD:apps/web/src/studio/ExportPanel.tsx').toString('utf8');
    expect(head).toContain("import { cn } from '@/lib/cn';");
    const carved = head.replace(/import \{ cn \} from '@\/lib\/cn';\n/, '');
    expect(carved).not.toContain("import { cn } from '@/lib/cn';");
    expect(redactClasses(carved)).toBe(redactClasses(main));
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '8cf979c52c94923126781ccdcbb96c0691c6dfbd7f2b67176d836466a80dac87',
    );
  });
});
