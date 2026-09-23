import type { ExecPolicy, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import { GIT_ENV_NAMES, gitEnv, gitVerdict, quoteVerdict } from './gitTools.js';
import type { ExecHost, ExecRunResult } from './execHost.js';

/**
 * M2 v35 (ADR 0016 amendment 35): the git COMMIT write tool — v32's deliberately
 * deferred other half, as its own separately-gated §28 slice. The agent may RECORD a
 * commit, but only what the human already staged: the policy allows exactly ONE argv
 * shape, `git commit -m <message>`. There is no `add`, no `push`, no extra flag — this
 * is also the first production use of the '*' wildcard in an ARG position: the shape is
 * fixed and only the message floats, and because argv is data (shell:false) a message
 * with spaces, quotes or newlines stays ONE verbatim token.
 */
export function gitCommitPolicy(root: string, options: { timeoutMs?: number; maxOutputBytes?: number } = {}): ExecPolicy {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxOutputBytes = options.maxOutputBytes ?? 65_536;
  return {
    root,
    allow: [{ argv: ['git', 'commit', '-m', '*'], timeoutMs, maxOutputBytes }],
    envAllow: GIT_ENV_NAMES,
    maxTimeoutMs: timeoutMs,
    maxOutputBytes,
  };
}

export interface GitCommitRecord {
  branch: string;
  hash: string;
  rootCommit: boolean;
  /** First line of the message as git echoed it (bodies may wrap; the FULL text is in the request). */
  subject: string;
  stat: { files: number; insertions: number; deletions: number } | null;
}

/** `git commit` stdout: `[branch hash] subject` + `N files changed, …` (mode lines follow the stat). */
export function parseCommitOutput(stdout: string): GitCommitRecord | null {
  const lines = stdout.split('\n');
  const first = lines[0] ?? '';
  const ref = /^\[(\S+?)(?: \(root-commit\))? ([0-9a-f]{4,})\](?: (.*))?$/.exec(first);
  if (!ref) return null;
  let stat: GitCommitRecord['stat'] = null;
  for (const line of lines.slice(1)) {
    const m = /^\s*(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(line);
    if (m) {
      stat = { files: Number(m[1]), insertions: Number(m[2] ?? 0), deletions: Number(m[3] ?? 0) };
      break;
    }
  }
  return { branch: ref[1]!, rootCommit: first.includes(' (root-commit) '), hash: ref[2]!, subject: (ref[3] ?? '').trim(), stat };
}

export const GIT_COMMIT_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'git.commit',
    description:
      'Record a commit from the ALREADY-STAGED index via the confined exec host (`git commit -m <message>` — the only argv the policy allows; nothing is staged or pushed by this tool). This WRITES history: the §28 checkpoint is mandatory.',
    permissions: ['exec'],
    args: [
      { name: 'message', type: 'string', required: true },
      { name: 'cwd', type: 'string' },
    ],
  },
];

export function registerGitCommitTool(registry: ToolRegistry, host: ExecHost, options: { env?: Record<string, string> } = {}): ToolRegistry {
  const env = gitEnv(options.env ?? process.env); // v46: whatever the caller needs, PLUS the isolation — a caller cannot opt out
  registry.register(GIT_COMMIT_TOOL_SPECS[0]!, async (args) => {
    const message = typeof args.message === 'string' ? args.message.trim() : '';
    if (message === '') throw new Error('commit message must be a non-empty string (git needs something to say)');
    const result: ExecRunResult = await host.run({ argv: ['git', 'commit', '-m', message], cwd: args.cwd, env }, { preApproved: true }); // the registry's exec gate is the one §28 checkpoint
    if (!result.ran) throw new Error(result.reason || 'run refused');
    if (result.spawnError !== '') throw new Error(`spawn failed: ${result.spawnError}`);
    const flags = `${result.truncated ? ' · output truncated at budget' : ''}${result.killedByBudget ? ' · killed at timeout budget' : ''}`;
    if (result.exitCode !== 0 || result.killedByBudget) {
      const verdict = gitVerdict(result.stdout, result.stderr, { truncated: result.truncated || result.killedByBudget });
      return { ok: false, detail: `git.commit → exit ${result.exitCode}: ${quoteVerdict(verdict)}${flags}`, exitCode: result.exitCode, message, truncated: result.truncated };
    }
    const record = parseCommitOutput(result.stdout);
    const detail = record
      ? `git.commit → exit 0: ${record.branch}@${record.hash}${record.stat ? ` · ${record.stat.files} file(s) +${record.stat.insertions} −${record.stat.deletions}` : ''}${flags}`
      : `git.commit → exit 0: committed (git echoed no summary line — stated, not guessed)${flags}`;
    return { ok: true, detail, exitCode: 0, message, ...(record ? { record } : {}), truncated: result.truncated };
  });
  return registry;
}
