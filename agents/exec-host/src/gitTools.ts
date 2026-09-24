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
 *
 * M2 v65 (ADR 0016 amendment 65) hardened the third half, which nobody had counted: what those shapes
 * PRINT. A repository's own `diff.noprefix`/`diff.mnemonicPrefix`/`diff.srcPrefix`/`diff.dstPrefix`
 * deletes or replaces the `a/`/`b/` that every diff reader here strips to name a file, and the doors
 * then parse zero files out of a diff git printed in full — with exit 0. The shapes now say the
 * prefixes, and the parsers count git's `diff --git` sections separately from the names they could
 * attach them to, so a rendering this package cannot read is stated as unread rather than as absent.
 *
 * M2 v66 (ADR 0016 amendment 66) is about the read that IS understood and still does not reach the door:
 * the output budget. v63 made `git.status` say so; the three DIFF doors never got the rule, so a window
 * was spoken as a census (`index holds 8 change(s)` for 25, `1 files, +0 −0` for a file git counts at
 * +1 −1). `diffWindowNotice` is that one rule, shared now by `git.diff`, `git.staged` and `git.show`.
 */

/** The diff flags that keep a READ from EXECUTING: a configured external diff or
 * gitattributes textconv filter is a third-party program, and git runs it with exit 0
 * while handing back an EMPTY diff — the worst answer a read-only door can give.
 *
 * M2 v65 (ADR 0016 amendment 65) adds the other half of what a diff line MEANS. Every diff reader in
 * this package names a file by stripping git's `a/` and `b/` (v32 for the worktree, v43 for the index,
 * v61 for the quoted rendering) — and four repository config keys decide whether git prints them:
 * `diff.noprefix`, `diff.mnemonicPrefix` (`c/`/`i/`), `diff.srcPrefix`, `diff.dstPrefix`. Measured on
 * this box with each one set in `.git/config`, for a staged index holding a modified, a renamed, a
 * binary and a deleted file: git exited 0 and printed its normal 4 `diff --git` sections, and BOTH diff
 * doors parsed 0 files — `git.staged` answered `the index is EMPTY — nothing is staged`, about an index
 * git itself described two lines later as `4 files changed, 2 insertions(+)`. v61 already met that lie
 * through a QUOTED name; this is the same lie through an unprefixed one, and §28 sits on the answer.
 * The command line owns those prefixes: it outranks every config file, including the repo's own, which
 * is why `diff.external` was confined by the shape in v46 rather than by an env pin. Measured, the four
 * keys each restore `a/`/`b/` and the resulting bytes are IDENTICAL to a default-config repository
 * (sha-verified across the 4-shape fixture, including `git show`'s body), so the flags cost nothing
 * where no config exists — and unlike env pins they cover keys this box has not been taught to fear.
 */
export const GIT_DIFF_FLAGS = ['--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/'];

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
 * M2 v57: the third member of the "git said a thing the tally hides" family, for the door that
 * reports the WORKING TREE. `counts` is a census of entries; an unmerged entry is not a change the
 * index is ready to record, it is a stop sign — so the door names the paths rather than letting
 * "1 added" read like a commit waiting to happen.
 */
export const unmergedStatusNotice = (paths: string[]): string =>
  `git reported ${paths.length} UNMERGED path(s) (${paths.join(', ')}) — a conflicted working tree, so these entries are NOT a staged change and a granted git.commit right now would be refused by git itself`;

/**
 * M2 v61 (ADR 0016 amendment 61): is this string a PATH, or git's C-quoted PICTURE of one?
 * Measured on this box with v46's `core.quotePath=false` in place: whitespace ALONE makes git quote a
 * porcelain path (` M "plain name.md"`), so a quote is not by itself evidence of escaping — and every
 * character that genuinely needs escaping (`"`, a backslash, a control character, and any non-ASCII byte
 * when quotePath is left at git's default) escapes as a BACKSLASH sequence. That asymmetry is what
 * `unwrapRendering` turns into a rule.
 */
export const isQuotedRendering = (s: string): boolean => s.length > 2 && s.startsWith('"') && s.endsWith('"');

