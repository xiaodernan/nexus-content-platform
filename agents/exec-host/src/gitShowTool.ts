import type { ExecPolicy, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import { GIT_ENV_NAMES, gitEnv } from './gitTools.js';
import type { ExecHost, ExecRunResult } from './execHost.js';

/**
 * M2 v42 (ADR 0016 amendment 42): the CONTENT read-back. v37/v38 let a run confirm that a
 * commit landed (a hash agreeing with git's own echo) — but a hash says *something* was
 * recorded, not *what*. This tool closes that gap: `git show --format= -- <path>` prints
 * HEAD's change for exactly one path, and for a file the run added that change IS the whole
 * content git kept. The policy allows ONE argv shape with one floating token, the revision
 * is pinned to HEAD by omission, and there is no way to name another commit, another
 * repository or a write — read-only like v32, still a real process, so §28 still gates it.
 */
export function gitShowPolicy(root: string, options: { timeoutMs?: number; maxOutputBytes?: number } = {}): ExecPolicy {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxOutputBytes = options.maxOutputBytes ?? 65_536;
  return {
    root,
    allow: [{ argv: ['git', 'show', '--format=', '--', '*'], timeoutMs, maxOutputBytes }],
    envAllow: GIT_ENV_NAMES,
    maxTimeoutMs: timeoutMs,
    maxOutputBytes,
  };
}

export interface GitShowFileChange {
  path: string;
  hunks: number;
  additions: number;
  deletions: number;
  /** Content lines HEAD ADDED at this path, marker stripped — for a new file, every line of it. */
  addedLines: string[];
  /** True when git printed a binary-diff notice instead of hunks (§60: stated, not guessed). */
  binary: boolean;
}

/** The body of `git show --format= -- <path>`: one file's unified diff, no commit header. */
export function parseShowDiff(stdout: string, path: string): GitShowFileChange {
  const change: GitShowFileChange = { path, hunks: 0, additions: 0, deletions: 0, addedLines: [], binary: false };
  for (const line of stdout.split('\n')) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('old mode') || line.startsWith('new mode') || line.startsWith('similarity') || line.startsWith('rename')) continue;
    if (line.startsWith('@@')) change.hunks += 1;
    else if (line.startsWith('+++') || line.startsWith('---')) continue; // headers are not content
    else if (line.startsWith('+')) {
      change.additions += 1;
      change.addedLines.push(line.slice(1));
    } else if (line.startsWith('-')) change.deletions += 1;
    else if (line.startsWith('\\')) continue; // "\ No newline at end of file"
    if (line.includes('Binary files')) change.binary = true;
  }
  return change;
}

/** The tool's own bound on what it will ask git about: one repo-relative path, nothing else. */
export function validateShowPath(path: unknown): string {
  if (typeof path !== 'string' || path.trim() === '') throw new Error('git.show needs a non-empty path');
  if (/\s/.test(path) && path !== path.trim()) throw new Error('git.show path must not carry surrounding whitespace');
  if (/[\n\r]/.test(path)) throw new Error('git.show path must be one line');
  if (path.startsWith('-')) throw new Error('git.show path must not start with "-" (options are not content)');
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\')) throw new Error('git.show path must be repo-relative, not absolute');
  if (path.split(/[\\/]/).includes('..')) throw new Error('git.show path must not climb out of the repository');
  return path;
}

export const GIT_SHOW_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'git.show',
    description:
      'Read back WHAT a commit recorded, through the confined exec host (`git show --format= -- <path>` — the only argv the policy allows; the revision is HEAD by construction, so no other commit is reachable). Returns HEAD\'s added lines and +/− tally for that one path. Read-only, but a real process spawns, so the §28 checkpoint applies.',
    permissions: ['exec'],
    args: [
      { name: 'path', type: 'string', required: true },
      { name: 'cwd', type: 'string' },
    ],
  },
];

export function registerGitShowTool(registry: ToolRegistry, host: ExecHost, options: { env?: Record<string, string> } = {}): ToolRegistry {
  const env = options.env ?? gitEnv();
  const spec = GIT_SHOW_TOOL_SPECS[0]!;
  registry.register(spec, async (args) => {
    const path = validateShowPath(args.path);
    const result: ExecRunResult = await host.run({ argv: ['git', 'show', '--format=', '--', path], cwd: args.cwd, env }, { preApproved: true }); // the registry's exec gate is the one §28 checkpoint
    if (!result.ran) throw new Error(result.reason || 'run refused');
    if (result.spawnError !== '') throw new Error(`spawn failed: ${result.spawnError}`);
    const flags = `${result.truncated ? ' · output truncated at budget' : ''}${result.killedByBudget ? ' · killed at timeout budget' : ''}`;
    if (result.exitCode !== 0 || result.killedByBudget) {
      const why = (result.stderr.trim() !== '' ? result.stderr : result.stdout).trim().split('\n')[0] ?? '';
      return { ok: false, detail: `git.show → exit ${result.exitCode}: ${why === '' ? 'no output' : why}${flags}`, exitCode: result.exitCode, path, addedLines: [], truncated: result.truncated };
    }
    const change = parseShowDiff(result.stdout, path);
    const touched = change.hunks > 0 || change.additions > 0 || change.deletions > 0;
    const detail = change.binary
      ? `git.show → exit 0: HEAD touches ${path} as a BINARY change (+${change.additions} −${change.deletions}) — git printed no hunks, so no lines are claimed${flags}`
      : touched
        ? `git.show → exit 0: HEAD changed ${path} · +${change.additions} −${change.deletions} across ${change.hunks} hunk(s)${flags}`
        : `git.show → exit 0: HEAD touches nothing at ${path} (empty diff — git recorded no change for this path in HEAD)${flags}`;
    return {
      ok: true,
      detail,
      exitCode: 0,
      path,
      hunks: change.hunks,
      additions: change.additions,
      deletions: change.deletions,
      addedLines: change.addedLines,
      ...(change.binary ? { binary: true } : {}),
      truncated: result.truncated,
    };
  });
  return registry;
}
