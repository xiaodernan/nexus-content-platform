import { describe, expect, it } from 'vitest';
import { ToolRegistry, planExec } from '@nexus/agent-runtime';
import { createExecHost, type ExecChild, type SpawnLike } from '../src/execHost.js';
import { GIT_SHOW_TOOL_SPECS, gitShowPolicy, parseShowDiff, registerGitShowTool, validateShowPath } from '../src/gitShowTool.js';

const NEW_FILE_DIFF = `diff --git a/notes/widget.md b/notes/widget.md
new file mode 100644
index 0000000..3f2a1b8
--- /dev/null
+++ b/notes/widget.md
@@ -0,0 +1,2 @@
+widget notes
+NOTE (DEMO MODE · seed 42)
`;

const MODIFIED_DIFF = `diff --git a/docs/a.md b/docs/a.md
index 1111111..2222222 100644
--- a/docs/a.md
+++ b/docs/a.md
@@ -1,2 +1,2 @@
 keep me
-old line
+new line
`;

describe('parseShowDiff (one file of HEAD\'s diff → the lines git kept, pure data)', () => {
  it('a file added at HEAD yields its WHOLE content as added lines', () => {
    expect(parseShowDiff(NEW_FILE_DIFF, 'notes/widget.md')).toEqual({
      path: 'notes/widget.md',
      hunks: 1,
      additions: 2,
      deletions: 0,
      addedLines: ['widget notes', 'NOTE (DEMO MODE · seed 42)'],
      binary: false,
    });
  });

  it('context and header lines are never content; +++/--- do not tally', () => {
    const c = parseShowDiff(MODIFIED_DIFF, 'docs/a.md');
    expect(c).toMatchObject({ hunks: 1, additions: 1, deletions: 1, addedLines: ['new line'] });
    expect(c.addedLines).not.toContain('/dev/null');
    expect(c.addedLines.some((l) => l.startsWith('+'))).toBe(false);
  });

  it('a binary change is STATED as binary — no hunks means no lines claimed', () => {
    const out = 'diff --git a/x.png b/x.png\nindex 1111111..2222222 100644\nBinary files a/x.png and b/x.png differ\n';
    expect(parseShowDiff(out, 'x.png')).toMatchObject({ hunks: 0, additions: 0, addedLines: [], binary: true });
  });

  it('empty stdout means HEAD touched nothing here, and a "\ No newline" marker is not a line', () => {
    expect(parseShowDiff('', 'a.md')).toMatchObject({ hunks: 0, additions: 0, deletions: 0, addedLines: [], binary: false });
    expect(parseShowDiff('@@ -1 +1 @@\n+tail\n\\ No newline at end of file\n', 'a.md').addedLines).toEqual(['tail']);
  });
});

describe('validateShowPath (one repo-relative path, nothing else)', () => {
  it('accepts ordinary repo paths, including nested and dotted ones', () => {
    for (const p of ['notes/widget.md', 'a', 'deep/inner/dir/file.ts', '.gitignore']) expect(validateShowPath(p)).toBe(p);
  });

  it('refuses the shapes that are not a path in THIS repo', () => {
    for (const p of ['', '   ', 'a\nb', '-x', '--stat', '/etc/passwd', 'C:\\Windows\\win.ini', '../outside.md', 'notes/../../x.md']) {
      expect(() => validateShowPath(p), JSON.stringify(p)).toThrow();
    }
    expect(() => validateShowPath(undefined)).toThrow(/non-empty path/);
    expect(() => validateShowPath(7)).toThrow(/non-empty path/);
  });
});

