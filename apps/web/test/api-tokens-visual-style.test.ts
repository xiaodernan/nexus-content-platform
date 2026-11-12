import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-20 `/api-tokens` 公开 API 凭据页——**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * 这一页是本轮最后几张"账号页全裸 Tailwind"里的一张（另几张在并行会话的 §FE 序列里）。
 * 本片只换 className，零行为：文案、data 钩子、表单/校验/签发/吊销/试一下逻辑、SCHEMA
 * 一字不改。`ApiTokensPanel.tsx` 是有交互的 client 组件（onClick/onChange/busy 态），
 * 所以它保留 `'use client'`；路由入口 `page.tsx` 仍是纯 server 组件。
 *
 * **剥 className 后全文逐字节零行为门**（本片最强）：基线（全裸，git HEAD）与改造后
 * 必须 redact 成完全相同的 SHA256 `6ae5d7c5…`——常量在**改前**由真实产物算出并钉死
 * （redact = 所有 `className="…"` → `className="@"`、所有 `className={\`…\`}` → `className={@}`、
 * 其余 `className={…}` → `className={@}`），三步 redact 顺序必须与钉死常量那一次完全一致。
 * redact 后相同才证明"改动只落在 className 字面值里，其它一个字节没动"。
 * 以后任何行为改动都会让这道门红——看到红了，先读本注释再决定是 bump 常量+ADR，还是退回去。
 *
 * 判据不变式（13 门）：
 *  1. page.tsx 纯 server 组件、force-dynamic、redirect 守卫、data-api-tokens-page 钩子；
 *  2. page/panel 全部字面 className 只有 `.at-*`；template 类名只认 `at-td` + 三选一状态色；
 *  3. 零裸 Tailwind 原子类（page 与 panel 双文件）；
 *  4. `.at-*` 在 globals.css 全部有基础定义；
 *  5. `.at-` 视觉段≥30 条视觉类、足够成段；
 *  6. 零写死 hex；7. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；
 *  8. 零新增颜色 token（视觉段不含 `--nexus-*:` 定义）；
 *  9. 零 transition / animation / @keyframes（零动效页，不装 reduced-motion 假门）；
 * 10. 零 @media（不引入新的响应式断点口径）；
 * 11. 六红线视觉延伸：全交互控件都有 :focus-visible 环、:disabled 真禁用语义、链接下划线偏移；
 * 12. 行为门：剥 className 后全文 SHA256 守恒（见上注释，`6ae5d7c5…`）；
 * 13. 数据钩子守恒：page 1 个 + panel 20 个 data-token-* / data-try-* / data-api-limits 钩子。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/api-tokens/page.tsx');
