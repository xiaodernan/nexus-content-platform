import { describe, expect, it } from 'vitest';
import { ToolRegistry, planExec } from '@nexus/agent-runtime';
import { createExecHost, type ExecChild, type SpawnLike } from '../src/execHost.js';
import { GIT_COMMIT_TOOL_SPECS, gitCommitPolicy, parseCommitOutput, registerGitCommitTool } from '../src/gitCommitTool.js';
import { gitEnv } from '../src/gitTools.js';

describe('parseCommitOutput (git echo → structured record, pure data)', () => {
  it('branch@hash + subject + stat, even with create-mode lines after the stat', () => {
    const rec = parseCommitOutput('[master 0a1b2c3] feat: add thing\n 2 files changed, 3 insertions(+), 1 deletion(-)\n create mode 100644 b.ts\n');
    expect(rec).toEqual({ branch: 'master', rootCommit: false, hash: '0a1b2c3', subject: 'feat: add thing', stat: { files: 2, insertions: 3, deletions: 1 } });
  });

  it('a root-commit carries its marker; a stat with only insertions parses', () => {
    const rec = parseCommitOutput('[main deadbeef] initial\n 1 file changed, 4 insertions(+)\n');
    expect(rec).toMatchObject({ branch: 'main', hash: 'deadbeef', subject: 'initial', stat: { files: 1, insertions: 4, deletions: 0 } });
    expect(parseCommitOutput('[main (root-commit) abc1234] start\n 1 file changed, 1 deletion(-)\n')!.rootCommit).toBe(true);
  });

  it('a wrapped body keeps only git\'s echoed subject line; missing stat says null, not zeros', () => {
    const rec = parseCommitOutput('[dev 1122334] subject line\nbody continuation indented\n 3 files changed\n');
    expect(rec).toMatchObject({ subject: 'subject line', stat: { files: 3, insertions: 0, deletions: 0 } });
    expect(parseCommitOutput('[dev 1122334] solo\n')!.stat).toBeNull();
  });

  it('anything without a `[branch hash]` reference line is NOT a commit echo → null', () => {
    expect(parseCommitOutput('On branch main\nnothing to commit\n')).toBeNull();
    expect(parseCommitOutput('')).toBeNull();
  });
});

