import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-30 `/admin/users` 账号与角色 + 过期访客回收（§131 / ADR-0072）——**静态那一寸**。
 *
 * 四份文件：
 *  - `page.tsx`（server）：三条硬规则（不能改自己/guest 不提权/改别人前提是审核员）+ 档位入口；
 *  - `GuestReclaimPanel.tsx`（client）：清单分屏 8/屏、判据是"沉默"、回执数由服务端算；
 *  - `PlanSelect.tsx` / `RoleButton.tsx`（client）：改档位（下拉+确认按钮）/ 提权降权（单按钮）。
 * 本片只换皮；listAccounts/countAdmins/scanGuestReclaimCandidates、reclaim-state 判据、
 * deny-gate 全在服务端——不动。
 *
 * **剥 className 后全文 SHA256 守恒**：四文件均恒等于改前（git HEAD）。
 * redact 三步序与钉死常量一致：page=`ad3ff95d…` plan=`1d403f70…` role=`2701465c…` reclaim=`ffcfd0b0…`。
 *
 * 判据不变式（12 门）：
 *  1. page.tsx server 组件 + denied×2 + role 闸门 + AdminNav current="users"；
 *  2. 三个 client 组件保留 'use client'；`router.refresh()` ×3 进门；
 *  3. 字面 className 全 `.adm-*`/`.am-*`/`.au-*`；4. 零裸 Tailwind 原子类；
 *  5. 用到的每个类都在 globals.css 有定义；6. `.au-` 段成规模（≥ 10 条）；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. `.au-` 段零 transition / @media；11. `.au-applyBtn` 锚 accent-2 / `.au-navBtn` 锚强边；
 * 12. SHA256 四文件守恒 + 数据钩子守恒（page 五组 + reclaim 六组 + plan/role 各三）。
 */
