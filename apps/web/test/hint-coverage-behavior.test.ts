import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HINTS } from '@/lib/hintCopy';

/**
 * §HINT-2 · 主界面的操作都带可访问教学气泡（门）。
 *
 * 原生 title 对键盘与触屏用户并不可靠，且 TopButton 曾把调用方 title 覆盖掉，
 * 旧门因此假绿。现在每个静态说明必须包在 `TeachingHint` 里，由组件克隆真实控件、
 * 接上 `aria-describedby` 与 `role=tooltip`，并提供 focus / pointer / Escape 收口。
 *
 * 本门钉五件事：
 *  1. **覆盖**：按钮、下拉、开关必须被 `TeachingHint` 包住，或落在声明过的动态豁免里；
 *  2. **单一真值**：静态 `hintId` 必须来自 `@/lib/hintCopy`，中英各一份且不夹杂；
 *  3. **接线**：源码用到的 id 存在，字典里的 id 没有死条目；
 *  4. **组件契约**：不是画一个气泡——`aria-describedby`、tooltip、焦点/触屏/Escape 都必须接上；
 *  5. **迁移守恒**：六个主界面不再用 `title={hint(...)}` 冒充可访问说明。
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
const NEEDS_HINT = ['button', 'select', 'input'] as const;
const HINT_COMPONENT = 'apps/web/src/components/TeachingHint.tsx';
const GLOBALS = 'apps/web/src/app/globals.css';
const TOKENS = 'apps/web/src/styles/tokens.css';

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

/** 一个 `<TeachingHint …>` 包裹的范围；静态 id 与动态 text 都必须声明其一。 */
function teachingHintRanges(source: string): { start: number; end: number; attrs: string }[] {
  const out: { start: number; end: number; attrs: string }[] = [];
  const open = /<TeachingHint\b/g;
  for (let m = open.exec(source); m; m = open.exec(source)) {
    const tag = openingTag(source, 'TeachingHint', m.index);
    if (!tag) continue;
    const close = source.indexOf('</TeachingHint>', tag.index);
    const end = close === -1 ? source.length : close;
    out.push({ start: tag.index, end, attrs: tag.attrs });
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
    match: 'text={v.hint}',
    why: '视口说明随断点宽度现场生成（按 375px 重新求解布局）——写死就与真实宽度对不上',
  },
  {
    file: 'apps/web/src/studio/TopBar.tsx',
    match: '{...buttonProps}',
    why: 'TopButton 把 TeachingHint 克隆注入的 aria-describedby 透传给真实 button；组件契约另有专门断言',
  },
];

