import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-34 `/admin/access` 访问账（全局）（§188 M8 第三片欠格）——**静态那一寸**。
 *
 * `page.tsx`（server）：全局凭据/endpoint 热点榜（1/7/30 天窗口由 ?days 驱动，坏值 parseApiAccessWindowDays 兜成 7）。
 * 六列/两列敏感榜（tokenName…hint、owner、calls、endpoints、projects、lastSeen）+ 导出 CSV（kind=tokens|endpoints）。
 * 本片只换皮；listApiAccessGlobal、白名单窗口、榜单截断规则——一字不动。
 *
 * **剥 className 后全文 SHA256 守恒（EOL 无关）**：`761cfec7…` 恒等于改前（git HEAD）。
 * redact 三步序与钉死常量一致。
 *
 * 判据不变式（10 门）：
 *  1. server 组件 + denied×2 + role 闸门 + AdminNav current="access"；
 *  2. 字面 className 全 `.adm-*`/`.am-*`/`.tl-*`（含 template 三元 am-windowChipActive/Idle）；3. 零裸 Tailwind；
 *  4. 用到的每个类都在 globals.css 有定义；5. `.am-` 段新增 am-window* 系/linkImplicit 有定义；
 *  6. 零写死 hex；7. 零新增颜色 token；8. 零 transition / @media；
 *  9. 两个 CSV export anchor 仍是 a[href]；10. SHA256 守恒 + 钩子守恒。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/admin/access/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** redact：EOL 归一 + className 任意形态归一 @。与钉死常量一致。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

function frClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:adm|am|ar|au|rl|tl|gw)-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-34 /admin/access 访问账（全局）', () => {
  it('server 组件 + denied×2 + role 闸门 + AdminNav current="access" + listApiAccessGlobal', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain("export const dynamic = 'force-dynamic'");
    expect(code).toContain('currentUserOrNull()');
    expect(code).toContain("user.role !== 'admin'");
    expect(code).toContain('<AdminNav current="access"');
    expect(code).toContain('listApiAccessGlobal(days)');
    expect(code).toContain('data-admin-denied="anonymous"');
    expect(code).toContain('data-admin-denied="not-admin"');
  });

  it('两个 CSV export anchor 仍是 a[href]（不截断，§188 明写）', () => {
    for (const kind of ['tokens', 'endpoints']) {
      expect(code).toContain(`data-access-export="${kind}"`);
      expect(code).toContain(`/api/admin/access/export?days=`);
    }
  });

  it('template 类名守恒：am-windowChipActive / am-windowChipIdle 由同一三元拼出', () => {
    expect(code).toMatch(/className=\{option === days \? 'am-windowChipActive' : 'am-windowChipIdle'\}/);
  });

  it('数据钩子守恒：root/summary/tokens/endpoints/empty×2/scope/window×3/export×2', () => {
    for (const hook of [
      'data-access-admin-root',
      'data-access-summary',
      'data-access-tokens',
      'data-access-tokens-empty',
      'data-access-endpoints',
      'data-access-endpoints-empty',
      'data-access-token=',
      'data-access-endpoint=',
      'data-access-token-owner',
      'data-access-endpoint-calls',
      'data-access-window=',
      'data-access-export=',
      'data-access-scope',
    ]) {
      expect(code, `access 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .adm-*/.am-*/.tl-*（含三元字面）', () => {
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
      const bad = cls.split(/\s+/).filter((t) => t && !/^(adm|am|tl)-/.test(t));
      expect(bad, `门面类之外还出现了：${bad.join(' ')}`).toEqual([]);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:adm|am|tl)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = frClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('零写死 hex + 零新增颜色 token', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(globals).not.toMatch(/--nexus-color-access-\w*\s*:/);
  });

  it('两个导出 CSV 的 label 一字不改（§188 token 账两面表述）', () => {
    expect(code).toContain('导出凭据榜 CSV（不截断）');
    expect(code).toContain('导出端点榜 CSV（不截断）');
  });

  it('.am- 段引用的每个 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const seg = globals.slice(globals.indexOf('.am-shellWide {'), globals.indexOf('/* ── §', globals.indexOf('.am-shellWide {')));
    const used = [...new Set([...seg.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(5);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('.am-windowChipActive/.am-linkImplicit 有 focus-visible 锚', () => {
    expect(globals).toContain('.am-windowChipActive:focus-visible');
    expect(globals).toContain('.am-windowChipIdle:focus-visible');
    expect(globals).toContain('.am-linkImplicit:focus-visible');
    expect(globals).toContain('.am-windowNavPush {');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：761cfec7c1a199e48d993d6f1e599da976401779511c70b1035201d1cf0524d6）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '761cfec7c1a199e48d993d6f1e599da976401779511c70b1035201d1cf0524d6',
    );
  });
});