describe('gitCommitPolicy (ONE argv shape; the message is the only free token)', () => {
  const policy = gitCommitPolicy('X:/repo');
  it.each([['git', 'commit', '-m', 'ship it'], ['git', 'commit', '-m', 'two words + "quotes"'], ['git', 'commit', '-m', '*']])(
    'allows exactly %j (the * matches ONE arg token, never the shape)',
    (...argv) => {
      expect(planExec({ argv }, policy).ok).toBe(true);
    },
  );
  it('default-denies everything that is not `commit -m <one message>`', () => {
    for (const argv of [
      ['git', 'commit'], // no message
      ['git', 'commit', '-m', 'a', 'b'], // arity: a second token is NOT absorbed
      ['git', 'commit', '-am', 'sneak add+commit'],
      ['git', 'commit', '--no-verify', '-m', 'x'], // 5 tokens: shape mismatch
      ['git', 'add', '.'],
      ['git', 'push'],
      ['rm', '-rf', '/'],
    ]) {
      const d = planExec({ argv }, policy);
      expect(d.ok, argv.join(' ')).toBe(false);
      expect(d.ok ? '' : d.reason).toMatch(/default-deny/);
    }
  });
  it('an EMPTY message never plans (request shape is checked before the allowlist)', () => {
    const d = planExec({ argv: ['git', 'commit', '-m', ''] }, policy);
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/non-empty strings/);
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
  const host = createExecHost(gitCommitPolicy('X:/repo'), { spawnLike });
  const registry = registerGitCommitTool(new ToolRegistry(), host, { env: { PATH: '/bin', TOKEN: 'secret' } });
  return { calls, registry, grant: { checkpoint: () => true } };
}

const COMMIT_OK = '[master 0a1b2c3] proof: staged-only commit\n 1 file changed, 2 insertions(+)\n';

describe('git.commit as a registry tool (history writes ONLY behind §28, from the staged index)', () => {
  it('the spec is exec-permission with a REQUIRED message — there is no silent no-message commit', () => {
    expect(GIT_COMMIT_TOOL_SPECS.map((s) => [s.name, s.permissions])).toEqual([['git.commit', ['exec']]]);
    expect(GIT_COMMIT_TOOL_SPECS[0]!.args[0]).toMatchObject({ name: 'message', required: true });
  });

  it('without a checkpoint the host is never reached: zero spawns', async () => {
    const h = harness(COMMIT_OK);
    const res = await h.registry.invoke({ callId: 'k0', tool: 'git.commit', args: { message: 'x' } });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint required for exec');
    expect(h.calls).toHaveLength(0);
  });

  it('granted: the message rides to git as ONE verbatim argv token (spaces, quotes, newline and all)', async () => {
    const h = harness(COMMIT_OK);
    const message = 'feat: multi word message\nbody "quoted" — intact';
    const res = await h.registry.invoke({ callId: 'k1', tool: 'git.commit', args: { message } }, h.grant);
    expect(res.ok).toBe(true);
    expect(h.calls[0]!.args).toEqual(['commit', '-m', message]);
    expect(h.calls[0]!.env).toEqual(gitEnv({ PATH: '/bin' })); // TOKEN scrubbed before git ever saw it; v46's isolation rides along on every door
    expect(res.output).toMatchObject({ ok: true, exitCode: 0, record: { branch: 'master', hash: '0a1b2c3' } });
    expect((res.output as { detail: string }).detail).toContain('git.commit → exit 0: master@0a1b2c3 · 1 file(s) +2 −0');
  });

  it('a blank message is a stated tool ERROR — and it never reaches the policy, let alone a spawn', async () => {
    const h = harness(COMMIT_OK);
    const res = await h.registry.invoke({ callId: 'k2', tool: 'git.commit', args: { message: '   ' } }, h.grant);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('non-empty string');
    expect(h.calls).toHaveLength(0);
  });

  // v52: this fixture used to be ONE invented line. It is now git 2.52's OWN bytes for a commit over
  // an unchanged tree — banner first, verdict last — which is the case that made the door quote a
  // banner where a human reads a reason (the same bytes are driven for real in verdict-proof.mjs).
  it('nothing staged → git exits nonzero and says so as DATA, quoting the verdict and not the banner', async () => {
    const h = harness('On branch master\nnothing to commit, working tree clean\n', '', { code: 1, signal: null });
    const res = await h.registry.invoke({ callId: 'k3', tool: 'git.commit', args: { message: 'x' } }, h.grant);
    expect(res.ok).toBe(true);
    expect(res.output).toMatchObject({ ok: false, exitCode: 1 });
    const detail = (res.output as { detail: string }).detail;
    expect(detail).toContain('git.commit → exit 1: nothing to commit, working tree clean · git\'s last line of the 2 it printed');
    expect(detail).not.toContain('On branch master'); // what a pre-v52 door handed a §28 reviewer
  });

  it('a conflicted merge: git puts the reason on stderr and a status letter on stdout, and the door quotes the reason', async () => {
    const h = harness('U\tfile.md\n', "error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nfatal: Exiting because of an unresolved conflict.\n", { code: 128, signal: null });
    const res = await h.registry.invoke({ callId: 'k3b', tool: 'git.commit', args: { message: 'x' } }, h.grant);
    const detail = (res.output as { detail: string }).detail;
    expect(detail).toContain('git.commit → exit 128: error: Committing is not possible because you have unmerged files. · git\'s prefixed line of the 4 it printed');
    expect(detail).not.toContain('U\tfile.md');
  });

  it('git printing NOTHING at all is stated as that, not as a reason', async () => {
    const h = harness('', '', { code: 137, signal: 'SIGKILL' });
    const res = await h.registry.invoke({ callId: 'k3c', tool: 'git.commit', args: { message: 'x' } }, h.grant);
    expect((res.output as { detail: string }).detail).toContain('git.commit → exit 137: git printed no output at all');
  });

  it('an escaping cwd is a stated ERROR with zero spawns; the jail confines writes too', async () => {
    const h = harness(COMMIT_OK);
    const res = await h.registry.invoke({ callId: 'k4', tool: 'git.commit', args: { message: 'x', cwd: '../other-repo' } }, h.grant);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('cwd refused');
    expect(h.calls).toHaveLength(0);
  });

  it('a policy-refused shape never spawns — the tool cannot be talked into --no-verify', async () => {
    const h = harness(COMMIT_OK);
    const sneaky = await h.registry.invoke({ callId: 'k5', tool: 'git.commit', args: { message: 'x --no-verify -a' } }, h.grant);
    expect((sneaky.output as { ok: boolean }).ok).toBe(true); // it is STILL one -m token: git sees the flags as message text
    expect(h.calls[0]!.args).toEqual(['commit', '-m', 'x --no-verify -a']);
  });
});