/**
 * M2 v61: git's rendering → the name, when and only when the rendering escaped nothing.
 * No backslash inside the quotes means git was quoting an ordinary name, so the bytes between the
 * quotes ARE the file — which matters because a repo with spaced filenames would otherwise hand every
 * entry to the reader unopenable, and `git.show` would refuse them all. A backslash means git was
 * escaping something, and this door will not guess at what: the rendering is kept and MARKED, so the
 * reader is told the name is a photograph rather than being handed a plausible-looking forgery.
 * Measured bound: on NTFS neither `"` nor `>` nor a tab can even be created in a filename (the proof
 * records the failed attempts), so the escaped branch is exercised by fixture here, not by a file.
 */
export function unwrapRendering(s: string): { name: string; quoted: boolean } {
  if (!isQuotedRendering(s)) return { name: s, quoted: false };
  const inner = s.slice(1, -1);
  if (inner.includes('\\')) return { name: s, quoted: true };
  return { name: inner, quoted: false };
}

/**
 * M2 v61: a rename is ONE change with TWO names, and only one of them is in HEAD. v32 kept the new
 * name and threw the old one away, so the door handed the agent a path and the agent took it to
 * `git.show` — which answers exit 0 with an EMPTY diff for a path HEAD has never heard of (measured:
 * 160 bytes under the old name, 0 under the new). The pair is therefore part of the answer.
 */
export const renamePairNotice = (pairs: Array<{ from: string; to: string }>): string =>
  `git.status carries ${pairs.length} rename/copy PAIR(s): ${pairs.map((p) => `${p.from} -> ${p.to}`).join(', ')} — the left name is what HEAD knows and the right name is what is on disk, so reading the pair through either name alone reports half the change`;

/**
 * M2 v61: the same warning for the entries this door could NOT turn back into a name — the residue after
 * `unwrapRendering`, which is only reached when git escaped something inside the quotes. Every character
 * it escapes (`"`, a backslash, a control character, non-ASCII under the default pin) is one the reader
 * would otherwise have to guess at.
 */
export const quotedPathNotice = (paths: string[]): string =>
  `${paths.length} path(s) arrive in git's C-QUOTED RENDERING with escapes inside (${paths.join(', ')}) — some character of the real name is NOT in this string: it will not open, will not match a pathspec, and must not be passed on as one`;

/**
 * M2 v61: `diff --git <pre> <post>` in EITHER rendering git uses — the plain `a/x b/x`, or the
 * C-quoted `"a/x" "b/x"` it falls back to for a name containing `"`, a backslash, a control
 * character or (before v61 pinned `core.quotePath=false`) any non-ASCII byte. v32's matcher required
 * the plain form, so a quoted name made the whole FILE vanish from the answer, and a door that
 * parsed no files declared the thing it was reading to be EMPTY — v52's lie-by-omission escalated
 * into a positive claim of absence. One matcher now serves both diff doors, and a rendering it
 * cannot unwrap is at least counted and named.
 */
const DIFF_HEADER = /^diff --git (?:"a\/(.*)"|a\/(.*)) (?:"b\/(.*)"|b\/(.*))$/;

/** The two names a diff section is about, and whether either reached us as an UNESCAPABLE rendering. */
export function parseDiffHeader(line: string): { from: string; to: string; quoted: boolean } | null {
  const m = DIFF_HEADER.exec(line);
  if (!m) return null;
  // groups 1/3 are the quoted form (the alternation ate the quotes, so they go back on); 2/4 are plain
  const from = unwrapRendering(m[1] !== undefined ? `"${m[1]}"` : (m[2] ?? ''));
  const to = unwrapRendering(m[3] !== undefined ? `"${m[3]}"` : (m[4] ?? ''));
  if (from.name === '' || to.name === '') return null; // a half-header names nothing
  return { from: from.name, to: to.name, quoted: from.quoted || to.quoted };
}

