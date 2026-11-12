import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-88 `AccountPanel.tsx` `.ac-` 门面化——§188 账号面板（登录/注册/登出/游客认领）——**静态那一寸**。
 * §134：游客也记账，所以两种身份都可进；不动。
 *
 * **本片诚实边界**：className 的一部分经由 `const inputClass` / `tabClass()` 流入——
 * 属性位 redact 看不见这两处的源串（它们是字面量 const 不是 className 属性）。
 * 故本片 **SHA 不对 HEAD 守恒**：HEAD→本片 的全部变更是本测试下述清单（见 ADR-0241）。
 * 验收改为三条可证：①属性位 redact 形状与 HEAD 完全一致（属性计数恒等于改动前形状）；
 * ②const 源串指向 globals.css 中真实存在的定义；③字面 className 全部 `.ac-*`。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/AccountPanel.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(main);

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

const start = findOutsideComments(globals, /\.ac-root \{/);
if (start < 0) throw new Error('.ac- 段缺失');
const rest = globals.slice(start);
const segEnd = rest.search(/\/\* ── §/);
const segment = segEnd > 0 ? rest.slice(0, segEnd) : rest;

/** redact：属性位（className 直接字面/模板/cn()）归一；const 源串不在其中——本机差异清单见 ADR-0241。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\s+/g, ' ');
}

describe('§FE-88 /components AccountPanel 账号面板', () => {
  it("'use client' 保留 + csrfToken/router 进门；register/login/logout 端点守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfToken()');
    expect(code).toContain('useRouter()');
    expect(code).toContain('/api/auth/register');
    expect(code).toContain('/api/auth/login');
    expect(code).toContain('/api/auth/logout');
  });

  it('数据钩子守恒：data-auth-* / data-credits-link / data-api-tokens-link', () => {
    for (const hook of ['data-auth-notice', 'data-auth-identity=', 'data-credits-link', 'data-api-tokens-link', 'data-auth-logout', 'data-auth-tab=', 'data-auth-displayname', 'data-auth-email', 'data-auth-password', 'data-auth-submit', 'data-auth-error']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .ac-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(15);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^ac-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 bg-brand/bg-bg-2/placeholder:/ml-2/disabled:opacity-40/text-[）', () => {
    for (const re of ['bg-brand', 'bg-bg-2', 'bg-bg-3', 'text-fg-', 'placeholder:', 'ml-2', 'text-[', 'text-12', 'text-13', 'text-14', 'disabled:opacity-', 'hover:bg-', 'flex-col', 'justify-between']) {
      expect(code, `AccountPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('const 源串指向 globals.css 真实定义的类（inputClass 三态 + tabClass 两态）', () => {
    const defined = new Set([...globals.matchAll(/\.(ac-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of ['ac-input', 'ac-tab', 'ac-tabActive', 'ac-tabIdle']) {
      expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    }
    expect(main).toContain("const inputClass =\n  'ac-input';");
    expect(main).toContain("const base = 'ac-tab'");
    expect(main).toContain('ac-tabActive');
    expect(main).toContain('ac-tabIdle');
  });

  it('className 用到的每个类都在 globals.css 有基础定义（属性位 + const 位全量）', () => {
    const attrUsed = new Set([...code.matchAll(/\bac-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    const defined = new Set([...globals.matchAll(/\.(ac-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of attrUsed) expect(defined).toContain(cls);
    // const 位用到的也必须定义
    for (const cls of ['ac-input', 'ac-tab', 'ac-tabActive', 'ac-tabIdle']) expect(defined).toContain(cls);
  });

  it('.ac- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(800);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.ac- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('属性位 redact 形状快照（本片已声明：SHA 不对 HEAD 守恒——见 ADR-0241）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '6a626fd1de58a7ee8e99492463daed2eec53e9b57773bfbb9f904c7a37bebc89',
    );
  });
});
