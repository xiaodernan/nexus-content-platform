import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-16 `app/credits/page.tsx` 的**静态那一寸**（零浏览器、零真库、零时钟、零后端）。
 *
 * 额度与消费页是 FE-10~15 之后全库剩余裸 Tailwind 密度最高的 server 纯展示页
 * （58 处 className / 38 去重裸 token / 525 次出现）。它同时是"账号——额度——账本"
 * 链路上最讲诚实的一页：余额是流水加出来的、没有消耗方的类别不报单价、最近 20 行
 * 不是全部余额、发布名额与门读同一口径（§159）。门面化必须一处文案、一个 data 钩子、
 * 一条业务分支都不动，只把 58 处 className 换成 `.cr-` 门面类。
 *
 * **本片三个新难点（相对 FE-10~15）**：
 *  1. **首个两处三元动态类同片**：流水点数 `delta < 0 ? danger-ink : accent-2-ink`
 *     （模板串插值 `${...}`）、档位行 `plan === view.plan ? fg-1 : fg-2`（三元组）。
 *     判据保留条件表达式/标识符/分支位置逐字节不动，只验两个分支的类值换成门面类。
 *  2. **首个响应式断点门**：余额网格 `grid-cols-2 ... md:grid-cols-4` 是全 FE 序列
 *     第一个 `md:` 断点。裸类进 `.cr-balanceGrid` 后，断点必须收口进 globals.css 的
 *     `@media (min-width: 48rem)`，**不许照抄 FE-14 `.an-defs` 的 40rem**——真编译实证
 *     Tailwind 4.3.5 默认 `md:` 是 `(width >= 48rem)`（768px），用 40rem 会让 4 列在
 *     640px 就提前触发（比原始早 128px），是真实视觉失真，不是等价换皮。
 *  3. **账本正负语义色守恒**：负=消耗→`danger-ink`（红）、正=发放→`accent-2-ink`（青），
 *     两个 `*-ink` token 在双主题下都声明、且两两不同（别把账记成谎话，§168）。
 *
 * **剥 className 后全文逐字节零行为门**是本片最强门：把 58 处 className 的**值**归一成 `@`
 * （含模板串/三元两形态：归一字符串字面量值，但**保留 `${}` 条件、标识符、比较运算符、
 * 分支位置**），其余全部保留（含 `stamp`/`costNote` 纯函数、`KINDS_WITH_A_CONSUMER` 集合、
 * 全部诚实文案、16 个 data 钩子、业务调用），改前与改后必须整份逐字节恒等。
 *
 * 判据不变式：
 *  1. 类名闭环：page 每个 `cr-*` 在 globals.css 有 `.cr-` 基础定义；
 *  2. 成规模视觉段（≥20）；3. 零写死 hex；4. token 真存在；5. 零新增颜色 token；
 *  6. **page 零裸 Tailwind**（58 处 className 全换，含 `max-w-[880px]`/`[980px]` 两个任意值）；
 *  7. **账本正负语义色守恒**：danger-ink/accent-2-ink 双主题声明、两两不同、门面类各锚其一；
 *  8. **2 处三元动态类守恒**：条件表达式/标识符逐字不动、两分支类值为门面类；
 *  9. **首个响应式断点收口**：JSX 零 `md:*`、`.cr-balanceGrid` 段内有 `@media` + 4 列；
 * 10. **剥 className 后全文 SHA256 逐字节零行为**（纯函数/文案/data 钩子/业务调用）；
 * 11. 16 个 data-* 钩子一个不丢（精确 token 集合，非子串 includes）；
 * 12. 纯函数 / 常量 / 诚实文案契约零行为；
 * 13. globals.css 块注释定界符严格配对。
 *
 * 本片有 1 个 `<Link>`（回首页登录），故补 `:focus-visible`（与 FE-12 纯展示页诚实删门对照）。
 * 浏览器那一寸归 `e2e/credits-visual.spec.ts`。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/credits/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