describe('§HINT-2 主界面的操作都带可访问教学气泡', () => {
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
      for (const m of source.matchAll(/['"](studio\.[A-Za-z0-9.]+)['"]/g)) used.add(m[1]!);
    }
    expect(used.size, '主界面几乎没有用到教学说明字典').toBeGreaterThanOrEqual(10);
    for (const id of used) {
      expect(Object.prototype.hasOwnProperty.call(HINTS, id), `源码用了不存在的说明 id：${id}`).toBe(true);
    }
    for (const id of Object.keys(HINTS)) {
      expect(used.has(id), `字典里的「${id}」没人用——它会让字典慢慢变成第二份文档`).toBe(true);
    }
  });

  it('覆盖：主界面每个按钮/下拉/开关都被 TeachingHint 包住（或落在声明过的动态豁免里）', () => {
    const problems: string[] = [];
    let checked = 0;

    for (const file of SURFACES) {
      const source = strip(readFileSync(join(ROOT, file), 'utf8'));
      const hints = teachingHintRanges(source);
      for (const wrapper of hints) {
        if (!/\bhintId=/.test(wrapper.attrs) && !/\btext=/.test(wrapper.attrs)) {
          problems.push(`${file}: TeachingHint 既没有 hintId 也没有 text`);
        }
        if (!/\blocale=/.test(wrapper.attrs)) {
          problems.push(`${file}: TeachingHint 没有 locale`);
        }
      }
      for (const name of NEEDS_HINT) {
        const re = new RegExp(`<${name}\\b`, 'g');
        for (let m = re.exec(source); m; m = re.exec(source)) {
          const tag = openingTag(source, name, m.index);
          if (!tag) continue;
          const attrs = tag.attrs;
          const inputType = attrs.match(/\btype="([^"]+)"/)?.[1] ?? 'text';
          if (name === 'input' && !['checkbox', 'radio'].includes(inputType)) continue;
          checked++;
          const wrapped = hints.some((h) => tag.index > h.start && tag.index < h.end);
          const dynamic = DYNAMIC_EXCEPTIONS.some((e) => e.file === file && attrs.includes(e.match));
          if (!wrapped && !dynamic) {
            problems.push(`${file}: <${name}> 没有被 TeachingHint 包住`);
          }
        }
      }
    }

    expect(checked, '没扫到任何控件——扫描器坏了，不是一切正常').toBeGreaterThanOrEqual(17);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('标签不污染名称：三个表单控件的 tooltip 不嵌在原生 label 里', () => {
    const commandBar = strip(readFileSync(join(ROOT, 'apps/web/src/studio/CommandBar.tsx'), 'utf8'));
    expect((commandBar.match(/<label htmlFor=/g) ?? []).length).toBe(3);
    for (const [labelId, marker] of [
      ['agentSelectId', 'data-ai-agent'],
      ['asyncInputId', 'data-ai-async'],
      ['reviewInputId', 'data-ai-review'],
    ]) {
      expect(commandBar).toContain(`<label htmlFor={${labelId}}>`);
      const tagName = marker === 'data-ai-agent' ? 'select' : 'input';
      const markerPattern = new RegExp(`(?:^|\\s)${marker}(?:\\s|$)`);
      const tag = [...commandBar.matchAll(new RegExp(`<${tagName}\\b`, 'g'))]
        .map((m) => openingTag(commandBar, tagName, m.index))
        .find((candidate) => candidate && markerPattern.test(candidate.attrs));
      expect(tag?.attrs, `${marker} 没找到真实控件开标签`).toContain(`id={${labelId}}`);
    }
    expect(commandBar).not.toMatch(/<label[^>]*className="cb-sendBar"/);
  });

  it('豁免是声明：每条动态豁免都必须在它说的那个文件里真的出现', () => {
    for (const e of DYNAMIC_EXCEPTIONS) {
      const source = strip(readFileSync(join(ROOT, e.file), 'utf8'));
      expect(source.includes(e.match), `豁免「${e.why}」在 ${e.file} 里已经不存在了——删掉它，别留着当借口`).toBe(true);
    }
  });

  it('迁移守恒：六个主界面不再用 title={hint(...)} 冒充可访问说明', () => {
    for (const file of SURFACES) {
      const source = strip(readFileSync(join(ROOT, file), 'utf8'));
      expect(source, `${file} 还留着原生 title 说明——它不能被键盘和触屏可靠读到`).not.toMatch(/title=\{hint\(/);
    }
    for (const file of SURFACES.slice(0, 3)) {
      const source = strip(readFileSync(join(ROOT, file), 'utf8'));
      expect(source, `${file} 没有接入共享气泡`).toContain("from '@/components/TeachingHint'");
    }
  });

  it('撤销/重做：实时操作名也走共享气泡，无历史时不挂空说明', () => {
    const topbar = strip(readFileSync(join(ROOT, 'apps/web/src/studio/TopBar.tsx'), 'utf8'));
    expect(topbar).toContain("hint('studio.topbar.undo', locale)");
    expect(topbar).toContain("hint('studio.topbar.redo', locale)");
    expect(topbar).toContain("text={`${hint('studio.topbar.undo', locale)}${historySuffix(undoLabel, locale)}`}");
    expect(topbar).toContain("text={`${hint('studio.topbar.redo', locale)}${historySuffix(redoLabel, locale)}`}");
    expect(topbar).toContain("locale === 'en' && CJK.test(label) ? '' : ` ${label}`");
    expect(topbar).toContain('viewportOptions(locale)');
    expect(topbar).toMatch(/undoLabel\s*\?\s*\(/);
    expect(topbar).toMatch(/redoLabel\s*\?\s*\(/);
    expect(topbar).not.toContain('title={undoLabel');
    expect(topbar).not.toContain('title={redoLabel');
  });

  it('组件契约：单一真值 + aria-describedby + tooltip + focus/pointer/Escape 收口', () => {
    const component = strip(readFileSync(join(ROOT, HINT_COMPONENT), 'utf8'));
    expect(component.slice(0, 40)).toContain("'use client'");
    expect(component).toContain("from '@/lib/hintCopy'");
    expect(component).toContain('hint(hintId, locale)');
    expect(component).toContain("'aria-describedby': describedBy");
    expect(component).toContain('role="tooltip"');
    expect(component).toContain('title: undefined');
    expect(component).toContain('createPortal(');
    expect(component).toContain('onFocusCapture=');
    expect(component).toContain('onPointerDownCapture=');
    expect(component).toContain("event.key !== 'Escape'");
    expect(component).toContain('const focusInside = !!root?.contains(document.activeElement)');
    expect(component).toContain('if (!focusInside) return');
    expect(component).toContain("addEventListener('pointerdown'");
    expect(component).toContain('event.stopPropagation()');
    expect(component).toContain('trigger?.focus({ preventScroll: true })');
    expect(component).toContain('window.visualViewport');
    expect(component).toContain("visualViewport?.addEventListener('resize', place)");
    expect(component).toContain("visualViewport?.addEventListener('scroll', place)");
    expect(component).toContain('const maxHeight = Math.min(naturalHeight, available)');
  });

  it('TopButton 不再吞掉说明：克隆注入的无障碍属性必须透传到真实 button', () => {
    const topbar = strip(readFileSync(join(ROOT, 'apps/web/src/studio/TopBar.tsx'), 'utf8'));
    expect(topbar).toContain('{...buttonProps}');
    expect(topbar).toContain('hintId="studio.topbar.grid"');
    expect(topbar).not.toContain('title={props.shortcut ?');
  });

  it('气泡视觉：不占布局、固定定位、token 色、forced-colors 回退、零写死 hex', () => {
    const css = readFileSync(join(ROOT, GLOBALS), 'utf8');
    const tokens = readFileSync(join(ROOT, TOKENS), 'utf8');
    expect(css).toMatch(/\.hint-anchor\s*\{\s*display:\s*contents;/);
    expect(css).toMatch(/\.hint-bubble\s*\{[^}]*position:\s*fixed;/);
    expect(css).toMatch(/\.hint-bubble\s*\{[^}]*z-index:\s*var\(--nexus-z-tooltip\);/);
    expect(css).toMatch(/\.hint-bubble\s*\{[^}]*max-width:/);
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{\s*\.hint-bubble\s*\{[^}]*background:\s*Canvas;/);
    const start = css.indexOf('.hint-anchor');
    const end = css.indexOf('.gw-grid', start);
    const segment = css.slice(start, end);
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const declared = new Set([...tokens.matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.filter((token) => !declared.has(token))).toEqual([]);
  });
});
