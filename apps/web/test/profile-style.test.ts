import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-5 创作者主页 `/u/[handle]` 视觉升级的**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * 为什么单独写这份而不是只靠 e2e：FE-4 的教训是「真 Chrome 双主题」在本机多 agent 抢资源下
 * 会被 SIGTERM 超时吃掉，判据写就却跑不到。这里把「不依赖渲染也能确定」的部分先钉死——
 * 恰好也是最容易静默失效的部分：
 *
 *  1. **类名闭环**：page.tsx 里每个 `pf-*` 类都在 globals.css 有 `.pf-*` 定义。
 *     一个拼错的类名不报错、只静默失效（与 style-tokens.test.ts 盯着拼错 token 同一类病）。
 *  2. **零写死颜色**：`.pf-` 段里不出现 hex 字面量（颜色全走 token / color-mix）。
 *     写死 hex 会绕开双主题，浅色主题下必然有一处读不出来（§90 四片血泪）。
 *  3. **token 真存在**：`.pf-` 段里每个 `var(--nexus-*)` 都在 tokens.css 声明过。
 *  4. **结构钩子不丢**：FE-5 只动视觉，21 个 `data-profile-*` 钩子一个都不能少——
 *     少一个就是改了结构/判据面，不是纯视觉片（§159）。
 *  5. **动效有退路**：凡用了 `transition` / `transform` / `animation` 的 `.pf-` 类，
 *     都要被 `@media (prefers-reduced-motion: reduce)` 收口（§90 无障碍）。
 *  6. **键盘可达**：交互类（链接卡 / 试玩链接）要有 `:focus-visible` 描边。
 *
 * 浏览器那一寸（真的渲染、深/浅主题、零 console error）归 `e2e/profile-visual.spec.ts`；
 * 这里不重复，只钉「渲染前就能确定」的不变式。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/u/[handle]/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

/** 去掉 CSS 注释，避免注释里的示例类名/hex 混进断言。 */
function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 去掉 JSDoc 后的**真实代码**——语义门一律锚它，不锚含注释的 page 全文（ADR-0154）。
 * 同批 play 门被变异臂证伪过：删正文真实调用/文案、只在 JSDoc 补同形字样，锚全文仍绿。
 */
const code = cssNoComments(page);

/** globals.css 里 `.pf-` 段的文本：从第一个 `.pf-` 定义到该 @layer 段收尾。
 *  取「含 `.pf-` 的选择器行」整段即可——判据只关心这些行的声明。 */
function pfRules(css: string): string[] {
  return cssNoComments(css)
    .split('\n')
    .filter((line) => /\.pf-[A-Za-z]/.test(line));
}

/** page.tsx 里所有以 pf- 开头的语义类名（去重）。 */
function pagePfClasses(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/["'`]([^"'`\n]*\bpf-[A-Za-z0-9-]+[^"'`\n]*)["'`]/g)) {
    for (const cls of m[1]!.split(/\s+/)) {
      if (/\bpf-[A-Za-z0-9-]+/.test(cls)) found.add(cls.replace(/[^\w-].*$/, ''));
    }
  }
  return [...found].sort();
}

/**
 * globals.css 里**有基础规则体**的 .pf- 主类名。
 *
 * 只数"类名出现过"是不够的（变异臂 A 抓出的真缺口）：`.pf-workCard` 即使删掉那行
 * `.pf-workCard { … }`，仍会在 `::before` / `:hover` / `:focus-visible` 乃至 reduced-motion
 * 段里反复出现，于是"存在性"门会绿着漏掉一个没有基础声明、只靠伪类挂着的空壳类。
 *
 * 两条收紧：①先把所有 `@media (prefers-reduced-motion)` 块整段剔掉——那里只是"关掉动效"，
 * 不是给类写样式，且常以 `.pf-a, .pf-b { transition:none }` 开头，会把删掉的基础类重新"定义"一遍；
 * ②余下只认 `.pf-x` 后紧跟 `{` / `,` / 空白（而非 `:` 伪类后缀）的基础选择器。
 */