const ROOT = process.cwd();
const READ = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const PAGE = READ('apps/web/src/app/admin/users/page.tsx');
const RECLAIM = READ('apps/web/src/app/admin/users/GuestReclaimPanel.tsx');
const PLAN = READ('apps/web/src/app/admin/users/PlanSelect.tsx');
const ROLE = READ('apps/web/src/app/admin/users/RoleButton.tsx');
const GLOBALS = READ('apps/web/src/app/globals.css');
const TOKENS = READ('apps/web/src/styles/tokens.css');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pageCode = strip(PAGE);
const reclaimCode = strip(RECLAIM);
const planCode = strip(PLAN);
const roleCode = strip(ROLE);

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.au-` 视觉段：`.au-shell {` 起，到下一个 §FE 段头止。 */
function auSegment(css: string): string {
  const start = findOutsideComments(css, /\.au-shell \{/);
  if (start < 0) throw new Error('globals.css 找不到 .au- 段（.au-shell {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = auSegment(GLOBALS);

/** redact：className 任意形态归一 @。 */
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
    for (const m of line.matchAll(/\.((?:adm|am|au)-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-30 /admin/users 账号与角色 + 客人回收', () => {
  it('page.tsx 是纯 server 组件 + denied×2 + role 闸门 + AdminNav current="users"', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).toContain("user.role !== 'admin'");
    expect(pageCode).toContain('<AdminNav current="users"');
    expect(pageCode).toContain('listAccounts(200)');
    expect(pageCode).not.toContain('onClick=');
    expect(pageCode).toContain('GuestReclaimPanel');
  });

  it('三个 client 组件保留 client 指令；router.refresh() 三条路径进门', () => {
    for (const src of [RECLAIM, PLAN, ROLE]) expect(src.slice(0, 40)).toContain("'use client'");
    for (const src of [RECLAIM, PLAN, ROLE]) expect(strip(src)).toContain('router.refresh()');
  });

  it('数据钩子守恒：page 五组 + plan 三钩 + role 三钩 + reclaim 六组', () => {
    for (const hook of ['data-users-root', 'data-users-summary', 'data-users-rules', 'data-users-plan-rules', 'data-account-row', 'data-account-name', 'data-account-role']) {
      expect(pageCode, `page 丢了钩子 ${hook}`).toContain(hook);
    }
    for (const hook of ['data-plan-select=', 'data-plan-set=', 'data-plan-notice']) {
      expect(planCode, `plan 丢了钩子 ${hook}`).toContain(hook);
    }
    for (const hook of ['data-role-set=', 'data-role-self', 'data-role-notice', 'data-role-guest']) {
      expect(roleCode, `role 丢了钩子 ${hook}`).toContain(hook);
    }
    for (const hook of ['data-reclaim-root', 'data-reclaim-rule', 'data-reclaim-counts', 'data-reclaim-pick-all', 'data-reclaim-page', 'data-reclaim-row=', 'data-reclaim-list', 'data-reclaim-truncated', 'data-reclaim-empty', 'data-recount-button', 'data-reclaim-apply', 'data-reclaim-notice']) {
      expect(reclaimCode, `reclaim 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('四个文件的字面 className 只认 .adm-*/.am-*/.au-*', () => {
    let total = 0;
    for (const src of [pageCode, reclaimCode, planCode, roleCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(adm|am|au)-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(36);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [pageCode, reclaimCode, planCode, roleCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        expect(cls).not.toMatch(
          /\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|text-fg-|text-danger-|text-accent-|bg-|flex\b|grid\b|gap-|items-|min-h-|min-w-|truncate|rounded-|md:|sm:|lg:|hover:|disabled:|font-|w-full|inline-|ml-)\b/,
        );
      }
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set(
      [...(pageCode + reclaimCode + planCode + roleCode).matchAll(/\b(?:adm|am|au)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]),
    );
    expect(used.size).toBeGreaterThanOrEqual(26);
    const defined = frClassesDefined(GLOBALS);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.au- 视觉段成规模（≥ 10 条）且零 transition / @media', () => {
    expect(segment.length).toBeGreaterThan(400);
    expect((segment.match(/\.au-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@media');
  });

  it('零写死 hex（视觉段 + 四文件都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const src of [pageCode, reclaimCode, planCode, roleCode]) {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it('.au- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(12);
    for (const token of used) {
      expect(TOKENS, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('.au-applyBtn 锚 accent-2（收走 N 个=批量不可逆）+ focus-visible/disabled；.au-navBtn 强边', () => {
    expect(segment).toMatch(/\.au-applyBtn \{[^}]*background: var\(--nexus-color-accent-2\)/);
    expect(segment).toContain('.au-applyBtn:focus-visible');
    expect(segment).toContain('.au-applyBtn:disabled');
    expect(segment).toContain('.au-navBtn:focus-visible');
    expect(segment).toContain('.au-navBtn:disabled');
    expect(segment).toContain('.au-select:focus-visible');
    expect(segment).toContain('.au-ghostBtn:hover:not(:disabled)');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：page=ad3ff95d… · plan=1d403f70… · role=2701465c… · reclaim=ffcfd0b0…）', () => {
    // 常量在改前（git HEAD）由真实产物 redact 算出并钉死；此门保证除 className 外一字节未动。
    expect(createHash('sha256').update(redactClasses(PAGE)).digest('hex')).toBe(
      'ad3ff95d7b719f373ba29a2645223b70627d7f11254d8733e0796a1e320a2bbd',
    );
    expect(createHash('sha256').update(redactClasses(PLAN)).digest('hex')).toBe(
      '1d403f706a5f028ac66f3052d48f2b54cd7fa7c2147f464ec7bec5a9cc9d99d6',
    );
    expect(createHash('sha256').update(redactClasses(ROLE)).digest('hex')).toBe(
      '2701465c4a360ec189b60352e7eb3b829a921597dd0e783872e8607e23bdea7b',
    );
    expect(createHash('sha256').update(redactClasses(RECLAIM)).digest('hex')).toBe(
      'ffcfd0b00a857e450d323bcaa71ab3a060556689e922dccc7ec1891b5b9695e7',
    );
  });
});
