import type { ExecPolicy, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import type { ExecHost, ExecRunResult } from './execHost.js';

/**
 * M2 v32 (ADR 0016 amendment 32): READ-ONLY git awareness on the confined host.
 * The agent stack learns what the repo looks like (`git status --short`, `git diff`)
 * through the exact same policy + checkpoint + budget machinery as v30 — no shell,
 * fixed exact-argv allowlist, and §9 holds by construction: nothing in here can
 * write. The git COMMIT tool is deliberately NOT part of this slice.
 */

const GIT_ENV_NAMES = ['PATH', 'SYSTEMROOT', 'HOME', 'USERPROFILE'];

/** The three commands this policy knows, and NOTHING else (default-deny). */
export function gitReadOnlyPolicy(root: string, options: { timeoutMs?: number; maxOutputBytes?: number } = {}): ExecPolicy {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxOutputBytes = options.maxOutputBytes ?? 65_536;
  return {
    root,
    allow: [
      { argv: ['git', 'status', '--short'], timeoutMs, maxOutputBytes },
      { argv: ['git', 'diff'], timeoutMs, maxOutputBytes },
      { argv: ['git', 'diff', '--stat'], timeoutMs, maxOutputBytes },
    ],
    envAllow: GIT_ENV_NAMES,
    maxTimeoutMs: timeoutMs,
    maxOutputBytes,
  };
}

/** Pick the few vars git actually needs out of an env source (default: this process). */
export function gitEnv(source: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of GIT_ENV_NAMES) if (typeof source[k] === 'string') env[k] = source[k];
  return env;
}

export interface GitStatusFile {
  xy: string;
  status: string;
  path: string;
}

const STATUS_ORDER: [string, string][] = [
  ['?', 'untracked'],
  ['U', 'unmerged'],
  ['A', 'added'],
  ['R', 'renamed'],
  ['C', 'copied'],
  ['D', 'deleted'],
  ['M', 'modified'],
];

/** Porcelain v1 (`--short`): `XY path`, renames as `XY old -> new` (new path wins). */
export function parseGitStatus(stdout: string): { files: GitStatusFile[]; counts: Record<string, number> } {
  const files: GitStatusFile[] = [];
  const counts: Record<string, number> = {};
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    const xy = line.slice(0, 2);
    let rest = line.slice(2).trim();
    const arrow = rest.indexOf(' -> ');
    if (arrow >= 0) rest = rest.slice(arrow + 4);
    const hit = STATUS_ORDER.find(([code]) => xy.includes(code));
    const status = hit ? hit[1] : 'other';
    files.push({ xy, status, path: rest });
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return { files, counts };
}

export interface GitDiffFile {
  path: string;
  hunks: number;
  additions: number;
  deletions: number;
}

/** Unified `git diff` text → per-file line tallies; `+++`/`---` headers never count. */
export function parseGitDiff(stdout: string): { files: GitDiffFile[]; totals: { files: number; hunks: number; additions: number; deletions: number } } {
  const files: GitDiffFile[] = [];
  let current: GitDiffFile | null = null;
  for (const line of stdout.split('\n')) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (header) {
      current = { path: header[2]!, hunks: 0, additions: 0, deletions: 0 };
      files.push(current);
      continue;
    }
    if (!current) continue; // preamble before the first file is not a diff
    if (line.startsWith('@@')) current.hunks += 1;
    else if (line.startsWith('+') && !line.startsWith('+++')) current.additions += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) current.deletions += 1;
  }
  const totals = files.reduce((t, f) => ({ files: t.files + 1, hunks: t.hunks + f.hunks, additions: t.additions + f.additions, deletions: t.deletions + f.deletions }), { files: 0, hunks: 0, additions: 0, deletions: 0 });
  return { files, totals };
}

/** `git diff --stat` footer: "N files changed, I insertions(+), D deletions(-)". */
export function parseDiffStat(stdout: string): { files: number; insertions: number; deletions: number } | null {
  const lines = stdout.split('\n').filter((l) => l.trim() !== '');
  const footer = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(lines[lines.length - 1] ?? '');
  if (!footer) return lines.length === 0 ? { files: 0, insertions: 0, deletions: 0 } : null;
  return { files: Number(footer[1]), insertions: Number(footer[2] ?? 0), deletions: Number(footer[3] ?? 0) };
}

export const GIT_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'git.status',
    description: 'Read-only working-tree awareness: runs `git status --short` through the confined exec host and returns parsed porcelain entries. Never writes, never shells.',
    permissions: ['exec'], // read-only for the repo, but a REAL process spawns — §28 still gates
    args: [{ name: 'cwd', type: 'string' }],
  },
  {
    name: 'git.diff',
    description: 'Read-only change awareness: `git diff` (per-file line tallies) or `git diff --stat` (summary) through the confined exec host. Exact argv only — no paths, no shell.',
    permissions: ['exec'],
    args: [
      { name: 'stat', type: 'boolean' },
      { name: 'cwd', type: 'string' },
    ],
  },
];

export function registerGitTools(registry: ToolRegistry, host: ExecHost, options: { env?: Record<string, string> } = {}): ToolRegistry {
  const env = options.env ?? gitEnv();
  const runGit = async (argv: string[], cwd: unknown): Promise<ExecRunResult> => {
    const result = await host.run({ argv, cwd, env }, { preApproved: true }); // the registry's exec gate is the one §28 checkpoint
    if (!result.ran) throw new Error(result.reason || 'run refused');
    if (result.spawnError !== '') throw new Error(`spawn failed: ${result.spawnError}`);
    return result;
  };
  const flags = (r: { truncated: boolean; killedByBudget: boolean }): string => `${r.truncated ? ' · output truncated at budget' : ''}${r.killedByBudget ? ' · killed at timeout budget' : ''}`;

  registry.register(GIT_TOOL_SPECS[0]!, async (args) => {
    const result = await runGit(['git', 'status', '--short'], args.cwd);
    const { files, counts } = parseGitStatus(result.stdout);
    const ok = result.exitCode === 0 && !result.killedByBudget;
    const tally = Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ');
    const detail = `git.status → exit ${result.exitCode}: ${files.length} entries${tally === '' ? '' : ` (${tally})`}${flags(result)}`;
    return { ok, detail, exitCode: result.exitCode, files, counts, truncated: result.truncated };
  });

  registry.register(GIT_TOOL_SPECS[1]!, async (args) => {
    const stat = args.stat === true;
    const result = await runGit(stat ? ['git', 'diff', '--stat'] : ['git', 'diff'], args.cwd);
    const ok = result.exitCode === 0 && !result.killedByBudget;
    if (stat) {
      const summary = parseDiffStat(result.stdout);
      const detail = `git.diff --stat → exit ${result.exitCode}${summary ? `: ${summary.files} files, +${summary.insertions} −${summary.deletions}` : ': unparseable stat footer'}${flags(result)}`;
      return { ok, detail, exitCode: result.exitCode, mode: 'stat', summary, text: result.stdout, truncated: result.truncated };
    }
    const { files, totals } = parseGitDiff(result.stdout);
    const detail = `git.diff → exit ${result.exitCode}: ${totals.files} files, +${totals.additions} −${totals.deletions} (${totals.hunks} hunks)${flags(result)}`;
    return { ok, detail, exitCode: result.exitCode, mode: 'full', files, totals, truncated: result.truncated };
  });

  return registry;
}
