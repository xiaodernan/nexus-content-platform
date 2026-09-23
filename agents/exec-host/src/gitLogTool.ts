import type { ExecPolicy, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import { GIT_ENV_NAMES, cutNotAbsence, gitEnv, gitVerdict, quoteVerdict, refusedNotAbsence } from './gitTools.js';
import type { ExecHost, ExecRunResult } from './execHost.js';

/**
 * M2 v37 (ADR 0016 amendment 37): the git LOG read-back tool — the last corner of the
 * see (v32) → touch (v35) → confirm (v37) circle. After a §28-approved commit the agent
 * can READ ITS OWN HISTORY and check the record it was handed actually landed. The
 * policy allows exactly ONE argv shape, `git log --oneline -n <count>` — the second
 * production use of the '*' ARG wildcard: shape fixed, count floats, arity enforced.
 * Read-only like v32: nothing here can write; only a real process spawns, and §28 gates it.
 */
export function gitLogPolicy(root: string, options: { timeoutMs?: number; maxOutputBytes?: number } = {}): ExecPolicy {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxOutputBytes = options.maxOutputBytes ?? 65_536;
  return {
    root,
    allow: [{ argv: ['git', 'log', '--oneline', '-n', '*'], timeoutMs, maxOutputBytes }],
    envAllow: GIT_ENV_NAMES,
    maxTimeoutMs: timeoutMs,
    maxOutputBytes,
  };
}

export interface GitLogEntry {
  hash: string;
  subject: string;
}

/** `git log --oneline` echo: `<hash> <subject>` per line; lines that echo no hash are COUNTED, not guessed. */
export function parseGitLog(stdout: string): { commits: GitLogEntry[]; skipped: number } {
  const commits: GitLogEntry[] = [];
  let skipped = 0;
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const m = /^([0-9a-f]{4,}) (.*)$/.exec(line);
    if (m) commits.push({ hash: m[1]!, subject: m[2]!.trim() });
    else skipped += 1;
  }
  return { commits, skipped };
}

/** The tool's OWN bound, above the policy's shape check: git would happily echo a huge log; we ask for a bounded window. */
export const GIT_LOG_MAX_COUNT = 100;

export const GIT_LOG_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'git.log',
    description:
      'Read back history through the confined exec host (`git log --oneline -n <count>` — the only argv the policy allows; default count 10, capped at 100). Read-only: it confirms what a granted git.commit actually wrote. Still spawns a real process, so the §28 checkpoint applies.',
    permissions: ['exec'],
    args: [
      { name: 'count', type: 'number' },
      { name: 'cwd', type: 'string' },
    ],
  },
];

export function registerGitLogTool(registry: ToolRegistry, host: ExecHost, options: { env?: Record<string, string> } = {}): ToolRegistry {
  const env = gitEnv(options.env ?? process.env); // v46: whatever the caller needs, PLUS the isolation — a caller cannot opt out
  registry.register(GIT_LOG_TOOL_SPECS[0]!, async (args) => {
    const count = args.count === undefined ? 10 : args.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > GIT_LOG_MAX_COUNT) {
      throw new Error(`count must be an integer between 1 and ${GIT_LOG_MAX_COUNT} (bounded read-back, never an unbounded log)`);
    }
    const result: ExecRunResult = await host.run({ argv: ['git', 'log', '--oneline', '-n', String(count)], cwd: args.cwd, env }, { preApproved: true }); // the registry's exec gate is the one §28 checkpoint
    if (!result.ran) throw new Error(result.reason || 'run refused');
    if (result.spawnError !== '') throw new Error(`spawn failed: ${result.spawnError}`);
    const flags = `${result.truncated ? ' · output truncated at budget' : ''}${result.killedByBudget ? ' · killed at timeout budget' : ''}`;
    if (result.exitCode !== 0 || result.killedByBudget) {
      const verdict = gitVerdict(result.stdout, result.stderr);
      return { ok: false, detail: `git.log → exit ${result.exitCode}: ${quoteVerdict(verdict)} · ${refusedNotAbsence('the repo has no commits')}${flags}`, exitCode: result.exitCode, count, commits: [], truncated: result.truncated };
    }
    const { commits, skipped } = parseGitLog(result.stdout);
    const top = commits[0];
    const detail = `git.log → exit 0: ${commits.length} commit(s)${top ? ` · newest ${top.hash} "${top.subject}"` : result.truncated ? ` · ${cutNotAbsence('the repository has no commits')}` : ' (empty log)'}${skipped > 0 ? ` · ${skipped} line(s) without a hash, counted not guessed` : ''}${flags}`;
    return { ok: true, detail, exitCode: 0, count, commits, ...(skipped > 0 ? { skipped } : {}), truncated: result.truncated };
  });
  return registry;
}
