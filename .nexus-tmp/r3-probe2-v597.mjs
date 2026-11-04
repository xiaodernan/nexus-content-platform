// What nodes does the plant's source actually contain?
import ts from 'typescript';
const SRC = `const WORDS: Record<string, string> = { spam: 'a spam report', harassment: 'a harassment report' };
`;
const sf = ts.createSourceFile('probe.ts', SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const lines = [];
const visit = (n, depth) => {
  lines.push(`${'  '.repeat(depth)}${ts.SyntaxKind[n.kind]} members=${Array.isArray(n.members) ? n.members.length : typeof n.members}`);
  ts.forEachChild(n, (c) => visit(c, depth + 1));
};
visit(sf, 0);
console.log(lines.join('\n'));
console.log('--- predicates');
for (const name of ['isObjectLiteralExpression', 'isTypeLiteralNode', 'isPropertyAssignment', 'isPropertySignature']) {
  console.log(`${name}: ${typeof ts[name]}`);
}
