import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'apps/web/src');

interface Difference {
  file: string;
  line: number;
  path: string;
  reason: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function keyOf(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function unwrap(node: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
    return unwrap(node.expression);
  }
  return node;
}

function compareValues(zh: ts.Expression, en: ts.Expression, path: string, file: string, line: number): Difference[] {
  const left = unwrap(zh);
  const right = unwrap(en);
  const differences: Difference[] = [];
  const add = (reason: string, at = line): void => {
    differences.push({ file, line: at, path, reason });
  };

  if (ts.isObjectLiteralExpression(left) && ts.isObjectLiteralExpression(right)) {
    const properties = (node: ts.ObjectLiteralExpression): Map<string, ts.PropertyAssignment> => {
      const map = new Map<string, ts.PropertyAssignment>();
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = keyOf(prop.name);
        if (key === null) continue;
        if (map.has(key)) add(`duplicate ${key}`);
        map.set(key, prop);
      }
      return map;
    };
    const zhProps = properties(left);
    const enProps = properties(right);
    for (const key of zhProps.keys()) {
      if (!enProps.has(key)) add(`en is missing ${key}`);
    }
    for (const key of enProps.keys()) {
      if (!zhProps.has(key)) add(`zh is missing ${key}`);
    }
    for (const [key, prop] of zhProps) {
      const other = enProps.get(key);
      if (other) differences.push(...compareValues(prop.initializer, other.initializer, `${path}.${key}`, file, line));
    }
    return differences;
  }

  if (ts.isArrayLiteralExpression(left) && ts.isArrayLiteralExpression(right)) {
    const populated = [...left.elements, ...right.elements].filter((el): el is ts.Expression => !ts.isOmittedExpression(el));
    const structured = populated.length > 0 && populated.every((el) => ts.isObjectLiteralExpression(unwrap(el)));
    if (structured && left.elements.length !== right.elements.length) add(`array length zh=${left.elements.length}, en=${right.elements.length}`);
    if (!structured && (left.elements.length === 0) !== (right.elements.length === 0)) add('one locale has no entries');
    for (let i = 0; i < Math.min(left.elements.length, right.elements.length); i += 1) {
      const a = left.elements[i]!;
      const b = right.elements[i]!;
      if (ts.isOmittedExpression(a) || ts.isOmittedExpression(b)) continue;
      if (ts.isObjectLiteralExpression(unwrap(a)) && ts.isObjectLiteralExpression(unwrap(b))) {
        differences.push(...compareValues(a, b, `${path}[${i}]`, file, line));
      }
    }
  }

  return differences;
}

function scan(file: string, source: string): Difference[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const differences: Difference[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const props = new Map(node.properties.filter(ts.isPropertyAssignment).map((prop) => [keyOf(prop.name), prop]));
      const zh = props.get('zh');
      const en = props.get('en');
      if (zh && en) {
        const line = sf.getLineAndCharacterOfPosition(zh.getStart(sf)).line + 1;
        differences.push(...compareValues(zh.initializer, en.initializer, '$', file, line));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return differences;
}

describe('§I18N-KEY-PARITY bilingual dictionaries have the same renderable shape', () => {
  it('detects a missing nested key, an extra array item and a duplicate key in planted fixtures', () => {
    const source = `const copy = { zh: { title: '标题', sections: [{ heading: '一', body: ['甲'] }] }, en: { title: 'Title', sections: [{ heading: 'One' }, { heading: 'Two' }], extra: 'x' } };`;
    const found = scan('fixture.ts', source);
    expect(found.some((d) => d.path === '$.sections' && d.reason.includes('array length'))).toBe(true);
    expect(found.some((d) => d.path === '$.sections[0]' && d.reason === 'en is missing body')).toBe(true);
    expect(found.some((d) => d.reason === 'zh is missing extra')).toBe(true);

    const duplicate = scan('fixture.ts', `const copy = { zh: { title: '一', title: '二' }, en: { title: 'One' } };`);
    expect(duplicate.some((d) => d.reason === 'duplicate title')).toBe(true);
  });

  it('accepts matching nested objects, arrays and locale-specific function implementations', () => {
    const source = `const copy = { zh: { title: '标题', items: [{ label: '一' }], name: (value: string) => '你好 ' + value }, en: { title: 'Title', items: [{ label: 'One' }], name: (value: string) => 'Hello ' + value } };`;
    expect(scan('fixture.ts', source)).toEqual([]);
  });

  it('every zh/en object pair in web source has identical keys and array lengths', () => {
    const files = walk(SRC);
    const differences = files.flatMap((full) => {
      const file = relative(SRC, full).replace(/\\/g, '/');
      return scan(file, readFileSync(full, 'utf8'));
    });
    const report = differences.map((d) => `${d.file}:${d.line} ${d.path} ${d.reason}`).join('\n');
    expect(files.length).toBeGreaterThan(300);
    expect(differences, `bilingual shape differences (${differences.length}):\n${report}`).toEqual([]);
  });
});
