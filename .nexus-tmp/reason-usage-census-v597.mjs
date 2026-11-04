// v597 pre-fix measurement: which shipped files USE a declared report reason as a reason (not merely
// spell a word that happens to collide with one)? Four structural readers, plus the near-miss count.
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
const REASONS = reasonConstants(CLIENT_MODEL);
const isReasonWord = (t) => REASONS.includes(t);
const text = (n) => n.getText();
// Does this expression read the report's reason field? `reason`, `report.reason`, `r.reason`.
const readsReason = (node) => {
  const t = text(node).trim();
  return t === 'reason' || /\.reason$/.test(t);
};
const eqOps = [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken];
const wordOf = (n) => ((ts.isStringLiteral(n) || (ts.isNoSubstitutionTemplateLiteral && ts.isNoSubstitutionTemplateLiteral(n))) && isReasonWord(n.text) ? n.text : null);
const keyOf = (n) => (ts.isPropertyAssignment(n) || ts.isPropertySignature(n) ? (ts.isIdentifier(n.name) ? n.name.text : ts.isStringLiteral(n.name) ? n.name.text : null) : null);

const findings = [];
for (const rel of shipped) {
  if (rel === CLIENT_MODEL) continue;
  const root = parse(rel);
  const hit = (rule, word, node) => findings.push({ rel, rule, word, line: root.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
  const visit = (n) => {
    // R1 — a declared reason compared against an expression that reads the reason field.
    if (ts.isBinaryExpression(n) && eqOps.includes(n.operatorToken.kind)) {
      const a = wordOf(n.left);
      const b = wordOf(n.right);
      if (a && readsReason(n.right)) hit('R1-equality', a, n.left);
      if (b && readsReason(n.left)) hit('R1-equality', b, n.right);
    }
    // R2 — a case label of a switch whose subject reads the reason field.
    if (ts.isCaseClause(n) && n.expression) {
      const w = wordOf(n.expression);
      const sw = n.parent && n.parent.parent;
      if (w && sw && ts.isSwitchStatement(sw) && readsReason(sw.expression)) hit('R2-switch', w, n.expression);
    }
    // R3 — two or more declared reasons as the keys of one object literal: a second word table.
    if ((ts.isObjectLiteralExpression(n) || ts.isTypeLiteralNode(n)) && Array.isArray(n.members)) {
      const keys = n.members.map(keyOf).filter((k) => k && isReasonWord(k));
      const uniq = [...new Set(keys)];
      if (uniq.length >= 2) for (const m of n.members) {
        const k = keyOf(m);
        if (k && isReasonWord(k)) hit('R3-second-table', k, m.name);
      }
    }
    // R4 — the WHOLE vocabulary re-declared by a non-owner (array literal or union of string literals).
    let members = null;
    if (ts.isArrayLiteralExpression(n)) members = n.elements.map(wordOf).filter(Boolean);
    if (ts.isUnionTypeNode(n)) members = n.types.map((t) => (ts.isLiteralTypeNode(t) ? wordOf(t.literal) : null)).filter(Boolean);
    if (members) {
      const set = [...new Set(members)];
      if (set.length >= 2 && REASONS.every((r) => set.includes(r))) hit('R4-wholesale', set.join('+'), n);
    }
    // R5 — a JSX attribute whose own name ends in `reason` carrying a declared word.
    if (ts.isJsxAttribute(n) && /reason$/i.test(text(n.name)) && n.initializer) {
      const v = ts.isJsxExpression(n.initializer) ? n.initializer.expression : n.initializer;
      const w = v ? wordOf(v) : null;
      if (w) hit('R5-jsx-attribute', w, v);
    }
    ts.forEachChild(n, visit);
  };
  visit(root);
}
const byRule = {};
for (const f of findings) (byRule[f.rule] ||= []).push(f);
console.log(`[roster] declared reasons: ${REASONS.join(', ')} · population ${shipped.length} shipped files (owner excluded)`);
console.log(`[charge] offenders ${findings.length} over ${new Set(findings.map((f) => f.rel)).size} file(s)`);
for (const [rule, fs] of Object.entries(byRule)) console.log(`  ${rule}: ${fs.map((f) => `${f.rel}:${f.line}(${f.word})`).join(', ')}`);

// The near-misses: a plain word census WOULD charge these, and the structural rules above must not.
const spellings = (rel) => {
  const out = [];
  const visit = (n) => {
    if (wordOf(n)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(parse(rel));
  return out;
};
const naive = shipped.filter((rel) => rel !== CLIENT_MODEL).map((rel) => ({ rel, words: spellings(rel) })).filter((s) => s.words.length > 0);
console.log(`[naive] a word-only census charges ${naive.length} file(s): ${naive.map((n) => `${n.rel}(${n.words.join('+')})`).join(', ')}`);
console.log(`[naive-vs-structural] innocent spellings not charged: ${naive.filter((n) => !findings.some((f) => f.rel === n.rel)).length}`);