/**
 * M2 v61: `+++ b/p` names a path ONE LINE AT A TIME, which the header cannot promise. A header has to be
 * split by position, and `diff --git a/x.md b/m b/n.md` — a directory whose name ends in a space, which
 * NTFS allows and the proof creates — steals that split and yields a name that is two paths glued
 * together. Measured: git prints both forms for the same change, so wherever a per-line name exists it
 * wins. `/dev/null` is not a name, and a rendering that survives unwrapping stays verbatim and announced.
 *
 * M2 v64 (second clause): a per-line name may also carry a field git does not mean as part of the path.
 * Measured on this box — `git diff --cached` renaming `m b/spaced.md` to `m b/renamed.md` prints BOTH
 * `--- a/m b/spaced.md\t` and `+++ b/m b/renamed.md\t`, and `git show` prints the same trailing TAB on the
 * added path — while a name with no space (`+++ b/brand-new.md`), a `/dev/null` side, and a C-QUOTED name
 * (`+++ "b/caf\303\251.md"`) each carry no tab. The tab is the unified header's name/timestamp separator
 * with an empty second field; keeping it hands §28 a path that exists nowhere on disk — the same harm as
 * v61's stolen split, arrived at from the other direction. So an UNQUOTED name ends at its first TAB.
 * A POSIX filename may contain a tab, and this box cannot create one to measure it (`git mv` →
 * `fatal: renaming 'tabbed.md' failed: Invalid argument`); that is stated, not worked around — git's
 * C-quoted rendering of a control character would not reach this branch anyway.
 */
export function parseFileLine(line: string): { path: string; quoted: boolean } | null {
  const m = /^\+\+\+ (?:"b\/(.*)"|b\/(.*))$/.exec(line);
  if (!m) return null;
  // the quoted branch keeps its rendering; an unquoted name ends at git's TAB field separator
  const r = unwrapRendering(m[1] !== undefined ? `"${m[1]}"` : (m[2] ?? '').split('\t')[0] ?? '');
  if (r.name === '' || r.name === '/dev/null') return null; // a name of nothing is not a name either
  return { path: r.name, quoted: r.quoted };
}

/**
 * M2 v64: a `--- ` / `+++ ` line is git's NAMES, and only where git prints names — the one pair between a
 * file's `diff --git` header and its first `@@`. Inside a hunk every line is CONTENT, and a content line
 * that merely starts with `++` or `--` arrives as `+++ b/x` / `--- a/x`, indistinguishable from the pair by
 * shape alone. Measured on this box (worktree: `code.ts` loses a line reading `-- a/ghost.ts`, `notes.md`
 * gains one reading `++ b/second.md`, `plain.txt` gains `+++ b/fake…`): git's own shortstat says
 * `3 files changed, 2 insertions(+), 1 deletion(-)` and both door-shape readers said `+0 −0`, with
 * `notes.md` renamed to `second.md` — a path that exists nowhere. Shape cannot tell those two jobs apart;
 * POSITION can, so the matchers that name a file and the exception that hides a header both run on the
 * caller's side of the first `@@` and never after it.
 */
export const isDiffHeaderPairLine = (line: string, insideHunk: boolean): boolean =>
  !insideHunk && (line.startsWith('--- ') || line.startsWith('+++ '));

/**
 * M2 v65 (ADR 0016 amendment 65): the door's own census of git's STRUCTURE, taken WITHOUT reading a
 * name. `diff --git` is the one line whose only job is to say "a file's section begins here", so
 * counting it needs no prefix, no unwrapping and no position rule — which is exactly what makes it the
 * floor under every rendering bug. A reader that names 0 files while git printed 4 sections has not
 * discovered that the index is empty; it has failed to read. Doors that diff therefore compare the two
 * numbers and say so out loud: v65's prefix flags close the four keys measured on this box, and this
 * comparison is what stands between a future rendering and a door claiming an absence.
 *
 * Why refuse rather than guess the split? Measured in the same fixture: `[diff] noprefix = true` prints
 * `diff --git x.ts x.ts` and `[diff] srcPrefix = q/` alongside it prints `diff --git q/bin.dat b/bin.dat`
 * — one strip-two-characters reader returns `ts` for the first (a path that exists nowhere) and the
 * CORRECT `bin.dat` for the second, because there `q/` and `b/` happen to be two characters each. A rule
 * that is wrong on real input and right by luck on the next is worse than refusing, which is the v61
 * harm arriving from the other direction. So an unnamable section is counted, quoted verbatim, and left
 * unnamable.
 */
