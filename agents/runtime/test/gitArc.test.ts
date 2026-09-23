import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import { planTask } from '../src/planner.js';
import { GIT_ARC_TOOLS, gitArcDoors, gitArcSteps, runGitArc, type GitArcPresence } from '../src/gitArc.js';
import type { AgentTask } from '../src/types.js';

const TASK: AgentTask = { id: 'arc-1', goal: 'add widget docs', targetPath: 'docs/a.md' };

/** A host registry carrying exactly the doors `present` says exist. */
function doorHost(present: Partial<GitArcPresence>, impl?: (tool: string) => unknown): ToolRegistry {
  const reg = new ToolRegistry();
  const specs: Record<string, { name: string; type: 'boolean' | 'string' | 'number' }> = {
    'git.staged': { name: 'stat', type: 'boolean' },
    'git.commit': { name: 'message', type: 'string' },
    'git.log': { name: 'count', type: 'number' },
    'git.show': { name: 'path', type: 'string' },
  };
  for (const tool of GIT_ARC_TOOLS) {
    if (!present[tool]) continue;
    reg.register({ name: tool, description: '', permissions: ['exec'], args: [specs[tool]!] }, () => impl?.(tool) ?? { ok: true, detail: `${tool}: walked` });
  }
  return reg;
}

const FULL: GitArcPresence = { 'git.staged': true, 'git.commit': true, 'git.log': true, 'git.show': true };

describe('gitArcDoors — the nesting of v36/38/44/45, stated once', () => {
  it('all four doors present ⇒ the canonical order, intent first and content last', () => {
    expect(gitArcDoors(FULL)).toEqual(['git.staged', 'git.commit', 'git.log', 'git.show']);
  });

  it('no commit door ⇒ no arc at all, whatever else the host registered', () => {
    expect(gitArcDoors({ ...FULL, 'git.commit': false })).toEqual([]);
    expect(gitArcDoors({ 'git.staged': false, 'git.commit': false, 'git.log': true, 'git.show': true })).toEqual([]);
  });

  it('a content read never runs ahead of the hash it would agree with', () => {
    expect(gitArcDoors({ ...FULL, 'git.log': false })).toEqual(['git.staged', 'git.commit']);
    expect(gitArcDoors({ 'git.staged': true, 'git.commit': true, 'git.log': false, 'git.show': true })).toEqual(['git.staged', 'git.commit']);
  });

  it('every other subset stays ordered and never orphaned', () => {
    expect(gitArcDoors({ 'git.staged': false, 'git.commit': true, 'git.log': false, 'git.show': false })).toEqual(['git.commit']);
    expect(gitArcDoors({ 'git.staged': true, 'git.commit': true, 'git.log': true, 'git.show': false })).toEqual(['git.staged', 'git.commit', 'git.log']);
  });
});

describe('gitArcSteps is the plan\'s own tail (v47 anti-drift)', () => {
  for (const hasStaged of [true, false]) {
    for (const hasConfirm of [true, false]) {
      for (const hasContent of [true, false]) {
        it(`planTask and gitArcSteps agree for hasStaged=${hasStaged} hasConfirm=${hasConfirm} hasContent=${hasContent}`, () => {
          const plan = planTask(TASK, { hasVerify: true, hasCommit: true, hasStaged, hasConfirm, hasContent });
          const present: GitArcPresence = { 'git.staged': hasStaged, 'git.commit': true, 'git.log': hasConfirm, 'git.show': hasContent };
          expect(plan.steps.filter((s) => s.tool.startsWith('git.'))).toEqual(
            gitArcSteps({ present, message: `chore(agent): verified run ${TASK.id} · seed ${plan.seed}`, showPath: TASK.targetPath! }),
          );
        });
      }
    }
  }

  it('a deferred @ref passes through UNtouched — the arc never resolves or invents a path', () => {
    const [inspect] = gitArcSteps({ present: FULL, message: 'm', showPath: '@search.hits.0.path' }).filter((s) => s.tool === 'git.show');
    expect(inspect!.args).toEqual({ path: '@search.hits.0.path' });
  });

  it('empty index or not, the arc carries no conditionals: git.commit asks for the human-staged index and nothing else', () => {
    const commit = gitArcSteps({ present: FULL, message: 'chore(agent): verified run x', showPath: 'p' }).find((s) => s.tool === 'git.commit');
    expect(commit!.args).toEqual({ message: 'chore(agent): verified run x' });
    expect(commit!.rationale).toContain('human-staged');
  });
});

