import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §WORLD-NET「万象脉络」`/world/<project>/network` 的静态判据（零浏览器/零库/零 provider）。
 *
 * 不变式：
 *  1. RSC-only + metadata + force-dynamic，只有作者可见（requireUser + projectVisibleTo + notFound）；
 *  2. 数据零 provider、零写库（loadWorld + buildWorldNetwork 纯函数）；
 *  3. 世界读不出来 ⇒ 如实空白（nw-empty），不画任何数字；空枢纽/势力团/桥/跨类各自如实空白；
 *  4. 字面 className 只认 .nw-* 族；零 hex；var(--nexus-*) 全在 tokens.css；
 *  5. forced-colors 收口、reduced-motion 收口、不新增渐变墨字；
 *  6. 四个区块的 data 钩子守恒；7. SHA256 钉死。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/world/[projectId]/network/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}
const NW_START = findOutsideComments(globals, /\.nw-page \{/);
if (NW_START < 0) throw new Error('globals.css 里没有 .nw-* 段');
const nwSegment = cssNoComments(globals.slice(NW_START));

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§WORLD-NET /world/<project>/network 万象脉络', () => {
  it('RSC + 仅作者可见 + 零 provider + 零写库', () => {
    expect(code).not.toContain('use client');
    expect(code).not.toContain('getDb()');
    expect(code).toContain('requireUser()');
    expect(code).toContain('projectVisibleTo(projectId');
    expect(code).toContain('notFound()');
    expect(code).toContain('buildWorldNetwork(');
    expect(code).not.toContain('Math.random');
    expect(code).not.toContain('fetch(');
    expect(code).not.toContain('openai');
  });

  it('世界读不出来 ⇒ 如实空白，不画任何数字', () => {
    expect(code).toContain('data-network-empty');
    expect(code).toContain('const doc = world && world.ok ? world.document : null');
    expect(code).toContain('if (!doc)');
    for (const h of ['data-network-hubs-empty', 'data-network-cliques-empty', 'data-network-bridges-empty', 'data-network-cross-empty']) {
      expect(code, `${h} 空态缺失`).toContain(h);
    }
  });

  it('四个区块 + 枢纽/桥/跨类/孤立钩子齐全', () => {
    for (const h of [
      'data-network-root', 'data-network-stats', 'data-network-hubs', 'data-network-cliques',
      'data-network-bridges', 'data-network-cross', 'data-network-isolated', 'data-network-foot',
      'data-network-hub={h.id}', 'data-network-clique={x.members.length}',
      'data-network-bridge={`${b.from}-${b.to}`}', 'data-network-cross={e.label}',
    ]) expect(code, `${h} 钩子丢了`).toContain(h);
  });

  it('字面 className 只认 .nw-* 族', () => {
    const literals = [...page.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThan(10);
    for (const value of literals) {
      for (const cls of value.split(/\s+/).filter(Boolean)) {
        expect(cls, `裸类 ${cls} 不在 .nw- 族`).toMatch(/^nw-/);
      }
    }
  });

  it('零写死 hex；var(--nexus-*) 全在 tokens.css', () => {
    expect(nwSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const used = [...new Set([...nwSegment.matchAll(/(--nexus-[a-z0-9-]+)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThan(5);
    for (const name of used) expect(tokens, `token ${name} 不存在`).toContain(`${name}:`);
  });

  it('forced-colors 与 reduced-motion 收口；不新增渐变墨字', () => {
    expect(nwSegment).toMatch(/@media\s*\(forced-colors:\s*active\)/);
    expect(nwSegment).toContain('CanvasText');
    expect(nwSegment).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(nwSegment).not.toMatch(/background-clip:\s*text/);
  });

  it('响应式单列断点存在（窄视口不挤压）', () => {
    expect(nwSegment).toMatch(/@media\s*\(max-width:\s*720px\)/);
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      'e8f47991e0d48261939f2f256c935c456be4cd7a990ce1956ade617f510ed59f',
    );
  });
});