export const unnamableDiffSections = (stdout: string): string[] =>
  stdout.split('\n').filter((l) => l.startsWith('diff --git ')).filter((l) => parseDiffHeader(l) === null);

/** The sentence that goes with it — the same family as v48's cut and v52's refusal. */
export const unnamableSectionsNotice = (lines: string[]): string =>
  `git printed ${lines.length} diff section(s) whose header this door cannot split into two names (${lines.map((l) => `"${l}"`).join(', ')}) — those ARE changes and this door could not NAME them, so they are in no tally above and nothing in this answer states that the index or working tree holds nothing`;

/**
 * M2 v66 (ADR 0016 amendment 66): v63 wrote this rule for `git.status` and left it THERE, so the three
 * doors that read a DIFF went on speaking their tallies as censuses over a read the budget had trimmed.
 * Measured on this box (git 2.52) in a throwaway repo whose index holds 25 changes — git's own footer:
 * `25 files changed, 75 insertions(+), 75 deletions(-)`:
 * - a budget that keeps 8 of the 25 sections made `git.staged` answer `index holds 8 change(s): 8
 *   modified · +24 −24 across 24 hunk(s)`, and its only budget clause was v56's `output truncated at
 *   budget (stdout)` — a sentence that admits bytes were lost while the numbers go on meaning "the index".
 *   Over every line boundary of that diff: 774 of its 776 boundaries are cuts, and all 774 of them produced
 *   such a census-shaped answer (`cut-tally-proof.mjs` §3 drives every one; §2 prints the sentence above).
 * - `git.diff` said `1 files, +0 −0 (0 hunks)` about a file git counts at +1 −1, and `0 files, +0 −0
 *   (0 hunks)` about a 4-section, 2004-byte worktree diff — v48's `cutNotAbsence` was never wired into
 *   THIS door's zero, only into `git.show` and `git.staged`.
 * - `git.show` said `HEAD changed src/mod-09/a-long-file-name-9.ts · +12 −0` where git's own `--numstat`
 *   for that path is `60 0`; 59 of its 65 cut windows (that face has 67 line boundaries) short-count a file
 *   the door simultaneously says HEAD changed.
 * The harm is not that the count is small — it is that a small count is phrased as the repository's.
 * So the doors say what kind of number it is: `AT LEAST` on the count itself, and this sentence beside
 * it. The sentence can be specific because the shape of a diff read makes it so, and that shape was
 * checked rather than assumed (`cut-tally-proof.mjs` §4, and the exhaustive unit case): the host keeps a
 * PREFIX of whole lines (v48), a diff section ends where the next `diff --git` begins, so every change
 * named before the last one in a window is byte-complete — only the LAST can be cut short. A `--stat`
 * read is immune to short-counting for the same reason turned inside out: git's footer is its LAST line,
 * so any window holding it holds the whole body (measured over every line boundary of both stat bodies —
 * 27 and 6 lines — 2 and 2 windows parse a footer, and none of the four lacked any part of the read),
 * which is why this rule is not applied to a stat tally that names files — and why the stat faces' real
 * hole was the zero, handled by v48's rule.
 * A tally of ZERO gets no sentence here: the door's own 0-branch (v48's `cutNotAbsence`, v52's refusal)
 * is the sentence for it, and stacking both would say the same thing twice. The sentence also declines
 * to name a location it cannot see: only `git.show` may say the cut landed INSIDE the change it names,
 * because that read is confined to one path; a multi-section read's budget can expire at a section
 * boundary, so its door says the last change it reached MAY be the short one.
 */
export const diffWindowNotice = (read: {
  window: boolean;
  subject: string;
  named: number;
  partial?: { path: string; additions: number; deletions: number };
  /**
   * True only when the read CANNOT hold a second section — `git.show` names one path, so a cut that
   * left any line at all necessarily stopped inside that path's diff. A multi-section read may have
   * had its budget expire exactly at a section boundary, leaving the last change it named whole; a
   * door that cannot tell the two apart says MAY, not LANDED (§60).
   */
  cutIsInside?: boolean;
}): string => {
  if (!read.window || read.named === 0) return '';
  const p = read.partial;
  const whole = p === undefined || read.named <= 1 ? '' : ` · the ${read.named - 1} change(s) named before it are whole`;
  const where = p === undefined
    ? ''
    : read.cutIsInside
      ? ` · the cut landed inside ${p.path} (+${p.additions} −${p.deletions}), whose numbers stop where the read did`
      : ` · the last change the read reached is ${p.path} (+${p.additions} −${p.deletions}), whose numbers MAY stop where the read did`;
  return ` · the counts above are the changes and lines that SURVIVED the output budget — git printed more on that pipe, so this is a WINDOW on ${read.subject}, NOT a census of it${where}${whole}`;
};

