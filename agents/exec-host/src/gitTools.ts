import type { ExecPolicy, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import type { ExecHost, ExecRunResult } from './execHost.js';
import { GIT_ISOLATION_ENV_NAMES, GIT_PASS_THROUGH_ENV_NAMES, forcedConfigEnv, GIT_ISOLATION_ENV } from './gitEnvIsolation.js';

/**
 * M2 v32 (ADR 0016 amendment 32): READ-ONLY git awareness on the confined host.
 * The agent stack learns what the repo looks like (`git status --short`, `git diff`)
 * through the exact same policy + checkpoint + budget machinery as v30 — no shell,
 * fixed exact-argv allowlist, and §9 holds by construction: nothing in here can
 * write. The git COMMIT tool is deliberately NOT part of this slice.
 *
 * M2 v46 (ADR 0016 amendment 46) hardened both halves of that claim: the diff shapes
 * now carry `--no-ext-diff`/`--no-textconv`, and every door runs under the pinned
 * environment from gitEnvIsolation.ts.
 */

/** The diff flags that keep a READ from EXECUTING: a configured external diff or
 * gitattributes textconv filter is a third-party program, and git runs it with exit 0
 * while handing back an EMPTY diff — the worst answer a read-only door can give. */
export const GIT_DIFF_FLAGS = ['--no-ext-diff', '--no-textconv'];

/** The handful of vars git actually needs — shared with the v35 commit slice. */
export const GIT_ENV_NAMES = [...GIT_PASS_THROUGH_ENV_NAMES, ...GIT_ISOLATION_ENV_NAMES];

/**
 * M2 v48 (ADR 0016 amendment 48): since a cut stream is trimmed to its last WHOLE line, a tight
 * budget can leave NOTHING to parse. A door may say "0 entries" — a count of what it read — but it
 * may not assert that the repository/index/HEAD HAS nothing, because the reason it read nothing is
 * the budget. Doors that would otherwise phrase an absence route that sentence through here.
 */
export const cutNotAbsence = (what: string): string => `no complete line survived the output budget — this is NOT a statement that ${what}`;

/**
 * M2 v52 (ADR 0016 amendment 52): WHICH of git's own lines is its VERDICT — one rule, six doors.
 * Measured against real git across 11 failure states (`verdict-proof.mjs`): when git refuses, the
 * reason is the line it PREFIXED (`fatal:`/`error:`/`warning:`); when it prefixes nothing, its LAST
 * line is the actionable summary and its FIRST is a banner (`On branch master` then
 * `nothing to commit, working tree clean`). Every door used to quote line 1 of stderr-or-stdout, so
 * a §28 decision could be weighed on a banner, and the two read doors quoted nothing at all.
 */
export interface GitVerdict {
  /** git's own words, verbatim; empty when git printed none, or when the budget ate all of them */
  line: string;
  /** WHICH rule picked it — the sentence says so, because the rules differ in what they prove */
  rule: 'prefixed' | 'sole' | 'last' | 'none' | 'cut';
  /** how many non-empty lines survive in what the host handed back, across BOTH streams */
  lines: number;
}

/**
 * M2 v53: `truncated` is the host's own flag, and it changes what an EMPTY answer means. Without it
 * a door that lost every byte to a budget said "git printed no output at all" beside "output
 * truncated at budget" — two clauses that contradict each other, in the one sentence a §28 reviewer
 * reads. v48's `cutNotAbsence` already says this about a parsed tally; this says it about git's words.
 */
export function gitVerdict(stdout: string, stderr: string, options: { truncated?: boolean } = {}): GitVerdict {
  // stderr first: a conflicted commit puts its reason there and a status letter on stdout
  const lines = [...stderr.split('\n'), ...stdout.split('\n')].filter((l) => l.trim() !== '').map((l) => l.trim());
  const prefixed = lines.find((l) => /^(fatal|error|warning):/.test(l));
  if (prefixed !== undefined) return { line: prefixed, rule: 'prefixed', lines: lines.length };
  if (lines.length === 1) return { line: lines[0]!, rule: 'sole', lines: 1 };
  if (lines.length > 1) return { line: lines.at(-1)!, rule: 'last', lines: lines.length };
  if (options.truncated) return { line: '', rule: 'cut', lines: 0 };
  return { line: '', rule: 'none', lines: 0 };
}

/** The clause a door quotes: git's words, plus how much of git's output the quote is NOT. */
export function quoteVerdict(v: GitVerdict): string {
  if (v.rule === 'none') return 'git printed no output at all';
  if (v.rule === 'cut') return 'no WHOLE line survived the output budget — git may have printed more; this is NOT a statement that it said nothing';
  return v.lines > 1 ? `${v.line} · git's ${v.rule} line of the ${v.lines} it printed` : v.line;
}

/**
 * M2 v56 (ADR 0016 amendment 56): the ONE budget sentence every door appends, naming WHICH pipe was
 * actually cut. Before this, six doors each re-assembled the same two clauses from the aggregate
 * flag, so "output truncated at budget" appeared next to an answer that had arrived whole simply
 * because the noise stream overflowed.
 */
export const budgetFlags = (r: { truncated: boolean; truncatedStreams?: Array<'stdout' | 'stderr'>; killedByBudget: boolean }): string =>
  `${r.truncated ? ` · output truncated at budget${r.truncatedStreams && r.truncatedStreams.length > 0 ? ` (${r.truncatedStreams.join(' + ')})` : ''}` : ''}${r.killedByBudget ? ' · killed at timeout budget' : ''}`;

/**
 * M2 v56: was the stream this door PARSED the one that lost bytes? Absence of evidence is NOT read
 * as evidence of a cut — `stdoutWasCut` is false for a run that lost nothing, and v48's
 * `cutNotAbsence` / the `cut` verdict rule then fire only on the stream they describe.
 */
export const stdoutWasCut = (r: { truncatedStreams?: Array<'stdout' | 'stderr'> }): boolean => r.truncatedStreams?.includes('stdout') ?? false;

/**
 * M2 v52: the read doors' twin of v48's `cutNotAbsence`. A command that FAILED reads nothing for a
 * reason that says nothing about the repository — `git status` on a corrupt index exits 128 with an
 * EMPTY stdout, and "0 entries" is a count of what the door read, never a claim that the tree is
 * clean. Before this, both read doors answered a refusal with exactly such a tally.
 */
export const refusedNotAbsence = (what: string): string => `git REFUSED this command — this is NOT a statement that ${what}`;

/**
 * M2 v52: the OTHER way a door can be lied to by a success — git exits 0 and prints a NOTICE in place
 * of a diff. Measured in a conflicted repository (`verdict-proof.mjs` §5): `git diff --cached` says
 * `* Unmerged path file.md` and nothing else, `git diff --cached --stat` says ` file.md | Unmerged`
 * then ` 0 files changed`, and plain `git diff` emits a COMBINED `diff --cc file.md` body that the
 * v32 parser finds no `diff --git` header for. Every one of those parses to ZERO — and a door that
 * reads zero as "nothing here" states the exact opposite of what git meant (an unmerged path is the
 * one thing a granted `git.commit` cannot record). Doors that diff therefore name the notice.
 */
export function unmergedNotice(stdout: string): string[] {
  const paths = new Set<string>();
  for (const line of stdout.split('\n')) {
    for (const re of [/^\*\s+Unmerged path\s+(.+)$/, /^(.+?)\s*\|\s*Unmerged$/, /^diff --cc (.+)$/]) {
      const m = re.exec(line);
      if (m?.[1]) paths.add(m[1].trim());
    }
  }
  return [...paths].sort();
}

export const unmergedNotAbsence = (paths: string[]): string =>
  `git reported ${paths.length} UNMERGED path(s) (${paths.join(', ')}) instead of a diff — a conflicted index, so a zero tally here is NOT a statement that nothing changed`;

/** The three commands this policy knows, and NOTHING else (default-deny). */
export function gitReadOnlyPolicy(root: string, options: { timeoutMs?: number; maxOutputBytes?: number } = {}): ExecPolicy {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxOutputBytes = options.maxOutputBytes ?? 65_536;
  return {
    root,
    allow: [
      { argv: ['git', 'status', '--short'], timeoutMs, maxOutputBytes },
      { argv: ['git', 'diff', ...GIT_DIFF_FLAGS], timeoutMs, maxOutputBytes },
      { argv: ['git', 'diff', ...GIT_DIFF_FLAGS, '--stat'], timeoutMs, maxOutputBytes },
    ],
    envAllow: GIT_ENV_NAMES,
    maxTimeoutMs: timeoutMs,
    maxOutputBytes,
  };
}

/** Pick the few vars git actually needs out of an env source (default: this process). */
export function gitEnv(source: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of GIT_PASS_THROUGH_ENV_NAMES) if (typeof source[k] === 'string') env[k] = source[k];
  return Object.assign(env, GIT_ISOLATION_ENV, forcedConfigEnv());
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
    description: 'Read-only change awareness: `git diff --no-ext-diff --no-textconv` (per-file line tallies) or the same shape plus `--stat` (summary) through the confined exec host. Exact argv only — no paths, no shell, and no external diff driver (see gitEnvIsolation).',
    permissions: ['exec'],
    args: [
      { name: 'stat', type: 'boolean' },
      { name: 'cwd', type: 'string' },
    ],
  },
];

