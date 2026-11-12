import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-23 `/tasks/[projectId]` 任务账本（§112）——**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * 路由 `page.tsx` 零 className（server 直读库渲染第一屏，交给 client 组件），
 * 表里的一切在 `TasksLedgerLive.tsx`（'use client'，订阅 generation.progress 重读）；
 * 每行的"重试"按钮在 `TaskRetryButton.tsx`（'use client'，§162 重试开新行）。
 * 本片只换 className；行为、文案、data 钩子、realtime 订阅/重读判据一字不改。
 *
 * **剥 className 后全文 SHA256 守恒**：三文件均逐字节恒等于改前（git HEAD）。
 * redact 三步序与钉死常量那一次一致：live=`1e7aa68d…`，retry=`b90012c2…`，page=`bd7e0e61…`。
 *
 * 判据不变式（13 门）：
 *  1. page.tsx server 组件 + force-dynamic + requireUser + listProjectTasks 钩子（零 className）；
 *  2. live + retry 保留 'use client'（唯二的 client 面）；
 *  3. 两个 client 文件字面 className 全 `.tl-*`；4. 零裸 Tailwind 原子类；
 *  5. .tl-* 每个都在 globals.css 有基础定义；6. `.tl-` 视觉段 ≥ 15 条视觉类；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*）全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. 零 transition / animation / @keyframes / @media；11. focus-visible 覆盖 backlink/retryBtn；
 *     .tl-retryBtn:disabled 真禁用；横滚区 role="region" + tabIndex 守恒（axe scrollable-region-focusable）；
 * 12. SHA256 三文件守恒；13. 数据钩子守恒（13 个 data-tasks-/data-task- 系 + 2 个 data-task-retry 系）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/tasks/[projectId]/page.tsx');
const LIVE = join(ROOT, 'apps/web/src/components/TasksLedgerLive.tsx');
const RETRY = join(ROOT, 'apps/web/src/components/TaskRetryButton.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const live = readFileSync(LIVE, 'utf8');
const retry = readFileSync(RETRY, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const liveCode = strip(live);
const retryCode = strip(retry);

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.tl-` 视觉段：`.tl-page {` 起，到下一个 §FE 段头止。 */
function tlSegment(css: string): string {
  const start = findOutsideComments(css, /\.tl-page \{/);
  if (start < 0) throw new Error('globals.css 找不到 .tl- 段（.tl-page {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = tlSegment(globals);

/** redact：所有 className 字面值/模板值 → @（顺序三步与钉死常量的那次一致）。 */
function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}');
}

function tlClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(tl-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-23 /tasks/[projectId] 任务账本', () => {
  it('page.tsx 是纯 server 组件、零 className、force-dynamic、走 listProjectTasks/requireUser', () => {
    expect(page).not.toContain('use client');
    expect(page).toContain("export const dynamic = 'force-dynamic'");
    expect(page).toContain('requireUser()');
    expect(page).toContain('listProjectTasks(');
    expect(page).toContain('TasksLedgerLive');
    expect(page).not.toContain('className=');
    expect(page).not.toContain('onClick=');
  });

  it('live + retry 保留 client 指令（唯二的 client 面）', () => {
    expect(live.slice(0, 40)).toContain("'use client'");
    expect(retry.slice(0, 40)).toContain("'use client'");
    expect(page).not.toContain("'use client'");
  });

  it('两个 client 文件的字面 className 只认 .tl-*', () => {
    let total = 0;
    for (const src of [liveCode, retryCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^tl-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThan(12);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [liveCode, retryCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        expect(cls).not.toMatch(
          /\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|text-fg-|text-danger-|text-warn-|bg-|flex\b|grid\b|gap-|items-|min-h-|min-w-|whitespace-|overflow-|w-full|inline-flex|rounded-|md:|sm:|hover:|disabled:|font-|self-)\b/,
        );
      }
    }
  });

  it('className 用到的每个 tl-* 都在 globals.css 里有 .tl- 基础定义', () => {
    const used = new Set([...(liveCode + '\n' + retryCode).matchAll(/\btl-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThan(12);
    const defined = tlClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.tl- 视觉段成规模（≥ 15 条视觉类）', () => {
    expect(tlClassesDefined(globals).size).toBeGreaterThanOrEqual(15);
    expect(segment.length).toBeGreaterThan(600);
  });

  it('零写死 hex（视觉段 + 两个 client 文件都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(liveCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(retryCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.tl- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('零 transition / animation / @keyframes / @media（零动效、基线零断点）', () => {
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('animation');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('@media');
  });

  it('focus-visible 覆盖 back/retryBtn；.tl-retryBtn:disabled 真禁用；滚动区 role="region"+tabIndex 守恒', () => {
    expect(segment).toContain('.tl-back:focus-visible');
    expect(segment).toContain('.tl-retryBtn:focus-visible');
    expect(segment).toContain('.tl-retryBtn:disabled');
    // 横滚区键盘可达（axe: scrollable-region-focusable）——行为不是样式，但进门守着
    expect(liveCode).toContain('role="region"');
    expect(liveCode).toContain('tabIndex={0}');
    expect(liveCode).toContain('aria-label="任务账本表格（可横向滚动）"');
  });

  it('数据钩子守恒：live 13 个 + retry 2 个（data-task-retry/-note）', () => {
    for (const hook of [
      'data-tasks-root',
      'data-tasks-title',
      'data-tasks-summary',
      'data-tasks-usage-summary',
      'data-tasks-realtime',
      'data-tasks-back',
      'data-tasks-live-note',
      'data-tasks-scope',
      'data-tasks-empty',
      'data-tasks-table-scroll',
      'data-task-row',
      'data-task-status',
      'data-task-usage',
    ]) {
      expect(liveCode, `live 丢了钩子 ${hook}`).toContain(hook);
    }
    expect(retryCode).toContain('data-task-retry=');
    expect(retryCode).toContain('data-task-retry-note');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：live=1e7aa68d… · retry=b90012c2… · page=bd7e0e61…）', () => {
    // 常量在改前（git HEAD）由真实产物 redact 算出并钉死；此门保证除 className 外一字节未动。
    expect(createHash('sha256').update(redactClasses(live)).digest('hex')).toBe(
      '1e7aa68d34b020cce7e2d7c3505883352107037368e62ba8119752564a4d520a',
    );
    expect(createHash('sha256').update(redactClasses(retry)).digest('hex')).toBe(
      'b90012c2ad50e24a71a316610fe85fb8b9caa69607d27fc8ef89b8c91ae23801',
    );
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'bd7e0e611bc74902aad2fd028288539769d2efbe5d078579af89d9cbe386e9a3',
    );
  });
});
