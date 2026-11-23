import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * §I18N-EN-PURITY · 英文模式零中文（全 src 扫描，2026-11-22）。
 *
 * 用户第八点：「英文模式下同理，全部统一英文」。`i18n-no-mix` 只守首页 HOME_TXT，
 * 其余页面的 en 文案没有门——于是英文界面里真的漏过 `「${name}」’s …` 这种
 * 中文书名号、`THE ATLAS · 世界全图` 这种挂牌、以及全角 `＋`。
 *
 * 本门用 TypeScript AST 找**所有** `en: { … }` 文案块，只扫**值**（对象的 key 不扫，
 * 所以「中文原因 → 英文译文」的查表键不会被误判），string / template / 函数体里的
 * 返回值都算。判据：
 *  1. 不许出现 CJK 统一表意文字（漏翻）；
 *  2. 不许出现 CJK 标点与全角符号（`「」、，。：；！？（）＋` …）；
 *     中英通用的 `·` `—` `…` 放行；
 *  3. LocaleToggle 的提示语跟随**当前**界面语言，不在中文界面塞英文整句，
 *     也不在英文界面塞中文整句（可见字只留目标语言名 EN / 中）。
 *
 * 明确豁免（写在这里，不是默默跳过）：
 *  - `components/BibleQuiz.tsx`：题库问的就是「正典里出现过哪个汉字」，
 *    汉字是题面本身（`走 (gone / to leave)`），不是界面文案漏翻。
 */
const ROOT = process.cwd();
const SRC = join(ROOT, 'apps/web/src');

const CJK = /[\u3400-\u9fff]/;
const CJK_PUNCT = /[\u3000-\u303f\uff00-\uffef]/;
const PUNCT_OK = new Set(['·', '—', '…']);
const EXEMPT = new Set(['components/BibleQuiz.tsx']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

/** `en:` 那个属性名（Identifier 或字符串字面量）。 */
function nameOf(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function offending(text: string): string[] {
  const bad: string[] = [];
  for (const ch of text) {
    if (PUNCT_OK.has(ch)) continue;
    if (CJK.test(ch) || CJK_PUNCT.test(ch)) bad.push(ch);
  }
  return bad;
}

function scanFile(file: string, source: string): Hit[] {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hits: Hit[] = [];

  const lineOf = (node: ts.Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const record = (node: ts.Node, text: string): void => {
    const bad = offending(text);
    if (bad.length > 0) hits.push({ file, line: lineOf(node), text: `${bad.join('')} ← ${text.trim().slice(0, 100)}` });
  };

  // 只走「会渲染的值」：对象字面量走各属性 initializer（不碰 key）、数组走元素、
  // 函数走函数体、模板串走各段文本。其它节点不下钻，避免把类型注解/键名当文案。
  const value = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      record(node, node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      record(node.head, node.head.text);
      for (const span of node.templateSpans) {
        value(span.expression);
        record(span.literal, span.literal.text);
      }
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (ts.isPropertyAssignment(prop)) value(prop.initializer);
        else if (ts.isSpreadAssignment(prop)) value(prop.expression);
        else if (ts.isShorthandPropertyAssignment(prop)) continue;
      }
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const el of node.elements) value(el);
      return;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      value(node.body);
      return;
    }
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      value(node.expression);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      value(node.whenTrue);
      value(node.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      value(node.left);
      value(node.right);
      return;
    }
    if (ts.isCallExpression(node)) {
      for (const arg of node.arguments) value(arg);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && nameOf(node.name) === 'en' && ts.isObjectLiteralExpression(node.initializer)) {
      value(node.initializer);
      return; // en 块内部不再找嵌套 en
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe('§I18N-EN-PURITY 英文模式零中文（全 src）', () => {
  const files = walk(SRC);
  const hits: Hit[] = [];
  for (const full of files) {
    const rel = relative(SRC, full).replace(/\\/g, '/');
    if (EXEMPT.has(rel)) continue;
    hits.push(...scanFile(rel, readFileSync(full, 'utf8')));
  }

  it('扫描面覆盖全部 ts/tsx（不是空跑）', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('所有 en 文案块零 CJK 字符 / 零中文标点', () => {
    const report = hits.map((h) => `${h.file}:${h.line} ${h.text}`).join('\n');
    expect(hits, `英文文案里仍有中文（${hits.length} 处）：\n${report}`).toHaveLength(0);
  });

  it('LocaleToggle 提示语跟随当前界面语言（不整句夹杂）', () => {
    const toggle = readFileSync(join(SRC, 'components/LocaleToggle.tsx'), 'utf8');
    expect(toggle).toContain("locale === 'zh' ? '切换到英文' : 'Switch to Chinese'");
    expect(toggle).not.toContain("'Switch to English'");
    expect(toggle).not.toContain("'切换到中文'");
  });
});
