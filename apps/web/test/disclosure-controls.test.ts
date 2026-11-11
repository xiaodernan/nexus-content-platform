import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §A11Y-2 disclosure 契约：每个 `aria-expanded` 触发键都必须用 `aria-controls`
 * 指向**同一文件里真实存在的**受控面板 id（静态不变式，零浏览器、零真库、零时钟）。
 *
 * 为什么按 JSX 字面写法判、不交给浏览器 axe（同 `control-names.test.ts` 的纪律）：
 * ① 这些面板全是**条件渲染**（展开才挂载），axe 只看渲染出的 DOM——收起态它扫不到，
 *    展开态又得真去点每一处（市场改价/举报、3D 对话、快照比较、历史明细、分镜改来源），
 *    后端与交互前置一大堆，结构上不可能稳稳地全覆盖。
 * ② 拼错的 id 会**静默失效**：`aria-controls` 指向不存在的 id，读屏用户听到"已展开"
 *    却找不到它管哪块——比没写更坏（声明了关系但是假的）。这正是 §85 / HealthPanel:146
 *    早就立过、却没推广到全库的契约：读屏用户听到"已折叠/已展开"，却不知道它管的是哪一块。
 *
 * 判据（对源码字符串判，同一段也能喂给"验电"假片段）：
 *   - **先剔除注释**（行注释、斜杠星号块注释、JSDoc、JSX 花括号块注释）——
 *     `HealthPanel:146/150` 的注释正文里就写着 `aria-expanded` 字样，正在讲"原来没有
 *     aria-controls"，若连注释一起扫就是假红；剔除用**等长空白**并保留换行，行号不漂。
 *     （本注释自身不写定界符字面量，免得把 JSDoc 提前闭合——FE-6/FE-8 同款坑。）
 *   - **只从真正的 JSX 开标签内**定位 `aria-expanded`（开标签要跨 `{}`/字符串取完整，
 *     否则 `onClick={() => set(x > 0)}` 里的 `>` 会把它截断）；纯字符串/注释里的字样不算。
 *   - 该标签必须另有 `aria-controls`，且值（字面量 `"foo"` 或表达式 `{foo ? id : undefined}`）
 *     指向的 id 名字能在**同文件**找到一个真实的 `id=` 定义（字面量 `id="foo"` 或 `id={foo}`);
 *   - 收起时不该留悬空引用：`aria-controls={open ? id : undefined}` 这种条件写法认，
 *     因为面板 id 只在展开态存在，与 HealthPanel:148 的纪律一致。
 *
 * 豁免清单（带理由，不能一刀切）：**当前为空——全库零豁免、13 颗触发键全合规**。
 *   - 曾有一条 `studio/AgentPanel.tsx` 豁免，理由"折叠区展开的是摘要 `<p>` 与 draft 两块、
 *     无单一受控面板与 id"。§A11Y-2 收官（ADR-0152）读码证伪：summary `<p>` 与 draft 区
 *     都**常驻**、不受 `open` 控制；`open` 只控制唯一一块条件渲染的 step 详情面板，
 *     且 `step.id` 是天然单一键。故给它补 `id={...step.id}` + 条件式 aria-controls 后删除本豁免，
 *     零行为（只加两个静态属性、不动 open 状态机/渲染分支）。豁免机制本身仍保留并由验电守住。
 *   - `studio/StudioShell.tsx` 的两颗本就合规（带 `aria-controls="nexus-inspector"` 指向真实 id），
 *     不需要豁免，本判据正常放行。
 *
 * 已有合规范式（本门守它们零回归）：HealthPanel:189-190 / PublishPanel:95-96 /
 * ExportPanel:129-130 / SearchBox:171-172 / StudioShell:362-363,390-391。
 *
 * 不承诺（诚实边界，同 usePopoverDismiss:15-18）：本门只守"声明关系真实"这条硬契约，
 * **不守 Escape 关闭 / Tab 离开 / 焦点回退**——那些是浮层的交互收口、会改行为，
 * 且平台自己对轻量 disclosure 明说"不承诺焦点陷阱"。列为本门之外，不伪装成 WCAG 硬门。
 */
const SRC = join(process.cwd(), 'apps/web/src');

/**
 * 带理由的豁免：相对项目根的文件路径（与 scanAll 的 rel 同口径）+ 理由（不许静默塞豁免）。
 * §A11Y-2 收官后**清零**：原 AgentPanel 一条已按 ADR-0152 补真实 id 收口。保留空数组与
 * 下方"每条豁免须命中真违规"的自卫门——将来真有无法收口的浮层才准带理由加回来，不许静默塞。
 */
const EXEMPTIONS: Array<{ file: string; reason: string }> = [];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

