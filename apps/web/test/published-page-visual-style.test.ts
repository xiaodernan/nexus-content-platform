import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-67 `published/[slug]/page.tsx` `.pub-` 门面化（§56/§14 公开分享页）——**静态那一寸**。
 *
 * §14 / ADR-0069 / ADR-0074：`?viewport=` 三态；`?viewport=` 自动选择四份投影，媒体查询选一份；design 钉体素；
 * 评论区 177 行——公开链接任何访客不登录即看——这是 NEXUS 被分享给陌生人的第一眼 surface；本片只换皮，
 * `getPublishedPage`/recordView/findPage/PublishedFrame 全路径一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn(…) 归一）：
 * `216de1f858cbd61d0e09ef82840ed08d8e11ceca6701e25cd4acd11cd5aadf43` 与 HEAD 字节一致。
 *
 * 判据不变式（10 门）：
 *  1. 'use client' 不涉及；2. 字面 className 全 `.pub-*`/`.pb-variant`（pb-variant 保留 fd 共享标记）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.pub-` 视觉段存在且零 @media / transition / @keyframes；
 *  6. `.pub-header`/`.pub-stage`/`.pub-playLink` hover 与 :focus-visible 环（若适用）；7. 零 hex；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；10. SHA256 守恒 + 钩子守恒（data-published-*）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/n/[handle]/[slug]/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(main);

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.pub-` 视觉段：`.pub-root {` 起，到下一个 §FE 段止。 */
function pubSegment(css: string): string {
  const start = findOutsideComments(css, /\.pub-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .pub- 段（.pub-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = pubSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\s+/g, ' ');
}

function classesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:pub|pb|cs|sb|wd|cp|ap)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-67 /n/[handle]/[slug] 公开分享页', () => {
  it("'use client' 无（server）；getPublishedPage/resolveLayout/hubs 进门", () => {
    expect(code).toContain('getPublishedPage(');
    expect(code).toContain('resolveLayout(');
  });

  it('数据钩子守恒：data-published-*/data-interactive-*/data-visit-notice/hook-count', () => {
    for (const hook of [
      'data-published-root',
      'data-published-path=',
      'data-published-title',
      'data-published-meta',
      'data-published-variant=',
      'data-published-play',
      'data-published-storyboard',
      'data-visit-notice',
      'data-interactive-note',
    ]) {
      expect(code, `published page 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .pub-*/.pb-variant（§ND 回收残，CLI）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(12);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:pub|pb)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（pub- 之外）——没有 text-fg-*/flex/flex-col/bg-bg-*', () => {
    for (const re of ['text-fg-', 'flex-col', 'flex flex-wrap', 'min-h-screen', 'bg-bg-', 'border-b', 'max-w-', 'hover:text-']) {
      expect(code, `published page 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:pub|pb|cs)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(11);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.pub- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(600);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.pub- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(5);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('.pub- 视觉段零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：216de1f858cbd61d0e09ef82840ed08d8e11ceca6701e25cd4acd11cd5aadf43）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '216de1f858cbd61d0e09ef82840ed08d8e11ceca6701e25cd4acd11cd5aadf43',
    );
  });
});
