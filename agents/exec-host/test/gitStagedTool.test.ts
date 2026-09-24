import { describe, expect, it } from 'vitest';
import { ToolRegistry, planExec } from '@nexus/agent-runtime';
import { createExecHost, type ExecChild, type SpawnLike } from '../src/execHost.js';
import { GIT_STAGED_TOOL_SPECS, gitStagedPolicy, parseStagedDiff, registerGitStagedTool, tallyStagedCounts } from '../src/gitStagedTool.js';
import { GIT_DIFF_FLAGS, gitEnv } from '../src/gitTools.js';

const ADDED = `diff --git a/notes/widget.md b/notes/widget.md
new file mode 100644
index 0000000..3f2a1b8
--- /dev/null
+++ b/notes/widget.md
@@ -0,0 +1,2 @@
+widget notes
+NOTE (DEMO MODE · seed 42)
`;

const MODIFIED = `diff --git a/docs/a.md b/docs/a.md
index 1111111..2222222 100644
--- a/docs/a.md
+++ b/docs/a.md
@@ -1,2 +1,2 @@
 keep me
-old line
+new line
`;

const DELETED = `diff --git a/old/x.md b/old/x.md
deleted file mode 100644
index 9999999..0000000
--- a/old/x.md
+++ /dev/null
@@ -1 +0,0 @@
-goodbye
`;

const RENAMED = `diff --git a/before.md b/after.md
similarity index 87%
rename from before.md
rename to after.md
index 1111111..2222222 100644
--- a/before.md
+++ b/after.md
@@ -1 +1 @@
-here
+here, renamed
`;

