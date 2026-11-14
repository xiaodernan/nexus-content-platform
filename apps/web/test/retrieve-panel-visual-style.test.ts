import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * §FE-56 `RetrievePanel.tsx` `.rp-` 门面化（§49 语料检索面板）——**静态那一寸**。
 *
 * 结果里带着"怎么命中的"（全文 / 子串）和三个加数；向量检索无 provider 时界面不假装（§159）。
 * 本片只换皮；查询/fetch/csrfHeaders/score 全部一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一，含 cn 雕刻 cn 一行）：
 * `aff6c541c09e876d7d8a2da5ed783087d452598f1811e1b18fefb991f8656533`（雕刻：唯一代码变更 = 删唯一使用点消失后已死的 `import { cn }` 一行）。
 *
 * 判据不变式（10 门）：
 *  1. 'use client' 保留 + csrfHeaders 进门；2. 字面 className 全 `.rp-*`/复用族；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.rp-` 段成规模（≥ 8 条）；
 *  6. 零 hex；7. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；8. 零新增颜色 token；
 *  9. 零 transition/@media/@keyframes；10. SHA256 守恒 + 钩子守恒（data-retrieve-* 已出现在文件中）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/RetrievePanel.tsx');
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

/** `.rp-` 视觉段：`.rp-lead11 {` 起，到下一个 §FE 段止。 */
function rpSegment(css: string): string {
  const start = findOutsideComments(css, /\.rp-lead11 \{/);
  if (start < 0) throw new Error('globals.css 找不到 .rp- 段（.rp-lead11 {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = rpSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@`。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\bcn\([^)]*\)/gs, 'cn()')
    .replace(/\s+/g, ' ');
}

function classesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:rp|wd|cp|ds|hi|mm|ap|gp)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-56 /studio RetrievePanel 语料检索面板', () => {
  it("'use client' 保留 + CSRF 路径进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
  });

  it('数据钩子守恒：data-retrieve-hit/source 展示', () => {
    expect(code).toContain('data-retrieve-hit=');
    expect(code).toContain('data-retrieve-source=');
  });

  it('字面 className 只认 .rp-*/复用族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(12);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:rp|wd|cp|ds|hi|mm|ap|gp)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'(?:rp|wd|cp|ds|hi|mm|ap|gp)-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'(?:rp|wd|cp|ds|hi|mm|ap|gp)-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（rp-/复用族之外）', () => {
    for (const re of ['px-', 'py-', 'w-full', 'rounded-[', 'items-center gap-1', 'text-fg-', 'bg-bg-', 'hover:bg-', 'max-h-[', 'flex items-start']) {
      expect(code, `RetrievePanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:rp|wd|cp|ds|hi|mm|ap|gp)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(15);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.rp- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(500);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.rp- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒；cn 雕刻一行后与雕刻过的 HEAD 一致', () => {
    const head = execSync('git show HEAD:apps/web/src/studio/RetrievePanel.tsx').toString('utf8');
    // 削弱条件：HEAD 之后这个 cn 行已随 §FE-56 提交落库——不再是可断言的前置条件
    const carved = head.replace(/import \{ cn \} from '@\/lib\/cn';\n/, '');
    expect(createHash('sha256').update(redactClasses(carved)).digest('hex')).toBe(
      createHash('sha256').update(redactClasses(main)).digest('hex'),
    );
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'aff6c541c09e876d7d8a2da5ed783087d452598f1811e1b18fefb991f8656533',
    );
  });
});
