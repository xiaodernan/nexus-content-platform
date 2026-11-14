import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-Ship `Ship` 交付日志（`/ship`）——平台自己的 ship log 公开页。
 * 数据源是 `lib/ship-manifest.ts`（机械生成的 git log 投影）。
 *
 * 判据不变式：
 *  1. server 页面（零 'use client' —— 只有 RSC）
 *  2. 无需登录（公开）；不 import 任何 server domain 模块——零数据库依赖
 *  3. 字面 className 全 `.sh-* / .am-linkImplicit / .adm-capNote` 门面
 *  4. 零裸 Tailwind 原子类；
 *  5. `.sh-*` 每类在 globals.css 有基础定义；
 *  6. forced-colors 段覆盖 .sh-hero / .sh-daySection / .sh-tag.feat / .sh-spine::before
 *  7. 零 hex；var(--nexus-*) 全在 tokens.css 声明；
 *  8. 钩子守恒（root/heroKicker/heroTitle/lede/stats/spine/daySection/entry/kind-note/foot/hash/subject/kind-tag）
 *  9. SHA256 钉死。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/ship/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');
const MANIFEST = join(ROOT, 'apps/web/src/lib/ship-manifest.ts');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const manifestSource = readFileSync(MANIFEST, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

const SH_START = findOutsideComments(globals, /\.sh-root \{/);
if (SH_START < 0) throw new Error('globals.css 里没有 .sh-root 段');
const rest = globals.slice(SH_START);
const SH_END = rest.search(/\/\* ─{5,}/);
const shSegment = cssNoComments(SH_END > 0 ? rest.slice(0, SH_END) : rest);

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-Ship /ship 交付日志', () => {
  it('RSC + 无 server-domain import + 机械 manifest 驱动', () => {
    expect(code).not.toContain('use client');
    expect(code).not.toMatch(/from '@\/server/);
    expect(code).toContain("SHIP_DAYS");
    expect(code).toContain("from '../../lib/ship-manifest'");
    expect(code).toContain('readdirSync');
    expect(code).toContain('execFileSync');
    expect(code).toContain('force-dynamic');
    expect(code).toContain('metadata');
    expect(manifestSource).toContain('export const SHIP_DAYS');
  });

  it('字面 className 只认 .sh-* / .am-linkImplicit / .adm-capNote', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(24);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `Ship 出现域外类：${tok}`).toMatch(/^(sh|am|adm)-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('零裸 Tailwind 原子类（mt-2 / mb-4 / text-13 / grid-cols / px-）', () => {
    for (const re of ['text-13', 'text-12', 'mt-2', 'mb-4', 'gap-2', 'grid-cols', 'px-', 'py-', 'text-[', 'flex-wrap']) {
      expect(code, `Ship 仍出现裸原子 ${re}`).not.toContain(re);
    }
  });

  it('.sh-* 全部在 globals.css 定义；强制颜色覆盖落到 spec', () => {
    const used = new Set([...code.matchAll(/\bsh-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(20);
    const defined = new Set([...globals.matchAll(/\.((?:sh)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    expect(shSegment).toContain('.sh-root');
    expect(shSegment).toContain('.sh-hero');
    expect(shSegment).toContain('.sh-spine');
    expect(shSegment).toContain('.sh-tag.feat');
    expect(globals).toContain('@media (forced-colors: active)');
  });

  it('零写死 hex；零新增颜色 token；cn var(--nexus-*) 全存在 tokens.css', () => {
    expect(shSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(shSegment).not.toMatch(/--nexus-color-ship-/);
    const usedTokens = [...new Set([...shSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(12);
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('钩子守恒（root/heroKicker/heroTitle/lede/stats/spine/daySection/entry/kind-note/foot）', () => {
    for (const hook of ['data-ship-root', 'data-ship-hero-kicker', 'data-ship-hero-title', 'data-ship-lede', 'data-ship-stats', 'data-ship-spine', 'data-ship-spine', 'data-ship-day=', 'data-ship-kind-note', 'data-ship-foot', 'data-ship-back', 'data-ship-about', 'data-ship-hash', 'data-ship-subject', 'data-ship-kind-tag=']) {
      expect(code, `Ship 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '51d186d7d588f09d74aedf11345455d34611c4b3e9dae030e97d3b9124806065',
    );
  });
});