/**
 * M2 v61: ONE sentence-pair for the doors that report parsed paths (`git.status`, `git.staged`),
 * the same way v52 gave every door one verdict rule and v56 one budget rule. A door that lists
 * entries owes the reader whatever those entries cannot say for themselves: a rename has two names,
 * and a rendering is not a path.
 */
export const pathShapeNotices = (entries: Array<{ path: string; fromPath?: string; quoted?: boolean }>): string => {
  const pairs = entries.filter((e) => e.fromPath !== undefined).map((e) => ({ from: e.fromPath!, to: e.path }));
  const rendered = entries.filter((e) => e.quoted).map((e) => e.path);
  return `${pairs.length > 0 ? ` · ${renamePairNotice(pairs)}` : ''}${rendered.length > 0 ? ` · ${quotedPathNotice(rendered)}` : ''}`;
};

/**
 * M2 v62: porcelain's two columns answer TWO different trees. v32 counted entries as one flat list,
 * so `git.status → 7 entries` where a granted `git.commit` records only 4. The notice names the split:
 * how many paths a commit WILL record (index differs from HEAD), how many it will NOT (worktree-only
 * or untracked), and how many are staged AND edited again (the `MM`/`AM` shape where the commit
 * records the index half but the disk half is still ahead).
 *
 * M2 v63: every number above is a count of entries THIS DOOR READ, and v48's budget decides how many
 * of git's lines survive to be read. Measured on this box (3 staged edits + 400 untracked files, so
 * git prints 403 porcelain lines): a 256-byte budget keeps 21 of them whole — the 3 staged rows plus
 * the first 18 untracked names, `u000.txt … u017.txt` — and before this amendment the door said
 * `git.commit records the INDEX: 3/21 entries differ from HEAD there`, a denominator that is a
 * window, phrased as a fact about the repository.
 * And when the cut left ONLY staged rows, `stagedCount === files.length` fired v62's silence rule and
 * the door said nothing at all about a tree with 400 unseen untracked files.
 * So `window` carries the read back in: v56's `stdoutWasCut` says git printed MORE on the very pipe
 * this door parses, and then the entries in hand are only what survived the cut. Under it the counts
 * become explicit window counts and the silence is replaced by a sentence — the same rule v48 wrote
 * for a tally and v52 for git's verdict, now applied to v62's ratio. A read the timeout STOPPED never
 * gets here: `killedByBudget` fails the door's `ok`, so that answer is already v52's refusal sentence.
 */