/** 从 `<tag` 起走到配对的闭合 `>`：跳过字符串与 JSX 表达式里的 `>`。 */
function openTag(src: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/**
 * 提取某属性 `attr=` 的值文本，按**花括号深度配平**，不靠正则猜——
 * 因为 JSX 表达式值里可能有模板插值 `${...}`（`aria-controls={flag ? `x-${id}` : undefined}`），
 * `\{([^{}]*)\}` 这类正则会在插值花括号处提前截断/匹配失败。
 * 返回：{ raw, value, at }；value 对 `="foo"` 是 foo，对 `={expr}` 是 expr；找不到返回 null。
 * 扫描时跳过字符串/模板内部的括号，避免模板里的 `${` 干扰深度。
 */
function attrValues(src: string, attr: string): Array<{ raw: string; value: string; quoted: boolean; at: number }> {
  const out: Array<{ raw: string; value: string; quoted: boolean; at: number }> = [];
  // 前缀必须不是单词字符或连字符：否则 `data-id=`/`paymentId=` 里的 id 会被误收成面板 id 定义，
  // 让悬空引用恰好撞上某个 data-id 而假绿。`<div id=`/` id=` 的前一个字符是空白或 `<`，才认。
  const re = new RegExp(`(?<![\\w-])${attr}\\s*=\\s*`, 'g');
  for (const m of src.matchAll(re)) {
    const at = m.index!;
    const i = at + m[0].length;
    const first = src[i];
    if (first === '"' || first === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== first) j++;
      out.push({ raw: src.slice(at, j + 1), value: src.slice(i + 1, j), quoted: true, at });
      continue;
    }
    if (first === '{') {
      let depth = 0;
      let quote: string | null = null;
      let j = i;
      for (; j < src.length; j++) {
        const c = src[j];
        if (quote) { if (c === quote) quote = null; continue; }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
      }
      out.push({ raw: src.slice(at, j), value: src.slice(i + 1, j - 1), quoted: false, at });
      continue;
    }
  }
  return out;
}

/**
 * 剔除注释，用**等长空白**替换（换行原样保留 ⇒ 行号不漂），并保护字符串字面量
 * （`'http://...'`、`'aria-expanded 字样'` 里的 `//`/字样不能被当成注释/触发键）。
 * 状态机：code / string / lineComment / blockComment。
 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let state: 'code' | 'string' | 'line' | 'block' = 'code';
  let quote = '';
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (state === 'code') {
      if (c === '/' && n === '/') { out += '  '; i += 2; state = 'line'; continue; }
      if (c === '/' && n === '*') { out += '  '; i += 2; state = 'block'; continue; }
      if (c === '"' || c === "'" || c === '`') { out += c; quote = c; i++; state = 'string'; continue; }
      out += c; i++;
    } else if (state === 'string') {
      out += c;
      if (c === '\\') { out += (n ?? ''); i += 2; continue; }
      if (c === quote) state = 'code';
      i++;
    } else if (state === 'line') {
      if (c === '\n') { out += '\n'; state = 'code'; } else out += ' ';
      i++;
    } else {
      if (c === '*' && n === '/') { out += '  '; i += 2; state = 'code'; continue; }
      out += c === '\n' ? '\n' : ' ';
      i++;
    }
  }
  return out;
}

/** 真正的 JSX 开标签（`<Name` 后跟空白/`/`/`>`）里含 `aria-expanded` 的那些，带行号。 */
function expandedTriggerTags(clean: string): Array<{ tag: string; line: number }> {
  const out: Array<{ tag: string; line: number }> = [];
  for (const m of clean.matchAll(/<([A-Za-z][\w.]*)(?=[\s/>])/g)) {
    const tag = openTag(clean, m.index!);
    if (!/\baria-expanded\b/.test(tag)) continue;
    out.push({ tag, line: clean.slice(0, m.index).split('\n').length });
  }
  return out;
}

/**
 * 把一段 expression 归一化成"id token"集合，供 `id=` 定义与 `aria-controls` 引用**共用同一口径**。
 * 收三类：① 带引号字符串字面量整串（'world-talk'）；② 模板字面量的**静态前缀**
 * （`snapshot-diff-${x}` → `snapshot-diff-`，含插值也认，因为触发键与面板的模板前缀相同即同一 id 族）；
 * ③ 裸标识符（listId）。引号/模板里的内容要先收，再屏蔽掉，避免被当标识符拆成 world/talk 碎片。
 */