describe('parseStagedDiff (the index as a stated set of changes, pure data)', () => {
  it('a staged new file is an ADDED change carrying its lines', () => {
    expect(parseStagedDiff(ADDED)).toEqual({
      files: [{ path: 'notes/widget.md', change: 'added', hunks: 1, additions: 2, deletions: 0, addedLines: ['widget notes', 'NOTE (DEMO MODE · seed 42)'], binary: false }],
      counts: { added: 1 },
      totals: { files: 1, hunks: 1, additions: 2, deletions: 0, binary: 0 },
    });
  });

  it('kind comes from git\'s own metadata: modified, deleted, renamed (the NEW path wins)', () => {
    expect(parseStagedDiff(MODIFIED).files[0]).toMatchObject({ path: 'docs/a.md', change: 'modified', additions: 1, deletions: 1, addedLines: ['new line'] });
    expect(parseStagedDiff(DELETED).files[0]).toMatchObject({ path: 'old/x.md', change: 'deleted', additions: 0, deletions: 1, addedLines: [] });
    expect(parseStagedDiff(RENAMED).files[0]).toMatchObject({ path: 'after.md', change: 'renamed', additions: 1, deletions: 1, addedLines: ['here, renamed'] });
  });

  // v61: v43 read `rename from` to DECIDE the kind and then threw the name away — so the pre-commit
  // window showed one half of a rename, and the half it showed is the one HEAD does not have yet.
  it('a rename keeps its pre-image: `rename from` is kept, not only believed (v61)', () => {
    expect(parseStagedDiff(RENAMED).files[0]!.fromPath).toBe('before.md');
    const copied = 'diff --git a/orig.md b/clone.md\nsimilarity index 100%\ncopy from orig.md\ncopy to clone.md\n--- a/orig.md\n+++ b/clone.md\n';
    expect(parseStagedDiff(copied).files[0]).toMatchObject({ path: 'clone.md', change: 'copied', fromPath: 'orig.md' });
  });

  it('an entry that is NOT a pair carries no fromPath key at all, and neither does a plain path (v61)', () => {
    const [one] = parseStagedDiff(MODIFIED).files;
    expect(one).toBeDefined();
    expect('fromPath' in one!).toBe(false);
    expect('quoted' in one!).toBe(false);
  });

  it('a path that reaches the door as git\'s C-QUOTED RENDERING is marked as one (v61)', () => {
    const quoted = 'diff --git "a/notes/caf\\303\\251.md" "b/notes/caf\\303\\251.md"\nindex 1..2 100644\n--- "a/notes/caf\\303\\251.md"\n+++ "b/notes/caf\\303\\251.md"\n@@ -1 +1 @@\n-cafe\n\\ No newline at end of file\n+caf\\303\\251\n';
    const [f] = parseStagedDiff(quoted).files;
    expect(f).toMatchObject({ path: '"notes/caf\\303\\251.md"', change: 'modified', quoted: true });
  });

  // v61, measured on real git: a rename too pure to carry a hunk prints NO `---`/`+++` lines, so its two
  // names exist only in `rename from` / `rename to` — and the header of that same change splits by
  // position, which a directory name ending in a space (`m b/`) steals.
  it('a rename too pure for a hunk is named by its own lines, and the stolen header split loses (v61)', () => {
    const spaced = 'diff --git a/x.md b/m b/n.md\nsimilarity index 100%\nrename from x.md\nrename to m b/n.md\n';
    const [f] = parseStagedDiff(spaced).files;
    expect(f).toMatchObject({ path: 'm b/n.md', fromPath: 'x.md', change: 'renamed' });
    expect('quoted' in f!).toBe(false);
    const copy = 'diff --git a/o.md b/c o.md\nsimilarity index 100%\ncopy from o.md\ncopy to c o.md\n';
    expect(parseStagedDiff(copy).files[0]).toMatchObject({ path: 'c o.md', fromPath: 'o.md', change: 'copied' });
  });

  it('several staged files tally per-file AND in one set of totals', () => {
    const { files, counts, totals } = parseStagedDiff(`${ADDED}${MODIFIED}${DELETED}`);
    expect(files.map((f) => f.change)).toEqual(['added', 'modified', 'deleted']);
    expect(counts).toEqual({ added: 1, modified: 1, deleted: 1 });
    expect(totals).toEqual({ files: 3, hunks: 3, additions: 3, deletions: 2, binary: 0 });
  });

  it('the name pair before the first hunk is never content, and a "\ No newline" marker is never a line', () => {
    const c = parseStagedDiff('diff --git a/a.md b/a.md\nindex 1..2 100644\n--- a/a.md\n+++ b/a.md\n@@ -1 +1 @@\n+tail\n\\ No newline at end of file\n');
    expect(c.files[0]).toMatchObject({ additions: 1, deletions: 0, addedLines: ['tail'] });
    expect(c.files[0]!.path).toBe('a.md');
  });

  // v64: the SAME shape inside a hunk is a line the human staged. Reading it as a header renamed the file to
  // something that is not in the repository and left `addedLines` — the text §28 is asked to approve — empty.
  it('a staged addition reading `++ b/second.md` stays in notes.md, in the count AND in addedLines (v64)', () => {
    const c = parseStagedDiff('diff --git a/notes.md b/notes.md\nindex 1..2 100644\n--- a/notes.md\n+++ b/notes.md\n@@ -1,2 +1,3 @@\n head\n+++ b/second.md\n tail\n');
    expect(c.files).toHaveLength(1);
    expect(c.files[0]).toMatchObject({ path: 'notes.md', change: 'modified', additions: 1, deletions: 0, addedLines: ['++ b/second.md'] });
    expect(c.totals).toEqual({ files: 1, hunks: 1, additions: 1, deletions: 0, binary: 0 });
  });

  it('a staged deletion reading `-- a/ghost.ts` is one deletion, not a pre-image line (v64)', () => {
    const c = parseStagedDiff('diff --git a/code.ts b/code.ts\nindex 1..2 100644\n--- a/code.ts\n+++ b/code.ts\n@@ -1,3 +1,2 @@\n a\n--- a/ghost.ts\n b\n');
    expect(c.files[0]).toMatchObject({ path: 'code.ts', additions: 0, deletions: 1 });
  });

  it('a second staged section is outside a hunk again, so its pair names it and adds nothing (v64)', () => {
    const c = parseStagedDiff('diff --git a/a.md b/a.md\n--- a/a.md\n+++ b/a.md\n@@ -1 +1 @@\n+++ b/content.md\ndiff --git a/b.md b/b.md\n--- a/b.md\n+++ b/b.md\n@@ -1 +1 @@\n-x\n+y\n');
    expect(c.files.map((f) => [f.path, f.additions, f.deletions])).toEqual([['a.md', 1, 0], ['b.md', 1, 1]]);
  });

  it('a binary staged change is flagged and claims no lines; text before the first file header is ignored', () => {
    const out = 'warning: some preamble\n';
    expect(parseStagedDiff(out).files).toEqual([]);
    const b = parseStagedDiff('diff --git a/logo.png b/logo.png\nindex 1..2 100644\nBinary files a/logo.png and b/logo.png differ\n');
    expect(b.files[0]).toMatchObject({ path: 'logo.png', change: 'modified', hunks: 0, additions: 0, addedLines: [], binary: true });
    expect(b.totals.binary).toBe(1);
  });

  it('an empty index parses to an honest zero, not to a fake change', () => {
    expect(parseStagedDiff('')).toEqual({ files: [], counts: {}, totals: { files: 0, hunks: 0, additions: 0, deletions: 0, binary: 0 } });
  });
});