/** raw 文本里找首个 `re` 匹配，跳过注释（注释里长得像门面类的 `.an-` 不是段起点）。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 去掉注释后的真实代码——契约门/结构钩子门锚它，注释不得喂绿（CRIT-1 / ADR-0154）。 */
const code = cssNoComments(page);

function definedTokens(css: string): Set<string> {
  return new Set([...cssNoComments(css).matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

/** globals.css 里有基础规则体的 `.cr-` 主类名（剔伪类/媒体查询内重复）。 */
function definedCrClasses(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(cr-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
      const tail = line.slice(m.index! + m[0]!.length).trimStart();
      if (/^[{,]/.test(tail)) out.add(m[1]!);
    }
  }
  return out;
}

/**
 * `.cr-` 视觉段完整文本：首个 `.cr-` 到**下一个 §FE 段头注释**之前。
 *
 * §CRIT-1 修实（并轨收尾）：初版边界用写死前缀枚举 `/\.(tc|an|mr|me|mi|mp)-/`，
 * 但 FE-17 `.notif-` 段后来插在 `.cr-` 与 `.tc-` 之间且不在枚举里，导致整段 `.notif-`
 * 被误吞进 `crSegment`——`.notif-grid2` 合法的 `@media (min-width: 40rem)` 撞上本片
 * "不得出现 40rem"门，判据假红（生产 CSS 无错）。根治：与 FE-17 `notifSegment` 同范式，
 * 以真实段头注释 `/* ── §FE-N` 为边界，不再枚举前缀——任何后续插段/改序都不会再误吞。
 */
const crSegment = (() => {
  const start = findOutsideComments(globals, /\.cr-[A-Za-z]/);
  if (start < 0) return '';
  const tail = globals.slice(start);
  const nextSection = tail.search(/\/\*\s*─+\s*§FE-\d+/);
  return cssNoComments(nextSection >= 0 ? tail.slice(0, nextSection) : tail);
})();

/** 从任意字符串抽所有 `cr-*` token。 */
function crTokensOf(s: string): string[] {
  return [...s.matchAll(/\bcr-[A-Za-z0-9-]+/g)].map((m) => m[0]!);
}

/**
 * 把一段 className 表达式里的所有字符串/模板串字面量内容归一为 `@`，保留 `${}` 与 JS 结构。
 * FE-16 首个含模板串/三元同片的门面：必须先正确剥值，才能做全文零行为哈希。
 */
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
 * **剥 className 后全文逐字节哈希**（本片最强零行为门）：静态 `className="…"` 整体归一为
 * `"@"`；动态 `className={…}` 平衡括号取出，字面值归一、保留 `${}`/条件/标识符/分支位置。
 * 基线（全裸）与改造后（全 `.cr-`）必须整份恒等。
 */
const STRIP_CLASS_SHA256 = '735592fb93a54c66ef349a718e53e9666cf28bc507a3df7073922287b20eaa67';
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

describe('§FE-16 credits 额度与消费页门面（静态不变式）', () => {
  it('page 用了 .cr- 语义类（58 处全接上），全部有 globals.css 基础定义', () => {
    const used = [...new Set(crTokensOf(code))].sort();
    expect(used.length, 'credits 一个 cr- 类都没有，门面没接上').toBeGreaterThanOrEqual(20);
    const defined = definedCrClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 cr- 类在 page 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .cr- 视觉段（不是空壳）', () => {
    expect(definedCrClasses(globals).size, '.cr- 定义太少，FE-16 门面升级没落地').toBeGreaterThanOrEqual(20);
    expect(crSegment.length, '.cr- 视觉段为空，零 hex 门不能假绿').toBeGreaterThan(400);
  });

  it('.cr- 段里没有写死的 hex 颜色', () => {
    const hex = [...crSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.cr- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.cr- 段里每个 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of crSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.cr- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('.cr- 段零新增颜色 token（只引用既有双主题 token）', () => {
    const newlyDefined = [...crSegment.matchAll(/(--nexus-color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    expect([...new Set(newlyDefined)], `.cr- 段定义了新颜色 token：${[...new Set(newlyDefined)].join(', ')}`).toEqual([]);
  });

  it('page 零裸 Tailwind：58 处 className 全换成 cr-*（含 max-w-[880px]/[980px] 两个任意值）', () => {
    const classTokens = allClassNameTokens(code);
    const bare = classTokens.filter((t) => !t.startsWith('cr-'));
    expect(bare, `仍有裸 Tailwind 原子类没换成 .cr-：${[...new Set(bare)].join(', ')}`).toEqual([]);
    expect(classTokens.length, 'page 没扫到足够 className，门面没接上').toBeGreaterThanOrEqual(58);
    // 两个任意值宽度原子类必消失
    expect(code, 'max-w-[880px] 任意值没换门面类').not.toContain('max-w-[880px]');
    expect(code, 'max-w-[980px] 任意值没换门面类').not.toContain('max-w-[980px]');
  });

  it('账本正负语义色守恒：负=消耗→danger-ink、正=发放→accent-2-ink，双主题声明、两两不同', () => {
    // 两个门面类各锚一个 *-ink token
    expect(crSegment, 'cr-deltaNeg 未锚 danger-ink').toMatch(/\.cr-deltaNeg\s*\{[^}]*var\(--nexus-color-danger-ink\)/);
    expect(crSegment, 'cr-deltaPos 未锚 accent-2-ink').toMatch(/\.cr-deltaPos\s*\{[^}]*var\(--nexus-color-accent-2-ink\)/);
    // 两个 *-ink token 双主题都声明（tokens.css 里各出现 ≥2 次：暗 root + 亮主题）
    for (const t of ['--nexus-color-danger-ink', '--nexus-color-accent-2-ink']) {
      const n = (tokens.match(new RegExp(t.replace(/[-]/g, '\\-') + '\\s*:', 'g')) ?? []).length;
      expect(n, `${t} 没在双主题各声明一次（出现 ${n} 次）`).toBeGreaterThanOrEqual(2);
    }
    expect('--nexus-color-danger-ink').not.toBe('--nexus-color-accent-2-ink');
  });

  it('2 处三元动态类守恒：条件表达式/标识符逐字不动、两分支类值为门面类', () => {
    // 模板串插值形态：delta < 0 ? A : B（保留 ${} 与比较符）
    expect(code, '流水点数三元条件被改').toContain('${entry.delta < 0 ? ');
    // 三元组形态：plan === view.plan ? A : B
    expect(code, '档位行三元条件被改').toContain("plan === view.plan ? '");
    // 两处的四个分支字面值都必须是 cr- 类（剥注释后从行内取）
    const deltaLine = code.split('\n').find((l) => l.includes('entry.delta < 0 ?')) ?? '';
    const planLine = code.split('\n').find((l) => l.includes('plan === view.plan ?')) ?? '';
    for (const l of [deltaLine, planLine]) {
      const branches = [...l.matchAll(/'([^']*cr-[^']*)'/g)].map((m) => m[1]!);
      expect(branches.length, `三元两分支没都换成 cr- 门面类：${l.trim()}`).toBeGreaterThanOrEqual(2);
      for (const b of branches) expect(b.split(/\s+/).every((t) => t.startsWith('cr-')), `分支含裸类：${b}`).toBe(true);
    }
  });

  it('首个响应式断点收口：JSX 零 md:*、.cr-balanceGrid 基础 2 列 + 48rem 断点切 4 列', () => {
    expect(code, 'md: 断点还留在 JSX（应收口进 globals.css）').not.toMatch(/\bmd:[a-z]/);
    // 基础态 = 2 列（原 grid-cols-2）
    expect(crSegment, 'cr-balanceGrid 未在 .cr- 段定义').toMatch(/\.cr-balanceGrid\s*\{[^}]*grid-template-columns:\s*repeat\(\s*2\b/);
    // 断点值必须是 48rem（原 md: 真编译 = width >= 48rem），40rem 会提前 128px 触发
    expect(crSegment, '.cr- 段缺 48rem 断点（40rem 是错抄 FE-14，会提前切 4 列）').toMatch(/@media\s*\(min-width:\s*48rem\)/);
    expect(crSegment, '不得出现 40rem 断点把 md 降级成 sm').not.toMatch(/@media\s*\(min-width:\s*40rem\)/);
    const mediaBlock = crSegment.match(/@media\s*\(min-width:\s*48rem\)\s*\{[\s\S]*?\.cr-balanceGrid[^}]*grid-template-columns:\s*repeat\(\s*4\b/);
    expect(mediaBlock, '48rem 断点下 cr-balanceGrid 没切成 4 列').toBeTruthy();
  });

  it('字号不串档：13px 组（whose/anonymous/empty）与 12px 组（storage/publish-slots）各归其类', () => {
    // 真量基线：whose/anonymous/empty 原 text-13；storage/publish-slots 原 text-12。
    // 若把两组并进同一个 .cr- 类，CSS 只能定一个字号，必有一组失真（本轮当场修实的第二个陷阱）。
    const lineOf = (hook: string): string => code.split('\n').find((l) => l.includes(hook)) ?? '';
    const clsOf = (hook: string): string => (lineOf(hook).match(/className="([^"]*)"/) ?? [])[1] ?? '';
    const g13 = ['data-credits-whose', 'data-credits-anonymous', 'data-credit-empty'].map(clsOf);
    const g12 = ['data-credits-storage', 'data-credits-publish-slots'].map(clsOf);
    for (const c of g13) expect(c, `13px 组钩子没归到 cr-lede/cr-empty：${c}`).toMatch(/^cr-(lede|empty)$/);
    for (const c of g12) expect(c, `12px 组钩子串进了 13px 的类（真实字号失真）：${c}`).toBe('cr-body');
    expect(new Set(g12).size, '12px 两组须同类').toBe(1);
    // CSS 侧：cr-lede=13px、cr-body=12px、cr-empty=13px，逐个钉死（不许靠继承/回退）
    expect(crSegment, 'cr-lede 须 13px').toMatch(/\.cr-lede\s*\{[^}]*font-size:\s*var\(--nexus-font-size-13\)/);
    expect(crSegment, 'cr-body 须 12px（storage/slots 原 text-12）').toMatch(/\.cr-body\s*\{[^}]*font-size:\s*var\(--nexus-font-size-12\)/);
    expect(crSegment, 'cr-empty 须 13px').toMatch(/\.cr-empty\s*\{[^}]*font-size:\s*var\(--nexus-font-size-13\)/);
  });

  it('剥 className 后全文逐字节零行为：58 处类值之外（纯函数/文案/data 钩子/业务调用）一个字节没动', () => {
    const stripped = stripClassNames(page).trimEnd();
    expect(createHash('sha256').update(stripped).digest('hex'),
      '剥类后全文变了——改动溢出 className，纯视觉零行为承诺不成立').toBe(STRIP_CLASS_SHA256);
  });

  it('16 个 data-* 钩子一个不丢（精确 token 集合，非子串 includes）', () => {
    const expected = [
      'data-credit-balance', 'data-credit-cost', 'data-credit-delta', 'data-credit-empty',
      'data-credit-entry', 'data-credit-kind', 'data-credit-task', 'data-credit-window',
      'data-credits-anonymous', 'data-credits-enforced', 'data-credits-limits',
      'data-credits-plan', 'data-credits-publish-slots', 'data-credits-storage',
      'data-credits-whose', 'data-plan-row',
    ];
    const present = new Set([...code.matchAll(/\bdata-credits?-[a-z-]+|\bdata-plan-row/g)].map((m) => m[0]!));
    const missing = expected.filter((h) => !present.has(h));
    expect(missing, `结构/判据钩子丢了（或改名成别的 token）：${missing.join(', ')}`).toEqual([]);
  });

  it('纯函数 / 常量 / 诚实文案契约零行为', () => {
    for (const fragment of [
      "new Set<CreditLedgerKind>(['ai', 'video'])",
      'function stamp(iso: string): string {',
      'return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;',
      'function costNote(kind: CreditLedgerKind): string {',
      "return KINDS_WITH_A_CONSUMER.has(kind) ? `一次 ${GENERATION_COST[kind]} 点` : '今天没有消耗方';",
      'const view = await readCredits(user.id);',
      'const grants = PLAN_MONTHLY_GRANTS[view.plan];',
      'const activePublications = await activePublicationCount(user.id);',
      'const publishLimit = concurrentPublishLimit(view.plan);',
      '{CREDIT_KINDS.map((kind) => (',
      '{PLAN_KEYS.map((plan: PlanKey) => (',
      '{planEnforcementReadout()}',
      'export const dynamic = ',
    ]) {
      expect(code, `纯函数/语义契约「${fragment.slice(0, 36)}…」丢了`).toContain(fragment);
    }
    for (const copy of [
      '今天没有消耗方',
      '余额是流水加出来的（库里没有"余额"这一列可改）',
      '这里只列最近 20 行；余额是按全部流水算的，不是这 20 行的和。',
      '没有充值入口',
      '失败的生成不扣点',
      '本机没有常驻定时器，写成"每月 1 日自动发放"就是假的',
    ]) {
      expect(code, `诚实文案「${copy.slice(0, 18)}…」丢了`).toContain(copy);
    }
  });

  it('globals.css 块注释定界符严格配对 + 编译后 .cr- 规则体不被吞（堵注释未闭合/提前闭合导致真编译挂的洞）', () => {
    const OPEN = String.fromCharCode(47, 42);
    const CLOSE = String.fromCharCode(42, 47);
    let inside = false;
    let strayOpen = 0;
    let strayClose = 0;
    for (let i = 0; i < globals.length; i++) {
      if (!inside && globals.startsWith(OPEN, i)) { inside = true; i++; }
      else if (inside && globals.startsWith(CLOSE, i)) { inside = false; i++; }
      else if (!inside && globals.startsWith(CLOSE, i)) strayClose++;
    }
    if (inside) strayOpen++;
    expect({ strayOpen, strayClose }, 'globals.css 有孤立定界符或注释未闭合').toEqual({ strayOpen: 0, strayClose: 0 });

    // §CRIT-1 修实（并轨收尾，臂 S12a 抓出）：上面的纯计数状态机有真实盲区——
    // 删掉 .cr- 段头注释的一个 */ 时，下一段头 /* 被吞进"未闭合"态、再被下一段尾 */ 重新配平，
    // strayOpen/strayClose 仍全 0＝门假绿，但浏览器按非嵌套语义会把 .cr-page 等真实规则体吞进注释
    // （CSS 编译挂）。补一道与浏览器一致的判据：用 cssNoComments（/* → 最近 */，非嵌套）剥离后，
    // page 用到的每个 cr-* 主类都仍带真实规则体 {...}，不许只剩注释里被提到的类名文本喂绿（ADR-0154）。
    const compiled = cssNoComments(globals);
    const realBodied = new Set<string>();
    for (const m of compiled.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const sel of m[1]!.split(',')) {
        const hit = sel.trim().match(/^\.(cr-[A-Za-z0-9-]+)/);
        if (hit) realBodied.add(hit[1]!);
      }
    }
    const used = [...new Set([...code.matchAll(/\bcr-[A-Za-z0-9-]+/g)].map((m) => m[0]!))];
    const swallowed = used.filter((c) => !realBodied.has(c));
    expect(swallowed, `注释未闭合把真实规则体吞进注释（CSS 编译会挂）：${swallowed.join(', ')}`).toEqual([]);
  });
});