function idTokens(expr: string): Set<string> {
  const out = new Set<string>();
  const masked = expr
    // ① 单/双引号字符串整串
    .replace(/'([^']*)'|"([^"]*)"/g, (_all, s1: string, s2: string) => {
      const v = s1 ?? s2;
      if (v) out.add(v);
      return ' '.repeat(_all.length);
    })
    // ② 模板字面量：取静态前缀（插值的 `${...}` 之前那一段），整串无插值则取全串
    .replace(/`([^`]*)`/g, (_all, body: string) => {
      const prefix = body.split('${')[0]!;
      if (prefix) out.add(prefix);
      return ' '.repeat(_all.length);
    });
  // ③ 剩余裸标识符
  for (const m of masked.matchAll(/[A-Za-z_$][\w$]*/g)) {
    if (/^(undefined|true|false|null|open|expanded|on|editing|comparing)$/.test(m[0])) continue;
    out.add(m[0]);
  }
  return out;
}

/** 收集一个文件里所有真实 `id=` 定义的 token（字面量 id="foo" 与表达式 id={foo} / id={`foo-${x}`}）。 */
function definedIds(src: string): Set<string> {
  const ids = new Set<string>();
  for (const { value, quoted } of attrValues(src, 'id')) {
    if (quoted) ids.add(value);
    else for (const t of idTokens(value)) ids.add(t);
  }
  return ids;
}

/** `aria-controls` 值 → 它承诺的 id token；null 表示没写。与 definedIds 共用 idTokens/attrValues 口径。 */
function controlsTarget(tag: string): { raw: string; names: string[] } | null {
  const hit = attrValues(tag, 'aria-controls')[0];
  if (!hit) return null;
  if (hit.quoted) return { raw: hit.raw, names: [hit.value] };
  return { raw: hit.raw, names: [...idTokens(hit.value)] };
}

/** 检查单个文件，返回违规清单（先剔除注释、只扫真开标签）。 */
function violationsIn(src: string, fileLabel: string): string[] {
  const clean = stripComments(src);
  const ids = definedIds(clean);
  const bad: string[] = [];
  for (const { tag, line } of expandedTriggerTags(clean)) {
    const target = controlsTarget(tag);
    if (!target) {
      bad.push(`${fileLabel}:${line} aria-expanded 无 aria-controls ${tag.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
      continue;
    }
    const hit = target.names.some((n) => ids.has(n));
    if (!hit) {
      bad.push(`${fileLabel}:${line} aria-controls 指向不存在的 id（${target.names.join(', ') || '(空)'}）${target.raw}`);
    }
  }
  return bad;
}

function scanAll(): { out: Array<{ file: string; bad: string[]; exempt: boolean }>; triggerTotal: number } {
  const out: Array<{ file: string; bad: string[]; exempt: boolean }> = [];
  let triggerTotal = 0;
  for (const file of tsxFiles(SRC)) {
    const rel = relative(process.cwd(), file).replace(/\\/g, '/');
    const src = readFileSync(file, 'utf8');
    triggerTotal += expandedTriggerTags(stripComments(src)).length;
    const bad = violationsIn(src, rel);
    if (bad.length) out.push({ file: rel, bad, exempt: EXEMPTIONS.some((e) => e.file === rel) });
  }
  return { out, triggerTotal };
}