function definedPfClasses(css: string): Set<string> {
  let clean = cssNoComments(css);
  for (const query of ['@media (prefers-reduced-motion: reduce)']) {
    for (;;) {
      const start = clean.indexOf(query);
      if (start < 0) break;
      const braceStart = clean.indexOf('{', start);
      if (braceStart < 0) break;
      let depth = 0;
      let end = braceStart;
      for (; end < clean.length; end++) {
        if (clean[end] === '{') depth++;
        else if (clean[end] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      clean = clean.slice(0, start) + clean.slice(end + 1);
    }
  }
  const out = new Set<string>();
  for (const line of clean.split('\n')) {
    for (const m of line.matchAll(/\.(pf-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
      const tail = line.slice(m.index! + m[0]!.length).trimStart();
      if (/^[{,]/.test(tail)) out.add(m[1]!);
    }
  }
  return out;
}

/** tokens.css 里声明过的全部 token 名。 */
function definedTokens(css: string): Set<string> {
  const noComments = cssNoComments(css);
  return new Set(
    [...noComments.matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
  );
}

/**
 * 取出某个 @media 查询的所有块的**完整 body**（花括号配对，不是 `[^}]*`）。
 * globals.css 里有多段 `prefers-reduced-motion`（.gw-/.se-/.pf- 各一段），且每段内部
 * 又有多条规则——用 `[^}]*` 只截到第一条规则的 `}`，会把后面的收口声明漏读。
 * 这里做配对括号把它读全，再按「含 `.pf-`」定位到本片那一段。
 */
function mediaBlocks(css: string, query: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(query, from);
    if (start < 0) break;
    const braceStart = css.indexOf('{', start);
    if (braceStart < 0) break;
    let depth = 0;
    let end = braceStart;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(css.slice(braceStart + 1, end));
    from = end + 1;
  }
  return out;
}

/** globals.css 里从第一条 `.pf-` 定义到文件尾的整段（含多行声明块），供按规则块解析。 */
const pfCss = (() => {
  const clean = cssNoComments(globals);
  const start = clean.search(/\.pf-[A-Za-z]/);
  return start < 0 ? '' : clean.slice(start);
})();

/**
 * 把 CSS 文本切成 `{ selector, decls }` 规则块（含多行声明）。
 * 按"行"扫会在多行声明上翻车：`.pf-workCard {` 的 `transition:` 写在后续行、
 * 那一行没有 `.pf-` 字样就被 `pfRules()` 丢了。动效门必须按完整规则块看。
 */
function ruleBlocks(css: string): Array<{ selector: string; decls: string }> {
  const out: Array<{ selector: string; decls: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) out.push({ selector: m[1]!, decls: m[2]! });
  return out;
}

const pfRulesText = pfRules(globals);
const pfRuleLines = pfRulesText.join('\n');
/** 本片那条 reduced-motion 段的完整 body（多条规则都在），定位靠 `.pf-` 前缀。 */
const pfReducedMotionBody = mediaBlocks(
  cssNoComments(globals),
  '@media (prefers-reduced-motion: reduce)',
).find((body) => body.includes('.pf-'));

describe('§FE-5 创作者主页视觉段（静态不变式）', () => {
  it('page.tsx 确实用了 .pf- 语义类，且全部在 globals.css 有定义（拼错的类名不静默失效）', () => {
    const used = pagePfClasses(code);
    expect(used.length, 'page.tsx 一个 pf- 类都没有，视觉段没接上').toBeGreaterThan(8);
    const defined = definedPfClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 pf- 类在 page.tsx 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .pf- 视觉段（不是空壳）', () => {
    const defined = definedPfClasses(globals);
    expect(defined.size, '.pf- 定义太少，FE-5 视觉升级没落地').toBeGreaterThanOrEqual(18);
  });

  it('.pf- 段里没有写死的 hex 颜色（零新增颜色 token 硬边界）', () => {
    const hex = [...pfRuleLines.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.pf- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.pf- 段里每个 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of pfRuleLines.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.pf- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('FE-5 只动视觉：21 个 data-profile-* 结构钩子一个都不能丢', () => {
    const expected = [
      'data-profile-root',
      'data-profile-deleted-banner',
      'data-profile-header',
      'data-profile-avatar',
      'data-profile-name',
      'data-profile-bio',
      'data-profile-counts',
      'data-profile-works',
      'data-profile-work-name',
      'data-profile-work-counts',
      'data-profile-empty',
      'data-profile-worlds',
      'data-profile-world',
      'data-profile-characters',
      'data-profile-character',
      'data-profile-privacy',
      'data-profile-games',
      'data-profile-game',
      'data-profile-game-play',
      'data-profile-game-design-only',
      'data-profile-games-note',
    ];
    const missing = expected.filter((h) => !code.includes(h));
    expect(missing, `结构/判据钩子丢了（不是纯视觉片）：${missing.join(', ')}`).toEqual([]);
  });

  it('两颗动作键客户端组件文件未被 FE-5 改动（只动视觉、不碰交互逻辑）', () => {
    // 判据面：FollowButton / BlockControl 的 data-* 钩子与交互逻辑留在各自文件里，
    // page.tsx 只是引用它们。这里钉的是 page.tsx 没把它们内联重写（那会带进逻辑）。
    expect(code).toContain('<FollowButton');
    expect(code).toContain('<BlockControl');
    const follow = readFileSync(join(ROOT, 'apps/web/src/app/u/[handle]/FollowButton.tsx'), 'utf8');
    const block = readFileSync(join(ROOT, 'apps/web/src/app/u/[handle]/BlockControl.tsx'), 'utf8');
    expect(follow).toContain('data-follow-button');
    expect(block).toContain('data-block-control');
  });

  it('用了动效的 .pf- 类都被 prefers-reduced-motion 收口', () => {
    expect(pfReducedMotionBody, '.pf- 段没有 prefers-reduced-motion 收口').toBeTruthy();
    const base = (s: string) => s.replace(/:(hover|focus-visible|active|before|after).*$/, '');
    const pfNames = (sel: string) =>
      [...sel.matchAll(/\.(pf-[A-Za-z0-9-]+)/g)].map((m) => base(m[1]!));

    // 按**规则块**（不是行）扫生产动效：多行声明块里的 transition 才扫得到。
    // reduced-motion 段自身（写着 transition:none）从 pfCss 里整段剔掉，不算动效源。
    const prodCss = (() => {
      let s = pfCss;
      for (;;) {
        const i = s.indexOf('@media (prefers-reduced-motion: reduce)');
        if (i < 0) break;
        const b = s.indexOf('{', i);
        let d = 0;
        let e = b;
        for (; e < s.length; e++) {
          if (s[e] === '{') d++;
          else if (s[e] === '}') {
            d--;
            if (d === 0) break;
          }
        }
        s = s.slice(0, i) + s.slice(e + 1);
      }
      return s;
    })();
    const blocks = ruleBlocks(prodCss);
    const transitioned = new Set<string>();
    const transformed = new Set<string>();
    for (const { selector, decls } of blocks) {
      const names = pfNames(selector);
      if (/animation:/.test(decls)) for (const n of names) { transitioned.add(n); transformed.add(n); }
      if (/transition:/.test(decls) && !/transition:\s*none/.test(decls)) for (const n of names) transitioned.add(n);
      if (/transform:/.test(decls) && !/transform:\s*none/.test(decls)) for (const n of names) transformed.add(n);
    }
    expect(transitioned.size, '没扫到任何 .pf- transition 动效源，这道门是空的').toBeGreaterThan(0);

    // reduced-motion 段里逐条规则看：transition:none / transform:none 必须在**同一条规则**里
    // 点名了对应类，才算真正收口（变异臂 C：删掉 transition:none 那条会在此红）。
    const rmBlocks = ruleBlocks(pfReducedMotionBody!);
    const transitionShut = new Set<string>();
    const transformShut = new Set<string>();
    for (const { selector, decls } of rmBlocks) {
      for (const n of pfNames(selector)) {
        if (/transition:\s*none/.test(decls)) transitionShut.add(n);
        if (/transform:\s*none/.test(decls)) transformShut.add(n);
      }
    }
    const transNotShut = [...transitioned].filter((c) => !transitionShut.has(c));
    expect(transNotShut, `这些类的 transition 没被 transition:none 真正关掉：${transNotShut.join(', ')}`).toEqual([]);
    const tfNotShut = [...transformed].filter((c) => !transformShut.has(c));
    expect(tfNotShut, `这些类的 transform 没被 transform:none 真正关掉：${tfNotShut.join(', ')}`).toEqual([]);
  });

  it('交互类（作品卡 / 试玩链接）有 :focus-visible 键盘描边', () => {
    expect(pfRuleLines, '作品卡缺 :focus-visible').toMatch(/\.pf-workCard:focus-visible/);
    expect(pfRuleLines, '试玩链接缺 :focus-visible').toMatch(/\.pf-gamePlay:focus-visible/);
  });
});
