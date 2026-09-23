import { describe, expect, it } from 'vitest';
import { ToolRegistry, planExec } from '@nexus/agent-runtime';
import type { SpawnLike } from '@nexus/agent-runtime';
import { createExecHost, type ExecChild } from '../src/execHost.js';
import { GIT_TOOL_SPECS, GIT_DIFF_FLAGS, gitEnv, gitReadOnlyPolicy, parseDiffStat, parseGitDiff, parseGitStatus, registerGitTools } from '../src/gitTools.js';
import { GIT_ABSENT_CONFIG, GIT_FORCED_CONFIG, GIT_ISOLATION_ENV, GIT_PASS_THROUGH_ENV_NAMES, forcedConfigEnv } from '../src/gitEnvIsolation.js';

describe('parseGitStatus (porcelain v1, pure data)', () => {
  it('maps XY codes to named statuses and counts per status', () => {
    const { files, counts } = parseGitStatus(' M src/a.ts\n?? pipeout.bin\nA  new.md\nD  gone.md\n');
    expect(files).toEqual([
      { xy: ' M', status: 'modified', path: 'src/a.ts' },
      { xy: '??', status: 'untracked', path: 'pipeout.bin' },
      { xy: 'A ', status: 'added', path: 'new.md' },
      { xy: 'D ', status: 'deleted', path: 'gone.md' },
    ]);
    expect(counts).toEqual({ modified: 1, untracked: 1, added: 1, deleted: 1 });
  });

  it('a rename keeps the NEW path; blank lines are noise, not entries', () => {
    const { files } = parseGitStatus('R  old/name.ts -> new/name.ts\n\n');
    expect(files).toEqual([{ xy: 'R ', status: 'renamed', path: 'new/name.ts' }]);
  });

  it('unknown XY codes say `other`, never silently match a known family', () => {
    expect(parseGitStatus('!  weird\n').files[0]).toMatchObject({ status: 'other' });
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
    expect(env.GIT_CONFIG_COUNT).toBe('4'); // and the count is OURS, so a smuggled fifth key is not read
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

function harness(stdout = '', end: { code: number | null; signal: string | null } = { code: 0, signal: null }, maxOut?: number) {
  const calls: { args: string[]; env: Record<string, string> }[] = [];
  const spawnLike: SpawnLike = (_command, args, opts) => {
    calls.push({ args, env: opts.env });
    const c = new FakeChild();
    queueMicrotask(() => c.fire(end, [['stdout', stdout]]));
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
