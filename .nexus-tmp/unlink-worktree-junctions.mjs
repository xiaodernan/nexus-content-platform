import fs from 'node:fs';
import path from 'node:path';

// One-shot lane tool: neutralize the deletion hazard measured on 2026-11-02 — a scratch git worktree whose
// node_modules/@nexus/* are Windows junctions pointing INTO the graded tree. Any recursive delete of that
// worktree follows the junctions and destroys the main tree's tracked workspace files (measured: 522).
const ROOT = process.cwd();
const root = 'D:/nexus-pkgcounts-wt/node_modules/@nexus';
const watched = ['apps/studio', 'agents/runtime', 'agents/exec-host', 'packages/design-model', 'packages/ai-providers', 'packages/three-runtime', 'packages/world-engine'];
const census = () => watched.map((d) => [d, fs.readdirSync(path.join(ROOT, d)).length]);
const before = census();
const names = fs.existsSync(root) ? fs.readdirSync(root) : [];
for (const n of names) {
  const p = path.join(root, n);
  if (!fs.lstatSync(p).isSymbolicLink()) {
    console.log('skip (not a reparse point):', n);
    continue;
  }
  const target = path.resolve(path.dirname(p), fs.readlinkSync(p));
  if (!target.startsWith(ROOT + path.sep)) {
    console.log('skip (target outside the graded tree):', n, '->', target);
    continue;
  }
  fs.rmdirSync(p); // RemoveDirectory on a reparse point drops the link; it never recurses into the target.
  console.log(
    'unlinked:', n, '->', target,
    '| link gone:', !fs.existsSync(p),
    '| target still has files:', fs.existsSync(target) && fs.readdirSync(target).length > 0,
  );
}
const after = census();
const same = JSON.stringify(before) === JSON.stringify(after);
console.log('graded tree unchanged:', same, same ? '' : JSON.stringify({ before, after }));
console.log('remaining in the stale worktree:', fs.readdirSync(root));
