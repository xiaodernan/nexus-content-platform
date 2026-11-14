import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-31 `/admin/audit` 审计事件页（§80/§84）——**静态那一寸**。
 *
 * `page.tsx`（server）：最近 100 条决定（登录/注册、人工裁决含越权尝试、发布/下架、角色变更），
 * 六列宽表格，390 下横滚 + role="region" + tabIndex={0}（axe scrollable-region-focusable，与 /tasks 同一纪律）。
 * 本片只换皮；listAudit、denied 两态、表格结构逐字节一致。
 *
 * **剥 className 后全文 SHA256 守恒**：`199d910c…` 恒等于改前（git HEAD）。
 * redact 三步序与钉死常量一致。
 *
 * 判据不变式（10 门）：
 *  1. server 组件 + denied×2 + role 闸门 + AdminNav current="audit"；
 *  2. 字面 className 全 `.adm-*`/`.am-*`/`.tl-*`；3. 零裸 Tailwind 原子类；
 *  4. 用到的每个类都在 globals.css 有定义；5. 视觉段 var(--nexus-*) 全在 tokens.css 声明；
 *  6. 零写死 hex；7. 零新增颜色 token；8. 零 transition/@media；
 *  9. role="region" + tabIndex + aria-label 守恒（横滚键盘可达）；10. SHA256 守恒 + 钩子守恒。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/admin/audit/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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
    for (const m of line.matchAll(/\.((?:adm|am|ar|au|tl)-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-31 /admin/audit 审计事件', () => {
  it('server 组件 + denied×2 + role 闸门 + AdminNav current="audit" + ViewerControls 不在此页', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain("export const dynamic = 'force-dynamic'");
    expect(code).toContain('currentUserOrNull()');
    expect(code).toContain("user.role !== 'admin'");
    expect(code).toContain('<AdminNav current="audit"');
    expect(code).toContain('data-admin-denied="anonymous"');
    expect(code).toContain('data-admin-denied="not-admin"');
    expect(code).toContain('listAudit(100)');
  });

  it('横滚区键盘可达进门：role="region" + tabIndex={0} + aria-label 守恒', () => {
    expect(code).toContain('role="region"');
    expect(code).toContain('tabIndex={0}');
    expect(code).toContain('aria-label="审计事件表（可横向滚动）"');
    expect(code).toContain('data-audit-table-scroll');
  });

  it('数据钩子守恒：summary/scope/empty/row/actor/allowed/table-scroll', () => {
    for (const hook of [
      'data-audit-root',
      'data-audit-summary',
      'data-audit-scope',
      'data-audit-empty',
      'data-audit-row=',
      'data-audit-actor=',
      'data-audit-allowed=',
      'data-audit-table-scroll',
    ]) {
      expect(code, `audit 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .adm-*/.am-*/.tl-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(14);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(adm|am|tl)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind 原子类', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of literals) {
      expect(cls).not.toMatch(
        /\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|text-fg-|text-danger-|text-accent-|bg-|flex\b|grid\b|gap-|items-|min-w-|max-w-|whitespace-|break-all|overflow-|md:|sm:|lg:|hover:|disabled:|font-)\b/,
      );
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:adm|am|tl)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(12);
    const defined = frClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('零写死 hex + 零新增颜色 token 于门面段', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(globals).not.toMatch(/--nexus-color-audit-\w*\s*:/);
  });

  it('两个宽表格类都在 tokens.css 里有定义（tabular-nums 只走 tl- 段）', () => {
    expect(tokens).toContain('--nexus-color-fg-3');
    expect(tokens).toContain('--nexus-color-fg-1');
    expect(tokens).toContain('--nexus-color-border-subtle');
    expect(globals).toContain('.tl-table {');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：199d910ce56d7fab7a70db25489d5746b1d6b5a3b95c72bdc52fb6d26b125340）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '199d910ce56d7fab7a70db25489d5746b1d6b5a3b95c72bdc52fb6d26b125340',
    );
  });
});
