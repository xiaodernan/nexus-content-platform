import type { ExecPolicy, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import { budgetFlags, diffWindowNotice, GIT_DIFF_FLAGS, GIT_ENV_NAMES, cutNotAbsence, gitEnv, gitVerdict, isDiffHeaderPairLine, parseDiffHeader, parseDiffStat, parseFileLine, pathShapeNotices, quoteVerdict, refusedNotAbsence, unmergedNotAbsence, unmergedNotice, unnamableDiffSections, unnamableSectionsNotice, stdoutWasCut, unwrapRendering } from './gitTools.js';
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
 *
 * M2 v65 (ADR 0016 amendment 65) found the SAME costume on a different key. This door's whole answer
 * is built from naming files, and four repo config keys decide whether git prints the `a/`/`b/` the
 * naming rule strips — with one of them set, git exited 0, printed its normal sections, and this door
 * said `the index is EMPTY — nothing is staged` about an index git's own footer called `4 files
 * changed`. The shapes therefore now OWN the prefixes (`--src-prefix=a/ --dst-prefix=b/`, which
 * outranks any config file), and — because a door cannot enumerate the renderings that do not exist
 * yet — the emptiness claim runs through v65's section census: sections git printed that this door
 * could not name are quoted and counted, never silently folded into "nothing is staged".
 *
 * M2 v66 (ADR 0016 amendment 66) is the same door on the OTHER way a read comes back short. v43 built
 * this window for a human at §28, and the whole answer is a COUNT — so when the output budget trims the
 * diff, the count is of what survived. Measured (index of 25 changes, git's footer `25 files changed,
 * 75 insertions(+), 75 deletions(-)`): a budget keeping 8 sections made this door answer `index holds
 * 8 change(s): 8 modified · +24 −24 across 24 hunk(s)`, and 774 of that diff's 776 line boundaries
 * produced some sentence of that shape. v63 wrote the rule for `git.status` and it never reached here;
 * now the tally says `AT LEAST`, and `diffWindowNotice` names the change the cut landed inside.
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
    if (line.startsWith('diff --git ')) {
      // v65: an unnameable section still ENDS the one being read. Left open, git's next `---`/`+++`/`@@`
      // pair and every content line under it were counted into the PREVIOUS file (measured: a 2-line
      // added file plus an unread section printed "+5 −1 across 2 hunk(s)"), so the tally would be wrong
      // as well as short — and a wrong tally is the answer a §28 reviewer cannot check.
      current = null;
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
      `Read what the HUMAN staged, through the confined exec host (\`git diff ${GIT_DIFF_FLAGS.join(' ')} --cached\`, or the same plus \`--stat\` — the only two argv the policy allows; no paths, no other flags). Plain git.diff cannot see staged content, so this is the pre-commit intent window: an index this door could read and name is stated as empty, one it could not name is stated as unread, and one the output budget trimmed is stated as a FLOOR rather than a count of the index (see diffWindowNotice). Read-only, but a real process spawns, so the §28 checkpoint applies.`,
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
      // v66: the stat face's ONLY window hole is the zero — an emptied read parses to `{0,0,0}` because
      // `parseDiffStat` is honest about a genuinely empty diff, and here there was nothing to be honest
      // about. A surviving footer is git's own arithmetic over the whole body (see diffWindowNotice),
      // so a non-zero stat tally gets no window clause.
      const detail = summary !== null && summary.files === 0 && stdoutWasCut(result)
        ? `git.staged --stat → exit 0: ${cutNotAbsence('the index holds nothing staged for the §28 ask')}${flags(result)}`
        : summary
          ? `git.staged --stat → exit 0: index holds ${summary.files} file(s) · +${summary.insertions} −${summary.deletions}${notice.length > 0 ? ` · ${unmergedNotAbsence(notice)}` : ''}${flags(result)}`
          : `git.staged --stat → exit 0: git printed no stat footer — stated, not guessed${notice.length > 0 ? ` · ${unmergedNotAbsence(notice)}` : ''}${flags(result)}`;
      return { ok: true, detail, exitCode: 0, stat: true, mode: 'stat', summary, text: result.stdout, truncated: result.truncated };
    }
    const index = parseStagedDiff(result.stdout);
    const notice = unmergedNotice(result.stdout);
    const unnamable = unnamableDiffSections(result.stdout); // v65: git's own section count, read without naming anything
    const windowed = stdoutWasCut(result); // v66: the budget may have trimmed THIS diff, and then so is every count below
    const last = index.files.at(-1);
    const tally = tallyStagedCounts(index.counts);
    const detail =
      index.files.length === 0
        ? notice.length > 0
          ? `git.staged → exit 0: ${unmergedNotAbsence(notice)} — the index is NOT empty, and a granted git.commit right now would be refused by git itself${flags(result)}`
          : unnamable.length > 0
            ? `git.staged → exit 0: ${unnamableSectionsNotice(unnamable)} · this door named 0 of them, so it cannot tell the §28 reviewer WHAT is staged — and it certainly cannot say the index is empty${flags(result)}`
            : stdoutWasCut(result)
              ? `git.staged → exit 0: ${cutNotAbsence('the index has nothing staged for the §28 ask')}${flags(result)}`
              : `git.staged → exit 0: the index is EMPTY — nothing is staged, so a granted git.commit right now would have nothing to record${flags(result)}`
        : `git.staged → exit 0: index holds ${windowed ? 'AT LEAST ' : ''}${index.totals.files} change(s): ${tally} · +${index.totals.additions} −${index.totals.deletions} across ${index.totals.hunks} hunk(s)${index.totals.binary > 0 ? ` · ${index.totals.binary} binary change(s) with no lines claimed` : ''}${unnamable.length > 0 ? ` · ${unnamableSectionsNotice(unnamable)}` : ''}${diffWindowNotice({ window: windowed, subject: 'the index — what a granted git.commit would record', named: index.totals.files, ...(last ? { partial: { path: last.path, additions: last.additions, deletions: last.deletions } } : {}) })}${pathShapeNotices(index.files)}${flags(result)}`;
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
