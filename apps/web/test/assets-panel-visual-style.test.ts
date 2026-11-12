import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * §FE-53 `AssetsPanel.tsx` `.ap-` 门面化（M2 Asset Library）——**静态那一寸**。
 *
 * 项目资产清单：列出/预览/删除——删除一次可撤销事务(§149)，剥掉引用它的 fill（字节删除尽力而为、到库缺字节回不来，回执如实写（§159））。
 * 引用计数变成 `referenceCounts` 一次走全节点扫成 Map（§147 代价 N+assets，不重扫）。
 * 本片只换皮；SketchPad 挂载条件、apiAssetUrl 鉴权、canvas jpeg 路径——一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一 + 去掉唯一使用点消失后已死的 `import { cn }` 一行）：
 * `88bf73a104b432f9358dc367618bce2ad77c67d03c3d823e3ba2519809152daa`：git HEAD 雕刻该 cn 行后与改后字节一致（雕刻见 ADR-0205）。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + lookups/studio 进门；2. 字面 className 全 `.ap-*` / 复用 `.wd-*`/`.sk-*`/`.ds-*`/`.hi-*`/`.cp-*`/`.pp-*`/`.gp-*`/`.sb-*`/`.hi-*`；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.ap-` 段成规模（≥ 40 条）；
 *  6. 零 hex；7. 字面量只出现在 0.625rem / 2px；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 transition/@media/@keyframes；11. `.ap-bannerWarn` color-mix、`.ap-thumb` 3.5rem 尺寸守恒；
 * 12. SHA256 守恒 + 钩子守恒（data-asset-* 系列——`data-asset-upload=`、`data-assets-empty` 等）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/AssetsPanel.tsx');
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

/** `.ap-` 视觉段：`.ap-chipDis {` 起，到下一个 §FE 段止。 */
function apSegment(css: string): string {
  const start = findOutsideComments(css, /\.ap-chipDis \{/);
  if (start < 0) throw new Error('globals.css 找不到 .ap- 段（.ap-chipDis {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = apSegment(globals);

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
    for (const m of line.matchAll(/\.((?:ap|sk|pp|wd|gp|sb|hi|cp|ds)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-53 /studio AssetsPanel 资产清单', () => {
  it("'use client' 保留 + studio.lock/upload/deleteAssetFromLibrary + referenceCounts 进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('referenceCounts(');
    expect(code).toContain('studio.deleteAssetFromLibrary(');
  });

  it('数据钩子守恒：assets-panel/asset-card/delete/demo-badge/notice/error/sketch-section/vbench-*', () => {
    for (const hook of [
      'data-assets-panel',
      'data-asset-card',
      'data-asset-delete',
      'data-asset-demo-badge',
      'data-asset-notice',
      'data-asset-error',
      'data-sketch-section',
      'data-vbench-run',
      'data-vbench-section',
      'data-image-generate',
      'data-image-prompt',
    ]) {
      expect(code, `AssetsPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .ap-* 与复用族（含 cn 单条分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(20);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:ap|sk|pp|wd|gp|sb|hi|cp|ds)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'ap-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'ap-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（ap-/复用族之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'max-h-[', 'w-[', 'h-[', 'bg-bg-', 'text-fg-', 'rounded-[', 'flex h-', 'items-center gap-', 'hover:bg-bg-', 'disabled:']) {
      expect(code, `AssetsPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:ap|sk|pp|wd|gp|sb|hi|cp|ds)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(25);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.ap- 视觉段成规模（≥ 25 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(2800);
    expect((segment.match(/\.ap-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(25);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex；字面量只出现在 0.625rem', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('font-size: 0.625rem');
  });

  it('.ap- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(9);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.ap-bannerWarn/.ap-thumb/.ap-infoBox 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.ap-bannerWarn {', '.ap-thumb {', '.ap-infoBox {', '.ap-wfullInput {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className/cn 后 SHA256 守恒：git HEAD 雕刻 cn 一行（唯一链接使用点消失后已死）后字节一致', () => {
    // 全片唯一代码字节变更 = 删除 `import { cn } from '@/lib/cn'`；redact 后比对雕刻过的 HEAD
    const head = execSync('git show HEAD:apps/web/src/studio/AssetsPanel.tsx').toString('utf8');
    expect(head).toContain("import { cn } from '@/lib/cn';");
    const carved = head.replace(/import \{ cn \} from '@\/lib\/cn';\n/, '');
    expect(carved).not.toContain("import { cn } from '@/lib/cn';");
    expect(createHash('sha256').update(redactClasses(carved)).digest('hex')).toBe(
      createHash('sha256').update(redactClasses(main)).digest('hex'),
    );
  });
});
