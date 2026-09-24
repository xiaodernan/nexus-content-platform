import { describe, expect, it } from 'vitest';
import { ToolRegistry, planExec } from '@nexus/agent-runtime';
import type { SpawnLike } from '@nexus/agent-runtime';
import { createExecHost, type ExecChild } from '../src/execHost.js';
import { GIT_TOOL_SPECS, GIT_DIFF_FLAGS, budgetFlags, diffWindowNotice, gitEnv, gitReadOnlyPolicy, gitVerdict, isDiffHeaderPairLine, isQuotedRendering, parseDiffHeader, parseDiffStat, parseFileLine, parseGitDiff, parseGitStatus, pathShapeNotices, quoteVerdict, refusedNotAbsence, registerGitTools, stdoutWasCut, treeSplitNotice, UNMERGED_XY, unmergedNotice, unmergedNotAbsence, unmergedStatusNotice, unnamableDiffSections, unnamableSectionsNotice, unwrapRendering } from '../src/gitTools.js';
import { GIT_ABSENT_CONFIG, GIT_FORCED_CONFIG, GIT_ISOLATION_ENV, GIT_PASS_THROUGH_ENV_NAMES, forcedConfigEnv } from '../src/gitEnvIsolation.js';

describe('parseGitStatus (porcelain v1, pure data)', () => {
  it('maps XY codes to named statuses and counts per status', () => {
    const { files, counts } = parseGitStatus(' M src/a.ts\n?? pipeout.bin\nA  new.md\nD  gone.md\n');
    expect(files).toEqual([
      { xy: ' M', status: 'modified', path: 'src/a.ts', dirty: true },
      { xy: '??', status: 'untracked', path: 'pipeout.bin' },
      { xy: 'A ', status: 'added', path: 'new.md', staged: true },
      { xy: 'D ', status: 'deleted', path: 'gone.md', staged: true },
    ]);
    expect(counts).toEqual({ modified: 1, untracked: 1, added: 1, deleted: 1 });
  });

  it('a rename keeps BOTH names: `path` is what is on disk, `fromPath` is what HEAD knows (v61)', () => {
    const { files } = parseGitStatus('R  old/name.ts -> new/name.ts\n\n');
    expect(files).toEqual([{ xy: 'R ', status: 'renamed', path: 'new/name.ts', fromPath: 'old/name.ts', staged: true }]);
  });

  // v61: ` -> ` is the separator of exactly two porcelain families (R and C). Reading it out of the
  // DATA instead of the FORMAT made `M  notes -> draft.md` — one modified file — into a pair whose
  // "new path" was half a filename.
  it('only R and C are pairs; a path that merely contains " -> " stays ONE path (v61)', () => {
    const { files } = parseGitStatus('M  notes -> draft.md\nA  a -> b.md\n?? c -> d.md\n');
    expect(files.map((f) => [f.status, f.path, f.fromPath])).toEqual([
      ['modified', 'notes -> draft.md', undefined],
      ['added', 'a -> b.md', undefined],
      ['untracked', 'c -> d.md', undefined],
    ]);
  });

  it('a rename that is ALSO modified in the tree is still a pair, and both halves stay quoted together (v61)', () => {
    const { files } = parseGitStatus('RM "docs/caf\\303\\251-old.md" -> "docs/caf\\303\\251-new.md"\n');
    expect(files[0]).toEqual({ xy: 'RM', status: 'renamed', path: '"docs/caf\\303\\251-new.md"', fromPath: '"docs/caf\\303\\251-old.md"', quoted: true, staged: true, dirty: true });
  });

  // Measured with v46's `core.quotePath=false` in place: WHITESPACE ALONE makes git quote a porcelain
  // path (` M "plain name.md"`), so a quote is not by itself evidence of escaping — and everything that
  // IS escaped (`"`, a backslash, a control character, non-ASCII under the default) escapes as a
  // backslash sequence. The rule that follows from that asymmetry lives in `unwrapRendering`; NTFS can
  // create neither `"` nor a tab nor `>` in a name, so the escaped branch stays a fixture, and the
  // proof says so instead of pretending it measured one.
  it('git quoting of an ordinary name is undone; git ESCAPING of one is announced, not guessed (v61)', () => {
    const { files } = parseGitStatus('?? "dropzone/\\303\\274no.md"\n?? plain.md\n M "plain name.md"\n');
    expect(files[0]!.quoted).toBe(true); // an escape inside: the name is NOT this string
    expect(files[0]!.path).toBe('"dropzone/\\303\\274no.md"');
    expect('quoted' in files[1]!).toBe(false);
    expect('fromPath' in files[1]!).toBe(false);
    expect(files[2]).toEqual({ xy: ' M', status: 'modified', path: 'plain name.md', dirty: true }); // quoted by git, openable here
    expect(isQuotedRendering('"x"')).toBe(true);
    expect(isQuotedRendering('x"')).toBe(false); // one quote is a filename; a pair is a rendering
    expect(isQuotedRendering('""')).toBe(false); // nothing between the quotes renders no name: junk, not a picture of a path
    expect(unwrapRendering('"a b.md"')).toEqual({ name: 'a b.md', quoted: false });
    expect(unwrapRendering('"a\\"b.md"')).toEqual({ name: '"a\\"b.md"', quoted: true });
    expect(unwrapRendering('plain.md')).toEqual({ name: 'plain.md', quoted: false });
  });

  it('a pair keeps both names whether git quoted one half, both, or neither (v61)', () => {
    const { files } = parseGitStatus('R  x.md -> "m b/n.md"\nR  "a b.md" -> "c d.md"\nC  o.md -> n.md\n');
    expect(files.map((f) => [f.path, f.fromPath, f.quoted ?? false])).toEqual([
      ['m b/n.md', 'x.md', false], // git quoted only the half that needed it
      ['c d.md', 'a b.md', false],
      ['n.md', 'o.md', false],
    ]);
  });

  it('pathShapeNotices speaks only about what the entries actually carry (v61)', () => {
    expect(pathShapeNotices([{ path: 'a.md' }, { path: 'b.md' }])).toBe('');
    expect(pathShapeNotices([{ path: 'b.md', fromPath: 'a.md' }])).toContain('1 rename/copy PAIR(s): a.md -> b.md');
    expect(pathShapeNotices([{ path: 'b.md', fromPath: 'a.md' }])).toContain('the left name is what HEAD knows');
    expect(pathShapeNotices([{ path: '"c.md"', quoted: true }])).toContain('C-QUOTED RENDERING with escapes inside ("c.md")');
    expect(pathShapeNotices([{ path: '"c.md"', quoted: true }])).toContain('must not be passed on as one');
  });

  it('unknown XY codes say `other`, never silently match a known family', () => {
    expect(parseGitStatus('!  weird\n').files[0]).toMatchObject({ status: 'other' });
  });

  // v57: measured on real merges — `git status --short` prints AA for an add/add conflict and DD for
  // a delete/delete one, and BOTH used to fall through to the single-letter rows, so the door
  // reported a conflicted path as `1 added` in a repo where `git.commit` would be refused.
  it('all SEVEN unmerged codes are unmerged, including the two same-letter pairs', () => {
    const porcelain = ['UU both.md', 'AA added.md', 'DD deleted.md', 'AU ours-added.md', 'UA theirs-added.md', 'DU ours-deleted.md', 'UD theirs-deleted.md'];
    const { files, counts } = parseGitStatus(porcelain.map((l) => `${l}\n`).join(''));
    expect(files.map((f) => [f.xy, f.status])).toEqual(porcelain.map((l) => [l.slice(0, 2), 'unmerged']));
    expect(counts).toEqual({ unmerged: 7 });
    expect([...UNMERGED_XY]).toEqual(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);
  });

  it('the clean single-letter codes keep their v32 names — the unmerged set is not a sledgehammer', () => {
    const { files } = parseGitStatus('A  new.md\nD  gone.md\nM  mod.md\nR  old -> new2.md\n?? free.md\n!! junk.md\n');
    expect(files.map((f) => f.status)).toEqual(['added', 'deleted', 'modified', 'renamed', 'untracked', 'other']);
  });
});