describe('tallyStagedCounts (canonical sentence order, absent kinds unspoken)', () => {
  it('speaks present kinds in fixed order regardless of how the object was built', () => {
    expect(tallyStagedCounts({ deleted: 1, added: 2, modified: 3 })).toBe('2 added, 3 modified, 1 deleted');
    expect(tallyStagedCounts({ copied: 1, renamed: 1 })).toBe('1 renamed, 1 copied');
    expect(tallyStagedCounts({})).toBe('');
  });
});

describe('gitStagedPolicy (TWO exact argv shapes; git\'s own escalations are not on the menu)', () => {
  const policy = gitStagedPolicy('X:/repo');
  it('allows exactly the cached diff with the execution flags pinned off, and its --stat form', () => {
    for (const argv of [
      ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached'],
      ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached', '--stat'],
    ]) {
      const d = planExec({ argv }, policy);
      expect(d.ok, argv.join(' ')).toBe(true);
    }
  });

  it('default-denies the unstaged diff (v32\'s door), every path-scoped form and the option-widenings that change what git CAN do', () => {
    for (const argv of [
      ['git', 'diff'], // v32's read-only policy, not this one
      ['git', 'diff', '--cached'], // v43's own shape, pinned BEFORE v46: no --no-ext-diff, so the repo's
      ['git', 'diff', '--cached', '--stat'], // .git/config could make git run a helper and return nothing
      ['git', 'diff', '--stat'],
      ['git', 'diff', '--cached', 'README.md'], // a path is a different question, and a scoping surface
      ['git', 'diff', '--cached', '--name-only'], // a third flag is not on the menu
      ['git', 'diff', '--cached', '--ext-diff'], // git would EXECUTE a configured helper: read-only in costume
      ['git', 'diff', '--cached', '--textconv'], // same, via gitattributes filters
      ['git', 'diff', '--cached', '--output=X:/repo/pwn.txt'], // a "read" that WRITES a file
      ['git', 'diff', '--cached', '--patch', '--', 'a.md'],
      ['git', 'diff', '--cached', '--stat', '--ext-diff'],
      ['git', '-c', 'diff.external=evil', 'diff', '--cached'],
      ['git', 'add', '.'], // staging stays a human act, in no policy here
      ['git', 'commit', '-m', 'x'], // v35's write door
      ['git', 'log', '--oneline', '-n', '2'], // v37's hash door
      ['git', 'show', '--format=', '--', 'a.md'], // v42's content door
    ]) {
      const d = planExec({ argv }, policy);
      expect(d.ok, argv.join(' ')).toBe(false);
      expect(d.ok ? '' : d.reason).toMatch(/default-deny/);
    }
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

function harness(stdout = '', stderr = '', end: { code: number | null; signal: string | null } = { code: 0, signal: null }, maxOutputBytes?: number) {
  const calls: { args: string[]; env: Record<string, string> }[] = [];
  const spawnLike: SpawnLike = (_command, args, opts) => {
    calls.push({ args, env: opts.env });
    const c = new FakeChild();
    queueMicrotask(() => c.fire(end, [...(stdout ? [['stdout', stdout] as ['stdout', string]] : []), ...(stderr ? [['stderr', stderr] as ['stderr', string]] : [])]));
    return c;
  };
  const host = createExecHost(gitStagedPolicy('X:/repo', { maxOutputBytes }), { spawnLike });
  const registry = registerGitStagedTool(new ToolRegistry(), host, { env: { PATH: '/bin', TOKEN: 'secret' } });
  return { calls, registry, grant: { checkpoint: () => true } };
}

describe('git.staged as a registry tool (the index behind §28 — a process still spawns)', () => {
  it('the spec is exec-permission with optional stat and cwd', () => {
    expect(GIT_STAGED_TOOL_SPECS.map((s) => [s.name, s.permissions])).toEqual([['git.staged', ['exec']]]);
    expect(GIT_STAGED_TOOL_SPECS[0]!.args).toEqual([
      { name: 'stat', type: 'boolean' },
      { name: 'cwd', type: 'string' },
    ]);
  });

  it('without a checkpoint the host is never reached: zero spawns', async () => {
    const h = harness(ADDED);
    const res = await h.registry.invoke({ callId: 'i0', tool: 'git.staged', args: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint required for exec');
    expect(h.calls).toHaveLength(0);
  });

  it('a denied checkpoint costs nothing at all — the intent stays unread', async () => {
    const h = harness(ADDED);
    const res = await h.registry.invoke({ callId: 'i0d', tool: 'git.staged', args: {} }, { checkpoint: () => false });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('denied at checkpoint (exec)');
    expect(h.calls).toHaveLength(0);
  });

  it('granted: argv is exactly `git diff --cached`, env is the scrubbed set, kinds and lines are the answer', async () => {
    const h = harness(`${ADDED}${MODIFIED}`);
    const res = await h.registry.invoke({ callId: 'i1', tool: 'git.staged', args: {} }, h.grant);
    expect(res.ok).toBe(true);
    expect(h.calls[0]!.args).toEqual(['diff', ...GIT_DIFF_FLAGS, '--cached']);
    expect(h.calls[0]!.env).toEqual(gitEnv({ PATH: '/bin' })); // TOKEN scrubbed before git ever saw it; v46's isolation rides along on every door
    expect(res.output).toMatchObject({
      ok: true,
      exitCode: 0,
      mode: 'full',
      counts: { added: 1, modified: 1 },
      totals: { files: 2, hunks: 2, additions: 3, deletions: 1, binary: 0 },
      paths: ['notes/widget.md', 'docs/a.md'],
    });
    expect((res.output as { files: Array<{ addedLines: string[] }> }).files[0].addedLines).toEqual(['widget notes', 'NOTE (DEMO MODE · seed 42)']);
    expect((res.output as { detail: string }).detail).toBe('git.staged → exit 0: index holds 2 change(s): 1 added, 1 modified · +3 −1 across 2 hunk(s)');
  });

  it('an EMPTY index says so in so many words — the pre-commit fact that matters', async () => {
    const h = harness('');
    const res = await h.registry.invoke({ callId: 'i2', tool: 'git.staged', args: {} }, h.grant);
    expect(res.output).toMatchObject({ ok: true, exitCode: 0, files: [], totals: { files: 0 } });
    expect((res.output as { detail: string }).detail).toContain('the index is EMPTY — nothing is staged, so a granted git.commit right now would have nothing to record');
  });

  // v52, measured on real git: in a CONFLICTED index `git diff --cached` exits 0 and prints a NOTICE
  // instead of a diff. Zero parsed files is a fact about the parser, not about the index — and this
  // is the sentence a human weighs one step before approving a commit over it.
  it('v52: an exit-0 unmerged NOTICE is never reported as an empty index', async () => {
    const h = harness('* Unmerged path file.md\n');
    const res = await h.registry.invoke({ callId: 'i2c', tool: 'git.staged', args: {} }, h.grant);
    const d = (res.output as { detail: string }).detail;
    expect(res.output).toMatchObject({ ok: true, exitCode: 0, files: [] });
    expect(d).toContain('git reported 1 UNMERGED path(s) (file.md) instead of a diff');
    expect(d).toContain('the index is NOT empty');
    expect(d).not.toContain('the index is EMPTY');
  });

  it('v52: the same notice in --stat shape keeps its footer AND names the conflict', async () => {
    const h = harness(' file.md | Unmerged\n 0 files changed\n');
    const res = await h.registry.invoke({ callId: 'i2d', tool: 'git.staged', args: { stat: true } }, h.grant);
    const d = (res.output as { detail: string }).detail;
    expect(d).toContain('git.staged --stat → exit 0: index holds 0 file(s)');
    expect(d).toContain('UNMERGED path(s) (file.md)');
  });

  it('v52: a refused read quotes the fatal line, not the first banner line', async () => {
    const h = harness('', 'fatal: .git/index: index file smaller than expected\n', { code: 128, signal: null });
    const res = await h.registry.invoke({ callId: 'i2e', tool: 'git.staged', args: {} }, h.grant);
    expect(res.output).toMatchObject({ ok: false, exitCode: 128 });
    expect((res.output as { detail: string }).detail).toContain('git.staged → exit 128: fatal: .git/index: index file smaller than expected');
  });

  // v56: the door's EMPTY claim is about STDOUT, so a flood on the other pipe must not hedge it.
  // Before this increment the door said "no complete line survived the output budget — this is NOT a
  // statement that the index has nothing staged" while the index genuinely was empty: the budget had
  // eaten a line the door never parses. Now it says the truth it is allowed to say, and names who cut.
  it('v56: a cut on stderr does not put the EMPTY verdict in doubt — and the sentence says (stderr)', async () => {
    const h = harness('', 'warning: some progress noise that will not fit at all\n', { code: 0, signal: null }, 6);
    const res = await h.registry.invoke({ callId: 'i2f', tool: 'git.staged', args: {} }, h.grant);
    const d = (res.output as { detail: string; truncated: boolean }).detail;
    expect(res.output).toMatchObject({ ok: true, files: [], truncated: true });
    expect(d).toContain('the index is EMPTY — nothing is staged');
    expect(d).toContain('output truncated at budget (stderr)');
    expect(d).not.toContain('no complete line survived');
  });

  it('v56: a cut on stdout still IS the hedge — the two cases stay distinguishable', async () => {
    const h = harness(ADDED, '', { code: 0, signal: null }, 4); // `diff`, no newline inside the window
    const res = await h.registry.invoke({ callId: 'i2g', tool: 'git.staged', args: {} }, h.grant);
    const d = (res.output as { detail: string }).detail;
    expect(d).toContain('no complete line survived the output budget');
    expect(d).toContain('output truncated at budget (stdout)');
    expect(d).not.toContain('the index is EMPTY');
  });

  it('v48: a budget so tight no whole line survives says the CUT, not "the index is EMPTY"', async () => {
    const h = harness(ADDED, '', { code: 0, signal: null }, 4); // 4 bytes = `diff`, no newline survives
    const res = await h.registry.invoke({ callId: 'i2b', tool: 'git.staged', args: {} }, h.grant);
    expect(res.output).toMatchObject({ ok: true, exitCode: 0, files: [], truncated: true });
    const d = (res.output as { detail: string }).detail;
    expect(d).toContain('no complete line survived the output budget');
    expect(d).not.toContain('index is EMPTY'); // v48: a cut is not an absence (§60)
    expect(d).toContain('output truncated at budget');
  });

  it('a binary staged change is counted and no lines are claimed (§60)', async () => {
    const h = harness('diff --git a/logo.png b/logo.png\nindex 1..2 100644\nBinary files a/logo.png and b/logo.png differ\n');
    const res = await h.registry.invoke({ callId: 'i3', tool: 'git.staged', args: {} }, h.grant);
    expect(res.output).toMatchObject({ ok: true, totals: { files: 1, binary: 1, additions: 0 } });
    expect((res.output as { detail: string }).detail).toContain('1 binary change(s) with no lines claimed');
  });

  it('stat mode asks the SECOND argv shape and reports git\'s own footer', async () => {
    const h = harness(' notes/widget.md | 3 +++\n 1 file changed, 3 insertions(+)\n');
    const res = await h.registry.invoke({ callId: 'i4', tool: 'git.staged', args: { stat: true } }, h.grant);
    expect(h.calls[0]!.args).toEqual(['diff', ...GIT_DIFF_FLAGS, '--cached', '--stat']);
    expect(res.output).toMatchObject({ ok: true, mode: 'stat', summary: { files: 1, insertions: 3, deletions: 0 } });
    expect((res.output as { detail: string }).detail).toBe('git.staged --stat → exit 0: index holds 1 file(s) · +3 −0');
  });

  it('a stat call with no footer states that nothing was parsed rather than inventing a tally', async () => {
    const h = harness('');
    const res = await h.registry.invoke({ callId: 'i5', tool: 'git.staged', args: { stat: true } }, h.grant);
    expect(res.output).toMatchObject({ ok: true, summary: { files: 0, insertions: 0, deletions: 0 } });
    expect((res.output as { detail: string }).detail).toContain('index holds 0 file(s) · +0 −0');
  });

  it('a non-zero git exit is honest DATA, not a crash', async () => {
    const h = harness('', 'error: unknown option `cached-only\'\nusage: git diff [<options>]\n', { code: 129, signal: null });
    const res = await h.registry.invoke({ callId: 'i6', tool: 'git.staged', args: {} }, h.grant);
    expect(res.ok).toBe(true);
    expect(res.output).toMatchObject({ ok: false, exitCode: 129, files: [] });
    expect((res.output as { detail: string }).detail).toContain('git.staged → exit 129: error: unknown option');
  });

  it('an escaping cwd is refused BEFORE any spawn', async () => {
    const h = harness(ADDED);
    const res = await h.registry.invoke({ callId: 'i7', tool: 'git.staged', args: { cwd: '../other-repo' } }, h.grant);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('cwd refused');
    expect(h.calls).toHaveLength(0);
  });

  it('a stat flag cannot be smuggled in as another type: the registry checks the spec before the host sees a token', async () => {
    const h = harness(ADDED);
    const res = await h.registry.invoke({ callId: 'i8', tool: 'git.staged', args: { stat: '--ext-diff' } }, h.grant);
    expect(res.ok).toBe(false); // not coerced to true, not silently read as the full diff
    expect(h.calls).toHaveLength(0);
    const omitted = await h.registry.invoke({ callId: 'i9', tool: 'git.staged', args: {} }, h.grant);
    expect(omitted.ok).toBe(true); // the no-flag call is the ONE default argv
    expect(h.calls[0]!.args).toEqual(['diff', ...GIT_DIFF_FLAGS, '--cached']);
  });
});
