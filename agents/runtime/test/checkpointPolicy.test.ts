import { describe, expect, it } from 'vitest';
import { ToolRegistry, type CheckpointRequest } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { decide, gatedCallIds, NO_RECEIPTS_NOTE, policyCheckpoint, receiptsOrNote, validateCheckpointPolicy, type CheckpointPolicy } from '../src/checkpointPolicy.js';
import { runTask } from '../src/orchestrator.js';
import type { AgentTask } from '../src/types.js';

const POLICY: CheckpointPolicy = {
  rules: [
    { tool: 'fs.*', grant: true, reason: 'workspace edits are the point of the run' },
    { tool: 'git.commit', grant: false, reason: 'staging review happens offline' },
  ],
  default: { grant: false, reason: 'unlisted capabilities escalate — nobody pre-approved this' },
};

const req = (tool: string, permissions: ['write'] | ['exec'] = ['write']): CheckpointRequest => ({
  call: { callId: `c:${tool}`, tool, args: {} },
  permissions,
});

describe('checkpoint policy (§28 as data)', () => {
  it('first matching rule wins, in order', () => {
    const d = decide(POLICY, req('fs.append'));
    expect(d).toMatchObject({ granted: true, matched: 'fs.*', reason: 'workspace edits are the point of the run' });
    const commit = decide(POLICY, req('git.commit', ['exec']));
    expect(commit.granted).toBe(false);
    expect(commit.matched).toBe('git.commit');
  });

  it('trailing globs and the * catch-all share matchesTool semantics with role scoping', () => {
    const p: CheckpointPolicy = { rules: [{ tool: '*', grant: true, reason: 'see-everything host' }], default: { grant: false, reason: 'unreachable' } };
    expect(decide(p, req('anything.at.all')).granted).toBe(true);
    const starFirst: CheckpointPolicy = { rules: [{ tool: '*', grant: true, reason: 'all' }, { tool: 'git.*', grant: false, reason: 'dead code guard' }], default: { grant: false, reason: 'd' } };
    expect(decide(starFirst, req('git.commit')).matched).toBe('*'); // FIRST match — order is semantics
  });

  it('unmatched calls land on the EXPLICIT default, never an invented verdict', () => {
    const d = decide(POLICY, req('memory.save'));
    expect(d.granted).toBe(false);
    expect(d.matched).toBe('default');
    expect(d.reason).toContain('escalate');
  });

  it('decide is pure: same inputs, byte-identical decision, policy untouched', () => {
    const frozen = structuredClone(POLICY);
    const a = decide(POLICY, req('fs.write'));
    const b = decide(POLICY, req('fs.write'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(POLICY).toEqual(frozen);
  });

  it('validateCheckpointPolicy refuses malformed data BEFORE it can gate anything', () => {
    expect(() => validateCheckpointPolicy({ rules: [{ tool: 'x', grant: true } as unknown as CheckpointPolicy['rules'][0]], default: { grant: false, reason: 'd' } })).toThrow(/reason/);
    expect(() => validateCheckpointPolicy({ rules: [{ tool: '', grant: true, reason: 'r' }], default: { grant: false, reason: 'd' } })).toThrow(/non-empty/);
    expect(() => validateCheckpointPolicy({ rules: [{ tool: 'a', grant: 'yes' as unknown as boolean, reason: 'r' }], default: { grant: false, reason: 'd' } })).toThrow(/grant/);
    expect(() => validateCheckpointPolicy({ rules: [{ tool: 'a', grant: true, reason: 'r' }, { tool: 'a', grant: false, reason: 'r2' }], default: { grant: false, reason: 'd' } })).toThrow(/duplicate/);
    expect(() => validateCheckpointPolicy({ rules: [], default: {} as CheckpointPolicy['default'] })).toThrow(/explicit default/);
    expect(() => validateCheckpointPolicy(POLICY)).not.toThrow();
  });

  it('policyCheckpoint keeps a receipt for EVERY verdict, in order', async () => {
    const cp = policyCheckpoint(POLICY);
    expect(await cp(req('fs.append'))).toBe(true);
    expect(await cp(req('git.commit', ['exec']))).toBe(false);
    expect(await cp(req('memory.save'))).toBe(false);
    expect(cp.decisions.map((d) => [d.matched, d.granted])).toEqual([['fs.*', true], ['git.commit', false], ['default', false]]);
    expect(cp.decisions[1]!.reason).toBe('staging review happens offline');
  });

  it('through the registry: a policy denial IS a §28 denial — same contract, same message', async () => {
    const registry = registerWorkspaceTools(new ToolRegistry(), new InMemoryWorkspace({ 'a.md': 'x\n' }));
    const cp = policyCheckpoint({ rules: [{ tool: 'fs.*', grant: false, reason: 'read-only host' }], default: { grant: false, reason: 'd' } });
    const res = await registry.invoke({ callId: 'c1', tool: 'fs.append', args: { path: 'a.md', text: 'hi' } }, { checkpoint: cp });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('denied at checkpoint (write)');
    expect(cp.decisions).toHaveLength(1);
  });

  it('runTask end-to-end: the policy decides which steps of the SAME plan run — audit says who', async () => {
    const ws = new InMemoryWorkspace({ 'docs/a.md': '# A\nwidget notes\n' });
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry.register({ name: 'test.run', description: 'v', permissions: ['exec'], args: [] }, () => ({ ok: true, detail: 'green' }));
    registry.register({ name: 'git.commit', description: 'c', permissions: ['exec'], args: [{ name: 'message', type: 'string' }] }, () => ({ ok: true }));
    const task: AgentTask = { id: 'cp1', goal: 'add widget docs', targetPath: 'docs/a.md' };
    const runWith = async (allowCommit: boolean) => {
      const cp = policyCheckpoint({
        rules: [
          { tool: 'fs.*', grant: true, reason: 'work the workspace' },
          { tool: 'test.run', grant: true, reason: 'verification is free' },
          { tool: 'git.commit', grant: allowCommit, reason: allowCommit ? 'human pre-approved this one shape' : 'human kept history closed' },
        ],
        default: { grant: false, reason: 'nothing else was ever discussed' },
      });
      const out = await runTask(task, { registry, checkpoint: cp, maxFixRounds: 0 });
      return { cp, out };
    };
    const blocked = await runWith(false);
    expect(blocked.out.status).toBe('denied');
    expect(blocked.out.results.at(-1)!.tool).toBe('git.commit');
    expect(ws.read('docs/a.md')).toContain('NOTE (DEMO'); // earlier policy-granted work STANDS
    const redacted = blocked.cp.decisions.filter((d) => d.matched === 'git.commit');
    expect(redacted).toHaveLength(1);
    expect(redacted[0]!.granted).toBe(false);
    const opened = await runWith(true);
    expect(opened.out.status).toBe('completed');
    // only DANGEROUS calls ever reach a checkpoint — the two read steps produced no verdicts
    expect(opened.cp.decisions.map((d) => d.call.tool)).toEqual(['fs.append', 'test.run', 'git.commit']);
    // search+read are read-permission: the policy never spoke for them (§28 gates writes, not eyes)
  });
});

/* ---- v54: the ownership rule lifted out of the git arc, so every record kind shares it ---- */

describe('receiptsOrNote + gatedCallIds (v54)', () => {
  const call = (id: string, tool: string) => ({ call: { callId: id, tool, args: {} }, permissions: ['write'] as ['write'] });

  it('takes only the receipts whose call id this record issued, in the order they were asked', () => {
    const cp = policyCheckpoint(POLICY);
    cp(call('a:annotate', 'fs.append'));
    cp(call('other:annotate', 'fs.append')); // an earlier stage of the same process, same tool
    cp(call('a:write', 'fs.write'));
    const owned = ['a:annotate', 'a:write'];
    const { decisions, note } = receiptsOrNote(cp, owned);
    expect(decisions.map((d) => d.call.callId)).toEqual(['a:annotate', 'a:write']);
    expect(note).toBeUndefined();
  });

  it('hands out COPIES, so a running process cannot edit what a record already reported', () => {
    const cp = policyCheckpoint(POLICY);
    cp(call('a:annotate', 'fs.append'));
    const { decisions } = receiptsOrNote(cp, ['a:annotate']);
    const before = JSON.stringify(decisions);
    cp.decisions[0]!.granted = false;
    cp.decisions[0]!.reason = 'rewritten after the fact';
    expect(JSON.stringify(decisions)).toBe(before);
  });

  it('an empty list from a face that KEEPS one is a fact, not a gap needing a sentence', () => {
    const cp = policyCheckpoint(POLICY);
    cp(call('elsewhere:x', 'fs.append'));
    const { decisions, note } = receiptsOrNote(cp, ['a:nothing-mine']);
    expect(decisions).toEqual([]);
    expect(note).toBeUndefined();
  });

  it('three silences stay three different answers: no list + gates ⇒ note, no list + no gates ⇒ quiet', () => {
    const bare = () => true;
    expect(receiptsOrNote(bare, ['a:annotate'])).toEqual({ decisions: [], note: NO_RECEIPTS_NOTE });
    expect(receiptsOrNote(undefined, ['a:annotate'])).toEqual({ decisions: [], note: NO_RECEIPTS_NOTE });
    expect(receiptsOrNote(bare, [])).toEqual({ decisions: [] });
    // A walk of pure reads asked §28 nothing, so an empty list IS the whole report (§60).
    expect(receiptsOrNote(bare, []).note).toBeUndefined();
  });

  it('gatedCallIds counts the calls §28 would actually have seen — absence is not a denial', () => {
    const reg = new ToolRegistry();
    reg.register({ name: 'fs.read', description: '', permissions: ['read'], args: [] }, () => 'x');
    reg.register({ name: 'fs.append', description: '', permissions: ['write'], args: [] }, () => 'x');
    reg.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => 'x');
    const calls = [
      { callId: 'r:search', tool: 'fs.read' },
      { callId: 'r:annotate', tool: 'fs.append' },
      { callId: 'r:verify', tool: 'test.run' },
      { callId: 'r:ghost', tool: 'git.commit' }, // not in THIS scope: capability by absence (§24)
    ];
    expect(gatedCallIds(reg, calls)).toEqual(['r:annotate', 'r:verify']);
    expect(gatedCallIds(reg, [])).toEqual([]);
  });
});