describe('parseGitDiff / parseDiffStat (line tallies, headers never count)', () => {
  it('per-file hunks/additions/deletions; the +++/--- file headers are excluded', () => {
    const text = [
      'preamble noise',
      'diff --git a/x.ts b/x.ts',
      'index 111..222 100644',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,2 +1,3 @@',
      ' const a = 1;',
      '+const b = 2;',
      '+const c = 3;',
      '-const old = 0;',
      'diff --git a/y.md b/y.md',
      '@@ -1 +1 @@',
      '-old line',
      '+new line',
    ].join('\n');
    const { files, totals } = parseGitDiff(text);
    expect(files).toEqual([
      { path: 'x.ts', hunks: 1, additions: 2, deletions: 1 },
      { path: 'y.md', hunks: 1, additions: 1, deletions: 1 },
    ]);
    expect(totals).toEqual({ files: 2, hunks: 2, additions: 3, deletions: 2 });
  });

  it('empty diff → all-zero totals; stat footer parses with missing groups; junk footer says null', () => {
    expect(parseGitDiff('').totals).toEqual({ files: 0, hunks: 0, additions: 0, deletions: 0 });
    expect(parseDiffStat(' x.ts | 3 +-\n 1 file changed, 2 insertions(+), 1 deletion(-)')).toEqual({ files: 1, insertions: 2, deletions: 1 });
    expect(parseDiffStat('')).toEqual({ files: 0, insertions: 0, deletions: 0 });
    expect(parseDiffStat(' x.ts | 3 +-\nsome git warning')).toBeNull();
  });

  // v61: `diff --git a/P b/P` has to be split by POSITION, and a directory whose name ends in a space
  // (legal on NTFS, created for real by the proof) puts a second ` b/` inside the path and steals it.
  // `+++ b/P` names the same file one line at a time, so where git prints it, it wins.
  it('a header whose split a ` b/` in the path stole is corrected by git\'s own per-line name (v61)', () => {
    expect(parseDiffHeader('diff --git a/x.md b/m b/n.md')).toEqual({ from: 'x.md b/m', to: 'n.md', quoted: false }); // the split IS wrong; that is the point
    const { files } = parseGitDiff(['diff --git a/x.md b/m b/n.md', '--- a/x.md', '+++ b/m b/n.md', '@@ -1 +1 @@', '-old', '+new'].join('\n'));
    expect(files).toEqual([{ path: 'm b/n.md', hunks: 1, additions: 1, deletions: 1 }]);
    expect(parseFileLine('+++ /dev/null')).toBeNull(); // a deletion's target names nothing
    expect(parseFileLine('+++ "b/a\\"b.md"')).toEqual({ path: '"a\\"b.md"', quoted: true });
    expect(parseFileLine('+++ b/a "b".md')).toEqual({ path: 'a "b".md', quoted: false });
    expect(parseFileLine('--- a/m b/n.md')).toBeNull(); // only the post-image line is read
  });
});

// v64: git prints `--- a/…` and `+++ b/…` ONCE per file section, before its first `@@`. Inside a hunk the
// very same shape is a line somebody WROTE — a file that gains `++ b/second.md` shows it as `+++ b/second.md`,
// which v32's reader took for a name: it counted nothing and renamed the file to a path that exists nowhere.
describe('v64 — a body line that WEARS a header\'s shape', () => {
  it('the rule is POSITION: the pair names before the first hunk and is content after it', () => {
    expect(isDiffHeaderPairLine('--- a/x.ts', false)).toBe(true);
    expect(isDiffHeaderPairLine('+++ b/x.ts', false)).toBe(true);
    expect(isDiffHeaderPairLine('--- /dev/null', false)).toBe(true);
    expect(isDiffHeaderPairLine('+++ b/x.ts', true)).toBe(false); // inside a hunk this is text, not a name
    expect(isDiffHeaderPairLine('+++b/x.ts', false)).toBe(false); // git's name line always carries the space
    expect(isDiffHeaderPairLine('@@ -1 +1 @@', false)).toBe(false);
  });

  it('an added line reading `++ b/second.md` counts as ONE addition and leaves the path alone', () => {
    const { files, totals } = parseGitDiff([
      'diff --git a/notes.md b/notes.md',
      'index 1..2 100644',
      '--- a/notes.md',
      '+++ b/notes.md',
      '@@ -1,2 +1,3 @@',
      ' head',
      '+++ b/second.md',
      ' tail',
    ].join('\n'));
    expect(files).toEqual([{ path: 'notes.md', hunks: 1, additions: 1, deletions: 0 }]);
    expect(totals).toEqual({ files: 1, hunks: 1, additions: 1, deletions: 0 });
  });

  it('a deleted line reading `-- a/ghost.ts` counts, and so does an addition whose own text starts with `+++`', () => {
    const { files } = parseGitDiff([
      'diff --git a/code.ts b/code.ts',
      'index 1..2 100644',
      '--- a/code.ts',
      '+++ b/code.ts',
      '@@ -1,3 +1,4 @@',
      ' a',
      '--- a/ghost.ts',
      '++++ b/fake-from-an-addition',
      ' b',
    ].join('\n'));
    expect(files).toEqual([{ path: 'code.ts', hunks: 1, additions: 1, deletions: 1 }]);
  });

  it('a new section starts OUTSIDE the hunk again, so its own `+++ b/…` names it and counts as nothing', () => {
    const { files, totals } = parseGitDiff([
      'diff --git a/a.md b/a.md', '--- a/a.md', '+++ b/a.md', '@@ -1 +1 @@', '+++ b/was-content.md',
      'diff --git a/b.md b/b.md', 'index 1..2 100644', '--- a/b.md', '+++ b/b.md', '@@ -1 +1 @@', '-x', '+y',
    ].join('\n'));
    expect(files).toEqual([
      { path: 'a.md', hunks: 1, additions: 1, deletions: 0 },
      { path: 'b.md', hunks: 1, additions: 1, deletions: 1 },
    ]);
    expect(totals).toEqual({ files: 2, hunks: 2, additions: 2, deletions: 1 });
  });

  it('a whole-file addition still tallies its content and not its `/dev/null` pre-image', () => {
    const { files } = parseGitDiff(['diff --git a/new.md b/new.md', 'new file mode 100644', 'index 0..1 100644', '--- /dev/null', '+++ b/new.md', '@@ -0,0 +1,2 @@', '++ b/kept.md', '+tail'].join('\n'));
    expect(files).toEqual([{ path: 'new.md', hunks: 1, additions: 2, deletions: 0 }]);
  });
});

// v64's second clause, measured on this box: git terminates an UNQUOTED name line with a TAB whenever the
// name contains a space (`--- a/m b/spaced.md\t`, `+++ b/m b/renamed.md\t`, in `diff` and in `show` alike),
// and does not do it for a space-free name (`+++ b/brand-new.md`) or a C-quoted one (`+++ "b/caf\303\251.md"`).
// That TAB is the unified header's name/timestamp separator with an empty second field.
describe('v64 — the TAB after a name is git\'s field, not the path\'s last character', () => {
  it('parseFileLine cuts at the separator and keeps the name git printed', () => {
    expect(parseFileLine('+++ b/m b/n.md\t')).toEqual({ path: 'm b/n.md', quoted: false });
    expect(parseFileLine('+++ b/plain.md')).toEqual({ path: 'plain.md', quoted: false });
    expect(parseFileLine('+++ "b/caf\\303\\251.md"')).toEqual({ path: '"caf\\303\\251.md"', quoted: true });
    expect(parseFileLine('+++ b/\t')).toBeNull(); // a name that is nothing names nothing
    // this box emits the separator with an EMPTY second field; the classic `name<TAB>timestamp` shape is
    // the same rule one field further, so it is written here as the consequence it is, not as a sighting.
    expect(parseFileLine('+++ b/x.ts\t2026-01-01 00:00:00.000000000 +0000')).toEqual({ path: 'x.ts', quoted: false });
  });

  it('a rename into a spaced path ends with git\'s real name, not with its separator', () => {
    const { files } = parseGitDiff([
      'diff --git a/x.md b/m b/n.md', 'similarity index 57%', 'rename from x.md', 'rename to m b/n.md',
      'index 1..2 100644', '--- a/x.md', '+++ b/m b/n.md\t', '@@ -1,2 +1,3 @@', ' one', ' two', '+three',
    ].join('\n'));
    expect(files).toEqual([{ path: 'm b/n.md', hunks: 1, additions: 1, deletions: 0 }]);
  });
});