export const treeSplitNotice = (files: GitStatusFile[], read: { window?: boolean } = {}): string => {
  const cut = read.window === true;
  const stagedCount = files.filter((f) => f.staged === true).length;
  const dirtyOnly = files.filter((f) => f.staged !== true && f.dirty === true);
  const untracked = files.filter((f) => f.status === 'untracked');
  const worktreeSide = dirtyOnly.length + untracked.length;
  const both = files.filter((f) => f.staged === true && f.dirty === true);
  if (stagedCount === 0 && worktreeSide === 0) return '';
  if (stagedCount === files.length) {
    // v62: a wholly-staged list has no split to report. v63: that is only true of a COMPLETE read.
    return cut
      ? ` · all ${files.length} entries this door read differ from HEAD in the index · the read was CUT at the budget, so this is NOT a statement that nothing unstaged or untracked exists behind it`
      : '';
  }
  const parts: string[] = [];
  parts.push(`git.commit records the INDEX: ${stagedCount}/${files.length} ${cut ? 'entries this door READ differ from HEAD there' : 'entries differ from HEAD there'}`);
  if (worktreeSide > 0) {
    const names = [...dirtyOnly.map((f) => f.path), ...untracked.map((f) => f.path)];
    parts.push(`${worktreeSide} worktree-side/untracked${cut ? ' read' : ''} (${names.join(', ')}) a granted commit records NONE of`);
  }
  if (both.length > 0) {
    parts.push(`${both.length} staged AND edited again on disk (${both.map((f) => f.path).join(', ')})`);
  }
  if (cut) parts.push('the read was CUT at the budget: these are the entries that survived, NOT a census of the repository — whatever git printed after the cut is unnamed here');
  return ` · ${parts.join(' · ')}`;
};

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
  /**
   * M2 v61: the OTHER half of a rename/copy — the name HEAD knows. Present only on a `R`/`C`
   * entry that git printed as `old -> new`; v32 dropped it, which is how a rename reached
   * `git.show` as a bare new path and came back looking like an absent file.
   */
  fromPath?: string;
  /** M2 v61: this path is git's C-QUOTED RENDERING, not the bytes on disk (see quotedPathNotice). */
  quoted?: boolean;
  /**
   * M2 v62: column X says the INDEX differs from HEAD — `git.commit` will record this path.
   * Present only when true; absent means X is blank or the row is unmerged.
   */
  staged?: true;
  /**
   * M2 v62: column Y says the WORKTREE differs from the index — a granted commit records
   * NONE of this half. Present only when true.
   */
  dirty?: true;
}

/**
 * M2 v57 (ADR 0016 amendment 57): the seven porcelain codes git's own spec calls UNMERGED. v32's
 * table matched a substring per row, which got `UU`/`AU`/`UA`/`DU`/`UD` right but let `AA` fall to
 * the `A` row and `DD` to the `D` row. Measured on a real add/add merge: `git status --short` prints
 * `AA new.md`, and the door reported it as `1 added` — in a repository where a granted `git.commit`
 * would be REFUSED outright. Checked BEFORE the table, so no other row can win an unmerged pair.
 */
export const UNMERGED_XY: ReadonlySet<string> = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

const STATUS_ORDER: [string, string][] = [
  ['?', 'untracked'],
  ['U', 'unmerged'],
  ['A', 'added'],
  ['R', 'renamed'],
  ['C', 'copied'],
  ['D', 'deleted'],
  ['M', 'modified'],
];

/**
 * M2 v61: porcelain v1 prints `XY old -> new` for exactly two families — a rename (`R`) and a copy
 * (`C`). Cutting at ` -> ` unconditionally read the SEPARATOR out of the data instead of the format:
 * on a filesystem that allows `>` in a name, `M  a -> b.md` is ONE modified file and used to become a
 * pair with half of a real filename deleted from the answer.
 */
const PAIRED_XY = /[RC]/;

/** Porcelain v1 (`--short`): `XY path`, renames and copies as `XY old -> new` — the new path wins the `path` field, and v61 keeps the old one too. */
export function parseGitStatus(stdout: string): { files: GitStatusFile[]; counts: Record<string, number> } {
  const files: GitStatusFile[] = [];
  const counts: Record<string, number> = {};
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    const xy = line.slice(0, 2);
    let rest = line.slice(2).trim();
    let fromPath: string | undefined;
    if (PAIRED_XY.test(xy)) {
      // Both halves quoted → git's separator is the LAST `" -> "`, which lets a name keep its own arrow.
      // Otherwise the first ` -> ` splits the pair (measured: git quotes only the half that needs it, as in
      // `R  x.md -> "m b/n.md"`). Residual bound: a name that needs quoting AND ends quote-adjacent to an
      // arrow still reads as a separator here. Measured porcelain v2 adoption cost: 6.9× bytes (33 706 vs
      // 4 884 on 262 files), leaving only 31 entries at the 4 096 budget that answers 219 under v1 —
      // v2 is NOT the next increment. git's per-line names (+++ / rename to) remain the authoritative fallback.
      const quotedSep = rest.includes('" -> "');
      const arrow = quotedSep ? rest.lastIndexOf('" -> "') : rest.indexOf(' -> ');
      if (arrow >= 0) {
        // the six-byte separator shares one quote with each half, so each slice keeps the quote that closes/left it
        fromPath = rest.slice(0, arrow + (quotedSep ? 1 : 0));
        rest = rest.slice(arrow + (quotedSep ? 5 : 4));
      }
    }
    const hit = UNMERGED_XY.has(xy) ? undefined : STATUS_ORDER.find(([code]) => xy.includes(code));
    const status = hit ? hit[1] : UNMERGED_XY.has(xy) ? 'unmerged' : 'other';
    const path = unwrapRendering(rest);
    const from = fromPath === undefined ? undefined : unwrapRendering(fromPath);
    const file: GitStatusFile = { xy, status, path: path.name };
    if (from !== undefined) file.fromPath = from.name;
    if (path.quoted || (from?.quoted ?? false)) file.quoted = true;
    if (!UNMERGED_XY.has(xy)) {
      if (xy[0] !== ' ' && xy[0] !== '?') file.staged = true;
      if (xy[1] !== ' ' && xy[1] !== '?') file.dirty = true;
    }
    files.push(file);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return { files, counts };
}

