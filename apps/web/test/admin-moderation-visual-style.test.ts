import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-29 `/admin/moderation` 人工复核台（§131）——**静态那一寸**。
 *
 * `page.tsx`：机检覆盖不到的部分明写出处、待看案列表（findings/verdict/举报数）+ denied×2
 * （anonymous/not-admin）；`ResolveButtons.tsx`（client）：放行 / 拒绝并撤下（rejected=danger-ink）。
 * 裁决是审核链上唯一能写下 approved/rejected 的地方——本片只换皮。
 *
 * **剥 className 后全文 SHA256 守恒**：两文件均恒等于改前（git HEAD）。
 * redact 三步序与钉死常量一致：page=`585733e5…`，resolve=`1917a942…`。
 *
 * 判据不变式（12 门）：
 *  1. page.tsx server 组件 + denied×2 + role 闸门 + AdminNav current="moderation"；
 *  2. ResolveButtons 保留 'use client'；`resolve('approved'|'rejected')` 两态进门；
 *  3. 字面 className 全 `.adm-*`/`.am-*`；4. 零裸 Tailwind 原子类；
 *  5. 用到的每个类都在 globals.css 有定义；6. `.am-` 段的本片新增类全部被用到；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. `.am-` 段零 transition / @media；11. `.am-btnDanger` 锚 danger（拒绝=立刻 404 公开 URL）；
 * 12. SHA256 双文件守恒 + 数据钩子守恒（case/findings/open/resolve 全钩子）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/admin/moderation/page.tsx');
const RESOLVE = join(ROOT, 'apps/web/src/app/admin/moderation/ResolveButtons.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const resolve = readFileSync(RESOLVE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const resolveCode = resolve.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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
    for (const m of line.matchAll(/\.((?:adm|am|ar)-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-29 /admin/moderation 人工复核台', () => {
  it('page.tsx 是纯 server 组件 + denied×2 + role 闸门 + AdminNav current="moderation"', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).toContain("user.role !== 'admin'");
    expect(pageCode).toContain('data-admin-denied="anonymous"');
    expect(pageCode).toContain('data-admin-denied="not-admin"');
    expect(pageCode).toContain('<AdminNav current="moderation"');
    expect(pageCode).toContain('<ResolveButtons');
    expect(pageCode).not.toContain('onClick=');
  });

  it('ResolveButtons 保留 client 指令；两态裁决原样（approved / rejected）+ POST', () => {
    expect(resolve.slice(0, 40)).toContain("'use client'");
    for (const res of ['approved', 'rejected']) {
      expect(resolveCode).toContain(`resolve('${res}')`);
    }
    expect(resolveCode).toContain("method: 'POST'");
    expect(resolveCode).toContain('router.refresh()');
    expect(resolveCode).toContain('data-resolve=');
    expect(resolveCode).toContain('data-resolve-note');
    expect(resolveCode).toContain('data-resolve-error');
  });

  it('数据钩子守恒：denied×2/rules-version/queue-limits/limits/empty/case/findings/open', () => {
    for (const hook of [
      'data-rules-version=',
      'data-queue-limits',
      'data-queue-limit',
      'data-queue-empty',
      'data-queue-case=',
      'data-case-project',
      'data-case-decision=',
      'data-case-reports=',
      'data-case-finding=',
      'data-case-open',
      'data-admin-queue',
    ]) {
      expect(pageCode, `page 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('两个文件的字面 className 只认 .adm-*/.am-*', () => {
    let total = 0;
    for (const src of [pageCode, resolveCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(adm|am)-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(28);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [pageCode, resolveCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        expect(cls).not.toMatch(
          /\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|text-fg-|text-danger-|text-accent-|bg-|flex\b|grid\b|gap-|items-|min-h-|min-w-|rounded-|md:|sm:|lg:|hover:|disabled:|font-|space-y-|block|w-full|inline-)\b/,
        );
      }
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...(pageCode + '\n' + resolveCode).matchAll(/\b(?:adm|am)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(22);
    const defined = frClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('零写死 hex（视觉段 + 两个文件都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(resolveCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.am- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(12);
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

  it('.am-btnDanger 锚 danger（拒绝=公开 URL 立刻 404）+ :disabled；该页 CASE 钩子守恒', () => {
    expect(segment).toMatch(/\.am-btnDanger \{[^}]*background: var\(--nexus-color-danger\)/);
    expect(segment).toContain('.am-btnDanger:disabled');
    expect(resolveCode).toContain('data-resolve="rejected"');
    expect(resolveCode).toContain('拒绝并撤下');
    expect(resolveCode).toContain('放行');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：page=585733e5… · resolve=1917a942…）', () => {
    // 常量在改前（git HEAD）由真实产物 redact 算出并钉死；此门保证除 className 外一字节未动。
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '585733e5a416b822e9ea86206b776622ef9d4a87ee42a45b74d48962f57636ed',
    );
    expect(createHash('sha256').update(redactClasses(resolve)).digest('hex')).toBe(
      '1917a94213071801ce54bb3dc590f6d47f0b8a5a9a34e836007890821065e525',
    );
  });
});