// v65, measured on real git: FOUR config keys in the repository's own `.git/config` decide whether git
// prints the `a/`/`b/` that every diff reader here strips to get a name — `diff.noprefix`,
// `diff.mnemonicPrefix`, `diff.srcPrefix`, `diff.dstPrefix`. Set any one of them and `git diff --cached`
// exits 0 with its sections intact and its names unattachable, and the door used to read that as an
// empty index. The shipped shape now says the prefixes itself; these are the bytes that used to arrive.
describe('v65 — a repository can delete the prefix every diff reader names files by', () => {
  const NOPREFIX = ['diff --git x.ts x.ts', '--- x.ts', '+++ x.ts', '@@ -1 +1 @@', '-old', '+new'];
  const MNEMONIC = ['diff --git c/x.ts i/x.ts', '--- c/x.ts', '+++ i/x.ts', '@@ -1 +1 @@', '-old', '+new'];
  // measured: `[diff] noprefix = true` together with `[diff] srcPrefix = q/` — the SECOND name really
  // does begin with `b/`, because the file is named `bin.dat`.
  const MIXED = 'diff --git q/bin.dat b/bin.dat';

  it.each([
    ['diff.noprefix=true', NOPREFIX],
    ['diff.mnemonicPrefix=true', MNEMONIC],
  ])('%s: git printed a section, the header matcher names nothing, and the census sees the section', (_config, lines) => {
    const text = lines.join('\n');
    expect(parseDiffHeader(lines[0]!)).toBeNull();
    expect(parseGitDiff(text)).toEqual({ files: [], totals: { files: 0, hunks: 0, additions: 0, deletions: 0 } });
    expect(unnamableDiffSections(text)).toEqual([lines[0]]);
  });

  it('the census is a count of SECTIONS, not of what the parser could read: git\'s structural line is the one it does not have to name', () => {
    expect(unnamableDiffSections('')).toEqual([]);
    expect(unnamableDiffSections('* Unmerged path file.md')).toEqual([]); // v52's notice is not a section
    const normal = ['diff --git a/x.ts b/x.ts', 'index 1..2 100644', '--- a/x.ts', '+++ b/x.ts', '@@ -1 +1 @@', '+new'].join('\n');
    expect(unnamableDiffSections(normal)).toEqual([]);
    expect(unnamableDiffSections([normal, ...MNEMONIC].join('\n'))).toEqual([MNEMONIC[0]]); // half-read: only the unread half is named
  });

  it('a mixed rendering is REFUSED, not guessed: the strip that answers `bin.dat` correctly would answer `ts` for `x.ts`', () => {
    expect(parseDiffHeader(MIXED)).toBeNull();
    expect(unnamableDiffSections(MIXED)).toEqual([MIXED]);
    const strip = (header: string) => header.replace('diff --git ', '').split(' ').map((n) => n.slice(2));
    // …here a two-character strip lands on the right answer, because `q/` and `b/` are each two characters
    // and the file is `bin.dat`:
    expect(strip(MIXED)).toEqual(['bin.dat', 'bin.dat']);
    // …and one rendering later it invents a path that exists nowhere, for git's own `x.ts`:
    expect(strip(NOPREFIX[0]!)).toEqual(['ts', 'ts']);
  });

  it('v65: an unnameable section ENDS the file before it — otherwise the unread body is counted into a named path', () => {
    const named = ['diff --git a/keep.ts b/keep.ts', '--- a/keep.ts', '+++ b/keep.ts', '@@ -1 +1 @@', '+one line'];
    const read = parseGitDiff([...named, ...MNEMONIC].join('\n'));
    // What the named section reports is EXACTLY what it would report on its own: the unread half adds
    // nothing to it. Measured before this boundary rule existed, a 2-line added file followed by an
    // unread section printed "+5 −1 across 2 hunk(s)" — the unread half's name pair counted as content
    // and its `---` as a deletion, so the tally was wrong as well as short (gitStagedTool's v65 case).
    expect(read.files).toEqual([{ path: 'keep.ts', hunks: 1, additions: 1, deletions: 0 }]);
    expect(read.totals).toEqual({ files: 1, hunks: 1, additions: 1, deletions: 0 });
    expect(parseGitDiff(named.join('\n'))).toEqual(read); // the same answer with and without the unread section after it
    expect(unnamableDiffSections([...named, ...MNEMONIC].join('\n'))).toEqual([MNEMONIC[0]]); // and the census still counts it
  });

  it('the notice quotes git\'s own line and states the limit, on both sides of a partial read', () => {
    const s = unnamableSectionsNotice([MIXED]);
    expect(s).toContain('git printed 1 diff section(s) whose header this door cannot split into two names');
    expect(s).toContain(`"${MIXED}"`); // git's bytes, verbatim — v52's rule applied to a header
    expect(s).toContain('those ARE changes');
    expect(s).toContain('this door could not NAME them');
    expect(s).toContain('so they are in no tally above'); // v65: the notice also bounds the NUMBERS beside it
  });

  it('the shape OWNS the prefixes, so no repository config can delete them (v65: argv, not env — the command line outranks the file)', () => {
    expect(GIT_DIFF_FLAGS).toContain('--src-prefix=a/');
    expect(GIT_DIFF_FLAGS).toContain('--dst-prefix=b/');
    const policy = gitReadOnlyPolicy('X:/repo');
    expect(planExec({ argv: ['git', 'diff', ...GIT_DIFF_FLAGS] }, policy).ok).toBe(true);
  });
});

describe('gitReadOnlyPolicy (three exact argv, NOTHING else)', () => {
  const policy = gitReadOnlyPolicy('X:/repo');
  it.each([['git', 'status', '--short'], ['git', 'diff', ...GIT_DIFF_FLAGS], ['git', 'diff', ...GIT_DIFF_FLAGS, '--stat']])('allows exactly %j', (...argv) => {
    const d = planExec({ argv }, policy);
    expect(d.ok).toBe(true);
  });
  it('refuses write-shaped and unlisted commands before any spawn (default-deny)', () => {
    for (const argv of [['git', 'push'], ['git', 'commit', '-m', 'x'], ['git', 'diff', '--', 'secret.env'], ['rm', '-rf', '/']]) {
      const d = planExec({ argv }, policy);
      expect(d.ok).toBe(false);
    }
  });
  it('v46: the pre-hardening shapes are now UNLISTED — a diff that may run an external driver is not a read', () => {
    for (const argv of [['git', 'diff'], ['git', 'diff', '--stat'], ['git', 'diff', '--ext-diff'], ['git', 'diff', '--textconv'], ['git', 'diff', '--no-ext-diff', '--ext-diff']]) {
      const d = planExec({ argv }, policy);
      expect(d.ok).toBe(false);
      expect(d.reason).toMatch(/default-deny/);
    }
  });
  it('gitEnv passes through only the named vars git needs — and imposes the isolation on top', () => {
    const env = gitEnv({ PATH: '/bin', SYSTEMROOT: 'C:/w', TOKEN: 'secret', HOME: undefined });
    expect(Object.keys(env).filter((k) => GIT_PASS_THROUGH_ENV_NAMES.includes(k))).toEqual(['PATH', 'SYSTEMROOT']);
    expect(env.TOKEN).toBeUndefined();
    expect(env).toMatchObject(GIT_ISOLATION_ENV, forcedConfigEnv());
  });
  it('a caller cannot opt out: even a source that names the pinned keys gets OUR values', () => {
    const env = gitEnv({ PATH: '/bin', GIT_CONFIG_GLOBAL: '/home/human/.gitconfig', GIT_CONFIG_COUNT: '9', GIT_CONFIG_KEY_0: 'diff.external', GIT_CONFIG_VALUE_0: 'evil' });
    expect(env.GIT_CONFIG_GLOBAL).toBe(GIT_ABSENT_CONFIG);
    expect(env.GIT_CONFIG_COUNT).toBe(String(Object.keys(GIT_FORCED_CONFIG).length));
    expect(env['GIT_CONFIG_KEY_0']).toBe('core.attributesFile'); // slots are numbered from zero in sorted key order
    expect(env['GIT_CONFIG_VALUE_0']).toBe(''); // the caller's `evil` driver never reaches git
    expect(env.GIT_CONFIG_COUNT).toBe('5'); // and the count is OURS, so a smuggled sixth key is not read
  });
});

