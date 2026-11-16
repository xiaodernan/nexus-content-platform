#!/usr/bin/env node
/**
 * §FE-2026-11 `no-raw-tailwind` —— 门禁：className 字面里不允许裸 Tailwind 原子。
 *
 * 背景：2026-11-13 §FE-37…§FE-101 把 apps/web 全表面（70+ 片）从裸 Tailwind 切到了 token 门面族。
 * 本工具把这条纪律钉成可执行门禁——任何新提交重新引入原子都会被抓住。
 *
 * 判定口径（宽于替换门，窄于口味）：只看 className 字面（不含 cn() 之外的普通字符串）里被空白
 * 拆开的每个 token，命中下列精确/锚定模式之一即报。门面族前缀（例如 `.ag-`/`.pp-`）天然不匹配。
 * 允许项：`hover:`/`focus-visible:` 等变体贴在门面类上（例如 `.tt-fab:hover`）——不报告，
 * 因为该检查看的是“原子本体”，变体前缀是合法修饰。
 *
 * 用法：node tools/ci/no-raw-tailwind.mjs [dir…]（默认 apps/web/src）
 * 退出码：0 = 干净；1 = 发现裸原子（逐个打印 file:line token）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = process.argv.slice(2);
const DIRS = ROOTS.length ? ROOTS : ['apps/web/src'];

/** 精确匹配的“原子本体”（整个 token 就是它）。 */
const EXACT = new Set([
  'flex', 'grid', 'inline-flex', 'inline-grid', 'block', 'inline-block', 'hidden', 'contents',
  'absolute', 'relative', 'fixed', 'sticky', 'static',
  'mx-auto', 'antialiased', 'italic', 'uppercase', 'lowercase', 'capitalize', 'underline',
  'line-through', 'truncate', 'italic', 'sr-only', 'container',
]);

/** 前缀模式（整个 token 必须以该前缀开头，且后续只允许 [A-Za-z0-9._/-]）。 */
const PREFIXES = [
  /^(px|py|pt|pb|pl|pr|p|m|mt|mb|ml|mr|mx|my)-(\d|\[)[A-Za-z0-9._[\]()/%-]*$/,
  /^(w|h|min-w|min-h|max-w|max-h)-(\[|\d)[A-Za-z0-9._[\]()/%-]*$/,
  /^(gap|space-x|space-y)-(\d|\[)[A-Za-z0-9._[\]()/%-]*$/,
  /^(inset|inset-x|inset-y|top|right|bottom|left)-(\[|-?\d)[A-Za-z0-9._[\]()/%-]*$/,
  /^(translate-x|translate-y|-translate-x|-translate-y)-\d[A-Za-z0-9._[\]()/%-]*$/,
  /^(text|bg|border|rounded|ring|shadow|divide|from|via|to|via|outline)-(?!(fg|bg|border|accent|brand|warn|danger|success|info|accent-[0-9]|space|radius|font|motion|shadow|ease|scale|z|gutter)-)[0-9a-z][A-Za-z0-9._[\]()/%-]*$/,
  /^(items|justify|content|self|place)-(start|end|center|baseline|stretch|between|around|evenly)$/,
  /^(flex|grid|inline-flex)-(col|row|wrap|nowrap|shrink|grow|1|auto|none)/,
  /^(min|max)-h-(screen|dvh|full|svh)$/,
  /^text-(\d|\[|fg-|danger-|warn-|success-|accent|brand|mono|font-)/,
  /^bg-(bg|brand|accent|warn|danger|success|info|white|black|transparent)/,
  /^border(-(\[|[trblxy]|[0-9]|subtle|strong|none|solid|dashed))/,
  /^rounded(-(\[|sm|md|lg|full|none|[trblxy]|\d))/,
  /^z-\d/,
  /^opacity-\d/,
  /^font-(thin|light|normal|medium|semibold|bold|mono|sans|serif)$/,
  /^tracking-/,
  /^leading-/,
  /^object-(cover|contain|fill|none)$/,
  /^overflow(-[xy])?-(auto|hidden|scroll|visible)$/,
  /^whitespace-(nowrap|normal|pre|pre-wrap|pre-line)$/,
  /^cursor-(pointer|default|not-allowed|move|text)$/,
  /^select-(none|text|all)$/,
  /^pointer-events-(none|auto)$/,
  /^backdrop-blur(-[a-z0-9]+)?$/,
  /^grid-cols-\d/,
  /^col-span-\d/,
  /^backdrop-(blur|saturate|brightness)/,
  /^(hover|focus|focus-visible|active|disabled|group-hover|sm|md|lg|xl|2xl):/,
];

/** 门面族后缀形（`.nb-faint` 等）永远合法；这里不使用——靠上面原子性判定即可放过。 */
const ATTR_RE = /className="([^"]*)"|className=\{`([^`]*)`\}|className=\{cn\(([^)]*)\)\}/g;
const QUOTE_RE = /'([^']*)'/g;

function isAtom(token) {
  if (!token) return false;
  if (EXACT.has(token)) return true;
  for (const re of PREFIXES) {
    if (re.test(token)) return true;
  }
  return false;
}

function tokensOf(text) {
  return text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

function* scanFile(file) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(ATTR_RE)) {
    if (m[1] !== undefined) {
      for (const tok of tokensOf(m[1])) if (isAtom(tok)) yield { line: lineOf(src, m.index ?? 0), tok };
    } else if (m[2] !== undefined) {
      const tpl = m[2];
      for (const tok of tokensOf(tpl)) {
        const clean = tok.replace(/^\$\{|\}$/g, '');
        if (isAtom(clean)) yield { line: lineOf(src, m.index ?? 0), tok: clean };
      }
    } else if (m[3] !== undefined) {
      for (const q of m[3].matchAll(QUOTE_RE)) {
        for (const tok of tokensOf(q[1])) if (isAtom(tok)) yield { line: lineOf(src, m.index ?? 0), tok };
      }
    }
  }
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function walk(dir) {
  const out = [];
  const st0 = statSync(dir);
  if (st0.isFile()) return /\.tsx$/.test(dir) ? [dir] : out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

let hits = 0;
for (const dir of DIRS) {
  for (const file of walk(dir)) {
    for (const { line, tok } of scanFile(file)) {
      hits += 1;
      console.log(`${relative(process.cwd(), file)}:${line}: ${tok}`);
    }
  }
}
if (hits > 0) {
  console.error(`no-raw-tailwind: 发现 ${hits} 处裸 Tailwind 原子（见上）——§FE-37 起 className 只认门面族。`);
  process.exit(1);
}
console.log('no-raw-tailwind: 干净（className 零裸原子）。');
