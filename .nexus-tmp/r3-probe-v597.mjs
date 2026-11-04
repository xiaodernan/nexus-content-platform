// Isolated probe of the R3 rule against the plant's own source text, in-process.
import ts from 'typescript';
const REASONS = ['spam', 'harassment', 'illegal', 'other'];
const SRC = `const WORDS: Record<string, string> = { spam: 'a spam report', harassment: 'a harassment report' };
export function inlineWords(reason: string): string {
  return WORDS[reason] ?? 'a report';
}
`;
const memberKey = (n) => {
  if (!(ts.isPropertyAssignment(n) || ts.isPropertySignature(n))) return null;
  if (ts.isIdentifier(n.name)) return n.name.text;
  if (ts.isStringLiteral(n.name)) return n.name.text;
  return null;
};
const sf = ts.createSourceFile('probe.tsx', SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const found = [];
const visit = (n) => {
  const kindName = ts.SyntaxKind[n.kind];
  if (ts.isObjectLiteralExpression(n) || ts.isTypeLiteralNode(n)) {
    const keys = [...new Set((n.members || []).map(memberKey).filter((k) => k && REASONS.includes(k)))];
    found.push({ kindName, memberCount: (n.members || []).length, keys, isArray: Array.isArray(n.members) });
  }
  ts.forEachChild(n, visit);
};
visit(sf);
console.log(JSON.stringify(found, null, 1));
console.log('isTypeLiteralNode is ' + typeof ts.isTypeLiteralNode);
