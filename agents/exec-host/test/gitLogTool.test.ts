import { describe, expect, it } from 'vitest';
import { ToolRegistry, planExec } from '@nexus/agent-runtime';
import { createExecHost, type ExecChild, type SpawnLike } from '../src/execHost.js';
import { GIT_LOG_MAX_COUNT, GIT_LOG_TOOL_SPECS, gitLogPolicy, parseGitLog, registerGitLogTool } from '../src/gitLogTool.js';

describe('parseGitLog (--oneline echo → structured entries, pure data)', () => {
  it('hash + multi-word subjects parse newest-first, exactly as git echoed them', () => {
    const { commits, skipped } = parseGitLog('0a1b2c3 feat: add thing\n 4d5e6f7 chore: tidy two words\n');
    expect(commits).toEqual([
      { hash: '0a1b2c3', subject: 'feat: add thing' },
      { hash: '4d5e6f7', subject: 'chore: tidy two words' },
    ]);
    expect(skipped).toBe(0);
  });

  it('merge lines are ordinary entries; blank lines are free; a hashless line is SKIPPED, never guessed into a commit', () => {
    const { commits, skipped } = parseGitLog('ab12cd3 Merge branch "x" — keep the dash\n\nnot-a-commit-line\n');
    expect(commits).toEqual([{ hash: 'ab12cd3', subject: 'Merge branch "x" — keep the dash' }]);
    expect(skipped).toBe(1);
  });

  it('empty stdout is an honest empty log, not a failure', () => {
    expect(parseGitLog('')).toEqual({ commits: [], skipped: 0 });
  });
});

describe('gitLogPolicy (ONE argv shape; only the count floats)', () => {
  const policy = gitLogPolicy('X:/repo');
  it.each([['git', 'log', '--oneline', '-n', '5'], ['git', 'log', '--oneline', '-n', '100'], ['git', 'log', '--oneline', '-n', '*']])(
    'allows exactly %j (the * matches ONE arg token)',
    (...argv) => {
      expect(planExec({ argv }, policy).ok).toBe(true);
    },
  );
  it('default-denies every other git verb and every widened log', () => {
    for (const argv of [
      ['git', 'log'], // no shape
      ['git', 'log', '--oneline'], // no -n window
      ['git', 'log', '--oneline', '-n'], // no count token
      ['git', 'log', '--oneline', '-n', '5', 'main'], // 6 tokens: a ref is NOT absorbed
      ['git', 'log', '--all', '--oneline', '-n', '5'],
      ['git', 'show', 'HEAD'],
      ['git', 'commit', '-m', 'x'], // the WRITE lives in its own policy (v35)
      ['git', 'push'],
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
  const host = createExecHost(gitLogPolicy('X:/repo'), { spawnLike });
  const registry = registerGitLogTool(new ToolRegistry(), host, { env: { PATH: '/bin', TOKEN: 'secret' } });
  return { calls, registry, grant: { checkpoint: () => true } };
}

const LOG_OK = '0a1b2c3 proof: agent commit\n deadbeef human seed commit\n';

describe('git.log as a registry tool (read-back behind §28 — a process still spawns)', () => {
  it('the spec is exec-permission with OPTIONAL count and cwd', () => {
    expect(GIT_LOG_TOOL_SPECS.map((s) => [s.name, s.permissions])).toEqual([['git.log', ['exec']]]);
    expect(GIT_LOG_TOOL_SPECS[0]!.args).toEqual([
      { name: 'count', type: 'number' },
      { name: 'cwd', type: 'string' },
    ]);
  });

  it('without a checkpoint the host is never reached: zero spawns', async () => {
    const h = harness(LOG_OK);
    const res = await h.registry.invoke({ callId: 'g0', tool: 'git.log', args: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint required for exec');
    expect(h.calls).toHaveLength(0);
  });

  it('granted: default window is 10, argv is ONE fixed shape, env is the scrubbed set', async () => {
    const h = harness(LOG_OK);
    const res = await h.registry.invoke({ callId: 'g1', tool: 'git.log', args: {} }, h.grant);
    expect(res.ok).toBe(true);
    expect(h.calls[0]!.args).toEqual(['log', '--oneline', '-n', '10']);
    expect(h.calls[0]!.env).toEqual({ PATH: '/bin' }); // TOKEN scrubbed before git ever saw it
    expect(res.output).toMatchObject({ ok: true, exitCode: 0, count: 10, commits: [{ hash: '0a1b2c3', subject: 'proof: agent commit' }, { hash: 'deadbeef', subject: 'human seed commit' }] });
    expect((res.output as { detail: string }).detail).toContain('2 commit(s) · newest 0a1b2c3 "proof: agent commit"');
  });

  it('an explicit count rides the wildcard token verbatim; the bound rejects junk BEFORE any spawn', async () => {
    const h = harness(LOG_OK);
    const five = await h.registry.invoke({ callId: 'g2', tool: 'git.log', args: { count: 5 } }, h.grant);
    expect(five.ok).toBe(true);
    expect(h.calls[0]!.args).toEqual(['log', '--oneline', '-n', '5']);
    for (const count of [0, -3, 1.5, GIT_LOG_MAX_COUNT + 1, Number.NaN]) {
      const bad = await h.registry.invoke({ callId: `g2-${count}`, tool: 'git.log', args: { count } }, h.grant);
      expect(bad.ok, String(count)).toBe(false);
      expect(bad.error).toContain('bounded read-back');
    }
    expect(h.calls).toHaveLength(1); // the junk counts never reached the policy, let alone a process
  });

  it('an empty repo is honest DATA: git exits 128 and its first stderr line is the answer, not a crash', async () => {
    const h = harness('', "fatal: your current branch 'master' does not have any commits yet\n", { code: 128, signal: null });
    const res = await h.registry.invoke({ callId: 'g3', tool: 'git.log', args: {} }, h.grant);
    expect(res.ok).toBe(true);
    expect(res.output).toMatchObject({ ok: false, exitCode: 128, commits: [] });
    expect((res.output as { detail: string }).detail).toContain("git.log → exit 128: fatal: your current branch 'master' does not have any commits yet");
  });

  it('an escaping cwd is a stated ERROR with zero spawns — read-only still lives in the jail', async () => {
    const h = harness(LOG_OK);
    const res = await h.registry.invoke({ callId: 'g4', tool: 'git.log', args: { cwd: '../other-repo' } }, h.grant);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('cwd refused');
    expect(h.calls).toHaveLength(0);
  });

  it('hashless echo lines surface as a stated skip count, never as invented commits', async () => {
    const h = harness('0a1b2c3 real\ngarbage without a hash\n');
    const res = await h.registry.invoke({ callId: 'g5', tool: 'git.log', args: {} }, h.grant);
    expect((res.output as { commits: unknown[] }).commits).toEqual([{ hash: '0a1b2c3', subject: 'real' }]);
    expect(res.output).toMatchObject({ skipped: 1 });
    expect((res.output as { detail: string }).detail).toContain('1 line(s) without a hash, counted not guessed');
  });
});