export function registerGitTools(registry: ToolRegistry, host: ExecHost, options: { env?: Record<string, string> } = {}): ToolRegistry {
  const env = gitEnv(options.env ?? process.env); // v46: whatever the caller needs, PLUS the isolation — a caller cannot opt out
  const runGit = async (argv: string[], cwd: unknown): Promise<ExecRunResult> => {
    const result = await host.run({ argv, cwd, env }, { preApproved: true }); // the registry's exec gate is the one §28 checkpoint
    if (!result.ran) throw new Error(result.reason || 'run refused');
    if (result.spawnError !== '') throw new Error(`spawn failed: ${result.spawnError}`);
    return result;
  };
  const flags = budgetFlags; // v56: ONE sentence for every door, naming the stream that was cut

  registry.register(GIT_TOOL_SPECS[0]!, async (args) => {
    const result = await runGit(['git', 'status', '--short'], args.cwd);
    const { files, counts } = parseGitStatus(result.stdout);
    const ok = result.exitCode === 0 && !result.killedByBudget;
    const tally = Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ');
    const detail = ok
      ? `git.status → exit ${result.exitCode}: ${files.length} entries${tally === '' ? '' : ` (${tally})`}${flags(result)}`
      : `git.status → exit ${result.exitCode}: ${quoteVerdict(gitVerdict(result.stdout, result.stderr, { truncated: result.truncated || result.killedByBudget }))} · ${files.length} entries parsed · ${refusedNotAbsence('the working tree is clean or empty')}${flags(result)}`;
    return { ok, detail, exitCode: result.exitCode, files, counts, truncated: result.truncated };
  });

  registry.register(GIT_TOOL_SPECS[1]!, async (args) => {
    const stat = args.stat === true;
    const result = await runGit(stat ? ['git', 'diff', ...GIT_DIFF_FLAGS, '--stat'] : ['git', 'diff', ...GIT_DIFF_FLAGS], args.cwd);
    const ok = result.exitCode === 0 && !result.killedByBudget;
    if (stat) {
      const summary = parseDiffStat(result.stdout);
      const notice = unmergedNotice(result.stdout);
      const parsed = summary ? `${summary.files} files, +${summary.insertions} −${summary.deletions}` : 'unparseable stat footer';
      const mention = notice.length > 0 ? ` · ${unmergedNotAbsence(notice)}` : '';
      const detail = ok
        ? `git.diff --stat → exit 0: ${parsed}${mention}${flags(result)}`
        : `git.diff --stat → exit ${result.exitCode}: ${quoteVerdict(gitVerdict(result.stdout, result.stderr, { truncated: result.truncated || result.killedByBudget }))} · ${parsed} · ${refusedNotAbsence('nothing changed')}${flags(result)}`;
      return { ok, detail, exitCode: result.exitCode, mode: 'stat', summary, text: result.stdout, truncated: result.truncated };
    }
    const { files, totals } = parseGitDiff(result.stdout);
    const notice = unmergedNotice(result.stdout);
    const tally = `${totals.files} files, +${totals.additions} −${totals.deletions} (${totals.hunks} hunks)`;
    const detail = ok
      ? `git.diff → exit 0: ${tally}${notice.length > 0 ? ` · ${unmergedNotAbsence(notice)}` : ''}${flags(result)}`
      : `git.diff → exit ${result.exitCode}: ${quoteVerdict(gitVerdict(result.stdout, result.stderr, { truncated: result.truncated || result.killedByBudget }))} · ${tally} · ${refusedNotAbsence('the tree has no changes')}${flags(result)}`;
    return { ok, detail, exitCode: result.exitCode, mode: 'full', files, totals, truncated: result.truncated };
  });

  return registry;
}
