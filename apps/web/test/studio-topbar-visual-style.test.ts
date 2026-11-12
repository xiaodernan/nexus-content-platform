import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-19 Studio 顶栏 `TopBar.tsx` 的**静态那一寸**（零浏览器、零真库、零时钟、零后端），
 * 也是整个 Studio 创作台家族 `.sp-` 门面命名空间的**基建第一片**。
 *
 * 先分清占用：`globals.css` 里既有 `.ss-` 段是 **FE-8 公开分镜页** `/n/[handle]/[slug]/storyboard`
 * 的门面，与 `/studio/[projectId]` 创作台无关。`apps/web/src/studio/` 下 30+ 面板组件全是
 * **裸 Tailwind 平铺**（TopBar 14 处 className / 83 处裸原子类 / 46 去重），是 FE-4~FE-18
 * 门面化序列里全库唯一尚未开垦的核心创作台大陆。本片选规模可控、状态机清晰、且是每次进
 * Studio 第一眼视觉门面的 `TopBar.tsx` 开篇，立住 `.sp-` 判据范式与视觉语言；后续 30+ 面板
 * （StudioShell / CommandBar / ContextPanel 等）按同一套纪律机械推广、边际成本递减。
 *
 * **零行为契约**：视口切换、撤销/重做、改名提交、保存态文案、存储调用（studio.*）、事件
 * 处理（onChange/onBlur/onKeyDown/onClick）、2 个 `<a>` href/title、4 个 data 钩子、aria 契约、
 * 全部诚实文案逐字节不动，只把 14 处 className 换成 `.sp-*` 门面类。三处 `cn()` 动态类
 * （saveState==='error' / viewport===v.id / props.active / props.disabled）保留条件/标识符/
 * 比较/分支位置，只归一字符串字面值。
 *
 * **剥 className 后全文逐字节零行为门**（本片最强）：基线（全裸）与改造后（全 `.sp-`）
 * 必须整份恒等 `3f6bcdd8…`——常量在**改前**由真实产物算出并钉死，改后匹配同一常量才证明
 * "改动只落在 className 字面值里，其它一个字节没动"。
 *
 * 判据不变式（13 门）：
 *  1. 类名闭环：TopBar 每个 `sp-*` 在 globals.css 有 `.sp-` 基础定义；
 *  2. 成规模 `.sp-` 视觉段（≥18 个门面类）；3. 零写死 hex；4. token 真存在；
 *  5. 零新增颜色 token；6. **TopBar 零裸 Tailwind**（14 处 className 全换，含全部任意值）；
 *  7. **动态类条件守恒**（3 处 cn 的条件/分支逐字不动、两/三分支值为门面类）；
 *  8. **六红线视觉延伸**：hover、2 个 `<a>` + 全控件 focus-visible 环、disabled 语义、
 *     reduced-motion 收口、不新增渐变墨字（TopBar 0 个、不扩 A11Y-1 面）；
 *  9. **剥 className 后全文 SHA256 零行为**；10. 4 个 data-* 钩子精确集合守恒；
 *  11. 纯函数/常量/诚实文案契约零行为（saveLabel 四分支 / studio.* 调用 / aria / VIEWPORTS）。
 *  12. **响应式断点真值门**：原唯一 `lg:hidden`（railToggle）经 Tailwind 4 真编译 =
 *      `(min-width: 64rem)`（1024px，见 tokens.css `--nexus-breakpoint-lg`），要精确落在
 *      `@media (min-width: 64rem)` 的 `.sp-railToggle { display: none }`，错位即真实失真；
 *  13. globals.css 块注释定界符严格配对 + 编译后 `.sp-` 规则体不被吞 + 段边界段头锚。
 *
 * 浏览器那一寸归 `e2e/studio-topbar-visual.spec.ts`。A11Y-1 forced-colors 回退不重复那扇门
 * （本片不新增渐变墨字）。`.sp-` 段作为文件最后一个 §FE 段，插在 A11Y-1 forced-colors 块之后、
 * `@layer components` 闭合之前；段内注释用非段头形式，段内不再插 `§FE-\d+` 段头（承 FE-18 教训，
 * 否则截断自身 spSegment 切片）。
 */
