import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-68 `NotificationBell.tsx` `.nb-` 门面化——§164 顶栏铃铛——**静态那一寸**。
 *
 * fetch 失败走 failed 分支，没有登录（401）走"不渲染"分支，只有真查到数才写数。
 * §163 实时订阅：真的推来一条 notification 就重新查一次数；不把事件里的标题当新通知累加到未读数上（ADR-0010 后果第 4 条：按库为准）。
 * 本片只换皮；fetch/useRealtime/onReconnect/resolver 五件一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `4e478645cce2ae54b6a9a79cbfaf00369aa5daaab763985eb5f2e1bfbd72e364` 与 HEAD 字节一致。
 *
 * 判据不变式（10 门）：
 *  1. 'use client' 保留 + useRealtime/useEffect 进门；2. 字面 className 全 `.nb-*`/复用族；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.nb-` 视觉段存在且零 @media / transition / @keyframes；
 *  6. `hover:text-fg-1` 被替换为 `.nb-link:hover { color: fg-1 }`（设计性 hover 不保留 transition）；
 *  7. 零 hex；8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. SHA256 守恒 + 钩子守恒（data-notification-bell/ready/unread/data-realtime）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/NotificationBell.tsx');
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

/** `.nb-` 视觉段：`.nb-faint {` 起，到下一个 §FE 段止。 */
function nbSegment(css: string): string {
  const start = findOutsideComments(css, /\.nb-faint \{/);
  if (start < 0) throw new Error('globals.css 找不到 .nb- 段（.nb-faint {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = nbSegment(globals);

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
    for (const m of line.matchAll(/\.((?:nb|np|cs|sb|wd|cp|ap)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-68 /components NotificationBell 顶栏铃铛', () => {
  it("'use client' 保留 + useRealtime/onReconnect/useEffect 进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('useRealtime(');
    expect(code).toContain('onReconnect');
    expect(code).toContain('void refresh()');
    expect(code).toContain('useEffect(');
  });

  it('数据钩子守恒：failed/loading/ready/unread/data-realtime', () => {
    for (const hook of ['data-notification-bell="failed"', 'data-notification-bell="loading"', 'data-notification-bell="ready"', 'data-notification-unread=', 'data-realtime=']) {
      expect(code, `NotificationBell 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .nb-*/复用族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(4);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:nb|np|cs|sb|wd|cp|ap)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（nb-/复用族之外）——含 hover:text-fg-1 / flex / items-center', () => {
    for (const re of ['hover:text-fg-1', 'flex ', 'items-center', 'text-fg-', 'text-accent-2-ink']) {
      expect(code, `NotificationBell 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:nb|np|cs|sb|wd|cp|ap)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(3);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.nb- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(150);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.nb- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(2);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.nb-link hover 有定义；data-realtime 三态', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toContain('.nb-link {');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：4e478645cce2ae54b6a9a79cbfaf00369aa5daaab763985eb5f2e1bfbd72e364）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '4e478645cce2ae54b6a9a79cbfaf00369aa5daaab763985eb5f2e1bfbd72e364',
    );
  });
});
