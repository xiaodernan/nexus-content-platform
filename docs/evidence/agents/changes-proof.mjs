// NEXUS M2 v7 — change-set + run-ledger proof (ADR 0016 amendment 7).
// Headless, offline, key-free. Two agent runs over a mini in-memory repo produce observed
// change-sets; each is rendered as a git-style unified diff and persisted through the
// checkpoint-gated, jailed `disk.write` (a human could `git apply` it externally — the
// honest stand-in for a git-commit tool, §60). Both full outcomes land in an append-only
// JSONL ledger that reloads across "sessions". Inverse patches must restore the exact
// before-snapshots. Run after `npm run build`:
//   node docs/evidence/agents/changes-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const {
  ToolRegistry, InMemoryWorkspace, registerWorkspaceTools, registerDiskTools,
  runTask, createChangeSet, applyPatch, inversePatch, formatUnifiedDiff, appendLedger, loadLedger,
} = rt;

const JAIL = path.join(os.tmpdir(), 'nexus-changes-proof').replace(/\\/g, '/');
fs.rmSync(JAIL, { recursive: true, force: true });

const seen = [];
const checkpoint = ({ call, permissions }) => {
  seen.push(`${call.tool}:${permissions.join('+')}`);
  return true;
};

const SEED = {
  'docs/widget.md': '# Widget\n\nThe widget renders parts.\n',
  'docs/other.md': '# Other\n\nunrelated\n',
};
const ledgerFile = `${JAIL}/state/ledger.jsonl`;

const diskReg = registerDiskTools(new ToolRegistry(), { root: JAIL, fsLike: fs });
const outcomes = [];
for (const n of [1, 2]) {
  const ws = new InMemoryWorkspace(SEED);
  const registry = registerWorkspaceTools(new ToolRegistry(), ws);
  registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
    ok: ws.read('docs/widget.md').includes('NOTE (DEMO MODE'),
    detail: 'annotated',
  }));
  const out = await runTask({ id: `chg-${n}`, goal: 'annotate widget docs' }, { registry, checkpoint, snapshot: () => ws.snapshot() });
  assert.equal(out.status, 'completed');
  assert.ok(out.changeSet, 'snapshot hook must yield a changeSet');
  assert.deepEqual(out.changeSet.files.map((f) => f.path), ['docs/widget.md']);
  assert.equal(out.changeSet.files[0].removed, 0, 'annotation only adds lines');

  // Unified diff → jailed disk.write (reviewable patch, applied by a human outside the runtime).
  const patchText = out.changeSet.files.map((f) => formatUnifiedDiff(f)).join('');
  assert.match(patchText, /^--- a\/docs\/widget\.md\n\+\+\+ b\/docs\/widget\.md\n@@ /);
  assert.match(patchText, /^\+NOTE \(DEMO MODE · agent chg-\d+/m);
  const wrote = await diskReg.invoke({ callId: `p${n}`, tool: 'disk.write', args: { path: `patches/chg-${n}.patch`, content: patchText } }, { checkpoint });
  assert.ok(wrote.ok, String(wrote.error));

  // Ledger append (audit trail survives the session).
  appendLedger(fs, ledgerFile, out);
  outcomes.push(out);
}

// Patches round-trip: forward reproduces after, inverse restores before.
for (const out of outcomes) {
  const f = out.changeSet.files[0];
  const after = applyPatch(SEED['docs/widget.md'], f);
  assert.ok(after.includes('NOTE (DEMO MODE'), 'forward patch adds the annotation');
  assert.equal(applyPatch(after, inversePatch(f)), SEED['docs/widget.md'], 'inverse patch must revert exactly');
}

// A fresh reader sees both runs, newest-last, well-formed.
const ledger = loadLedger(fs, ledgerFile);
assert.equal(ledger.malformed, 0);
assert.deepEqual(ledger.runs.map((r) => r.task.id), ['chg-1', 'chg-2']);
assert.deepEqual(loadLedger(fs, ledgerFile, 1).runs.map((r) => r.task.id), ['chg-2']);
for (const r of ledger.runs) assert.equal(r.provenance.mode, 'demo');

// createChangeSet is workspace-agnostic: same diffs recomputed from raw snapshots match.
const before = { 'x.md': 'a\nb\n' };
const after = { 'x.md': 'a\nB\nb\n' };
const cs = createChangeSet('manual', before, after);
assert.equal(applyPatch('a\nb\n', cs.files[0]), 'a\nB\nb\n');

assert.ok(seen.includes('disk.write:write') && seen.includes('fs.append:write'), 'gates visited');
console.log(`[changes-proof] 2 runs → patches in ${JAIL}/patches (checkpoint-gated, jailed)`);
console.log('[changes-proof] sample patch head:\n' + fs.readFileSync(`${JAIL}/patches/chg-1.patch`, 'utf8').split('\n').slice(0, 6).map((l) => '    ' + l).join('\n'));
console.log('[changes-proof] inverse patches revert exactly ✓ · ledger reloads [chg-1, chg-2] ✓');
console.log('[changes-proof] ALL ASSERTIONS PASSED (no child_process, no git binary — reviewable diffs, honest §60)');
fs.rmSync(JAIL, { recursive: true, force: true });