describe('runGitArc — a role-scoped walk of the same doors', () => {
  it('walks the doors the scope actually has, in order, stamping each call with the stage', async () => {
    const out = await runGitArc(doorHost(FULL), { callId: 'c1:release', message: 'm', showPath: 'docs/a.md', checkpoint: () => true });
    expect(out.status).toBe('completed');
    expect(out.doors).toEqual([...GIT_ARC_TOOLS]);
    expect(out.results.map((r) => r.callId)).toEqual(['c1:release:staged', 'c1:release:commit', 'c1:release:confirm', 'c1:release:inspect']);
    expect(out.steps.map((s) => s.stepId)).toEqual(['staged', 'commit', 'confirm', 'inspect']);
  });

  it('one §28 gate per door — the arc is never a single blanket approval', async () => {
    const gates: string[] = [];
    const out = await runGitArc(doorHost(FULL), {
      callId: 'g',
      message: 'm',
      showPath: 'p',
      checkpoint: ({ call, permissions }) => {
        gates.push(`${call.tool}:${permissions.join('/')}`);
        return true;
      },
    });
    expect(gates).toEqual(['git.staged:exec', 'git.commit:exec', 'git.log:exec', 'git.show:exec']);
    expect(out.status).toBe('completed');
  });

  it('a denial stops the walk at that door; the doors that passed STAND and the rest are never asked', async () => {
    const asked: string[] = [];
    const out = await runGitArc(doorHost(FULL), {
      callId: 'd',
      message: 'm',
      showPath: 'p',
      checkpoint: ({ call }) => {
        asked.push(call.tool);
        return call.tool !== 'git.commit';
      },
    });
    expect(out.status).toBe('stopped');
    expect(out.stoppedAt).toBe('commit');
    expect(out.reason).toContain('denied at commit');
    expect(asked).toEqual(['git.staged', 'git.commit']); // confirm/inspect never knocked
    expect(out.results.map((r) => r.ok)).toEqual([true, false]);
    expect(out.results[0]!.output).toEqual({ ok: true, detail: 'git.staged: walked' }); // the read the human allowed is not erased
  });

  it('no checkpoint at all: nothing runs, and the first door says why', async () => {
    const out = await runGitArc(doorHost(FULL), { callId: 'n', message: 'm', showPath: 'docs/a.md' });
    expect(out.status).toBe('stopped');
    expect(out.stoppedAt).toBe('staged');
    expect(out.results).toHaveLength(1);
    expect(out.results[0]!.error).toContain('checkpoint required');
  });

  it('PARITY WITH THE PLAN FACE: git answering red is DATA the arc carries, not a stop (v44 rule)', async () => {
    const out = await runGitArc(doorHost(FULL, (tool) => (tool === 'git.commit' ? { ok: false, detail: 'git.commit → exit 1: On branch master', exitCode: 1 } : { ok: true, detail: `${tool}: walked` })), {
      callId: 'e',
      message: 'm',
      showPath: 'p',
      checkpoint: () => true,
    });
    expect(out.status).toBe('completed');
    expect(out.doors).toHaveLength(4);
    expect(out.results[1]!.ok).toBe(true); // the tool worked
    expect((out.results[1]!.output as { ok: boolean }).ok).toBe(false); // and git said it recorded nothing
    expect((out.results[1]!.output as { detail: string }).detail).toContain('On branch master');
  });

  it('a door that throws stops the arc with git-side honesty preserved: earlier results stay', async () => {
    const out = await runGitArc(doorHost(FULL, (tool) => {
      if (tool === 'git.log') throw new Error('host died');
      return { ok: true, detail: `${tool}: walked` };
    }), { callId: 'f', message: 'm', showPath: 'p', checkpoint: () => true });
    expect(out.status).toBe('stopped');
    expect(out.stoppedAt).toBe('confirm');
    expect(out.reason).toContain('did not pass: host died');
    expect(out.results).toHaveLength(3);
  });

  it('the content door with no LIVE path is skipped and the skip is stated, not silently dropped', async () => {
    const out = await runGitArc(doorHost(FULL), { callId: 'h', message: 'm', checkpoint: () => true });
    expect(out.doors).toEqual(['git.staged', 'git.commit', 'git.log']);
    expect(out.status).toBe('completed');
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toContain('git.show skipped');
    expect(out.notes[0]).toContain('would be a guess');
  });

  it('an absent door needs no note — capability by absence is the scope\'s business, not a skip', async () => {
    const out = await runGitArc(doorHost({ 'git.staged': true, 'git.commit': true, 'git.log': true }), { callId: 'i', message: 'm', checkpoint: () => true });
    expect(out.doors).toEqual(['git.staged', 'git.commit', 'git.log']);
    expect(out.notes).toEqual([]);
    expect(out.results).toHaveLength(3);
  });
});