describe('§A11Y-2 disclosure 契约（aria-expanded ⇒ aria-controls 指向真实 id）', () => {
  const { out: all, triggerTotal } = scanAll();
  const unexempt = all.filter((v) => !v.exempt);

  it('全库确实扫到了成规模的 aria-expanded 触发键，否则这道门是空的', () => {
    // 全库零豁免后仍有 13 颗（Health/Publish/Export/Search/StudioShell×2 + A11Y-2 补的 6 + AgentPanel 1），
    // 下界 12 防"写法一变就静默扫不到"的空转门（FE-5 I=1 假绿教训）
    expect(triggerTotal, `只扫到 ${triggerTotal} 颗 aria-expanded，判据可能失效了`).toBeGreaterThanOrEqual(12);
  });

  it('全库零豁免：豁免清单已清空，且所有触发键都合规（A11Y-2 收官）', () => {
    expect(EXEMPTIONS, 'A11Y-2 收官后不该再有豁免；若确需豁免必须带理由且命中真违规').toEqual([]);
    // 扫全与合规分别由 250 门（triggerTotal≥12）与 255 门（unexempt 无 bad）守；
    // 这里只钉"零豁免"这一件——全合规时 unexempt 本就该为空，绝不能拿它当"扫到了键"的证据（FE-9 code 纪律）。
  });

  it('所有非豁免的 aria-expanded 触发键都有 aria-controls 指向同文件真实 id', () => {
    expect(
      unexempt.flatMap((v) => v.bad),
      `${unexempt.length} 个文件有 disclosure 契约违规：\n${unexempt.flatMap((v) => v.bad).join('\n')}`,
    ).toEqual([]);
  });

  it('豁免清单每条都要有理由、文件真实存在、且真的命中了一个违规（不许静默塞豁免）', () => {
    for (const e of EXEMPTIONS) {
      expect(e.reason.length, `豁免 ${e.file} 没写理由`).toBeGreaterThan(10);
      expect(existsSync(join(process.cwd(), e.file)), `豁免 ${e.file} 指向的文件不存在`).toBe(true);
      // 防路径写错导致豁免静默失效（首跑踩过：写相对 SRC 的路径，scanAll 用的是相对项目根，
      // 结果豁免没命中、AgentPanel 被当非豁免违规）。必须真的命中一处被扫到的违规。
      const hit = all.find((v) => v.file === e.file);
      expect(hit, `豁免 ${e.file} 没命中任何违规——要么路径写错、要么它已经合规了，该删这条豁免`).toBeDefined();
    }
  });

  it('验电：裸/悬空要抓、字面量/条件式要放、注释与字符串字样不算、开标签不被 > 截断', () => {
    // ① 裸的 aria-expanded 必须抓到
    expect(violationsIn('<button aria-expanded={open}>x</button>', 'x.tsx')).toHaveLength(1);
    // ② 指向不存在的 id 必须抓到（比没写更坏：声明了假关系）
    expect(violationsIn('<button aria-expanded={open} aria-controls="ghost" />\n<div id="real" />', 'x.tsx')).toHaveLength(1);
    // ③ 字面量配对合法：放行
    expect(violationsIn('<button aria-expanded={open} aria-controls="panel" />\n<div id="panel" />', 'x.tsx')).toEqual([]);
    // ④ 条件式 + 表达式 id 合法：放行（面板 id 只在展开态存在、收起不留悬空引用）
    expect(
      violationsIn('<button aria-expanded={open} aria-controls={open ? listId : undefined} />\n<div id={listId} />', 'x.tsx'),
    ).toEqual([]);
    // ⑤ 表达式里的 `>` 不能把开标签截断——截断了就会把带 aria-controls 的读成裸标签（假红）
    expect(
      violationsIn('<button onClick={() => set(open ? 1 : 0)} aria-expanded={open} aria-controls="p" />\n<div id="p" />', 'x.tsx'),
    ).toEqual([]);
    // ⑥ 字符串字面量里的字样不算触发键
    expect(violationsIn("const s = 'aria-expanded 是给读屏看的';", 'x.tsx')).toEqual([]);
    // ⑦ 注释里的字样与伪标签都不算——专钉 HealthPanel:146/150 首跑假红（注释正文里有 <button aria-expanded="false">）
    expect(
      violationsIn('/* 展开键原来只有 `aria-expanded`，没有 `aria-controls`：<button aria-expanded="false"> */\n<button aria-expanded={ok} aria-controls="p" />\n<div id="p" />', 'x.tsx'),
    ).toEqual([]);
    // ⑧ 行注释里的伪标签同样不算（// 与 http:// 里的 // 不能误吃后续代码）
    expect(
      violationsIn('const u = "http://x"; // <button aria-expanded={open}>\n<button aria-expanded={ok} aria-controls="p" />\n<div id="p" />', 'x.tsx'),
    ).toEqual([]);
    // ⑨ 条件式**字符串字面量**：'world-talk' 要当整串 token 认，不能拆成 world/talk 碎片（WorldWalk/Storyboard 同款）
    expect(
      violationsIn('<button aria-expanded={on} aria-controls={on ? \'world-talk\' : undefined} />\n<div id="world-talk" />', 'x.tsx'),
    ).toEqual([]);
    // ⑩ 条件式**模板插值** id：触发键与面板前缀相同即同一 id 族，含 ${...} 也要认（HistoryPanel 两处同款）
    expect(
      violationsIn('<button aria-expanded={eq} aria-controls={eq ? `history-diff-${entry.id}` : undefined} />\n<ul id={`history-diff-${entry.id}`} />', 'x.tsx'),
    ).toEqual([]);
    // ⑪ 反向有牙：模板前缀相同但触发键引用了**别的** id 族，要红（防"取任意标识符命中就放行"的假绿）
    expect(
      violationsIn('<button aria-expanded={eq} aria-controls={eq ? `snapshot-diff-${x}` : undefined} />\n<ul id={`history-diff-${x}`} />', 'x.tsx'),
    ).toHaveLength(1);
    // ⑫ data-id 不算面板 id 定义：悬空引用恰好撞上某 data-id 也必须红（防误收 data-* 的假绿）
    expect(
      violationsIn('<button aria-expanded={on} aria-controls="ghost" />\n<div data-marketplace-panel="ghost" />', 'x.tsx'),
    ).toHaveLength(1);
  });
});
