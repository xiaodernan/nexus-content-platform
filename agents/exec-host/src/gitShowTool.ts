import type { ExecPolicy, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import { budgetFlags, GIT_DIFF_FLAGS, GIT_ENV_NAMES, cutNotAbsence, gitEnv, gitVerdict, isDiffHeaderPairLine, isQuotedRendering, quoteVerdict, refusedNotAbsence, stdoutWasCut } from './gitTools.js';
import type { ExecHost, ExecRunResult } from './execHost.js';

/**
 * M2 v42 (ADR 0016 amendment 42): the CONTENT read-back. v37/v38 let a run confirm that a
 * commit landed (a hash agreeing with git's own echo) — but a hash says *something* was
 * recorded, not *what*. This tool closes that gap: `git show --format= -- <path>` prints
 * HEAD's change for exactly one path, and for a file the run added that change IS the whole
 * content git kept. The policy allows ONE argv shape with one floating token, the revision
 * is pinned to HEAD by omission, and there is no way to name another commit, another
 * repository or a write — read-only like v32, still a real process, so §28 still gates it.
 *
 * M2 v46 (ADR 0016 amendment 46) revises that ONE shape. Measured against real git 2.52:
 * `git show --format=` ignores `[diff] external` (checked on both an added and a modified
 * path), but it DOES honour a diff driver named by a committed `.gitattributes`, and such a
 * driver's `textconv` is a COMMAND. Against a binary path HEAD really changed, the unpinned
 * shape ran that command twice and printed an EMPTY diff with exit 0 — so the door reported
 * "HEAD touches nothing here" about a recorded change, and both sides had converted to the
 * same text on the way. `--no-ext-diff --no-textconv` are now part of the pinned shape: the
 * answer comes from git's builtin diff machinery, and a binary change says BINARY (§60).
 */
export function gitShowPolicy(root: string, options: { timeoutMs?: number; maxOutputBytes?: number } = {}): ExecPolicy {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxOutputBytes = options.maxOutputBytes ?? 65_536;
  return {
    root,
    allow: [{ argv: ['git', 'show', ...GIT_DIFF_FLAGS, '--format=', '--', '*'], timeoutMs, maxOutputBytes }],
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

/**
 * The body of `git show --format= -- <path>`: one file's unified diff, no commit header.
 * v64: the `+++`/`---` skip is POSITION-gated like the two other diff readers — before the first `@@`
 * those lines are git naming the file, after it a line reading `+++ b/x` is a line HEAD ADDED.
 */
export function parseShowDiff(stdout: string, path: string): GitShowFileChange {
  const change: GitShowFileChange = { path, hunks: 0, additions: 0, deletions: 0, addedLines: [], binary: false };
  let insideHunk = false;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('old mode') || line.startsWith('new mode') || line.startsWith('similarity') || line.startsWith('rename')) continue;
    if (line.startsWith('@@')) {
      insideHunk = true;
      change.hunks += 1;
    } else if (isDiffHeaderPairLine(line, insideHunk)) continue; // the name pair, and only it, is not content
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
  // M2 v61: a string that STARTS and ENDS with a quote is git's escaping of a path, not a path.
  // `core.quotePath=false` is now forced, so this arrives only from a name containing `"`, a
  // backslash or a control character — or from a caller passing on a rendering it read elsewhere.
  // Handing it to git would produce exit 0 with an EMPTY diff about a file that was never asked
  // about, the one answer this door may not give (v44 measured that emptiness), so it refuses first.
  if (isQuotedRendering(path)) throw new Error('git.show path is a C-QUOTED RENDERING, not a path — name the file itself (a real filename may of course start with a quote; git cannot tell the two apart from the string, so this door asks rather than guesses)');
  if (path.startsWith('-')) throw new Error('git.show path must not start with "-" (options are not content)');
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\')) throw new Error('git.show path must be repo-relative, not absolute');
  if (path.split(/[\\/]/).includes('..')) throw new Error('git.show path must not climb out of the repository');
  return path;
}

export const GIT_SHOW_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'git.show',
    description:
      'Read back WHAT a commit recorded, through the confined exec host (`git show --no-ext-diff --no-textconv --format= -- <path>` — the only argv the policy allows; the revision is HEAD by construction, so no other commit is reachable, and no configured diff helper can answer for git). Returns HEAD\'s added lines and +/− tally for that one path. Read-only, but a real process spawns, so the §28 checkpoint applies.',
    permissions: ['exec'],
    args: [
      { name: 'path', type: 'string', required: true },
      { name: 'cwd', type: 'string' },
    ],
  },
];

export function registerGitShowTool(registry: ToolRegistry, host: ExecHost, options: { env?: Record<string, string> } = {}): ToolRegistry {
  const env = gitEnv(options.env ?? process.env); // v46: whatever the caller needs, PLUS the isolation — a caller cannot opt out
  const spec = GIT_SHOW_TOOL_SPECS[0]!;
  registry.register(spec, async (args) => {
    const path = validateShowPath(args.path);
    const result: ExecRunResult = await host.run({ argv: ['git', 'show', ...GIT_DIFF_FLAGS, '--format=', '--', path], cwd: args.cwd, env }, { preApproved: true }); // the registry's exec gate is the one §28 checkpoint
    if (!result.ran) throw new Error(result.reason || 'run refused');
    if (result.spawnError !== '') throw new Error(`spawn failed: ${result.spawnError}`);
    const flags = budgetFlags(result);
    if (result.exitCode !== 0 || result.killedByBudget) {
      const verdict = gitVerdict(result.stdout, result.stderr, { truncated: result.truncated || result.killedByBudget });
      return { ok: false, detail: `git.show → exit ${result.exitCode}: ${quoteVerdict(verdict)} · ${refusedNotAbsence(`HEAD touches nothing at ${path}`)}${flags}`, exitCode: result.exitCode, path, addedLines: [], truncated: result.truncated };
    }
    const change = parseShowDiff(result.stdout, path);
    const touched = change.hunks > 0 || change.additions > 0 || change.deletions > 0;
    const detail = change.binary
      ? `git.show → exit 0: HEAD touches ${path} as a BINARY change (+${change.additions} −${change.deletions}) — git printed no hunks, so no lines are claimed${flags}`
      : touched
        ? `git.show → exit 0: HEAD changed ${path} · +${change.additions} −${change.deletions} across ${change.hunks} hunk(s)${flags}`
        : stdoutWasCut(result)
          ? `git.show → exit 0: ${cutNotAbsence(`HEAD touched ${path}`)}${flags}`
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
