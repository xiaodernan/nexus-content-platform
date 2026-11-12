import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-18 NEXUS 首页 `app/page.tsx` 的**静态那一寸**（零浏览器、零真库、零时钟、零后端）。
 *
 * 首页是平台的门面、登录后的启动屏（§FE-3 语）。FE-3 只把 Hero / navlink / demoChip /
 * emptySection 收进 `.hp-*`（8 个类、含渐变墨字 wordmark + 柔光空态 + pill 导航），
 * **正文五个 section（账号/项目/回收站/我的主页/Provider 状态）仍是高裸 Tailwind 平铺**
 * （全页 64 处 className / 171 处裸原子类 / 43 去重，server 组件）。本片把正文也收进
 * `.hp-*` 门面段，并把 FE-3 已立的精致视觉语言（section 分隔、行卡 hover 辉光、语义色
 * 徽标、focus 环、柔光）延伸到正文——既守"零裸 Tailwind"纪律，又让首页视觉精致度
 * 从 Hero 一贯到正文（用户"前端魅力登峰造极"主线）。
 *
 * **零行为契约**：fetch / 三态分支（serviceState·serviceLabel·caps.live）· 项目/回收站/
 * 收藏/Provider 四个 map · 17 个 data 钩子 · 全部诚实文案 · aria 契约 · `<a>` 链接
 * 逐字节不动，只把 64 处 className 换成 `.hp-*` 门面类。
 *
 * **剥 className 后全文逐字节零行为门**（本片最强）：静态 `className="…"` 整体归一 `@`；
 * 动态 `className={…}` 平衡括号取出、字面值归一、**保留 `${}` 条件 / 标识符 / 比较运算符 /
 * 分支位置**（首页唯一动态类 `` hp-demoChip ${caps.live ? '…' : '…'} ``）。改前（全裸+半成品
 * 门面）与改后（全 `.hp-`）必须整份逐字节恒等。
 *
 * 判据不变式：
 *  1. 类名闭环：page 每个 `hp-*` 在 globals.css 有 `.hp-` 基础定义；
 *  2. 成规模 `.hp-` 视觉段（≥28，含 FE-3 既有 8 + 本片新增）；3. 零写死 hex；
 *  4. token 真存在；5. 零新增颜色 token；6. **page 零裸 Tailwind**（64 处 className 全换，
 *     含 `max-w-[820px]` 任意值）；7. **动态类条件守恒**（caps.live 逐字不动、两分支门面类）；
 *  8. **六红线视觉延伸**：新增 `.hp-` 全锚 `--nexus-*`+color-mix、双主题、行卡 hover、
 *     6 个 `<a>` focus-visible 环、reduced-motion 收口、不新增渐变墨字（不扩 A11Y-1 面）；
 *  9. **剥 className 后全文 SHA256 零行为**；10. 17 个 data-* 钩子精确集合守恒；
 *  11. 纯函数/常量/诚实文案契约零行为（MODALITIES/serviceState/serviceLabel/三态空文案）；
 *  12. globals.css 块注释定界符严格配对 + 编译后 `.hp-` 规则体不被吞（FE-16 修实范式）。
 *
 * 浏览器那一寸归 `e2e/home-visual.spec.ts`。A11Y-1 forced-colors 渐变墨字回退不重复那扇门
 * （本片不新增渐变墨字类，既有 `.hp-heroTitle` 回退仍归 `forced-colors-style.test.ts`）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 去掉注释后的真实代码——契约门/结构钩子门锚它，注释不得喂绿（CRIT-1 / ADR-0154）。 */
const code = cssNoComments(page);