describe('gitShowPolicy (ONE argv shape; HEAD is pinned by omission)', () => {
  const policy = gitShowPolicy('X:/repo');
  it.each([
    ['git', 'show', '--format=', '--', 'notes/widget.md'],
    ['git', 'show', '--format=', '--', 'README.md'],
    ['git', 'show', '--format=', '--', '*'],
  ])('allows exactly %j (the * matches ONE path token)', (...argv) => {
    expect(planExec({ argv }, policy).ok).toBe(true);
  });

  it('default-denies every other show, every other verb and any widened argv', () => {
    for (const argv of [
      ['git', 'show'],
      ['git', 'show', 'HEAD'], // no format pin: the commit header would come back
      ['git', 'show', '--format=', 'HEAD'], // no `--`: a revision is being named
      ['git', 'show', '--format=', 'HEAD~9:README.md'], // blob syntax names ANOTHER commit
      ['git', 'show', '--format=', '--'], // arity: nothing to read
      ['git', 'show', '--format=', '--', 'a.md', 'b.md'], // a second path is a wider question
      ['git', 'show', '--format=', '--', 'a.md', 'main'], // a ref is NOT absorbed
      ['git', 'log', '--oneline', '-n', '2'], // the hash read-back is v37's policy
      ['git', 'commit', '-m', 'x'], // the write is v35's policy
      ['git', 'add', '.'], // staging stays a human act, in no policy here
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

function harness(stdout = '', stderr = '', end: { code: number | null; signal: string | null } = { code: 0, signal: null }) {
  const calls: { args: string[]; env: Record<string, string> }[] = [];
  const spawnLike: SpawnLike = (_command, args, opts) => {
    calls.push({ args, env: opts.env });
    const c = new FakeChild();
    queueMicrotask(() => c.fire(end, [...(stdout ? [['stdout', stdout] as ['stdout', string]] : []), ...(stderr ? [['stderr', stderr] as ['stderr', string]] : [])]));
    return c;
  };
  const host = createExecHost(gitShowPolicy('X:/repo'), { spawnLike });
  const registry = registerGitShowTool(new ToolRegistry(), host, { env: { PATH: '/bin', TOKEN: 'secret' } });
  return { calls, registry, grant: { checkpoint: () => true } };
}

describe('git.show as a registry tool (content behind §28 — a process still spawns)', () => {
  it('the spec is exec-permission with a REQUIRED path plus optional cwd', () => {
    expect(GIT_SHOW_TOOL_SPECS.map((s) => [s.name, s.permissions])).toEqual([['git.show', ['exec']]]);
    expect(GIT_SHOW_TOOL_SPECS[0]!.args).toEqual([
      { name: 'path', type: 'string', required: true },
      { name: 'cwd', type: 'string' },
    ]);
  });

  it('without a checkpoint the host is never reached: zero spawns', async () => {
    const h = harness(NEW_FILE_DIFF);
    const res = await h.registry.invoke({ callId: 's0', tool: 'git.show', args: { path: 'notes/widget.md' } });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint required for exec');
    expect(h.calls).toHaveLength(0);
  });

  it('a denied checkpoint costs nothing at all — the content stays unread', async () => {
    const h = harness(NEW_FILE_DIFF);
    const res = await h.registry.invoke({ callId: 's0d', tool: 'git.show', args: { path: 'notes/widget.md' } }, { checkpoint: () => false });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('denied at checkpoint (exec)');
    expect(h.calls).toHaveLength(0);
  });

  it('granted: argv is ONE fixed shape around the path, env is the scrubbed set, the lines are the answer', async () => {
    const h = harness(NEW_FILE_DIFF);
    const res = await h.registry.invoke({ callId: 's1', tool: 'git.show', args: { path: 'notes/widget.md' } }, h.grant);
    expect(res.ok).toBe(true);
    expect(h.calls[0]!.args).toEqual(['show', '--format=', '--', 'notes/widget.md']);
    expect(h.calls[0]!.env).toEqual({ PATH: '/bin' }); // TOKEN scrubbed before git ever saw it
    expect(res.output).toMatchObject({
      ok: true,
      exitCode: 0,
      path: 'notes/widget.md',
      hunks: 1,
      additions: 2,
      deletions: 0,
      addedLines: ['widget notes', 'NOTE (DEMO MODE · seed 42)'],
    });
    expect((res.output as { detail: string }).detail).toBe('git.show → exit 0: HEAD changed notes/widget.md · +2 −0 across 1 hunk(s)');
  });

  it('a partial change reports only HEAD\'s hunk, and says so — it never claims to be the whole file', async () => {
    const h = harness(MODIFIED_DIFF);
    const res = await h.registry.invoke({ callId: 's2', tool: 'git.show', args: { path: 'docs/a.md' } }, h.grant);
    expect(res.output).toMatchObject({ ok: true, hunks: 1, additions: 1, deletions: 1, addedLines: ['new line'] });
    expect((res.output as { detail: string }).detail).toContain('+1 −1 across 1 hunk(s)');
  });

  it('a non-zero git answer is honest DATA: git\'s own fatal line quoted, tool result still well-formed', async () => {
    // Real git 2.52 argv-probed message for the pinned shape on a branch with no commits yet
    // (`git show --format= -- <path>` → exit 128). An UNMATCHED path is NOT this case — it
    // exits 0 with an empty diff, which the next test covers.
    const h = harness('', "fatal: your current branch 'master' does not have any commits yet\n", { code: 128, signal: null });
    const res = await h.registry.invoke({ callId: 's3', tool: 'git.show', args: { path: 'nope.md' } }, h.grant);
    expect(res.ok).toBe(true);
    expect(res.output).toMatchObject({ ok: false, exitCode: 128, addedLines: [] });
    expect((res.output as { detail: string }).detail).toContain('git.show → exit 128: fatal: your current branch');
  });

  it('an empty diff (nothing recorded for this path in HEAD) states the nothing', async () => {
    const h = harness('');
    const res = await h.registry.invoke({ callId: 's4', tool: 'git.show', args: { path: 'a.md' } }, h.grant);
    expect(res.output).toMatchObject({ ok: true, exitCode: 0, hunks: 0, addedLines: [] });
    expect((res.output as { detail: string }).detail).toBe('git.show → exit 0: HEAD touches nothing at a.md (empty diff — git recorded no change for this path in HEAD)');
  });

  it('junk paths and escaping cwds are rejected BEFORE any spawn', async () => {
    const h = harness(NEW_FILE_DIFF);
    for (const path of ['', 'notes\nwidget.md', '-stat', '/etc/passwd', '../outside.md']) {
      const res = await h.registry.invoke({ callId: `s5:${path}`, tool: 'git.show', args: { path } }, h.grant);
      expect(res.ok, path).toBe(false);
    }
    const missing = await h.registry.invoke({ callId: 's5b', tool: 'git.show', args: {} }, h.grant);
    expect(missing.error).toContain('missing required arg "path"');
    const escape = await h.registry.invoke({ callId: 's6', tool: 'git.show', args: { path: 'a.md', cwd: '../other-repo' } }, h.grant);
    expect(escape.ok).toBe(false);
    expect(escape.error).toContain('cwd refused');
    expect(h.calls).toHaveLength(0); // read-only still lives in the jail, and validation came first
  });

  it('a binary change claims no lines (§60)', async () => {
    const h = harness('diff --git a/x.png b/x.png\nindex 1..2 100644\nBinary files a/x.png and b/x.png differ\n');
    const res = await h.registry.invoke({ callId: 's7', tool: 'git.show', args: { path: 'x.png' } }, h.grant);
    expect(res.output).toMatchObject({ ok: true, binary: true, addedLines: [] });
    expect((res.output as { detail: string }).detail).toContain('as a BINARY change');
  });
});