class FakeChild implements ExecChild {
  private data: Array<(s: 'stdout' | 'stderr', c: Buffer | string) => void> = [];
  private ends: Array<(e: { code: number | null; signal: string | null; error?: string }) => void> = [];
  onData(l: (s: 'stdout' | 'stderr', c: Buffer | string) => void) {
    this.data.push(l);
  }
  onEnd(l: (e: { code: number | null; signal: string | null; error?: string }) => void) {
    this.ends.push(l);
  }
  kill(): void {
    for (const l of this.ends) l({ code: null, signal: 'SIGTERM' });
  }
  fire(end: { code: number | null; signal: string | null }, chunks: ['stdout' | 'stderr', string][] = []) {
    for (const [s, t] of chunks) for (const l of this.data) l(s, t);
    for (const l of this.ends) l(end);
  }
}

function harness(stdout = '', end: { code: number | null; signal: string | null } = { code: 0, signal: null }, maxOut?: number, stderr = '') {
  const calls: { args: string[]; env: Record<string, string> }[] = [];
  const spawnLike: SpawnLike = (_command, args, opts) => {
    calls.push({ args, env: opts.env });
    const c = new FakeChild();
    queueMicrotask(() => c.fire(end, stderr === '' ? [['stdout', stdout]] : [['stderr', stderr], ['stdout', stdout]]));
    return c;
  };
  const host = createExecHost(gitReadOnlyPolicy('X:/repo', maxOut === undefined ? {} : { maxOutputBytes: maxOut }), { spawnLike });
  const registry = registerGitTools(new ToolRegistry(), host, { env: { PATH: '/bin', TOKEN: 'secret' } });
  return { calls, registry, grant: { checkpoint: () => true } };
}

