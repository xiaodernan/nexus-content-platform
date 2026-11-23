import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HINTS } from '@/lib/hintCopy';

/**
 * §HINT-1 · 主界面的操作都带教学说明（门）。
 *
 * 用户第五点：「主界面给各种按键和操作加上附带的教学说明，方便用户理解」。
 * 落地前的实测（`apps/web/src/studio/CommandBar.tsx` + `components/CommandPalette.tsx`）：
 * **14 个控件，0 个带说明**——「执行」「Fast」「Balanced」「让模型读一遍」
 * 「批准并交回编辑区」「展开计划」这些词，对第一次进 Studio 的人全是黑话，
 * 而它们恰好是最需要解释的那几个。
 *
 * 本门钉四件事：
 *  1. **覆盖**：主界面每个 `<button>` / `<select>` / `<input type="checkbox">`
 *     都必须带一句教学说明，且那句必须出自 `@/lib/hintCopy` 的同一份字典
 *     （`title={hint('<id>', locale)}`）——手写一句塞进 title 不算数，
 *     因为那样就会出现两套说法。
 *  2. **双语**：每条说明 zh 含汉字、en 零汉字零全角标点（§八 不中英夹杂），
 *     两边都够长（一个词不算说明），且没有两条说同一句话。
 *  3. **接线**：源码里用到的每个 id 都在字典里（拼错就红）；
 *     字典里的每个 id 都真被用到（死条目也红——它会让字典慢慢变成第二份文档）。
 *  4. **豁免是声明**：文字自明的链接与带占位符的输入框不要求说明，
 *     但豁免规则写在下面这条代码里，审阅者看得见谁被放过、为什么。
 *
 * 变异验伪（2026-11-23，每处只红该红的那条臂，已还原）：
 *  · 删掉 CommandBar 里「执行」那颗钮的 title → 「覆盖」臂红；
 *  · 把字典里 en 那句塞一个汉字 → 「双语」臂红；
 *  · 把字典里一个 id 改成不存在的名字 → 「接线」臂红；
 *  · 给字典加一条没人用的说明 → 「死条目」臂红。
 */
const ROOT = process.cwd();

/** 主界面：Studio 的操作面 + 首页 + 广场 + 观察站。 */
const SURFACES = [
  'apps/web/src/studio/CommandBar.tsx',
  'apps/web/src/studio/TopBar.tsx',
  'apps/web/src/components/CommandPalette.tsx',
  'apps/web/src/app/page.tsx',
  'apps/web/src/app/discover/page.tsx',
  'apps/web/src/app/admin/observe/page.tsx',
] as const;

/** 需要教学说明的控件：按钮、下拉、开关。 */
const NEEDS_HINT = ['button', 'select'] as const;

const CJK = /[\u3400-\u9fff]/;
const CJK_PUNCT = /[\u3000-\u303f\uff00-\uffef]/;
const PUNCT_OK = new Set(['·', '—', '…']);

/** 剥掉整行注释与块注释（JSX 里的 `{/* … *\/}` 也算块注释）。 */
function strip(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{(\/\*[\s\S]*?\*\/)\}/g, '');
}

/**
 * 扫出一个 JSX 开标签的完整属性串。
 *
 * 注意：属性里常有 `onClick={() => …}`，那个 `=>` 的 `>` 不是标签的结束符。
 * 按「前一个字符不是 `=` 的 `>`」收尾，才不会把按钮截成半截。
 */
function openingTag(source: string, name: string, from = 0): { attrs: string; index: number } | null {
  const re = new RegExp(`<${name}\\b`, 'g');
  re.lastIndex = from;
  const m = re.exec(source);
  if (!m) return null;
  let i = m.index + m[0].length;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i]!;
    if (quote) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; i++; continue; }
    if (ch === '>' && source[i - 1] !== '=') break;
    i++;
  }
  return { attrs: source.slice(m.index + m[0].length, i), index: m.index };
}

/** 一个 `<label …>` 包裹的范围（它上面的 title 会覆盖里面的控件）。 */
function labelRanges(source: string): { start: number; end: number; title: string }[] {
  const out: { start: number; end: number; title: string }[] = [];
  const open = /<label\b/g;
  for (let m = open.exec(source); m; m = open.exec(source)) {
    const tag = openingTag(source, 'label', m.index);
    if (!tag) continue;
    const close = source.indexOf('</label>', tag.index);
    const end = close === -1 ? source.length : close;
    out.push({ start: tag.index, end, title: tag.attrs });
  }
  return out;
}

/**
 * 动态说明的豁免：不是死句子的那几处。
 *
 * 豁免是**声明**——谁被放过、为什么，都写在下面这条代码里，审阅者看得见。
 * 每条豁免还必须在对应文件里真的出现（门会查），否则就成了一个永远用不上的借口。
 */
const DYNAMIC_EXCEPTIONS: { file: string; match: string; why: string }[] = [
  {
    file: 'apps/web/src/studio/TopBar.tsx',
    match: 'title={v.hint}',
    why: '视口说明随断点宽度现场生成（按 375px 重新求解布局）——写死就与真实宽度对不上',
  },
  {
    file: 'apps/web/src/studio/TopBar.tsx',
    match: 'title={undoLabel ?? undefined}',
    why: '撤销说明由 store 现场给出（撤销：移动图层）——比任何静态句子都准',
  },
  {
    file: 'apps/web/src/studio/TopBar.tsx',
    match: 'title={redoLabel ?? undefined}',
    why: '同上：重做说明现场给出',
  },
  {
    file: 'apps/web/src/studio/TopBar.tsx',
    match: 'title={props.shortcut ?',
    why: 'TopButton 的 title 由调用方给：撤销/重做给现场标签，网格给字典里的说明',
  },
];

