import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-37 `CharacterChat.tsx` `.ch-` 门面化（§47 角色对话框）——**静态那一寸**。
 *
 * 共用一块（CharacterPanel 编辑器 + `/world` 的 3D HUD 都渲染它）：回复只有一种来源
 * （ai-service 背后的真模型，§159 不编一句假的顶上）；无会话线程，真实回复落 §48 记忆。
 * 本片只换皮；行为/文案/data 钩子/CSRF/`send()` 三态——一字不动。
 *
 * **剥 className 后 SHA256 守恒（cn 雕刻）**：全片唯一代码字节变更是删除唯一使用点后已死的
 * `import { cn } from '@/lib/cn'` 一行；carve 后 redact 恒等于改前后同一值（`ef0f3980…`）。
 * redact 三步序与钉死常量一致（EOL 归一 \r\n→\n）。
 *
 * 判据不变式（12 门）：
 *  1. client 指令保留；`send()`/`sessionRef`/`chat_${Datetime}` 三件套进门；
 *  2. fetch 仍走 `/api/projects/<id>/characters/<id>/chat` + csrfHeaders()；
 *  3. 字面 className 全 `.ch-*`（含 ternary ch-msgUser/ch-msgCharacter）；4. 零裸 Tailwind；
 *  5. 用到的每个类都在 globals.css 有基础定义；6. `.ch-` 段成规模（≥ 10 条）；
 *  7. 零写死 hex（0.625rem 字面量是有意——token 尺度无 10px，FE-37 记账）；8. 零新增颜色 token；
 *  9. 零 transition/@media；10. input focus-visible、disabled 语义；11. 三态 send() 进门；
 * 12. SHA256 雕刻恒等 + 数据钩子守恒（-root/-log/-msg/-input/-send/-error）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/CharacterChat.tsx');
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

/** `.ch-` 视觉段：`.ch-title {` 起，到下一个 §FE 段头止。 */
function chSegment(css: string): string {
  const start = findOutsideComments(css, /\.ch-title \{/);
  if (start < 0) throw new Error('globals.css 找不到 .ch- 段（.ch-title {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return strip(m > 0 ? rest.slice(0, m) : rest);
}

const segment = chSegment(globals);

/** redact：EOL 归一 + className 任意形态归一 @。与钉死常量一致。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

const HEAD_CN_LINE = "import { cn } from '@/lib/cn';\n";
const head = execSync('git show HEAD:apps/web/src/studio/CharacterChat.tsx').toString('utf8').replace(/\r\n/g, '\n');
const carved = head.replace(HEAD_CN_LINE, '');

function chClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.(ch-[A-Za-z0-9-]+)\s*[,{]/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-37 /studio CharacterChat 角色对话框', () => {
  it("保留 'use client'（交互面）+ send()/sessionRef 三件套 + csrfHeaders", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('const send = async () =>');
    expect(code).toContain('const sessionRef = useRef(`chat_${Date.now().toString(36)}`)');
    expect(code).toContain('setLog((prev) => [...prev, { role:');
    expect(code).toContain("const sessionRef = useRef");
  });

  it('fetch 仍走 /api/projects/<id>/characters/<id>/chat + POST + csrfHeaders()', () => {
    expect(code).toContain("'content-type': 'application/json'");
    expect(code).toContain('...csrfHeaders()');
    expect(code).toContain('method: \'POST\'');
    expect(code).toContain('`/api/projects/${projectId}/characters/${characterId}/chat`');
  });

  it('数据钩子守恒：-root/-log/-msg/-input/-send/-error', () => {
    for (const hook of [
      'data-character-chat',
      'data-character-chat-log',
      'data-character-chat-msg=',
      'data-character-chat-input',
      'data-character-chat-send',
      'data-character-chat-error',
    ]) {
      expect(code, `CharacterChat 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .ch-*（含 ch-msg ternary 分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(8);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^ch-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'ch-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'ch-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind 原子类（ch- 除外）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of literals) {
      const bad = cls.split(/\s+/).filter((t) => t && !/^ch-/.test(t));
      expect(bad, `门面类之外还出现了：${bad.join(' ')}`).toEqual([]);
    }
  });

  it('className 用到的每个 ch-* 都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bch-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(10);
    const defined = chClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.ch- 视觉段成规模（≥ 11 条视觉类）且零 @media', () => {
    expect(segment.length).toBeGreaterThan(400);
    expect((segment.match(/\.ch-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(11);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
  });

  it('零写死 hex（视觉段 + 文件不许；0.625rem 字面量是内容字号，刻意保留见 ADR-0189）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('font-size: 0.625rem');
  });

  it('.ch- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）；.ch-send :disabled 真禁用', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toContain('.ch-send:disabled');
    expect(segment).toContain('.ch-input:focus');
  });

  it('零 transition / animation / @keyframes（零动效对话框：只有 Enter 提交与发送反馈）', () => {
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('animation');
    expect(segment).not.toContain('@keyframes');
  });

  it('雕刻门：cn 一行删除后 redact 恒等于雕刻后的 BASE 值（ef0f3980…）', () => {
    // 全片唯一代码字节变更 = 删除已死的 cn import；carve 后与钉死常量一致。
    // 前置条件已过去（§FE-53/私有片已落库）——只保留 redact 字节守恒
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'ef0f39809c9d2d9c4a9b7b6de08e1d3ebea14305a3ba9d4be967bb3e3e26e82d',
    );
    expect(createHash('sha256').update(redactClasses(carved)).digest('hex')).toBe(
      'ef0f39809c9d2d9c4a9b7b6de08e1d3ebea14305a3ba9d4be967bb3e3e26e82d',
    );
  });
});
