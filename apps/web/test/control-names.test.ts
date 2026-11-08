import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 每个 `<select>` 与文件选择框都必须有自己的可及名。
 *
 * 为什么不把这条交给浏览器里的 axe（`e2e/a11y-internal.spec.ts`）：axe 只看得见**渲染出来的** DOM。
 * §85 第四片首跑在首页与市场抓到 5 处 `select-name`／`label` 违规，我把同一个判据拿去找全库，
 * 又翻出 6 处一模一样的——它们全在**默认收起的面板**里（设计系统、属性、变体板）和**点开才出现的表单**里
 * （公开页的举报理由）。也就是说浏览器那道门结构上不可能看见它们。
 * 拼错的 token 会静默失效，缺名字的控件会**静默不被朗读**：读屏用户听到的是「组合框」三个字，
 * 而界面上一行有六个组合框。所以这里按 JSX 的字面写法判，而不是等一个永远扫不到的浏览器。
 *
 * 判据（任一即算有名字，跟浏览器的算法一致，从强到弱）：
 *   ① 开标签里写了 `aria-label` / `aria-labelledby` / `title`；
 *   ② 被一个 `<label>` 包着（不是自闭合的那种——`<label htmlFor=… />` 只是指向别人，不包住任何东西）；
 *   ③ 写了 `id=`，而同一个文件里有一个 `htmlFor=` 用了同样的值。
 */

const SRC = join(process.cwd(), 'apps/web/src');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

/** 从 `<tag` 起走到配对的闭合 `>`：跳过字符串与 JSX 表达式里的 `>`，否则 `onChange={(e) => …}` 会把标签截断。 */
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

/** 每个非自闭合 `<label>` 的覆盖区间；套娃的 label 用计数配对，不靠正则。 */
function labelSpans(src: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /<label\b|<\/label>/g;
  const stack: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[0] === '</label>') {
      const open = stack.pop();
      if (open !== undefined) spans.push([open, m.index]);
      continue;
    }
    const tag = openTag(src, m.index);
    if (tag.trimEnd().endsWith('/>')) continue; // 自闭合：它不包任何东西
    stack.push(m.index);
  }
  return spans;
}

/** 控件缺名字的清单（把源码当字符串判，这样同一段判据也能喂给「验电」用的假片段）。 */
function unnamedControls(src: string, fileLabel: string): string[] {
  const spans = labelSpans(src);
  const bad: string[] = [];
  for (const m of src.matchAll(/<(select|input)\b/g)) {
    const tag = openTag(src, m.index);
    if (m[1] === 'input' && !/type="file"/.test(tag)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const name = tag.replace(/\s+/g, ' ').trim().slice(0, 90);
    if (/aria-label=|aria-labelledby=|title=/.test(tag)) continue;
    if (spans.some(([s, e]) => m.index > s && m.index < e)) continue;
    const id = tag.match(/\bid=(?:"[^"]*"|\{[^}]*\})/)?.[0]?.slice(3);
    if (id && src.includes(`htmlFor=${id}`)) continue;
    bad.push(`${fileLabel}:${line} <${m[1]}> ${id ? `(id=${id} 但没有人 htmlFor 它)` : '(没有名字)'} ${name}`);
  }
  return bad;
}

describe('控件的可及名（§90 无障碍 · WCAG 4.1.2 名称、角色、值）', () => {
  const offenders: string[] = [];
  let checked = 0;
  for (const file of tsxFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    const before = checked;
    checked += (src.match(/<select\b/g)?.length ?? 0) + (src.match(/type="file"/g)?.length ?? 0);
    if (before === checked) continue;
    offenders.push(...unnamedControls(src, relative(process.cwd(), file)));
  }

  it('全库确实扫到了控件，否则这道门是空的（写法一变就静默失效）', () => {
    expect(checked).toBeGreaterThan(20);
  });

  it('没有裸的 <select> 或文件选择框', () => {
    expect(
      offenders,
      `${offenders.length} 处控件缺可及名：\n${offenders.slice(0, 12).join('\n')}`,
    ).toEqual([]);
  });

  it('验电：判据本身要能红——裸标签要抓、三种合法写法要放、截断标签的箭头函数不算漏', () => {
    // ① 裸的必须抓到
    expect(unnamedControls('<select value={a} onChange={e} />', 'x.tsx')).toHaveLength(1);
    expect(unnamedControls('<input type="file" />', 'x.tsx')).toHaveLength(1);
    // ② 三种合法写法都放行
    expect(unnamedControls('<select aria-label="类型" value={a} />', 'x.tsx')).toEqual([]);
    expect(unnamedControls('<label>类型<select value={a} /></label>', 'x.tsx')).toEqual([]);
    expect(
      unnamedControls('<label htmlFor="k">类型</label><select id="k" value={a} />', 'x.tsx'),
    ).toEqual([]);
    // ③ 自闭合的 label 只是指向别人，不构成包裹
    expect(unnamedControls('<label htmlFor="k" />\n<select value={a} />', 'x.tsx')).toHaveLength(1);
    // ④ 表达式里的 `>` 不能把开标签截断——截断了就会把带名字的读成没名字（假红），
    //    反过来 `onChange={(e) => set(e)}` 后面的 title 也读得到，才是真判据
    expect(
      unnamedControls('<select onChange={(e) => set(e.target.value)} title="类型" />', 'x.tsx'),
    ).toEqual([]);
    // 非文件的 input 不在这道门的范围里（占位符 / 显式 label 各有其法，交给浏览器的 axe 判）
    expect(unnamedControls('<input value={a} placeholder="名称" />', 'x.tsx')).toEqual([]);
  });
});
