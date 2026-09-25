import { describe, expect, it } from 'vitest';
import { ToolRegistry, planExec } from '@nexus/agent-runtime';
import { createExecHost, type ExecChild, type SpawnLike } from '../src/execHost.js';
import { GIT_LOG_MAX_COUNT, GIT_LOG_TOOL_SPECS, gitLogPolicy, parseGitLog, registerGitLogTool } from '../src/gitLogTool.js';
import { gitEnv } from '../src/gitTools.js';

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

  // v67 (ADR 0016 amendment 67): these two cases are the MEASURED harm, recorded at the parser so the
  // reason the shape carries `--no-decorate`/`--no-color` stays checkable. Neither flag is a hint.
  it('v67: a git DECORATION is indistinguishable from a subject that starts like one — no reader can un-parse it', () => {
    // Measured with `log.decorate=short` in .git/config: git printed this line for a commit whose real
    // subject is `real subject`. The next line is the SAME bytes for a commit a human titled
    // `(HEAD -> master) real subject`. A parser cannot tell the two apart, so the fix is not here.
    expect(parseGitLog('0a1b2c3 (HEAD -> master) real subject\n')).toEqual({
      commits: [{ hash: '0a1b2c3', subject: '(HEAD -> master) real subject' }],
      skipped: 0,
    });
  });

  it('v67: one ANSI prefix on the line costs the whole history — the hash stops matching, so git.log said EMPTY', () => {
    // Measured with `color.ui=always`: 2 real commits, and the door answered `0 commit(s) (empty log)`
    // at exit 0. This is why the color pin is a shape matter, not a stripping matter: a door that strips
    // escapes would be guessing which bytes git painted and which the repository committed.
    const { commits, skipped } = parseGitLog('\u001b[32m0a1b2c3\u001b[m feat: add thing\n');
    expect(commits).toEqual([]);
    expect(skipped).toBe(1);
  });
});

