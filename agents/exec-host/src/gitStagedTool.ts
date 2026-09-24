import type { ExecPolicy, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import { budgetFlags, GIT_DIFF_FLAGS, GIT_ENV_NAMES, cutNotAbsence, gitEnv, gitVerdict, isDiffHeaderPairLine, parseDiffHeader, parseDiffStat, parseFileLine, pathShapeNotices, quoteVerdict, refusedNotAbsence, unmergedNotAbsence, unmergedNotice, stdoutWasCut, unwrapRendering } from './gitTools.js';
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
  /**
   * M2 v61 (ADR 0016 amendment 61): the pre-image name of a staged rename/copy, from git's own
   * `rename from`/`copy from` metadata line. v43 already READ those lines to name the kind and then
   * threw the value away, so the intent window showed one name for a change that has two — and the
   * name it kept is the one HEAD does not have yet.
   */
  fromPath?: string;
  /** M2 v61: this path is git's C-QUOTED RENDERING, not the bytes on disk. */
  quoted?: boolean;
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
 * `deleted file mode`, `rename to`), never from guesswork; and v64 corrects the last half of that
 * sentence — a `---`/`+++` line is metadata ONLY in the pair git prints before the first `@@`, because
 * after it every line is content and a deleted line reading `-- a/x` arrives as `--- a/x`.
 *
 * M2 v61 (ADR 0016 amendment 61) keeps the two halves of what git already said: a `rename from`
 * line decided the KIND and its name was thrown away, so the intent window showed a rename under the
 * one name HEAD does not have yet; and the header matcher demanded git's PLAIN `diff --git a/x b/x`
 * form, so a C-quoted header — which git emits for any name it will not print raw — lost the file
 * entirely, and a door that parsed no files told the §28 reviewer the index was EMPTY. Both halves
 * of that second bug now live in `parseDiffHeader`, shared with the worktree door, and a section's
 * name is taken from git's per-line `+++ b/…` (or `rename to`/`copy to`, for a rename too pure to
 * carry a body) WHEREVER THAT LINE IS STILL A NAME — because the header has to be split by POSITION, a
 * path containing ` b/` steals that split, and v64 found the other position error: past the first `@@`
 * the same shape is a changed line, not a name. Measured; see the proof's §3.
 */
export function parseStagedDiff(stdout: string): StagedIndex {
  const files: StagedFileChange[] = [];
  let current: StagedFileChange | null = null;
  let insideHunk = false; // v64: the pair that names a file exists only before this flag turns on
  for (const line of stdout.split('\n')) {
    const header = parseDiffHeader(line); // v61: the same matcher reads git's plain AND C-quoted headers
    if (header) {
      current = { path: header.to, change: 'modified', hunks: 0, additions: 0, deletions: 0, addedLines: [], binary: false };
      if (header.quoted) current.quoted = true;
      files.push(current);
      insideHunk = false;
      continue;
    }
    if (!current) continue; // a preamble before the first file is not a change
    if (isDiffHeaderPairLine(line, insideHunk)) {
      const named = parseFileLine(line); // v61: git's per-line name beats a header whose split a ` b/` stole
      if (named) {
        current.path = named.path;
        if (named.quoted) current.quoted = true;
      }
      continue;
    }
    if (line.startsWith('new file mode')) current.change = 'added';
    else if (line.startsWith('deleted file mode')) current.change = 'deleted';
    else if (line.startsWith('rename from ')) {
      current.change = 'renamed';
      current.fromPath = line.slice('rename from '.length); // v61: the kind was read from this line and the name dropped
    } else if (line.startsWith('rename to ') || line.startsWith('copy to ')) {
      current.path = line.slice(line.startsWith('rename') ? 'rename to '.length : 'copy to '.length); // v61: a pure rename carries no `+++` line, so THIS one names it
    } else if (line.startsWith('copy from ')) {
      current.change = 'copied';
      current.fromPath = line.slice('copy from '.length);
    } else if (line.startsWith('Binary files') && line.endsWith(' differ')) current.binary = true;
    else if (line.startsWith('@@')) {
      insideHunk = true;
      current.hunks += 1;
    } else if (line.startsWith('+')) {
      current.additions += 1;
      current.addedLines.push(line.slice(1)); // v64: inside a hunk git's own one-character prefix is the whole difference between content and metadata
    } else if (line.startsWith('-')) current.deletions += 1;
  }
  const counts: Partial<Record<StagedChangeKind, number>> = {};
  // v61: the body lines above are git's own words, taken verbatim — so they go through the same one rule
  // as every other name this package reads: unwrap what git merely quoted, announce what git escaped.
  for (const f of files) {
    const p = unwrapRendering(f.path);
    f.path = p.name;
    const from = f.fromPath === undefined ? undefined : unwrapRendering(f.fromPath);
    if (from !== undefined) f.fromPath = from.name;
    if (p.quoted || (from?.quoted ?? false)) f.quoted = true;
  }
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
        : `git.staged → exit 0: index holds ${index.totals.files} change(s): ${tally} · +${index.totals.additions} −${index.totals.deletions} across ${index.totals.hunks} hunk(s)${index.totals.binary > 0 ? ` · ${index.totals.binary} binary change(s) with no lines claimed` : ''}${pathShapeNotices(index.files)}${flags(result)}`;
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