const ROOT = process.cwd();
const TOPBAR = join(ROOT, 'apps/web/src/studio/TopBar.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const topbar = readFileSync(TOPBAR, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 去掉注释后的真实代码——契约门/结构钩子门锚它，注释不得喂绿（CRIT-1 / ADR-0154）。 */
const code = cssNoComments(topbar);

function definedTokens(css: string): Set<string> {
  return new Set([...cssNoComments(css).matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

/** globals.css 里有基础规则体的 `.sp-` 主类名（剔伪类/媒体查询内重复）。 */
function definedSpClasses(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(sp-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
      const tail = line.slice(m.index! + m[0]!.length).trimStart();
      if (/^[{,]/.test(tail)) out.add(m[1]!);
    }
  }
  return out;
}

/**
 * `.sp-` 视觉段完整文本：首个 `.sp-` 到**下一个 § 段头注释**之前。
 * 段头注释锚（非前缀枚举）——任何后续插段/改序都不会误吞（FE-16 §CRIT-1 修实范式）。
 * `.sp-` 段是文件最后一个 §FE 段，其后无段头，取到 EOF。
 */
const spSegment = (() => {
  const start = globals.search(/\.sp-[A-Za-z]/);
  if (start < 0) return '';
  const tail = globals.slice(start);
  const nextSection = tail.search(/\/\*\s*─+\s*§[A-Z]/);
  return cssNoComments(nextSection >= 0 ? tail.slice(0, nextSection) : tail);
})();

/** 从任意字符串抽所有 `sp-*` token（完整词，非子串）。 */
function spTokensOf(s: string): string[] {
  return [...s.matchAll(/\bsp-[A-Za-z0-9-]+/g)].map((m) => m[0]!);
}

/** 把一段 className 表达式里的所有字符串/模板串字面量内容归一为 `@`，保留 `${}` 与 JS 结构。 */
function maskLiterals(expr: string): string {
  let out = '';
  let i = 0;
  while (i < expr.length) {
    const c = expr[i]!;
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += q; i++;
      let staticSegStarted = false;
      while (i < expr.length) {
        if (expr[i] === '\\') { out += expr[i]! + (expr[i + 1] ?? ''); i += 2; continue; }
        if (q === '`' && expr[i] === '$' && expr[i + 1] === '{') {
          out += '${'; i += 2;
          let d = 1;
          let inner = '';
          while (i < expr.length && d > 0) {
            const cc = expr[i]!;
            if (cc === "'" || cc === '"' || cc === '`') {
              const iq = cc; inner += cc; i++;
              while (i < expr.length) {
                if (expr[i] === '\\') { inner += expr[i]! + (expr[i + 1] ?? ''); i += 2; continue; }
                if (expr[i] === iq) { inner += iq; i++; break; }
                inner += expr[i]!; i++;
              }
              continue;
            }
            if (cc === '{') d++;
            else if (cc === '}') { d--; if (d === 0) { inner += cc; i++; break; } }
            inner += cc; i++;
          }
          out += maskLiterals(inner);
          staticSegStarted = false;
          continue;
        }
        if (expr[i] === q) { out += q; i++; break; }
        if (!staticSegStarted) { out += '@'; staticSegStarted = true; }
        i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * **剥 className 后全文逐字节哈希**（本片最强零行为门）。
 * 基线（全裸）与改造后（全 `.sp-`）必须整份恒等 `3f6bcdd8…`（改前由真实产物算出并钉死）。
 */
const STRIP_CLASS_SHA256 = '3f6bcdd87872c2c880759f4a18d884d38764fc395e63dff72cd70196100b03ce';
function stripClassNames(src: string): string {
  const s = src.replace(/\r\n/g, '\n');
  let out = '';
  let i = 0;
  while (true) {
    const k = s.indexOf('className=', i);
    if (k < 0) { out += s.slice(i); break; }
    out += s.slice(i, k + 'className='.length);
    let j = k + 'className='.length;
    while (s[j] === ' ') { out += s[j]!; j++; }
    if (s[j] === '"' || s[j] === "'") {
      const q = s[j]!;
      const e = s.indexOf(q, j + 1);
      out += q + '@' + q;
      j = e + 1;
    } else if (s[j] === '{') {
      let depth = 0;
      let q = j;
      let expr = '';
      for (; q < s.length; q++) {
        const c = s[q]!;
        if (c === "'" || c === '"' || c === '`') {
          const strQ = c; expr += c; q++;
          while (q < s.length) {
            if (s[q] === '\\') { expr += s[q]! + (s[q + 1] ?? ''); q += 2; continue; }
            if (s[q] === strQ) { expr += strQ; q++; break; }
            expr += s[q]!; q++;
          }
          q--; continue;
        }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { expr += c; q++; break; } }
        expr += c;
      }
      out += '{' + maskLiterals(expr.slice(1, -1)) + '}';
      j = q;
    } else { out += s[j]!; j++; }
    i = j;
  }
  return out;
}

/** 全文件 className token（三形态：静态串 / 模板串 / cn(...){} 里的字面量）。 */
function allClassNameTokens(src: string): string[] {
  const out: string[] = [];
  const push = (raw: string): void => {
    for (const t of raw.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (t) out.push(t);
  };
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) push(m[1] ?? m[2] ?? '');
  for (const m of src.matchAll(/className=\{(?!`)([^}]*)\}/g)) {
    for (const lit of m[1]!.matchAll(/'([^']*)'|"([^"]*)"/g)) push(lit[1] ?? lit[2] ?? '');
  }
  return out;
}

/** Tailwind 裸原子类探测（前缀锚定）——门面化后一个都不许剩。 */
const ATOM = /^(?:flex|grid|block|inline|inline-block|inline-flex|hidden|table|contents|list-item|container|sr-only|truncate|capitalize|uppercase|lowercase|italic|underline|antialiased|visible|invisible|collapse|isolate|static|fixed|absolute|relative|sticky|grow|shrink|basis-\d|order-\d|w-|h-|min-|max-|size-|aspect-|m[tblrxy]?-|p[tblrxy]?-|gap(-[xy])?-|space(-[xy])?-|flex-(?:row|col|wrap|nowrap|1|auto|none|grow|shrink|basis)|grid-(?:col|row|flow|auto|cols-|rows-)|col-|row-|place-(?:items|content|self)-|items-|justify-|self-|content-|text-|font-|leading-|tracking-|align-|list-|bg-|from-|via-|to-|border|border-|rounded|rounded-|shadow|shadow-|ring|ring-|outline|outline-|opacity-|blur|transition|transition-|duration-|delay-|ease-|animate-|transform|scale-|rotate-|translate-|cursor-|select-|resize|overflow-|overscroll-|whitespace-|break-|z-|top-|bottom-|left-|right-|inset-|float-|clear-|object-|stroke-|fill-|mix-|will-|snap-|touch-|pointer-|indent-|decoration-|caret-|accent-|columns-|box-|hyphens-|writing-|appearance-|sm:|md:|lg:|xl:)(?:\[|[\w./%-]|$)/;

describe('§FE-19 Studio 顶栏门面基建（静态不变式）', () => {
  it('TopBar 用了 .sp- 语义类（14 处 className 全接上），全部有 globals.css 基础定义', () => {
    const used = [...new Set(spTokensOf(code))].sort();
    expect(used.length, `TopBar sp- 类不足 18（实际 ${used.length}），门面没接上`).toBeGreaterThanOrEqual(18);
    const defined = definedSpClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 sp- 类在 TopBar 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .sp- 视觉段（≥18，Studio 家族基建）', () => {
    const defined = definedSpClasses(globals);
    expect(defined.size, `.sp- 段只有 ${defined.size} 个类，不是成规模视觉段`).toBeGreaterThanOrEqual(18);
  });

  it('.sp- 段里没有写死的 hex 颜色', () => {
    expect(spSegment.replace(/#[0-9a-fA-F]{3,8}\b/g, ''), 'sp- 段有写死 hex').toBe(spSegment);
    expect(spSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.sp- 段里每个 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const declared = definedTokens(tokens);
    const used = [...new Set([...spSegment.matchAll(/(--nexus-[a-z0-9-]+)/g)].map((m) => m[1]!))];
    expect(used.filter((v) => !declared.has(v)), `sp- 段用了未声明的 token：${used.filter((v) => !declared.has(v)).join(', ')}`).toEqual([]);
  });

  it('.sp- 段零新增颜色 token（只引用双主题既有 token）', () => {
    expect(spSegment, 'sp- 段不该定义任何 --nexus-color-*').not.toMatch(/--nexus-color-[a-z0-9-]+\s*:/);
  });

  it('TopBar 零裸 Tailwind：14 处 className 全换成 sp-*（含 w-[220px]/max-w-[280px]/z-[60] 任意值）', () => {
    const bare = allClassNameTokens(code).filter((t) => ATOM.test(t));
    expect(bare, `仍有裸原子类（${[...new Set(bare)].length} 去重）：${[...new Set(bare)].join(', ')}`).toEqual([]);
  });

  it('动态类条件守恒：3 处 cn() 的条件/分支位置逐字不动、三态值为门面类', () => {
    expect((code.match(/\bcn\(/g) ?? []).length, 'TopBar 应有 3 处 cn() 动态类').toBe(3);
    expect(code, 'saveState 三态条件动了').toMatch(/saveState === 'error'\s*\?\s*'sp-saveErr'\s*:\s*'sp-saveIdle'/);
    expect(code, 'viewport 选中条件动了').toMatch(/viewport === v\.id\s*\?\s*'sp-viewportOn'\s*:\s*'sp-viewportOff'/);
    expect(code, 'TopButton active 条件动了').toMatch(/props\.active\s*\?\s*'sp-topBtnOn'\s*:\s*'sp-topBtnOff'/);
    expect(code, 'TopButton disabled 短路条件动了').toMatch(/props\.disabled\s*&&\s*'sp-topBtnDisabled'/);
  });

  it('六红线视觉延伸：hover、2 个 <a> + 全控件 focus-visible、disabled、reduced-motion、不新增渐变墨字', () => {
    // hover 交互态（面板按钮 / 视口未选中 / TopButton 未选中）——锚"选择器 + 非空 background 规则体"，
    // 不能只 toContain 选择器名（变异臂 D 抓出：删空规则体后仅剩 `.sp-x:hover { }` 也会假绿）。
    for (const sel of ['sp-railToggle', 'sp-viewportOff', 'sp-topBtnOff']) {
      expect(spSegment, `缺 .${sel}:hover 交互态或规则体被删空`)
        .toMatch(new RegExp(`\\.${sel}:hover\\s*\\{[^}]*background[^}]*\\}`));
    }
    // 2 个 <a>（NEXUS wordmark / 预览）href 仍在，且门面段有 focus-visible 环
    expect((code.match(/<a\s/g) ?? []).length, 'TopBar <a> 数变了').toBe(2);
    expect(spSegment, 'sp- 段缺 focus-visible 环').toMatch(/:focus-visible\s*\{/);
    expect(spSegment).toMatch(/outline:\s*2px\s+solid\s+var\(--nexus-color-brand\)/);
    for (const a of ['sp-wordmark', 'sp-previewLink']) {
      expect(spSegment, `${a} 缺 focus 环`).toContain(`.${a}:focus-visible`);
    }
    // disabled 语义（TopButton 禁用态：not-allowed + 半透明）
    expect(spSegment, '缺 disabled 语义类').toContain('.sp-topBtnDisabled');
    expect(spSegment).toMatch(/\.sp-topBtnDisabled\s*\{[^}]*cursor:\s*not-allowed/);
    // reduced-motion 收口
    expect(spSegment, 'sp- 段缺 prefers-reduced-motion 收口').toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    // 不新增渐变墨字：sp- 段里 color:transparent + background-clip:text 的类必须为 0
    const ink = [...spSegment.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /color:\s*transparent/.test(m[2]!) && /background-clip:\s*text/.test(m[2]!));
    expect(ink.length, 'FE-19 不该新增渐变墨字类（会扩 A11Y-1 forced-colors 面）').toBe(0);
  });

  it('剥 className 后全文逐字节零行为：14 处类值之外（视口/撤销/改名/保存态/文案/data 钩子）一个字节没动', () => {
    expect(createHash('sha256').update(stripClassNames(topbar).trimEnd()).digest('hex'),
      '剥类后全文变了——改动溢出 className，纯视觉零行为承诺不成立').toBe(STRIP_CLASS_SHA256);
  });

  it('4 个 data-* 钩子一个不丢（精确 token 集合，非子串 includes）', () => {
    const expected = ['data-project-name', 'data-save-state', 'data-theme-mode', 'data-viewport'];
    const found = new Set([...code.matchAll(/\bdata-[a-z][a-z0-9-]*/g)].map((m) => m[0]!));
    const missing = expected.filter((h) => !found.has(h));
    expect(missing, `结构/判据钩子丢了：${missing.join(', ')}`).toEqual([]);
  });

  it('纯函数 / 常量 / 诚实文案契约零行为（saveLabel 四分支 / studio.* 调用 / aria / VIEWPORTS）', () => {
    // saveLabel 四分支（诚实保存态）
    expect(code, 'saveLabel 判定链动了').toMatch(/const saveLabel =\s*saveState === 'saving'\s*\?\s*'保存中…'/);
    for (const s of ["'有未保存改动'", "'已同步'", '`保存失败：${saveError ?? \'未知错误\'}`']) {
      expect(code, `诚实文案丢了：${s}`).toContain(s);
    }
    // studio.* 存储调用链
    for (const s of ['studio.renameDocument(trimmed)', 'studio.undo()', 'studio.redo()', 'studio.setViewport(v.id)', 'studio.setMode(', 'studio.toggleGrid()']) {
      expect(code, `存储调用丢了：${s}`).toContain(s);
    }
    // 事件处理 / 改名状态机
    for (const s of ['onBlur={commitName}', 'onKeyDown=', 'setEditingName(false)', "e.key === 'Enter'", "e.key === 'Escape'", 'e.stopPropagation()']) {
      expect(code, `事件处理丢了：${s}`).toContain(s);
    }
    // aria 契约
    expect(code).toContain('aria-label="项目名"');
    expect(code).toContain('aria-pressed={props.active}');
    // VIEWPORTS 映射来自 viewer-params 那一份表（§16 单一真值）
    for (const s of ['VIEWPORTS.map(', 'BREAKPOINT_LABELS[option.id]', 'VIEWPORT_OPTIONS.map(', 'studio.setViewport(v.id)']) {
      expect(code, `视口真值链丢了：${s}`).toContain(s);
    }
    // 2 个 <a> href / title 诚实文案
    for (const s of ['<a href="/"', "'未命名项目'", 'href={`/preview/${projectId}`}', '只读运行预览（任务 #7 接入运行态投影）']) {
      expect(topbar, `链接/文案丢了：${s}`).toContain(s);
    }
    // 顶栏按钮诚实文案
    for (const s of ['面板', 'NEXUS', '默认主题', '预览', '撤销', '重做', '网格']) {
      expect(topbar, `顶栏文案丢了：${s}`).toContain(s);
    }
  });

  it('响应式断点真值：原唯一 lg:hidden（railToggle）精确落 @media (min-width: 64rem) 的 display:none', () => {
    // Tailwind 4 的 lg = 64rem = 1024px（tokens.css --nexus-breakpoint-lg）；错位即真实失真（FE-16 教训）。
    // 单断言匹配完整结构：内层规则体自带 }，不能先截外块再找内层（会截断）。
    expect(spSegment,
      'sp- 段缺 @media (min-width: 64rem) 内 .sp-railToggle { display: none }（原 lg:hidden 没精确落上）')
      .toMatch(/@media\s*\(min-width:\s*64rem\)\s*\{[^}]*\.sp-railToggle\s*\{\s*display:\s*none\s*;?\s*\}/);
  });

  it('globals.css 块注释定界符严格配对 + 编译后 .sp- 规则体不被吞（堵注释未闭合导致真编译挂的洞）', () => {
    const OPEN = String.fromCharCode(47, 42);
    const CLOSE = String.fromCharCode(42, 47);
    let inside = false, strayOpen = 0, strayClose = 0;
    for (let i = 0; i < globals.length; i++) {
      if (!inside && globals.startsWith(OPEN, i)) { inside = true; i++; }
      else if (inside && globals.startsWith(CLOSE, i)) { inside = false; i++; }
      else if (!inside && globals.startsWith(CLOSE, i)) strayClose++;
    }
    if (inside) strayOpen++;
    expect({ strayOpen, strayClose }, 'globals.css 有孤立定界符或注释未闭合').toEqual({ strayOpen: 0, strayClose: 0 });

    // 与浏览器一致（/* → 最近 */，非嵌套）剥离后，TopBar 用到的每个 sp-* 都仍带真实规则体。
    const compiled = cssNoComments(globals);
    const realBodied = new Set<string>();
    for (const m of compiled.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const sel of m[1]!.split(',')) {
        const hit = sel.trim().match(/^\.(sp-[A-Za-z0-9-]+)/);
        if (hit) realBodied.add(hit[1]!);
      }
    }
    const used = [...new Set([...code.matchAll(/\bsp-[A-Za-z0-9-]+/g)].map((m) => m[0]!))];
    const swallowed = used.filter((c) => !realBodied.has(c));
    expect(swallowed, `注释未闭合把真实规则体吞进注释（CSS 编译会挂）：${swallowed.join(', ')}`).toEqual([]);
  });
});