export interface GitDiffFile {
  path: string;
  hunks: number;
  additions: number;
  deletions: number;
  /** M2 v61: this path reached us as git's C-QUOTED RENDERING. A worktree-vs-index diff has no rename to name (measured: git reports an un-staged rename as a delete plus an untracked file), so unlike the index-facing doors this one carries no pre-image. */
  quoted?: boolean;
}

/**
 * Unified `git diff` text → per-file line tallies. v64: the `+++`/`---` pair never counts WHILE IT IS
 * STILL A PAIR, i.e. before the first `@@` of its file section; after that line every `+`/`-` is content
 * that git counted, and git's own footer is the judge (see `isDiffHeaderPairLine`).
 */
export function parseGitDiff(stdout: string): { files: GitDiffFile[]; totals: { files: number; hunks: number; additions: number; deletions: number } } {
  const files: GitDiffFile[] = [];
  let current: GitDiffFile | null = null;
  let insideHunk = false; // v64: where the reader is inside the current file section decides what `---`/`+++` MEAN
  for (const line of stdout.split('\n')) {
    const header = parseDiffHeader(line);
    if (header) {
      current = { path: header.to, hunks: 0, additions: 0, deletions: 0 };
      if (header.quoted) current.quoted = true;
      files.push(current);
      insideHunk = false; // v64: a new section starts with a fresh pair of name lines
      continue;
    }
    if (line.startsWith('diff --git ')) {
      // v65: git says a section begins here and this door cannot name it, so it ENDS the file it was
      // reading. The alternative is not "one file missing" — measured on this box, the unread section's
      // own `---`/`+++`/`@@`/content lines were then counted into the file BEFORE it, so a tally that
      // looks complete would also be wrong, in the one direction nothing else in the answer reveals.
      current = null;
      insideHunk = false;
      continue;
    }
    if (!current) continue; // preamble before the first file is not a diff
    if (isDiffHeaderPairLine(line, insideHunk)) {
      const named = parseFileLine(line); // v61: git's own per-line name beats a header whose split a ` b/` stole
      if (named) {
        current.path = named.path;
        if (named.quoted) current.quoted = true;
      }
      continue;
    }
    if (line.startsWith('@@')) {
      insideHunk = true;
      current.hunks += 1;
    } else if (line.startsWith('+')) current.additions += 1;
    else if (line.startsWith('-')) current.deletions += 1;
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
    description: `Read-only change awareness: \`git diff ${GIT_DIFF_FLAGS.join(' ')}\` (per-file line tallies) or the same shape plus \`--stat\` (summary) through the confined exec host. Exact argv only — no paths, no shell, no external diff driver, and the \`a/\`/\`b/\` the per-file names are read from are ours, not the repository's (see gitEnvIsolation). A read the output budget trimmed reports its counts as a FLOOR on the working tree, not a census of it (see diffWindowNotice).`,
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
    const conflicted = files.filter((f) => f.status === 'unmerged').map((f) => f.path);
    // v63: a cut read is a WINDOW on git's answer, and the split sentence must say so. `killedByBudget`
    // is deliberately NOT part of this — a killed read fails `ok` above and answers with git's verdict
    // plus v52's `refusedNotAbsence`, so no count of it is ever spoken as a census.
    const windowed = stdoutWasCut(result);
    const detail = ok
      ? `git.status → exit ${result.exitCode}: ${files.length} entries${tally === '' ? '' : ` (${tally})`}${conflicted.length > 0 ? ` · ${unmergedStatusNotice(conflicted)}` : ''}${pathShapeNotices(files)}${treeSplitNotice(files, { window: windowed })}${flags(result)}`
      : `git.status → exit ${result.exitCode}: ${quoteVerdict(gitVerdict(result.stdout, result.stderr, { truncated: result.truncated || result.killedByBudget }))} · ${files.length} entries parsed · ${refusedNotAbsence('the working tree is clean or empty')}${flags(result)}`;
    return { ok, detail, exitCode: result.exitCode, files, counts, truncated: result.truncated };
  });

  registry.register(GIT_TOOL_SPECS[1]!, async (args) => {
    const stat = args.stat === true;
    const result = await runGit(stat ? ['git', 'diff', ...GIT_DIFF_FLAGS, '--stat'] : ['git', 'diff', ...GIT_DIFF_FLAGS], args.cwd);
    const ok = result.exitCode === 0 && !result.killedByBudget;
    const windowed = stdoutWasCut(result); // v66: v56's predicate, now read by the diff doors too
    if (stat) {
      const summary = parseDiffStat(result.stdout);
      const notice = unmergedNotice(result.stdout);
      // v66: a cut that emptied the read is NOT a 0-file census — git's footer simply did not survive.
      // A footer that DID survive needs no window clause: it is git's own arithmetic over the whole body,
      // and a prefix read either holds the last line or loses it (measured exhaustively, see diffWindowNotice).
      const cutEmpty = summary !== null && summary.files === 0 && windowed;
      const parsed = cutEmpty ? cutNotAbsence('nothing changed') : summary ? `${summary.files} files, +${summary.insertions} −${summary.deletions}` : 'unparseable stat footer';
      const mention = notice.length > 0 ? ` · ${unmergedNotAbsence(notice)}` : '';
      const detail = ok
        ? `git.diff --stat → exit 0: ${parsed}${mention}${flags(result)}`
        : `git.diff --stat → exit ${result.exitCode}: ${quoteVerdict(gitVerdict(result.stdout, result.stderr, { truncated: result.truncated || result.killedByBudget }))} · ${parsed} · ${refusedNotAbsence('nothing changed')}${flags(result)}`;
      return { ok, detail, exitCode: result.exitCode, mode: 'stat', summary, text: result.stdout, truncated: result.truncated };
    }
    const { files, totals } = parseGitDiff(result.stdout);
    const notice = unmergedNotice(result.stdout);
    const unnamable = unnamableDiffSections(result.stdout); // v65: git's section count is the floor under this tally
    const last = files.at(-1);
    const tally = totals.files === 0 && windowed
      ? cutNotAbsence('the working tree has no changes') // v66: git.diff had no such branch — v32 predated v48
      : `${windowed ? 'AT LEAST ' : ''}${totals.files} files, +${totals.additions} −${totals.deletions} (${totals.hunks} hunks)`;
    const detail = ok
      ? `git.diff → exit 0: ${tally}${notice.length > 0 ? ` · ${unmergedNotAbsence(notice)}` : ''}${unnamable.length > 0 ? ` · ${unnamableSectionsNotice(unnamable)}` : ''}${diffWindowNotice({ window: windowed, subject: 'the working tree', named: totals.files, ...(last ? { partial: { path: last.path, additions: last.additions, deletions: last.deletions } } : {}) })}${pathShapeNotices(files)}${flags(result)}`
      : `git.diff → exit ${result.exitCode}: ${quoteVerdict(gitVerdict(result.stdout, result.stderr, { truncated: result.truncated || result.killedByBudget }))} · ${tally} · ${refusedNotAbsence('the tree has no changes')}${flags(result)}`;
    return { ok, detail, exitCode: result.exitCode, mode: 'full', files, totals, truncated: result.truncated };
  });

  return registry;
}
