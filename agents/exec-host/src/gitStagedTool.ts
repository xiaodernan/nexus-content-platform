import type { ExecPolicy, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import { budgetFlags, GIT_DIFF_FLAGS, GIT_ENV_NAMES, cutNotAbsence, gitEnv, gitVerdict, parseDiffStat, quoteVerdict, refusedNotAbsence, unmergedNotAbsence, unmergedNotice, stdoutWasCut } from './gitTools.js';
import type { ExecHost, ExecRunResult } from './execHost.js';

/**
 * M2 v43 (ADR 0016 amendment 43): reading the HUMAN'S INTENT — what sits in the index.
 * v32's read-only door cannot see it: plain `git diff` compares the working tree to the
 * index, so a change the human has STAGED shows as NOTHING. And since §9/§28 keep staging
 * a human act while v35's `git.commit` records exactly that staged index, the agent was
 * being asked to commit contents it had no way to read. This tool opens that window:
 * `git diff --cached`, two exact argv shapes, no paths, no flags — deliberately narrow,
 * because `git diff` gains powers from options this policy will never name: `--ext-diff`
 * and `--textconv` make git EXECUTE a configured helper (code execution wearing a read-only
 * costume), `--output=<file>` makes a "read" WRITE. Still read-only, still a real process,
 * so §28 still gates it.
 *
 * M2 v46 (ADR 0016 amendment 46) finished that sentence: refusing to NAME `--ext-diff`
 * does not stop a repository whose own `.git/config` already sets `diff.external` — git
 * then runs the helper for a shape this policy invented, and hands back an EMPTY diff with
 * exit 0. So the shapes now carry the negations (`--no-ext-diff --no-textconv`) and the
 * spawn runs under the pinned environment from gitEnvIsolation.ts.
 */
export function gitStagedPolicy(root: string, options: { timeoutMs?: number; maxOutputBytes?: number } = {}): ExecPolicy {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxOutputBytes = options.maxOutputBytes ?? 65_536;
  return {
    root,
    allow: [
      { argv: ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached'], timeoutMs, maxOutputBytes },
      { argv: ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached', '--stat'], timeoutMs, maxOutputBytes },
    ],
    envAllow: GIT_ENV_NAMES,
    maxTimeoutMs: timeoutMs,
    maxOutputBytes,
  };
}

export type StagedChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';

/** The order the tally is spoken in — first-seen order would make the sentence jitter. */
export const STAGED_CHANGE_ORDER: StagedChangeKind[] = ['added', 'modified', 'deleted', 'renamed', 'copied'];

export interface StagedFileChange {
  path: string;
  change: StagedChangeKind;
  hunks: number;
  additions: number;
  deletions: number;
  /** Lines the index ADDS at this path, marker stripped — for a staged new file, the content as it will be recorded. */
  addedLines: string[];
  /** git printed "Binary files … differ" instead of hunks: no lines may be claimed (§60). */
  binary: boolean;
}

export interface StagedIndex {
  files: StagedFileChange[];
  counts: Partial<Record<StagedChangeKind, number>>;
  totals: { files: number; hunks: number; additions: number; deletions: number; binary: number };
}

/**
 * The index's diff text → per-file CHANGE KIND, line tallies and added lines. v42's
 * `parseShowDiff` reads ONE file's diff body; the whole index is several such bodies back to
 * back, and the question here is different: which files is the human about to record, and
 * which kind of change is each. Kind comes from git's own metadata lines (`new file mode`,
 * `deleted file mode`, `rename to`), never from guesswork; header lines (`---`/`+++`) are
 * never content.
 */
export function parseStagedDiff(stdout: string): StagedIndex {
  const files: StagedFileChange[] = [];
  let current: StagedFileChange | null = null;
  for (const line of stdout.split('\n')) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (header) {
      current = { path: header[2]!, change: 'modified', hunks: 0, additions: 0, deletions: 0, addedLines: [], binary: false };
      files.push(current);
      continue;
    }
    if (!current) continue; // a preamble before the first file is not a change
    if (line.startsWith('new file mode')) current.change = 'added';
    else if (line.startsWith('deleted file mode')) current.change = 'deleted';
    else if (line.startsWith('rename from ')) current.change = 'renamed';
    else if (line.startsWith('copy from ')) current.change = 'copied';
    else if (line.startsWith('Binary files') && line.endsWith(' differ')) current.binary = true;
    else if (line.startsWith('@@')) current.hunks += 1;
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions += 1;
      current.addedLines.push(line.slice(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) current.deletions += 1;
  }
  const counts: Partial<Record<StagedChangeKind, number>> = {};
  const totals = files.reduce(
    (t, f) => {
      counts[f.change] = (counts[f.change] ?? 0) + 1;
      return { files: t.files + 1, hunks: t.hunks + f.hunks, additions: t.additions + f.additions, deletions: t.deletions + f.deletions, binary: t.binary + (f.binary ? 1 : 0) };
    },
    { files: 0, hunks: 0, additions: 0, deletions: 0, binary: 0 }
  );
  return { files, counts, totals };
}

/** "1 added, 1 modified" in canonical order — only the kinds actually present are spoken. */
export function tallyStagedCounts(counts: Partial<Record<StagedChangeKind, number>>): string {
  const parts = STAGED_CHANGE_ORDER.filter((k) => (counts[k] ?? 0) > 0).map((k) => `${counts[k]} ${k}`);
  return parts.join(', ');
}

export const GIT_STAGED_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'git.staged',
    description:
      'Read what the HUMAN staged, through the confined exec host (`git diff --no-ext-diff --no-textconv --cached`, or the same plus `--stat` — the only two argv the policy allows; no paths, no other flags). Plain git.diff cannot see staged content, so this is the pre-commit intent window: an empty index is stated as such. Read-only, but a real process spawns, so the §28 checkpoint applies.',
    permissions: ['exec'],
    args: [
      { name: 'stat', type: 'boolean' },
      { name: 'cwd', type: 'string' },
    ],
  },
];

export function registerGitStagedTool(registry: ToolRegistry, host: ExecHost, options: { env?: Record<string, string> } = {}): ToolRegistry {
  const env = gitEnv(options.env ?? process.env); // v46: whatever the caller needs, PLUS the isolation — a caller cannot opt out
  const flags = budgetFlags; // v56: the ONE budget sentence, naming the pipe that was cut

  registry.register(GIT_STAGED_TOOL_SPECS[0]!, async (args) => {
    const stat = args.stat === true;
    const result: ExecRunResult = await host.run({ argv: stat ? ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached', '--stat'] : ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached'], cwd: args.cwd, env }, { preApproved: true }); // the registry's exec gate is the one §28 checkpoint
    if (!result.ran) throw new Error(result.reason || 'run refused');
    if (result.spawnError !== '') throw new Error(`spawn failed: ${result.spawnError}`);
    if (result.exitCode !== 0 || result.killedByBudget) {
      const verdict = gitVerdict(result.stdout, result.stderr, { truncated: result.truncated || result.killedByBudget });
      return { ok: false, detail: `git.staged → exit ${result.exitCode}: ${quoteVerdict(verdict)} · ${refusedNotAbsence('the index holds nothing staged for the §28 ask')}${flags(result)}`, exitCode: result.exitCode, stat, files: [], truncated: result.truncated };
    }
    if (stat) {
      const summary = parseDiffStat(result.stdout);
      const notice = unmergedNotice(result.stdout);
      const detail = summary
        ? `git.staged --stat → exit 0: index holds ${summary.files} file(s) · +${summary.insertions} −${summary.deletions}${notice.length > 0 ? ` · ${unmergedNotAbsence(notice)}` : ''}${flags(result)}`
        : `git.staged --stat → exit 0: git printed no stat footer — stated, not guessed${notice.length > 0 ? ` · ${unmergedNotAbsence(notice)}` : ''}${flags(result)}`;
      return { ok: true, detail, exitCode: 0, stat: true, mode: 'stat', summary, text: result.stdout, truncated: result.truncated };
    }
    const index = parseStagedDiff(result.stdout);
    const notice = unmergedNotice(result.stdout);
    const tally = tallyStagedCounts(index.counts);
    const detail =
      index.files.length === 0
        ? notice.length > 0
          ? `git.staged → exit 0: ${unmergedNotAbsence(notice)} — the index is NOT empty, and a granted git.commit right now would be refused by git itself${flags(result)}`
          : stdoutWasCut(result)
            ? `git.staged → exit 0: ${cutNotAbsence('the index has nothing staged for the §28 ask')}${flags(result)}`
            : `git.staged → exit 0: the index is EMPTY — nothing is staged, so a granted git.commit right now would have nothing to record${flags(result)}`
        : `git.staged → exit 0: index holds ${index.totals.files} change(s): ${tally} · +${index.totals.additions} −${index.totals.deletions} across ${index.totals.hunks} hunk(s)${index.totals.binary > 0 ? ` · ${index.totals.binary} binary change(s) with no lines claimed` : ''}${flags(result)}`;
    return {
      ok: true,
      detail,
      exitCode: 0,
      stat: false,
      mode: 'full',
      ...index,
      paths: index.files.map((f) => f.path),
      text: result.stdout,
      truncated: result.truncated,
    };
  });
  return registry;
}
