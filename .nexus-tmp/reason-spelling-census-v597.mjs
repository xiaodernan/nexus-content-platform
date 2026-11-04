// Pre-fix measurement for v597: how many shipped files OUTSIDE the owner spell a declared report reason
// as their own string literal, and does the owner spell all of them? Mirrors §11.9's reader shape.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const CLIENT_MODEL = 'apps/studio/src/lib/ops.ts';
const CLIENT_SRC_ROOT = 'apps/studio/src';

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p.split('\\').join('/'));
  }
  return out;
};
const shipped = walk(CLIENT_SRC_ROOT).filter((p) => !/\.(test|spec)\.tsx?$/.test(p));
const parse = (rel) =>
  ts.createSourceFile(rel, readFileSync(rel, 'utf8'), ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

// The declared reasons come from the owner's own array literal, not from a list typed into this script.
const reasonConstants = (rel) => {
  const out = [];
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.initializer && n.name.getText() === 'REPORT_REASONS') {
      const arr = ts.isAsExpression(n.initializer) ? n.initializer.expression : n.initializer;
      if (ts.isArrayLiteralExpression(arr)) for (const el of arr.elements) if (ts.isStringLiteral(el)) out.push(el.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(parse(rel));
  return out;
};
const reasons = reasonConstants(CLIENT_MODEL);
console.log(`[roster] REPORT_REASONS read ${reasons.length} values out of ${CLIENT_MODEL}: ${reasons.join(', ')}`);

const spellings = (rel, wanted) => {
  const out = [];
  const visit = (n) => {
    if ((ts.isStringLiteral(n) || (ts.isNoSubstitutionTemplateLiteral && ts.isNoSubstitutionTemplateLiteral(n))) && wanted.includes(n.text)) {
      out.push(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(parse(rel));
  return out;
};

const foldSites = shipped
  .filter((rel) => rel !== CLIENT_MODEL)
  .map((rel) => ({ rel, words: spellings(rel, reasons) }))
  .filter((s) => s.words.length > 0);
console.log(`[census] population ${shipped.length} shipped files (owner excluded from the charge set) · offenders ${foldSites.length}`);
for (const f of foldSites) console.log(`  ${f.rel} → ${f.words.join(', ')}`);
const ownerSpelled = [...new Set(spellings(CLIENT_MODEL, reasons))].sort();
console.log(`[carrier] ${CLIENT_MODEL} spells ${ownerSpelled.length}/${reasons.length} (${ownerSpelled.join(', ')})`);