function definedTokens(css: string): Set<string> {
  return new Set([...cssNoComments(css).matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

/** globals.css 里有基础规则体的 `.hp-` 主类名（剔伪类/媒体查询内重复）。 */
function definedHpClasses(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(hp-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
      const tail = line.slice(m.index! + m[0]!.length).trimStart();
      if (/^[{,]/.test(tail)) out.add(m[1]!);
    }
  }
  return out;
}

/**
 * `.hp-` 视觉段完整文本：首个 `.hp-` 到**下一个 §FE 段头注释**之前。
 * 段头注释锚（非前缀枚举）——任何后续插段/改序都不会误吞（FE-16 §CRIT-1 修实范式）。
 */
const hpSegment = (() => {
  const start = globals.search(/\.hp-[A-Za-z]/);
  if (start < 0) return '';
  const tail = globals.slice(start);
  const nextSection = tail.search(/\/\*\s*─+\s*§FE-\d+/);
  return cssNoComments(nextSection >= 0 ? tail.slice(0, nextSection) : tail);
})();

/** 从任意字符串抽所有 `hp-*` token（完整词，非子串）。 */
function hpTokensOf(s: string): string[] {
  return [...s.matchAll(/\bhp-[A-Za-z0-9-]+/g)].map((m) => m[0]!);
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
 * 基线（全裸 + FE-3 半成品门面）与改造后（全 `.hp-`）必须整份恒等 `e7050b0f…`。
 */
const STRIP_CLASS_SHA256 = 'e7050b0f36dfb5f5be87875917d6b058f4414597df34551258406eafddf186d5';
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

/** 全文件 className token（三形态：静态串 / 模板串 / 三元{} 里的字面量）。 */
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

describe('§FE-18 NEXUS 首页页面门面（静态不变式）', () => {
  it('page 用了 .hp- 语义类（正文五 section 全接上），全部有 globals.css 基础定义', () => {
    const used = [...new Set(hpTokensOf(code))].sort();
    expect(used.length, '首页 hp- 类不足 28，正文门面没接上').toBeGreaterThanOrEqual(28);
    const defined = definedHpClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 hp- 类在 page 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .hp- 视觉段（≥28，含 FE-3 既有 + 正文延伸）', () => {
    const defined = definedHpClasses(globals);
    expect(defined.size, `.hp- 段只有 ${defined.size} 个类，不是成规模视觉段`).toBeGreaterThanOrEqual(28);
  });

  it('.hp- 段里没有写死的 hex 颜色', () => {
    expect(hpSegment.replace(/#[0-9a-fA-F]{3,8}\b/g, ''), 'hp- 段有写死 hex').toBe(hpSegment);
    expect(hpSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.hp- 段里每个 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const declared = definedTokens(tokens);
    const used = [...new Set([...hpSegment.matchAll(/(--nexus-[a-z0-9-]+)/g)].map((m) => m[1]!))];
    expect(used.filter((v) => !declared.has(v)), `hp- 段用了未声明的 token：${used.filter((v) => !declared.has(v)).join(', ')}`).toEqual([]);
  });

  it('.hp- 段零新增颜色 token（只引用双主题既有 token）', () => {
    // hp- 段内不得"定义"新颜色 token（--nexus-color-* :）；只允许引用 var()
    expect(hpSegment, 'hp- 段不该定义任何 --nexus-color-*').not.toMatch(/--nexus-color-[a-z0-9-]+\s*:/);
  });

  it('page 零裸 Tailwind：64 处 className 全换成 hp-*（含 max-w-[820px] 任意值）', () => {
    const bare = allClassNameTokens(page).filter((t) => ATOM.test(t));
    expect(bare, `仍有裸原子类：${[...new Set(bare)].join(', ')}`).toEqual([]);
  });

  it('动态类条件守恒：caps.live 逐字不动、两分支类值为门面类', () => {
    const dyn = page.match(/className=\{`([^`]*)`\}/);
    expect(dyn, '首页唯一动态类（demoChip 模板串）不见了').toBeTruthy();
    expect(dyn![1]!).toMatch(/\$\{caps\.live\s*\?\s*'hp-[A-Za-z0-9-]+'\s*:\s*'hp-[A-Za-z0-9-]+'\}/);
    expect(dyn![1]!).toContain('hp-demoChip');
  });

  it('六红线视觉延伸：行卡 hover、6 个 <a> focus-visible、reduced-motion 收口、不新增渐变墨字', () => {
    // 行卡 hover（FE-3 精致语言延伸到正文）
    expect(hpSegment, '正文行卡缺 hover 辉光/背景切换').toMatch(/\.hp-rowCardInteractive:hover\s*\{/);
    // 6 个 <a>：nav 5 + profile 1 + 项目/收藏行卡是 <a>，focus 环须在 hp- 段
    expect((code.match(/<a\s/g) ?? []).length, '首页 <a> 数变了').toBeGreaterThanOrEqual(6);
    expect(hpSegment, 'hp- 段缺 focus-visible 环').toMatch(/:focus-visible\s*\{/);
    expect(hpSegment).toMatch(/outline:\s*2px\s+solid\s+var\(--nexus-color-brand\)/);
    // reduced-motion：transition 收口
    expect(hpSegment, 'hp- 段缺 prefers-reduced-motion 收口').toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    // 不新增渐变墨字：hp- 段里 color:transparent+background-clip:text 的类只能是 FE-3 既有 1 个（heroTitle）
    const ink = [...hpSegment.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /color:\s*transparent/.test(m[2]!) && /background-clip:\s*text/.test(m[2]!));
    expect(ink.length, 'FE-18 不该新增渐变墨字类（会扩 A11Y-1 forced-colors 面）').toBeLessThanOrEqual(1);
  });

  it('剥 className 后全文逐字节零行为：64 处类值之外（三态/四个 map/文案/data 钩子/业务调用）一个字节没动', () => {
    expect(createHash('sha256').update(stripClassNames(page).trimEnd()).digest('hex'),
      '剥类后全文变了——改动溢出 className，纯视觉零行为承诺不成立').toBe(STRIP_CLASS_SHA256);
  });

  it('17 个 data-* 钩子一个不丢（精确 token 集合，非子串 includes）', () => {
    const expected = [
      'data-ai-service', 'data-deleted-empty', 'data-deleted-list', 'data-deleted-row',
      'data-demo-mode', 'data-my-profile-link', 'data-nav-analytics', 'data-nav-blocks',
      'data-nav-discover', 'data-nav-marketplace', 'data-nav-search', 'data-nexus-wordmark',
      'data-project-row', 'data-saved-empty', 'data-saved-list', 'data-saved-row', 'data-site-nav',
    ];
    const found = new Set([...code.matchAll(/\bdata-[a-z][a-z0-9-]*/g)].map((m) => m[0]!));
    const missing = expected.filter((h) => !found.has(h));
    expect(missing, `结构/判据钩子丢了：${missing.join(', ')}`).toEqual([]);
  });

  it('纯函数 / 常量 / 诚实文案契约零行为', () => {
    // MODALITIES 三元组
    expect(code).toMatch(/const MODALITIES = \[\s*\{ key: 'text', label: '文本 \/ 设计生成' \},\s*\{ key: 'image', label: '图像生成' \},\s*\{ key: 'video', label: '视频生成' \},\s*\] as const;/);
    // 三态判定链
    expect(code).toContain("const serviceState = !serviceUrl ? 'missing' : health ? 'ready' : 'unreachable';");
    expect(code).toContain("const serviceLabel = !serviceUrl ? '未配置' : health ? `在线 · ${health.capability}` : '不可达';");
    // 四个 map + 三态空文案（诚实边界）
    for (const s of ['projects.map(', 'deleted.map(', 'saved.map(', 'health.providers.map(']) expect(code, `丢了 ${s}`).toContain(s);
    for (const s of ['还没有项目。创建一个即可进入 Studio 画布。', '回收站是空的。', '还没有收藏。', '这里只会出现你公开过的作品']) {
      expect(page, `诚实文案丢了：${s}`).toContain(s);
    }
    // demoChip 双态文案
    expect(code).toContain("caps.live ? 'LIVE PROVIDER' : 'DEMO MODE'");
  });

  it('globals.css 块注释定界符严格配对 + 编译后 .hp- 规则体不被吞（堵注释未闭合导致真编译挂的洞）', () => {
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

    // 与浏览器一致（/* → 最近 */，非嵌套）剥离后，page 用到的每个 hp-* 都仍带真实规则体。
    const compiled = cssNoComments(globals);
    const realBodied = new Set<string>();
    for (const m of compiled.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const sel of m[1]!.split(',')) {
        const hit = sel.trim().match(/^\.(hp-[A-Za-z0-9-]+)/);
        if (hit) realBodied.add(hit[1]!);
      }
    }
    const used = [...new Set([...code.matchAll(/\bhp-[A-Za-z0-9-]+/g)].map((m) => m[0]!))];
    const swallowed = used.filter((c) => !realBodied.has(c));
    expect(swallowed, `注释未闭合把真实规则体吞进注释（CSS 编译会挂）：${swallowed.join(', ')}`).toEqual([]);
  });
});