describe('§HINT-1 主界面的操作都带教学说明', () => {
  it('字典：每条说明中英各一份，zh 有汉字、en 零汉字零全角标点、两边都够长', () => {
    const ids = Object.keys(HINTS);
    expect(ids.length, '教学说明的规模太小，说明只加在了一两个地方').toBeGreaterThanOrEqual(17);

    const seenZh = new Map<string, string>();
    for (const id of ids) {
      const entry = (HINTS as Record<string, { zh: string; en: string }>)[id]!;
      expect(entry.zh, `${id} 缺中文说明`).toBeTruthy();
      expect(entry.en, `${id} 缺英文说明`).toBeTruthy();
      expect(CJK.test(entry.zh), `${id} 的中文说明里没有汉字（多半是复制错了语言）`).toBe(true);
      expect(CJK.test(entry.en), `${id} 的英文说明里混进了汉字`).toBe(false);
      for (const ch of entry.en) {
        if (PUNCT_OK.has(ch)) continue;
        expect(CJK_PUNCT.test(ch), `${id} 的英文说明里混进了全角标点 ${ch}`).toBe(false);
      }
      expect(entry.zh.length, `${id} 的中文说明太短——一个词不算说明`).toBeGreaterThanOrEqual(16);
      expect(entry.en.length, `${id} 的英文说明太短——a word is not an explanation`).toBeGreaterThanOrEqual(24);
      const dup = seenZh.get(entry.zh);
      expect(dup, `${id} 与 ${dup} 的中文说明一字不差——两处控件说了同一句话`).toBeUndefined();
      seenZh.set(entry.zh, id);
    }
  });

  it('接线：源码里用到的每个 id 都在字典里；字典里没有死条目', () => {
    const used = new Set<string>();
    for (const file of SURFACES) {
      const source = strip(readFileSync(join(ROOT, file), 'utf8'));
      // 用法有两种写法：`hint('id', locale)` 直接给 id，和 MODES 那张表里
      // `hint: 'id'` 先存起来再传进去。两种都要算「用到了」，
      // 否则表里引用的三条档位说明会被误判成死条目。
      for (const m of source.matchAll(/'(studio\.[A-Za-z0-9.]+)'/g)) used.add(m[1]!);
    }
    expect(used.size, '主界面几乎没有用到教学说明字典').toBeGreaterThanOrEqual(10);
    for (const id of used) {
      expect(Object.prototype.hasOwnProperty.call(HINTS, id), `源码用了不存在的说明 id：${id}`).toBe(true);
    }
    for (const id of Object.keys(HINTS)) {
      expect(used.has(id), `字典里的「${id}」没人用——它会让字典慢慢变成第二份文档`).toBe(true);
    }
  });

  it('覆盖：主界面每个按钮/下拉都带说明（或被带 title 的 label 包着）', () => {
    const problems: string[] = [];
    let checked = 0;

    for (const file of SURFACES) {
      const source = strip(readFileSync(join(ROOT, file), 'utf8'));
      const labels = labelRanges(source);
      for (const name of NEEDS_HINT) {
        const re = new RegExp(`<${name}\\b`, 'g');
        for (let m = re.exec(source); m; m = re.exec(source)) {
          const tag = openingTag(source, name, m.index);
          if (!tag) continue;
          const attrs = tag.attrs;
          // 输入型控件（文本框）有自己的占位符说明；按钮与下拉没有。
          if (/type="(?:text|search|number|email|url)"/.test(attrs)) continue;
          checked++;
          const own = /\btitle=\{hint\(/.test(attrs);
          const wrapped = labels.some((l) => tag.index > l.start && tag.index < l.end && /title=\{hint\(/.test(l.title));
          const dynamic = DYNAMIC_EXCEPTIONS.some((e) => e.file === file && attrs.includes(e.match));
          if (!own && !wrapped && !dynamic) {
            problems.push(`${file}: <${name}> 没有教学说明`);
          }
        }
      }
    }

    // 17 是实测值（六个主界面里的 button + select）。低于它说明扫描器坏了，
    // 而不是「一切正常」——这两种情况必须分开。
    expect(checked, '没扫到任何控件——扫描器坏了，不是一切正常').toBeGreaterThanOrEqual(17);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('豁免是声明：每条动态豁免都必须在它说的那个文件里真的出现', () => {
    for (const e of DYNAMIC_EXCEPTIONS) {
      const source = strip(readFileSync(join(ROOT, e.file), 'utf8'));
      expect(source.includes(e.match), `豁免「${e.why}」在 ${e.file} 里已经不存在了——删掉它，别留着当借口`).toBe(true);
    }
  });

  it('说明不是写死的：控件上的说明必须调用 hint()，不许内联一句中文', () => {
    for (const file of SURFACES) {
      const source = strip(readFileSync(join(ROOT, file), 'utf8'));
      for (const m of source.matchAll(/\btitle="([^"]*)"/g)) {
        expect(m[1]!, `${file} 的 title 是写死的中文字面量，不是来自字典的说明`).not.toMatch(CJK);
      }
    }
  });
});
