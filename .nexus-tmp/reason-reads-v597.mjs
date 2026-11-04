import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
const CLIENT_MODEL = 'apps/studio/src/lib/ops.ts';
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p.split('\\').join('/'));
  }
  return out;
};
const shipped = walk('apps/studio/src').filter((p) => !/\.(test|spec)\.tsx?$/.test(p));
const parse = (rel) => ts.createSourceFile(rel, readFileSync(rel, 'utf8'), ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const files = [];
let total = 0;
for (const rel of shipped) {
  let count = 0;
  const visit = (n) => {
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'reason') count++;
    ts.forEachChild(n, visit);
  };
  visit(parse(rel));
  if (count > 0) {
    files.push(`${rel}:${count}`);
    total += count;
  }
}
console.log(`[reads] ".reason" property reads: ${total} over ${files.length} shipped files (owner included? ${files.some((f) => f.startsWith(CLIENT_MODEL))})`);
console.log(files.join('\n'));