const PANEL = join(ROOT, 'apps/web/src/components/ApiTokensPanel.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const panel = readFileSync(PANEL, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

/** 去注释后的真代码——所有语义门锚它。 */
const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const panelCode = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** globals.css 里 `.at-*` 基础定义选择器集合。 */
function atClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(at-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

/** raw 文本里找首个 `re` 匹配，跳过注释（注释里长得像门面类的 `.at-` 不是段起点）。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.at-` 视觉段：`.at-page {` 起，到下一个 §FE 段头止（段头锚够脊梁骨，别吞 `.tc-`）。 */
function atSegment(css: string): string {
  const start = findOutsideComments(css, /\.at-page \{/);
  if (start < 0) throw new Error('globals.css 找不到 .at- 段（.at-page {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = atSegment(globals);
const segmentNoComments = cssNoComments(segment);

/** redact：所有 className 字面值/模板值 → @（顺序三步与钉死常量的那次一致）。 */
function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}');
}

describe('§FE-20 /api-tokens 公开 API 凭据页', () => {
  it('page.tsx 是纯 server 组件：零 client 指令、force-dynamic、redirect 守卫、page 钩子齐全', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).toContain('if (!user) redirect(');
    expect(pageCode).toContain('data-api-tokens-page');
    expect(pageCode).toContain('<ApiTokensPanel');
    expect(pageCode).not.toContain('fetch(');
    expect(pageCode).not.toContain('onClick=');
  });

  it('panel 保留 client 指令（交互面板），page 不许有（路由入口必须 server）', () => {
    expect(panel.slice(0, 40)).toContain("'use client'");
    expect(page).not.toContain("'use client'");
  });

  it('page 与 panel 的全部字面 className 只认 .at-*（每一段都得是门面类）', () => {
    let total = 0;
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^at-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThan(30);
  });

  it('template 类名只认 at-td + 三选一状态色（at-statusBad/Warn/Ok）', () => {
    const templates = [...panelCode.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    expect(templates.length).toBe(1);
    const only = templates[0]!;
    expect(only).toContain('at-td');
    expect(only).toContain('at-statusBad');
    expect(only).toContain('at-statusWarn');
    expect(only).toContain('at-statusOk');
    // 不许夹带任何旧的 Tailwind 状态色原子类
    expect(only).not.toMatch(/text-(danger|warn|fg)-/);
  });

  it('零裸 Tailwind 原子类（mt-/mx-/px-/py-/text-N/text-[/flex/grid/gap-/items-/border-b/md:/sm:/hover:）', () => {
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        expect(cls).not.toMatch(
          /\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|text-fg-|text-danger-|text-warn-|text-accent-|text-brand|bg-|flex\b|grid\b|gap-|items-|border-|rounded-\[|md:|sm:|hover:|disabled:|font-)\b/,
        );
      }
    }
  });

  it('className 用到的每个 at-* 都在 globals.css 里有 .at- 基础定义', () => {
    const used = new Set(
      [...(pageCode + '\n' + panelCode).matchAll(/\bat-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]),
    );
    expect(used.size).toBeGreaterThan(20);
    const defined = atClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}（.at-${cls} {…}）`).toContain(cls);
    }
  });

  it('.at- 视觉段成规模（≥28 条视觉类）', () => {
    const defined = atClassesDefined(globals);
    expect(defined.size).toBeGreaterThanOrEqual(28);
    expect(segment.length).toBeGreaterThan(1000);
  });

  it('零写死 hex（视觉段 + 两文件都不许）', () => {
    expect(segmentNoComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.at- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segmentNoComments.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThan(15);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）', () => {
    expect(segmentNoComments).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('零 transition / animation / @keyframes（零动效页）', () => {
    expect(segmentNoComments).not.toContain('transition');
    expect(segmentNoComments).not.toContain('animation');
    expect(segmentNoComments).not.toContain('@keyframes');
  });

  it('零 @media（不引入新的响应式断点，行为与基线一致）', () => {
    expect(segmentNoComments).not.toContain('@media');
  });

  it('六红线视觉延伸：:focus-visible 环覆盖全部交互控件；:disabled 真禁用语义', () => {
    for (const sel of [
      '.at-backlink:focus-visible',
      '.at-input:focus-visible',
      '.at-inputNarrow:focus-visible',
      '.at-btnPrimary:focus-visible',
      '.at-btnGhost:focus-visible',
      '.at-btnDanger:focus-visible',
      '.at-btnGhostSm:focus-visible',
      '.at-btnGhostSmWarn:focus-visible',
      '.at-textLink:focus-visible',
    ]) {
      expect(segment).toContain(sel);
    }
    for (const sel of [
      '.at-btnPrimary:disabled',
      '.at-btnGhost:disabled',
      '.at-btnGhostSm:disabled',
      '.at-btnGhostSmWarn:disabled',
      '.at-textLink:disabled',
    ]) {
      expect(segment).toContain(sel);
    }
    // 链接下划线保留偏移，不裸下划线
    expect(segment).toMatch(/\.at-textLink \{[^}]*text-underline-offset|\.at-backlink \{[^}]*text-underline-offset/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：6ae5d7c55c769ceb1a19f793665798f1e312a46ff6573b7592ff26a228f0904e）', () => {
    // 常量在改前（git HEAD）由真实产物 redact 算出并钉死；此门保证除 className 之外一字节未动。
    // 若未来行为改动需要 bump 常量：必须随 ADR 写明"行为改了什么、为什么"，不许悄摸 bump。
    expect(createHash('sha256').update(redactClasses(panel)).digest('hex')).toBe(
      '6ae5d7c55c769ceb1a19f793665798f1e312a46ff6573b7592ff26a228f0904e',
    );
  });

  it('数据钩子守恒：page 1 个 + panel 21 个 data-token-*/data-try-*/data-api-limits', () => {
    expect(pageCode).toContain('data-api-tokens-page');
    for (const hook of [
      'data-token-name',
      'data-token-days',
      'data-token-create',
      'data-token-scope',
      'data-token-issued',
      'data-token-plain',
      'data-try-list',
      'data-try-design',
      'data-try-patch',
      'data-try-status',
      'data-token-error',
      'data-token-note',
      'data-token-list-failed',
      'data-token-empty',
      'data-token-row',
      'data-token-hint',
      'data-token-access',
      'data-token-status',
      'data-token-revoke',
      'data-token-retry',
      'data-api-limits',
    ]) {
      expect(panelCode, `panel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('诚实文案守恒：明文唯一一次 / 列表读失败分明', () => {
    expect(panelCode).toContain('唯一一次');
    expect(panelCode).toContain('读不到');
  });
});
