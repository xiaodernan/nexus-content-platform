import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-28 `/admin/marketplace` 市场工单（§123/#158/#159）——**静态那一寸**。
 *
 * `page.tsx`：举报工单队列（筛选 chips / 工单卡 / 已结案两格 / 市场审计日志最近 50）+ denied×2
 * （anonymous/not-admin），复用 `.adm-*`denied 系；`TriageButtons.tsx`（client）：一条工单的三个处置
 * （受理=reviewing / 结案=resolved / 驳回=dismissed 危险色），结案只落工单结论、不撤内容。
 * 本片只换皮：`REPORT_STATUSES` 过滤、`getReports/getAuditLog` 读路径、行内提示语义、
 * `outcome` 并排展示（不换掉按钮）、409 原样念——全部一字不动。
 *
 * **剥 className 后全文 SHA256 守恒**：两文件均恒等于改前（git HEAD）。
 * redact 三步序与钉死常量一致：page=`84052785…`，triage=`03379155…`。
 *
 * 判据不变式（13 门）：
 *  1. page.tsx server 组件 + denied×2 + role 闸门 + AdminNav current="marketplace"；
 *  2. TriageButtons 保留 'use client'；`send('reviewing'|'resolved'|'dismissed')` 三态进门；
 *  3. 字面 className 全 `.adm-*`/`.am-*`；4. 零裸 Tailwind 原子类；
 *  5. 用到的每个类都在 globals.css 有定义；6. `.am-` 段成规模（≥ 25 条）；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. `.am-` 段零 transition / @media；11. `.am-btnDanger` 锚 danger（驳回=举报不成立）；
 * 12. SHA256 双文件守恒；13. 数据钩子守恒（filter×5 / row×报告单 / closed×2 / triage×3+2）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/admin/marketplace/page.tsx');
const TRIAGE = join(ROOT, 'apps/web/src/app/admin/marketplace/TriageButtons.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const triage = readFileSync(TRIAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const triageCode = triage.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.am-` 视觉段：`.am-scopeBox {` 起，到下一个 §FE 段头止。 */
function amSegment(css: string): string {
  const start = findOutsideComments(css, /\.am-scopeBox \{/);
  if (start < 0) throw new Error('globals.css 找不到 .am- 段（.am-scopeBox {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = amSegment(globals);

/** redact：className 任意形态归一 @；与钉死常量一致。 */
function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

function frClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:adm|am|ar)-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-28 /admin/marketplace 市场工单', () => {
  it('page.tsx 是纯 server 组件 + denied×2 + role 闸门 + AdminNav current="marketplace"', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).toContain("user.role !== 'admin'");
    expect(pageCode).toContain('data-admin-denied="anonymous"');
    expect(pageCode).toContain('data-admin-denied="not-admin"');
    expect(pageCode).toContain('<AdminNav current="marketplace"');
    expect(pageCode).toContain('<TriageButtons');
    expect(pageCode).not.toContain('onClick=');
  });

  it('TriageButtons 保留 client 指令；三态处置原样（reviewing / resolved / dismissed）', () => {
    expect(triage.slice(0, 40)).toContain("'use client'");
    for (const status of ['reviewing', 'resolved', 'dismissed']) {
      expect(triageCode).toContain(`send('${status}')`);
    }
    expect(triageCode).toContain("method: 'PATCH'");
    expect(triageCode).toContain('router.refresh()');
    expect(triageCode).toContain('data-triage=');
    expect(triageCode).toContain('data-triage-note');
    expect(triageCode).toContain('data-triage-error');
  });

  it('数据钩子守恒：filter×5（all+四态）+ row/status/empty/closed/audit-log/audit-row', () => {
    for (const hook of [
      'data-report-filter-status="all"',
      "data-report-filter-status={value}",
      'data-report-row=',
      'data-report-status=',
      'data-report-reason=',
      'data-report-item',
      'data-report-created',
      'data-report-status-label',
      'data-report-reporter',
      'data-report-description',
      'data-report-closed=',
      'data-report-notes=',
      'data-marketplace-audit-log',
      'data-marketplace-audit-empty',
      'data-marketplace-audit-row=',
      'data-marketplace-scope',
      'data-marketplace-summary',
      'data-admin-marketplace',
    ]) {
      expect(pageCode, `page 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('两个文件的字面 className 只认 .adm-*/.am-*', () => {
    let total = 0;
    for (const src of [pageCode, triageCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(adm|am)-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(34);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [pageCode, triageCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        expect(cls).not.toMatch(
          /\b(mt-|mb-|mx-|px-|py-|my-|p-\d|text-\d|text-\[|text-fg-|text-danger-|text-accent-|bg-|flex\b|grid\b|gap-|items-|min-h-|min-w-|break-all|whitespace-|rounded-|md:|sm:|lg:|hover:|focus:|disabled:|font-|w-full|inline-)\b/,
        );
      }
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...(pageCode + '\n' + triageCode).matchAll(/\b(?:adm|am)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(25);
    const defined = frClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.am- 视觉段成规模（≥ 25 条视觉类）', () => {
    expect(segment.length).toBeGreaterThan(800);
    expect((segment.match(/\.am-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(25);
  });

  it('零写死 hex（视觉段 + 两个文件都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(triageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.am- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(14);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）；零 transition / @media', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
  });

  it('.am-btnDanger 锚 danger（驳回=举报不成立）+ :disabled 真禁用；noteInput focus-visible', () => {
    expect(segment).toMatch(/\.am-btnDanger \{[^}]*background: var\(--nexus-color-danger\)/);
    expect(segment).toContain('.am-btnDanger:disabled');
    expect(segment).toContain('.am-noteInput:focus-visible');
    expect(segment).toContain('.am-btn:focus-visible');
  });

  it('驳回按钮的 data 钩子仍是 data-triage="dismissed"（文案 "驳回（举报不成立）" 一字不改）', () => {
    expect(triageCode).toContain('data-triage="dismissed"');
    expect(triageCode).toContain('驳回（举报不成立）');
    expect(triageCode).toContain('结案（举报成立）');
    expect(triageCode).toContain('受理（复核中）');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：page=84052785… · triage=03379155…）', () => {
    // 常量在改前（git HEAD）由真实产物 redact 算出并钉死；此门保证除 className 外一字节未动。
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '84052785e43badae0f1bddc029306887a4793500fa8fb4dc826fe49172cbfc82',
    );
    expect(createHash('sha256').update(redactClasses(triage)).digest('hex')).toBe(
      '033791554f714a59914b7930b36bdc254d79f5eefa535b54b90a9291364c9d2d',
    );
  });
});