describe('git.status / git.diff as registry tools (§28 gates the process; the repo stays read-only)', () => {
  it('both specs are exec-permission — read-only for the repo does NOT mean gate-free', () => {
    expect(GIT_TOOL_SPECS.map((s) => [s.name, s.permissions])).toEqual([
      ['git.status', ['exec']],
      ['git.diff', ['exec']],
    ]);
  });

  it('without a checkpoint the tool never reaches the host: zero spawns', async () => {
    const h = harness(' M a.ts\n');
    const res = await h.registry.invoke({ callId: 'c0', tool: 'git.status', args: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint required for exec');
    expect(h.calls).toHaveLength(0);
  });

  it('granted git.status returns PARSED porcelain, not a raw blob, and the env is policy-scrubbed', async () => {
    const h = harness(' M src/a.ts\n?? pipeout.bin\n');
    const res = await h.registry.invoke({ callId: 'c1', tool: 'git.status', args: {} }, h.grant);
    expect(res.ok).toBe(true);
    const out = res.output as { ok: boolean; detail: string; files: unknown[]; counts: Record<string, number>; truncated: boolean };
    expect(out.counts).toEqual({ modified: 1, untracked: 1 });
    expect(out.files).toHaveLength(2);
    expect(out.detail).toContain('git.status → exit 0: 2 entries');
    expect(h.calls[0]).toEqual({ args: ['status', '--short'], env: gitEnv({ PATH: '/bin' }) }); // TOKEN dropped by the pass-through list, and git still runs under the isolation
  });

  it('a rename is spoken as a PAIR by the door, not as the single path that HEAD has never heard of (v61)', async () => {
    const h = harness('R  docs/old.md -> docs/new.md\n');
    const res = await h.registry.invoke({ callId: 'c1b', tool: 'git.status', args: {} }, h.grant);
    const out = res.output as { detail: string; files: Array<{ path: string; fromPath?: string }> };
    expect(out.files).toEqual([{ xy: 'R ', status: 'renamed', path: 'docs/new.md', fromPath: 'docs/old.md', staged: true }]);
    expect(out.detail).toContain('1 rename/copy PAIR(s): docs/old.md -> docs/new.md');
    expect(out.detail).toContain('reading the pair through either name alone reports half the change');
  });

  it('git.diff full mode tallies lines; stat:true swaps to the `--stat` argv and parses the footer', async () => {
    const full = harness('diff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n-a\n+b\n');
    const res1 = await full.registry.invoke({ callId: 'c2', tool: 'git.diff', args: {} }, full.grant);
    expect((res1.output as { totals: { files: number } }).totals.files).toBe(1);
    const stat = harness(' x.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n');
    const res2 = await stat.registry.invoke({ callId: 'c3', tool: 'git.diff', args: { stat: true } }, stat.grant);
    expect(stat.calls[0]!.args).toEqual(['diff', ...GIT_DIFF_FLAGS, '--stat']);
    expect(full.calls[0]!.args).toEqual(['diff', ...GIT_DIFF_FLAGS]); // the shape git actually received cannot run an external driver
    expect((res2.output as { summary: unknown }).summary).toEqual({ files: 1, insertions: 1, deletions: 1 });
  });

  it('a nonzero exit (e.g. not a git repo) is ok:false DATA with the stated code — the call itself succeeded', async () => {
    const h = harness('', { code: 128, signal: null });
    const res = await h.registry.invoke({ callId: 'c4', tool: 'git.status', args: {} }, h.grant);
    expect(res.ok).toBe(true);
    expect(res.output).toMatchObject({ ok: false, exitCode: 128 });
  });

  it('an escaping cwd is a stated tool ERROR; the jail holds even for read-only commands', async () => {
    const h = harness('');
    const res = await h.registry.invoke({ callId: 'c5', tool: 'git.status', args: { cwd: '../outside' } }, h.grant);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('cwd refused');
    expect(h.calls).toHaveLength(0);
  });

  it('a truncated read says so in the detail — partial awareness is labeled, never silent', async () => {
    const h = harness(' M a.ts\n?? b.bin\n', { code: 0, signal: null }, 4);
    const res = await h.registry.invoke({ callId: 'c6', tool: 'git.status', args: {} }, h.grant);
    const out = res.output as { detail: string; truncated: boolean };
    expect(out.truncated).toBe(true);
    expect(out.detail).toContain('output truncated at budget');
  });
});

/**
 * M2 v52 (ADR 0016 amendment 52): WHICH line of git is its verdict, and what a refusal is allowed
 * to claim. EVERY fixture below is git 2.52 for Windows speaking for itself — captured by a
 * throwaway probe running the SAME argv the shipped doors run, in an os.tmpdir repo (the doors
 * themselves are driven against real git in docs/evidence/agents/verdict-proof.mjs; only the paths
 * inside these bytes are generic). Before this, the door tests could only ever feed one line, and a
 * one-line fixture cannot distinguish a verdict from a banner.
 */
const REAL = {
  cleanTree: { code: 1, stdout: 'On branch master\nnothing to commit, working tree clean\n', stderr: '' },
  notStaged: {
    code: 1,
    stdout: 'On branch master\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)\n\tmodified:   seed.md\n\nno changes added to commit (use "git add" and/or "git commit -a")\n',
    stderr: '',
  },
  indexLock: {
    code: 128,
    stdout: '',
    stderr: "fatal: Unable to create 'X:/repo/.git/index.lock': File exists.\nAnother git process seems to be running in this repository, e.g.\nan editor opened by 'git commit'. Please make sure all processes\nare terminated then try again. If it still fails, a git process\nmay have crashed in this repository earlier:\nremove the file manually to continue.\n",
  },
  conflicted: {
    code: 128,
    stdout: 'U\tfile.md\n',
    stderr: "error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.\n",
  },
  corruptIndex: { code: 128, stdout: '', stderr: 'fatal: .git/index: index file smaller than expected\n' },
  hookSpoke: { code: 1, stdout: '', stderr: 'hook speaks on stdout\n' },
  unborn: { code: 128, stdout: '', stderr: "fatal: your current branch 'master' does not have any commits yet\n" },
  silent: { code: 128, stdout: '', stderr: '' },
  // outside a repo, `git diff --cached` degrades to --no-index mode and dumps its usage: 132 lines
  usageDump: { code: 129, stdout: '', stderr: "error: unknown option `cached'\nusage: git diff --no-index [<options>] <path> <path> [<pathspec>...]\n" + '    --verbose        description\n'.repeat(130) },
};

describe('gitVerdict — one rule for which line is git saying something (v52, real bytes)', () => {
  it('a prefixed line outranks everything else, including an earlier stdout letter', () => {
    const v = gitVerdict(REAL.conflicted.stdout, REAL.conflicted.stderr);
    expect(v).toEqual({
      line: 'error: Committing is not possible because you have unmerged files.',
      rule: 'prefixed',
      lines: 5,
    });
    expect(v.line).not.toContain('U\tfile.md'); // stdout carried a status letter; the reason is on stderr
  });

  it('with six lines and no prefix, the verdict is the LAST one — the first is a banner', () => {
    const v = gitVerdict(REAL.cleanTree.stdout, REAL.cleanTree.stderr);
    expect(v.rule).toBe('last');
    expect(v.line).toBe('nothing to commit, working tree clean');
    expect(v.line).not.toBe('On branch master'); // what every pre-v52 door quoted
    expect(v.lines).toBe(2);
  });

  it('the six-line refusal a human weighs before approving a commit ends in what to do', () => {
    const v = gitVerdict(REAL.notStaged.stdout, REAL.notStaged.stderr);
    expect(v).toMatchObject({ rule: 'last', lines: 6 });
    expect(v.line).toBe('no changes added to commit (use "git add" and/or "git commit -a")');
  });

  it('the FIRST prefixed line wins among six, and hint: lines are not prefixes', () => {
    expect(gitVerdict(REAL.indexLock.stdout, REAL.indexLock.stderr)).toMatchObject({
      line: "fatal: Unable to create 'X:/repo/.git/index.lock': File exists.",
      rule: 'prefixed',
      lines: 6,
    });
    expect(gitVerdict('', REAL.conflicted.stderr).line).not.toContain('hint:');
  });

  it('git printing NOTHING at all is stated as that; git being CUT off mid-word is stated as that too', () => {
    expect(gitVerdict(REAL.hookSpoke.stdout, REAL.hookSpoke.stderr)).toEqual({ line: 'hook speaks on stdout', rule: 'sole', lines: 1 });
    expect(gitVerdict(REAL.silent.stdout, REAL.silent.stderr)).toEqual({ line: '', rule: 'none', lines: 0 });
    expect(quoteVerdict(gitVerdict('', ''))).toBe('git printed no output at all');
    // v53: the same empty strings mean something else entirely when the budget spoke first
    expect(gitVerdict('', '', { truncated: true })).toEqual({ line: '', rule: 'cut', lines: 0 });
    expect(quoteVerdict(gitVerdict('', '', { truncated: true }))).toContain('no WHOLE line survived the output budget');
    expect(quoteVerdict(gitVerdict('', '', { truncated: true }))).toContain('NOT a statement that it said nothing');
    expect(quoteVerdict(gitVerdict('partial without newline', '', { truncated: true }))).toBe('partial without newline'); // v48: bytes survive ⇒ the rules above still apply
  });

  it('a door facing a fully-cut refusal says CUT, never "printed no output at all"', async () => {
    const h = harness('no newline in the kept window at all', { code: 128, signal: null }, 6);
    const res = await h.registry.invoke({ callId: 'v5', tool: 'git.status', args: {} }, h.grant);
    const detail = String((res.output as { detail: string }).detail);
    expect(detail).toContain('no WHOLE line survived the output budget');
    expect(detail).not.toContain('git printed no output at all');
    expect(detail).toContain('output truncated at budget');
  });

  it('git indents with tabs and spaces — the quote carries the words, not the layout', () => {
    expect(gitVerdict('\t\tmodified:   seed.md\n', '   fatal: leading whitespace\n').line).toBe('fatal: leading whitespace');
  });

  it('a quote says how much of git it is NOT, and stays silent when there is nothing to suppress', () => {
    expect(quoteVerdict(gitVerdict(REAL.cleanTree.stdout, ''))).toBe('nothing to commit, working tree clean · git\'s last line of the 2 it printed');
    expect(quoteVerdict(gitVerdict(REAL.hookSpoke.stdout, REAL.hookSpoke.stderr))).toBe('hook speaks on stdout');
    const big = quoteVerdict(gitVerdict(REAL.usageDump.stdout, REAL.usageDump.stderr));
    expect(big).toContain("error: unknown option `cached'");
    expect(big).toContain("git's prefixed line of the 132 it printed");
  });

  it('refusedNotAbsence is the read doors twin of cutNotAbsence, phrased as a refusal', () => {
    expect(refusedNotAbsence('the tree has no changes')).toBe('git REFUSED this command — this is NOT a statement that the tree has no changes');
  });
});

/**
 * M2 v56 (ADR 0016 amendment 56): the budget sentence names the PIPE, and a claim about the parsed
 * stream may not be triggered by the other one.
 */
describe('budgetFlags / stdoutWasCut — who the budget actually cut (v56)', () => {
  const r = (over: Partial<{ truncated: boolean; truncatedStreams: Array<'stdout' | 'stderr'>; killedByBudget: boolean }>) => ({ truncated: false, killedByBudget: false, ...over });

  it('nothing cut, one cut, the other cut, both cut — four different sentences', () => {
    expect(budgetFlags(r({}))).toBe('');
    expect(budgetFlags(r({ truncated: true, truncatedStreams: ['stdout'] }))).toBe(' · output truncated at budget (stdout)');
    expect(budgetFlags(r({ truncated: true, truncatedStreams: ['stderr'] }))).toBe(' · output truncated at budget (stderr)');
    expect(budgetFlags(r({ truncated: true, truncatedStreams: ['stdout', 'stderr'] }))).toBe(' · output truncated at budget (stdout + stderr)');
    expect(budgetFlags(r({ killedByBudget: true }))).toBe(' · killed at timeout budget');
  });

  it('a bare truncated flag with no stream evidence still says so, and names nothing', () => {
    expect(budgetFlags(r({ truncated: true }))).toBe(' · output truncated at budget'); // never a guess about which
  });

  it('stdoutWasCut answers only about stdout — the other pipe is not this door’s business', () => {
    expect(stdoutWasCut(r({ truncated: true, truncatedStreams: ['stderr'] }))).toBe(false);
    expect(stdoutWasCut(r({ truncated: true, truncatedStreams: ['stdout'] }))).toBe(true);
    expect(stdoutWasCut(r({ truncated: true }))).toBe(false);
    expect(stdoutWasCut({})).toBe(false);
  });
});

/**
 * M2 v52 §5 of the proof: git can exit 0 and still not ANSWER. These three shapes are git 2.52's
 * own bytes from a conflicted repository — one per door family — and all three parse to ZERO files.
 */
const UNMERGED_BYTES = {
  stagedNotice: '* Unmerged path file.md\n',
  statNotice: ' file.md | Unmerged\n 0 files changed\n',
  combinedDiff: 'diff --cc file.md\nindex ba2906d,2299c37..0000000\n@@@ -1,1 -1,1 +1,5 @@@\n++<<<<<<< HEAD\n +main\n++=======\n+ side\n++>>>>>>> side\n',
  ordinaryDiff: 'diff --git a/x.ts b/x.ts\nindex 111..222 100644\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n',
};

describe('unmergedNotice — an exit-0 notice is not an empty answer (v52)', () => {
  it('all three of git unmerged shapes name the path, and a normal diff names none', () => {
    expect(unmergedNotice(UNMERGED_BYTES.stagedNotice)).toEqual(['file.md']);
    expect(unmergedNotice(UNMERGED_BYTES.statNotice)).toEqual(['file.md']);
    expect(unmergedNotice(UNMERGED_BYTES.combinedDiff)).toEqual(['file.md']);
    expect(unmergedNotice(UNMERGED_BYTES.ordinaryDiff)).toEqual([]);
    expect(unmergedNotice('')).toEqual([]);
  });

  it('the notice sentence says what the tally is NOT, and names every path', () => {
    expect(unmergedNotAbsence(['a.md', 'b.md'])).toBe(
      'git reported 2 UNMERGED path(s) (a.md, b.md) instead of a diff — a conflicted index, so a zero tally here is NOT a statement that nothing changed',
    );
  });

  // v65: the worktree door reads the same names off the same headers, and git's `diff --git` count is the
  // floor under its tally. Measured on this box: with `[diff] mnemonicPrefix = true` git exited 0 and
  // printed its section, and this door answered `0 files, +0 −0 (0 hunks)` — a count that read as a
  // statement that nothing had changed. The shape now owns the prefixes; this case holds the net.
  it('v65: git.diff says so when git printed sections it could not name, instead of a bare 0-file tally', async () => {
    const mnemonic = ['diff --git c/x.ts i/x.ts', 'index 1..2 100644', '--- c/x.ts', '+++ i/x.ts', '@@ -1 +1 @@', '+new'].join('\n');
    const full = harness(mnemonic);
    const res = await full.registry.invoke({ callId: 'dv65', tool: 'git.diff', args: {} }, full.grant);
    const d = (res.output as { detail: string }).detail;
    expect(res.output).toMatchObject({ ok: true, exitCode: 0, mode: 'full', totals: { files: 0 } });
    expect(d).toContain('git printed 1 diff section(s) whose header this door cannot split into two names');
    expect(d).toContain('"diff --git c/x.ts i/x.ts"');
    expect(d).toContain('those ARE changes');
    expect(d).not.toContain('the tree has no changes'); // that sentence belongs to a refusal, not to this read
  });

  it('git.diff on a combined (conflicted) diff refuses to call its own 0-file tally an answer', async () => {
    const h = harness(UNMERGED_BYTES.combinedDiff); // git exits 0 here — no refusal, just a notice
    const res = await h.registry.invoke({ callId: 'u1', tool: 'git.diff', args: {} }, h.grant);
    const out = res.output as { ok: boolean; detail: string; totals: { files: number } };
    expect(out.ok).toBe(true);
    expect(out.totals.files).toBe(0); // v32 parser: no `diff --git` header, so no files — stated, not fixed
    expect(out.detail).toContain('0 files, +0 −0 (0 hunks)');
    expect(out.detail).toContain('git reported 1 UNMERGED path(s) (file.md) instead of a diff');
  });

  it('git.diff --stat sees the Unmerged footer line beside its own summary', async () => {
    const h = harness(UNMERGED_BYTES.statNotice);
    const detail = String(((await h.registry.invoke({ callId: 'u2', tool: 'git.diff', args: { stat: true } }, h.grant)).output as { detail: string }).detail);
    expect(detail).toContain('git.diff --stat → exit 0: 0 files, +0 −0');
    expect(detail).toContain('git reported 1 UNMERGED path(s) (file.md)');
  });

  it('a healthy diff carries no notice clause at all', async () => {
    const h = harness(UNMERGED_BYTES.ordinaryDiff);
    const detail = String(((await h.registry.invoke({ callId: 'u3', tool: 'git.diff', args: {} }, h.grant)).output as { detail: string }).detail);
    expect(detail).toContain('1 files, +1 −1 (1 hunks)');
    expect(detail).not.toContain('UNMERGED');
  });

  // v57: the door that reports the WORKING TREE now names a conflict too, so the same repository is
  // described one way by git.status and one way by git.staged — measured trigger: an add/add merge,
  // where `AA new.md` used to be reported as `1 added`.
  it('git.status on an add/add conflict says UNMERGED and names the path, not "1 added"', async () => {
    const h = harness('AA new.md\n M other.md\n');
    const res = await h.registry.invoke({ callId: 'u4', tool: 'git.status', args: {} }, h.grant);
    const out = res.output as { ok: boolean; counts: Record<string, number>; detail: string; files: { status: string }[] };
    expect(out.ok).toBe(true);
    expect(out.counts).toEqual({ unmerged: 1, modified: 1 });
    expect(out.detail).toContain('git reported 1 UNMERGED path(s) (new.md)');
    expect(out.detail).toContain('a granted git.commit right now would be refused by git itself');
    expect(out.detail).not.toContain('2 added');
  });

  it('a clean working tree gets no conflict clause (the notice cannot leak into an ordinary answer)', async () => {
    const h = harness(' M a.ts\n?? b.bin\n');
    const detail = String(((await h.registry.invoke({ callId: 'u5', tool: 'git.status', args: {} }, h.grant)).output as { detail: string }).detail);
    expect(detail).toContain('git.status → exit 0: 2 entries (1 modified, 1 untracked)');
    expect(detail).toContain('git.commit records the INDEX: 0/2');
    expect(detail).not.toContain('UNMERGED');
  });
});

describe('every git door quotes that verdict, and a refusal is never a tally (v52)', () => {
  const detailOf = (res: { output?: unknown; error?: string }): string => String((res.output as { detail: string } | undefined)?.detail ?? res.error ?? '');

  it('git.status on a corrupt index names the refusal instead of reporting a clean count', async () => {
    const h = harness(REAL.corruptIndex.stdout, { code: REAL.corruptIndex.code, signal: null }, undefined, REAL.corruptIndex.stderr);
    const res = await h.registry.invoke({ callId: 'v1', tool: 'git.status', args: {} }, h.grant);
    const detail = detailOf(res);
    expect(res.ok).toBe(true); // the CALL succeeded; git refused
    expect(detail).toContain('git.status → exit 128: fatal: .git/index: index file smaller than expected');
    expect(detail).toContain('0 entries parsed');
    expect(detail).toContain('this is NOT a statement that the working tree is clean or empty');
  });

  it('git.diff on the same broken repo keeps its tally AND disclaims it', async () => {
    const h = harness(REAL.corruptIndex.stdout, { code: 128, signal: null }, undefined, REAL.corruptIndex.stderr);
    const detail = detailOf(await h.registry.invoke({ callId: 'v2', tool: 'git.diff', args: {} }, h.grant));
    expect(detail).toContain('0 files, +0 −0 (0 hunks)');
    expect(detail).toContain('this is NOT a statement that the tree has no changes');
  });

  it('git.diff --stat on a 132-line usage dump quotes line 1 and SAYS it quoted 1 of 132', async () => {
    const h = harness(REAL.usageDump.stdout, { code: 129, signal: null }, undefined, REAL.usageDump.stderr);
    const detail = detailOf(await h.registry.invoke({ callId: 'v3', tool: 'git.diff', args: { stat: true } }, h.grant));
    expect(detail).toContain("error: unknown option `cached'");
    expect(detail).toContain("git's prefixed line of the 132 it printed");
    expect(detail).toContain('this is NOT a statement that nothing changed');
  });

  it('a SUCCESSFUL read carries no refusal sentence at all — the disclaimer cannot leak into an answer', async () => {    const h = harness(' M a.ts\n?? b.bin\n');
    const detail = detailOf(await h.registry.invoke({ callId: 'v4', tool: 'git.status', args: {} }, h.grant));
    expect(detail).toContain('git.status → exit 0: 2 entries (1 modified, 1 untracked)');
    expect(detail).not.toContain('REFUSED');
    expect(detail).not.toContain('NOT a statement');
  });
});

describe('per-column staged/dirty — porcelain\'s TWO columns are TWO trees (v62)', () => {
  it('MM is ONE path with TWO different changes: staged AND dirty', () => {
    const { files } = parseGitStatus('MM both.txt\n');
    expect(files[0]).toMatchObject({ staged: true, dirty: true });
  });

  it('AM is a new file that was edited after staging: staged AND dirty', () => {
    const { files } = parseGitStatus('AM new-staged.md\n');
    expect(files[0]).toMatchObject({ staged: true, dirty: true });
  });

  it('M (X only) is staged and the field Y is absent, not false', () => {
    const { files } = parseGitStatus('M  staged-mod.txt\n');
    expect(files[0]!.staged).toBe(true);
    expect('dirty' in files[0]!).toBe(false);
  });

  it('M (Y only) is dirty and the field X is absent, not false', () => {
    const { files } = parseGitStatus(' M worktree-mod.txt\n');
    expect(files[0]!.dirty).toBe(true);
    expect('staged' in files[0]!).toBe(false);
  });

  it('D (X only) means a staged deletion: commit records it', () => {
    const { files } = parseGitStatus('D  staged-del.txt\n');
    expect(files[0]!.staged).toBe(true);
    expect('dirty' in files[0]!).toBe(false);
  });

  it('D (Y only) means a worktree deletion: a commit records NONE of it', () => {
    const { files } = parseGitStatus(' D worktree-del.txt\n');
    expect(files[0]!.dirty).toBe(true);
    expect('staged' in files[0]!).toBe(false);
  });

  it('?? untracked gets neither field (both columns are a question mark)', () => {
    const { files } = parseGitStatus('?? untracked.md\n');
    expect('staged' in files[0]!).toBe(false);
    expect('dirty' in files[0]!).toBe(false);
  });

  it('unmerged rows get neither field because a commit is refused outright', () => {
    const { files } = parseGitStatus('UU conflicted.txt\nAA added-both.txt\nDD deleted-both.txt\n');
    for (const f of files) {
      expect('staged' in f).toBe(false);
      expect('dirty' in f).toBe(false);
      expect(f.status).toBe('unmerged');
    }
  });
});

describe('treeSplitNotice — what the flat entry count cannot say (v62)', () => {
  it('returns empty string when every entry is staged (no split to name)', () => {
    const { files } = parseGitStatus('M  a.txt\nA  b.txt\nD  c.txt\n');
    expect(treeSplitNotice(files)).toBe('');
  });

  it('returns empty string for zero files', () => {
    expect(treeSplitNotice([])).toBe('');
  });

  it('names the split when some are staged and some are not', () => {
    const { files } = parseGitStatus('MM both.txt\nAM new-staged.md\nD  staged-del.txt\nM  staged-mod.txt\n D worktree-del.txt\n M worktree-mod.txt\n?? untracked.md\n');
    const notice = treeSplitNotice(files);
    expect(notice).toContain('git.commit records the INDEX: 4/7');
    expect(notice).toContain('worktree-side/untracked');
    expect(notice).toContain('worktree-del.txt');
    expect(notice).toContain('worktree-mod.txt');
    expect(notice).toContain('untracked.md');
    expect(notice).toContain('a granted commit records NONE of');
    expect(notice).toContain('2 staged AND edited again on disk');
    expect(notice).toContain('both.txt');
    expect(notice).toContain('new-staged.md');
  });

  it('says NONE when zero entries are staged', () => {
    const { files } = parseGitStatus(' M dirty.txt\n?? new.bin\n');
    const notice = treeSplitNotice(files);
    expect(notice).toContain('git.commit records the INDEX: 0/2');
    expect(notice).toContain('a granted commit records NONE of');
  });

  it('the door\'s detail sentence carries the notice for a mixed repository', async () => {
    const h = harness('MM both.txt\n M only-disk.txt\n?? fresh.md\n');
    const res = await h.registry.invoke({ callId: 't62a', tool: 'git.status', args: {} }, h.grant);
    const detail = String((res.output as { detail: string }).detail);
    expect(detail).toContain('git.commit records the INDEX: 1/3');
    expect(detail).toContain('staged AND edited again on disk (both.txt)');
    expect(detail).toContain('a granted commit records NONE of');
  });

  it('the door\'s detail stays silent about the split when everything is staged', async () => {
    const h = harness('M  only-staged.txt\nD  deleted-in-index.txt\n');
    const res = await h.registry.invoke({ callId: 't62b', tool: 'git.status', args: {} }, h.grant);
    const detail = String((res.output as { detail: string }).detail);
    expect(detail).not.toContain('git.commit records the INDEX');
    expect(detail).toContain('2 entries');
  });
});

describe('v63 — a CUT read is a WINDOW, not a census', () => {
  // Porcelain prints tracked changes FIRST and untracked paths LAST, so a cut list is a window whose
  // missing tail is exactly the worktree-side entries v62 promised to name.
  const manyUntracked = ['M  a.txt', 'M  b.txt', 'M  c.txt', ...Array.from({ length: 400 }, (_, i) => `?? u${String(i).padStart(3, '0')}.txt`)].join('\n') + '\n';
  const mixed = 'MM both.txt\n M only-disk.txt\n?? u0.txt\n?? u1.txt\n';
  const stagedOnly = 'M  a.txt\nA  b.txt\n';

  it('says nothing about a split for a window that read no entries — that answer is v48/v52\'s', () => {
    expect(treeSplitNotice([], { window: true })).toBe('');
    expect(treeSplitNotice([])).toBe('');
  });

  it('leaves v62\'s sentences untouched for a read that was NOT cut', () => {
    const { files } = parseGitStatus(mixed);
    expect(treeSplitNotice(files)).toBe(treeSplitNotice(files, { window: false }));
    expect(treeSplitNotice(files)).toContain('1/4 entries differ from HEAD there');
    expect(treeSplitNotice(files)).not.toContain('this door READ');
  });

  it('calls the ratio a WINDOW when the pipe it parses was cut, and denies being a census', () => {
    const { files } = parseGitStatus(mixed);
    const notice = treeSplitNotice(files, { window: true });
    expect(notice).toContain('1/4 entries this door READ differ from HEAD there');
    expect(notice).toContain('3 worktree-side/untracked read (only-disk.txt, u0.txt, u1.txt)');
    expect(notice).toContain('the read was CUT at the budget');
    expect(notice).toContain('NOT a census of the repository');
  });

  it('refuses v62\'s silence for a fully-staged window: "everything is staged" speaks for the whole tree', () => {
    const { files } = parseGitStatus(stagedOnly);
    expect(treeSplitNotice(files)).toBe(''); // a COMPLETE read still has no split to report
    const notice = treeSplitNotice(files, { window: true });
    expect(notice).not.toBe('');
    expect(notice).toContain('all 2 entries this door read differ from HEAD in the index');
    expect(notice).toContain('NOT a statement that nothing unstaged or untracked exists behind it');
  });

  it('the door at a cut budget reports the ratio of what it READ, and names the cut', async () => {
    const h = harness(manyUntracked, { code: 0, signal: null }, 256);
    const res = await h.registry.invoke({ callId: 't63a', tool: 'git.status', args: {} }, h.grant);
    const o = res.output as { detail: string; files: Array<{ path: string; staged?: true }> };
    const ratio = /records the INDEX: (\d+)\/(\d+) entries this door READ differ from HEAD there/.exec(o.detail);
    expect(ratio, o.detail).not.toBeNull();
    expect(Number(ratio?.[2])).toBe(o.files.length); // the denominator is the read, never git's line count
    expect(o.files.length).toBeGreaterThan(0);
    expect(o.files.length).toBeLessThan(403);
    expect(o.detail).toContain('the read was CUT at the budget');
    expect(o.detail).toContain('output truncated at budget (stdout)');
  });

  it('the door NEVER answers a cut read with v62\'s silence, whatever survived the cut', async () => {
    const h = harness(manyUntracked, { code: 0, signal: null }, 30); // only the three staged lines fit
    const res = await h.registry.invoke({ callId: 't63b', tool: 'git.status', args: {} }, h.grant);
    const o = res.output as { detail: string; files: Array<{ staged?: true }> };
    expect(o.files.every((f) => f.staged === true)).toBe(true);
    expect(o.detail).toContain('the read was CUT at the budget, so this is NOT a statement that nothing unstaged or untracked exists behind it');
    expect(o.detail).not.toContain('3/3'); // no ratio may be spoken as if it were the repository
  });
});

describe('v66 — a cut DIFF tally is a WINDOW claim, not a census', () => {
  // Three sections, each complete: the first two are whole in a window that stops inside the third,
  // which is exactly the property `diffWindowNotice` states out loud (and the exhaustive case below
  // checks on every line boundary rather than trusting this fixture's shape).
  const section = (n: string, adds: number) =>
    [
      `diff --git a/${n}.ts b/${n}.ts`,
      `index 1111111..2222222 100644`,
      `--- a/${n}.ts`,
      `+++ b/${n}.ts`,
      `@@ -1,2 +1,${2 + adds} @@`,
      ` context ${n}`,
      ...Array.from({ length: adds }, (_, k) => `+added ${n}-${k}`),
    ].join('\n');
  const THREE = [section('a', 2), section('b', 3), section('c', 4)].join('\n') + '\n';
  const STAT = [' a.ts | 2 ++', ' b.ts | 3 +++', ' c.ts | 4 ++++', ' 3 files changed, 9 insertions(+)', ''].join('\n');
  const lines = THREE.split('\n');
  const head = (n: number) => lines.slice(0, n).join('\n') + '\n';
  const cut = head(11); // inside b's hunk: a is whole, b is half-read, c never arrives
  const cutBudget = cut.length;

  it('says NOTHING for a read that was not cut, and nothing for a read that named no change', () => {
    expect(diffWindowNotice({ window: false, subject: 'the working tree', named: 3 })).toBe('');
    expect(diffWindowNotice({ window: true, subject: 'the working tree', named: 0 })).toBe('');
    expect(diffWindowNotice({ window: false, subject: 'the working tree', named: 0 })).toBe('');
  });

  it('names the subject and the change the read reached LAST; only a one-section read may say the cut landed inside it', () => {
    const s = diffWindowNotice({ window: true, subject: 'the working tree', named: 3, partial: { path: 'c.ts', additions: 1, deletions: 0 } });
    expect(s).toContain('this is a WINDOW on the working tree, NOT a census of it');
    expect(s).toContain('the last change the read reached is c.ts (+1 −0), whose numbers MAY stop where the read did');
    expect(s).not.toContain('the cut landed inside'); // a budget may have expired exactly at a section boundary — this door cannot tell
    expect(s).toContain('the 2 change(s) named before it are whole');
    const shown = diffWindowNotice({ window: true, subject: "HEAD's change to c.ts", named: 1, partial: { path: 'c.ts', additions: 0, deletions: 0 }, cutIsInside: true });
    expect(shown).toContain('the cut landed inside c.ts (+0 −0), whose numbers stop where the read did'); // git.show diffs ONE path, so the cut has nowhere else to be
    expect(shown).not.toContain('0 change(s) named before it'); // a floor of "whole except the last" over ONE file says nothing
  });

  it('git.diff qualifies its counts when the pipe it parses was cut, and the counts stay the read\'s own', async () => {
    const h = harness(THREE, { code: 0, signal: null }, cutBudget);
    const res = await h.registry.invoke({ callId: 'v66a', tool: 'git.diff', args: {} }, h.grant);
    const o = res.output as { detail: string; totals: { files: number; additions: number; deletions: number } };
    const p = parseGitDiff(cut); // the expectation is DERIVED from the same bytes, not copied from a hope
    expect(o.totals).toEqual(p.totals);
    expect(p.totals.files).toBeLessThan(3); // the whole read names 3 — so this really is a short answer
    expect(o.detail).toContain(`AT LEAST ${p.totals.files} files, +${p.totals.additions} −${p.totals.deletions}`);
    expect(o.detail).toContain('this is a WINDOW on the working tree, NOT a census of it');
    expect(o.detail).toContain('output truncated at budget (stdout)'); // v56's clause is still there
  });

  it('a whole read is worded EXACTLY as it was before v66 — the clause is about a cut, not a style', async () => {
    const h = harness(THREE);
    const res = await h.registry.invoke({ callId: 'v66b', tool: 'git.diff', args: {} }, h.grant);
    const o = res.output as { detail: string; totals: { files: number; additions: number } };
    expect(o.totals.files).toBe(3);
    expect(o.detail).toBe('git.diff → exit 0: 3 files, +9 −0 (3 hunks)');
  });

  it('git.diff refuses to report 0 files about a read its own budget emptied (v48\'s rule, never wired here)', async () => {
    const h = harness(THREE, { code: 0, signal: null }, 1);
    const res = await h.registry.invoke({ callId: 'v66c', tool: 'git.diff', args: {} }, h.grant);
    const o = res.output as { detail: string; truncated: boolean };
    expect(o.truncated).toBe(true);
    expect(o.detail).toContain('no complete line survived the output budget — this is NOT a statement that the working tree has no changes');
    expect(o.detail).not.toContain('0 files, +0 −0');
  });

  it('git.diff --stat refuses the same 0-file census, and still reports git\'s footer as a census when it survived', async () => {
    const emptied = await harness(STAT, { code: 0, signal: null }, 1).registry.invoke({ callId: 'v66d', tool: 'git.diff', args: { stat: true } }, harness().grant);
    const cutOpen = emptied.output as { detail: string; summary: unknown };
    expect(cutOpen.detail).toContain('no complete line survived the output budget — this is NOT a statement that nothing changed');
    expect(cutOpen.detail).not.toContain('0 files');
    expect(cutOpen.summary).toEqual({ files: 0, insertions: 0, deletions: 0 }); // the record keeps git's arithmetic; the SENTENCE refuses it
    const whole = await harness(STAT).registry.invoke({ callId: 'v66e', tool: 'git.diff', args: { stat: true } }, harness().grant);
    expect((whole.output as { detail: string }).detail).toBe('git.diff --stat → exit 0: 3 files, +9 −0');
  });

  it('the sentence\'s load-bearing property holds on EVERY line boundary: only the LAST change in a window can be short', () => {
    const whole = parseGitDiff(THREE);
    expect(whole.totals).toEqual({ files: 3, hunks: 3, additions: 9, deletions: 0 });
    for (let n = 1; n < lines.length; n += 1) {
      const kept = head(n);
      const p = parseGitDiff(kept);
      expect(p.files.length).toBeLessThanOrEqual(whole.files.length);
      expect(p.files.slice(0, -1)).toEqual(whole.files.slice(0, Math.max(0, p.files.length - 1)));
      expect(p.files.every((f, i) => i === p.files.length - 1 || f.additions <= whole.files[i]!.additions)).toBe(true);
    }
  });

  it('a --stat read that holds git\'s footer holds the WHOLE body — so its tally needs no window clause', () => {
    const statLines = STAT.split('\n');
    const bodyLines = statLines.filter((l) => l !== '').length;
    let parsed = 0;
    for (let n = 1; n <= statLines.length; n += 1) {
      const kept = statLines.slice(0, n).join('\n');
      const summary = parseDiffStat(kept);
      if (summary === null) {
        expect(/files? changed/.test(kept)).toBe(false); // a window without the census says so, it does not invent one
        continue;
      }
      parsed += 1;
      // git prints the footer after every file line, so a window that can parse a census holds them all.
      expect(statLines.slice(0, n).filter((l) => l !== '').length).toBe(bodyLines);
    }
    expect(parsed).toBeGreaterThan(0); // a vacuous scan would otherwise prove nothing
  });
});
