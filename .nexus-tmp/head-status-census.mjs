// Re-read of this batch's PRE-FIX census, on HEAD's own bytes rather than the ones I drafted against.
// The claims are: the face `reportStatusText` is declared by 2 shipped files, 25 status literals sit in 4
// files, and the shipped population is 153. Same reader as §11 (the TypeScript compiler API), fed by
// `git show HEAD:<path>` so the worktree's fixes cannot flatter the measurement of the defect.
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const ROOT = 'D:/\u7ec8\u6781\u9879\u76ee';
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const STATUSES = ['open', 'reviewed', 'resolved', 'rejected', 'acknowledged'];

const listed = git(['ls-tree', '-r', '--name-only', 'HEAD', 'apps/studio/src']).trim().split('\n').map((p) => p.split('\\').join('/'));
const shipped = listed.filter((p) => /\.tsx?$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p));
console.log(`[census] HEAD=${git(['rev-parse', '--short', 'HEAD']).trim()} tracked under apps/studio/src=${listed.length} shipped (non-test .ts/.tsx)=${shipped.length}`);

const faces = {};
const literals = {};
const perStatus = {};
let parsed = 0;
for (const rel of shipped) {
  const text = git(['show', `HEAD:${rel}`]);
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  parsed += 1;
  let declaredHere = 0;
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.name.text === 'reportStatusText') declaredHere += 1;
    if (ts.isVariableDeclaration(n) && n.name.getText() === 'reportStatusText') declaredHere += 1;
    if ((ts.isStringLiteral(n) || (ts.isNoSubstitutionTemplateLiteral && ts.isNoSubstitutionTemplateLiteral(n))) && STATUSES.includes(n.text)) {
      literals[rel] = (literals[rel] || 0) + 1;
      perStatus[n.text] = (perStatus[n.text] || 0) + 1;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (declaredHere > 0) faces[rel] = declaredHere;
}
const totalLiterals = Object.values(literals).reduce((a, b) => a + b, 0);
console.log(`[census] parsed ${parsed} files · reportStatusText declared by ${Object.keys(faces).length} shipped file(s): ${Object.entries(faces).map(([f, n]) => `${f}(${n})`).join(', ')}`);
console.log(`[census] status literals: ${totalLiterals} in ${Object.keys(literals).length} files — ${Object.entries(literals).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')}`);
console.log(`[census] literals per status: ${STATUSES.map((s) => `${s}=${perStatus[s] || 0}`).join(' ')}`);