describe('gitLogPolicy (ONE argv shape; only the count floats)', () => {
  const policy = gitLogPolicy('X:/repo');
  const PINNED = ['git', 'log', '--oneline', '--no-decorate', '--no-color'];
  it.each([
    [...PINNED, '-n', '5'],
    [...PINNED, '-n', '100'],
    [...PINNED, '-n', '*'],
  ])('allows exactly %j (the * matches ONE arg token)', (...argv) => {
    expect(planExec({ argv }, policy).ok).toBe(true);
  });
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
      // v67: the pins are not optional. A log that did not say `--no-decorate`/`--no-color` would let the
      // repository write its own refs and escapes into the subject this door reports.
      ['git', 'log', '--oneline', '-n', '5'], // v37's own shape, pinned BEFORE v67: undecorated, uncolored by luck
      ['git', 'log', '--oneline', '--no-color', '-n', '5'], // half a pin
      ['git', 'log', '--oneline', '--no-decorate', '-n', '5'],
      ['git', 'log', '--oneline', '--decorate', '--no-color', '-n', '5'], // an ASKED-FOR decoration is still a widening
      ['git', 'log', '--oneline', '--no-decorate', '--color=always', '-n', '5'],
      ['git', 'log', '--oneline', '--no-decorate', '--no-color', '-n', '5', '--format=%H'], // a format is a different question
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
  const host = createExecHost(gitLogPolicy('X:/repo', { maxOutputBytes }), { spawnLike });
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
    expect(h.calls[0]!.args).toEqual(['log', '--oneline', '--no-decorate', '--no-color', '-n', '10']);
    expect(h.calls[0]!.env).toEqual(gitEnv({ PATH: '/bin' })); // TOKEN scrubbed before git ever saw it; v46's isolation rides along on every door
    expect(res.output).toMatchObject({ ok: true, exitCode: 0, count: 10, commits: [{ hash: '0a1b2c3', subject: 'proof: agent commit' }, { hash: 'deadbeef', subject: 'human seed commit' }] });
    expect((res.output as { detail: string }).detail).toContain('2 commit(s) · newest 0a1b2c3 "proof: agent commit"');
  });

  it('an explicit count rides the wildcard token verbatim; the bound rejects junk BEFORE any spawn', async () => {
    const h = harness(LOG_OK);
    const five = await h.registry.invoke({ callId: 'g2', tool: 'git.log', args: { count: 5 } }, h.grant);
    expect(five.ok).toBe(true);
    expect(h.calls[0]!.args).toEqual(['log', '--oneline', '--no-decorate', '--no-color', '-n', '5']);
    for (const count of [0, -3, 1.5, GIT_LOG_MAX_COUNT + 1, Number.NaN]) {
      const bad = await h.registry.invoke({ callId: `g2-${count}`, tool: 'git.log', args: { count } }, h.grant);
      expect(bad.ok, String(count)).toBe(false);
      expect(bad.error).toContain('bounded read-back');
    }
    expect(h.calls).toHaveLength(1); // the junk counts never reached the policy, let alone a process
  });

  it('an empty repo is honest DATA: git exits 128 and its own fatal line is the answer, not a crash', async () => {
    const h = harness('', "fatal: your current branch 'master' does not have any commits yet\n", { code: 128, signal: null });
    const res = await h.registry.invoke({ callId: 'g3', tool: 'git.log', args: {} }, h.grant);
    expect(res.ok).toBe(true);
    expect(res.output).toMatchObject({ ok: false, exitCode: 128, commits: [] });
    expect((res.output as { detail: string }).detail).toContain("git.log → exit 128: fatal: your current branch 'master' does not have any commits yet");
    // v52: `commits: []` here is a count of what git REFUSED to answer, not a finding about history
    expect((res.output as { detail: string }).detail).toContain('git REFUSED this command — this is NOT a statement that the repo has no commits');
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

  it('v48: a budget so tight no whole line survives says the CUT, not "empty log"', async () => {
    const h = harness('0a1b2c3 real\n', '', { code: 0, signal: null }, 4);
    const res = await h.registry.invoke({ callId: 'g6', tool: 'git.log', args: {} }, h.grant);
    const d = (res.output as { detail: string; truncated: boolean }).detail;
    expect(res.output).toMatchObject({ ok: true, exitCode: 0, commits: [], truncated: true });
    expect(d).toContain('no complete line survived the output budget');
    expect(d).not.toContain('empty log'); // v48: a cut is not an absence (§60)
    expect(d).not.toContain('AT LEAST'); // v68: a floor of NOTHING is v48's sentence, not a floor of a count
    expect(d).not.toContain('OLDER than every entry named here'); // and it names no entries to be older than
  });

  // v68 (ADR 0016 amendment 68): 24 of a 25-commit log read's 24 whole-line cut budgets used to print a
  // CENSUS. The clause below is what the door says now, and the newest-first property is what it may NOT say.
  const FIVE = [
    '0a1b2c3 newest commit subject, padded out a little',
    '1111111 the second newest commit in this repo',
    '2222222 third, and its subject is about as long',
    '3333333 fourth commit down the newest-first list',
    '4444444 fifth and oldest in this small fixture',
  ];
  const keepLines = (n: number) => FIVE.slice(0, n).reduce((b, l) => b + Buffer.byteLength(l, 'utf8') + 1, 0);

  it('v68: a cut read floors its own count and keeps the newest entry it named', async () => {
    const h = harness(`${FIVE.join('\n')}\n`, '', { code: 0, signal: null }, keepLines(2));
    const res = await h.registry.invoke({ callId: 'v68a', tool: 'git.log', args: { count: 5 } }, h.grant);
    const o = res.output as { detail: string; commits: { hash: string }[]; count: number; truncated: boolean };
    expect(o.commits.map((c) => c.hash)).toEqual(['0a1b2c3', '1111111']); // the SURVIVORS are git's newest, whole
    expect(o.detail).toContain('AT LEAST 2 commit(s)');
    expect(o.detail).toContain('this door asked for 5');
    expect(o.detail).toContain('truncated at budget (stdout)');
    expect(o.detail).not.toContain(': 2 commit(s)'); // the census phrasing must be unreachable on a cut read
  });

  it('v68: an UNCUT read is worded exactly as it was before v68 — and a budget landing on the last line boundary is uncut', async () => {
    const WHOLE = 'git.log → exit 0: 5 commit(s) · newest 0a1b2c3 "newest commit subject, padded out a little"';
    const exact = await harness(`${FIVE.join('\n')}\n`, '', { code: 0, signal: null }, keepLines(5)).registry
      .invoke({ callId: 'v68b', tool: 'git.log', args: { count: 5 } }, { checkpoint: () => true });
    const unbounded = await harness(`${FIVE.join('\n')}\n`).registry
      .invoke({ callId: 'v68c', tool: 'git.log', args: { count: 5 } }, { checkpoint: () => true });
    expect((exact.output as { detail: string }).detail).toBe(WHOLE); // v68's clause may not leak into a whole answer
    expect((unbounded.output as { detail: string }).detail).toBe(WHOLE); // …and the two reads agree byte for byte
    for (const o of [exact.output, unbounded.output] as { truncated: boolean; detail: string }[]) {
      expect(o.truncated).toBe(false);
      expect(o.detail).not.toContain('AT LEAST');
    }
  });

  it('v68: a cut that ALSO costs a hashless line floors the count and still reports the skip separately', async () => {
    const h = harness(`${FIVE[0]}\nnot-a-commit\n${FIVE[1]}\n`, '', { code: 0, signal: null }, Buffer.byteLength(`${FIVE[0]}\nnot-a-commit\n`, 'utf8'));
    const res = await h.registry.invoke({ callId: 'v68d', tool: 'git.log', args: { count: 5 } }, h.grant);
    const o = res.output as { detail: string; commits: unknown[]; skipped?: number };
    expect(o.commits).toHaveLength(1);
    expect(o.skipped).toBe(1); // v37's "counted, never guessed" survives the floor clause beside it
    expect(o.detail).toContain('AT LEAST 1 commit(s)');
    expect(o.detail).toContain('1 line(s) without a hash, counted not guessed');
  });
});
