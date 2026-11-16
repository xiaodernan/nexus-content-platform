/**
 * Build docs/latest.json — the showcase fact pack the portfolio page fetches
 * (portfolio repo path: assets/nexus-content/latest.json).
 *
 * Every number is COMPUTED at generation time (git + filesystem), never hand-typed:
 *   - head / total_commits / first_commit_at  (from git)
 *   - adrs / contracts / test_files / services / feature_surface / milestone (SHOWCASE + fs)
 *   - generated_at  (build time)
 *
 * Output schema matches the portfolio page's inline fetch IDs:
 *   nc-head ← head · nc-commits ← total_commits · nc-adrs ← adrs · nc-contracts ← contracts
 *   nc-services ← services · nc-testfiles ← test_files · nc-generated ← generated_at + first_commit_at
 *   nc-features ← feature_surface.slice(0,5).join(' · ')
 *
 * Run: node scripts/build-showcase.mjs
 * Exit code 0 always; the artifact is docs/latest.json.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

/** Recursively count files under dir whose basename satisfies pred, skipping junk dirs. */
function countFiles(dir, pred) {
  const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'target', '.turbo', 'vendor']);
  let n = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (pred(e.name)) n += 1;
    }
  }
  return n;
}

const showcase = JSON.parse(readFileSync(path.join(REPO_ROOT, 'docs/SHOWCASE.json'), 'utf8'));
if (!String(showcase?.schema_version ?? '').startsWith('nexus-content.')) {
  throw new Error('docs/SHOWCASE.json carries an unexpected schema_version');
}

const head = git(['rev-parse', '--short', 'HEAD']);
const totalCommits = Number(git(['rev-list', '--count', 'HEAD']));
const firstCommit = git(['log', '--reverse', '--format=%cI']).split('\n')[0];
const adrs = countFiles(path.join(REPO_ROOT, 'docs', 'adr'), (n) => n.endsWith('.md'));
const contracts = countFiles(path.join(REPO_ROOT, 'contracts'), (n) => n.endsWith('.schema.json'));
const testFiles = countFiles(REPO_ROOT, (n) => /\.test\.(ts|tsx|js|mjs)$/.test(n));

const pack = {
  schema_version: 'nexus-content.latest.v1',
  generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  branch: 'master',
  head,
  total_commits: totalCommits,
  first_commit_at: firstCommit,
  adrs,
  contracts,
  services: showcase.services,
  test_files: testFiles,
  milestone: showcase.milestone,
  milestone_full: showcase.milestone_full,
  headline: showcase.headline,
  feature_surface: showcase.feature_surface,
  privacy_note: showcase.privacy_note,
};

const out = path.join(REPO_ROOT, 'docs', 'latest.json');
writeFileSync(out, JSON.stringify(pack, null, 2) + '\n', 'utf8');
console.log(`docs/latest.json written: head=${pack.head} commits=${pack.total_commits} adrs=${pack.adrs} contracts=${pack.contracts} services=${pack.services} test_files=${pack.test_files}`);
