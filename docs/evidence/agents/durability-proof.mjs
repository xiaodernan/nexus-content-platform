// NEXUS M2 v3 — durability proof-of-work (ADR 0016 amendment 3).
// Headless, offline, key-free. Unlike v2 (in-process memory only), this proves the store
// survives into a SEPARATE OS process: run 1 persists memory through the checkpoint-gated,
// allowlisted `disk.write` tool (real node:fs inside a jailed temp root), run 2 is a fresh
// `node` child process that reloads the JSON and recalls from it. Escape attempts are
// rejected and never touch the disk outside the jail. §60: still demo-mode machinery.
// Run from the repo root after `npm run build`:  node docs/evidence/agents/durability-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { ToolRegistry, MemoryStore, registerMemoryTools, registerDiskTools, runTask } = rt;

const JAIL = path.join(os.tmpdir(), 'nexus-durability-proof').replace(/\\/g, '/');
fs.rmSync(JAIL, { recursive: true, force: true });

const seen = [];
const checkpoint = ({ call, permissions }) => {
  seen.push(`${call.tool}:${permissions.join('+')}`);
  return true;
};

// ── Run 1: an agent task whose finding is persisted to disk by the host ──────
const store1 = new MemoryStore();
// Cold memory: the task registry gets workspace tools only, so research goes through fs.search.
const reg1 = new ToolRegistry();
const ws = new rt.InMemoryWorkspace({ 'docs/rotate.md': '# Rotate\n\nrotation baking explanation\n' });
reg1.register(rt.WORKSPACE_TOOL_SPECS.find((s) => s.name === 'fs.search'), () => ({ hits: ws.search('rotation') }));
reg1.register(rt.WORKSPACE_TOOL_SPECS.find((s) => s.name === 'fs.read'), (a) => ({ content: ws.read(String(a.path)) }));
reg1.register(rt.WORKSPACE_TOOL_SPECS.find((s) => s.name === 'fs.append'), (a) => {
  ws.append(String(a.path), String(a.text));
  return { path: String(a.path) };
});
const goalA = 'rotation baking explanation';
const outA = await runTask({ id: 'dur-A', goal: goalA }, { registry: reg1, checkpoint });
assert.equal(outA.status, 'completed');
const hit = outA.results[0].output.hits[0];
assert.equal(hit.path, 'docs/rotate.md');

// Host persists memory via the allowlisted real-disk tool (node:fs satisfies FsWriteLike directly).
// Save the finding through memory.save first (checkpoint-gated §26), then flush to disk with disk.write.
const regDisk = registerDiskTools(new ToolRegistry(), { root: JAIL, fsLike: fs });
const regMem2 = registerMemoryTools(new ToolRegistry(), store1, 'atlas');
const gate = await regMem2.invoke(
  {
    callId: 'm1',
    tool: 'memory.save',
    args: { runId: 'dur-A', query: goalA, summary: `rotation doc found at ${hit.path}:${hit.line}`, refs: [`${hit.path}:${hit.line}`] },
  },
  { checkpoint },
);
assert.ok(gate.ok);
const json = rt.serializeMemory(store1);
const write = await regDisk.invoke(
  { callId: 'w1', tool: 'disk.write', args: { path: 'state/memory.json', content: json } },
  { checkpoint },
);
assert.ok(write.ok, `disk.write should land inside the jail: ${write.error}`);
assert.ok(fs.existsSync(path.join(JAIL, 'state', 'memory.json')));
assert.ok(seen.includes('disk.write:write'), 'disk.write must be checkpoint-gated');

// Escape attempts are refused and touch nothing outside the jail.
const escape = await regDisk.invoke(
  { callId: 'w2', tool: 'disk.write', args: { path: '../../nexus-escape.txt', content: 'x' } },
  { checkpoint },
);
assert.equal(escape.ok, false);
assert.match(escape.error, /escapes/);
assert.equal(fs.existsSync(path.join(os.tmpdir(), 'nexus-escape.txt')), false);

// ── Run 2: a FRESH OS process recalls from the persisted file ───────────────
const child = execFileSync(
  process.execPath,
  [
    '-e',
    `const DIST=${JSON.stringify(pathToFileURL('./agents/runtime/dist/index.js').href)};
     (async()=>{
       const rt=await import(DIST);
       const fs=require('fs');
       const store=new rt.MemoryStore();
       const res=rt.loadMemoryStore(store,fs,process.argv[1]);
       console.log(JSON.stringify({ok:res.ok,count:store.list().length,top:store.recall(process.argv[2])[0]??null}));
     })().catch(e=>{console.error(String(e));process.exit(1)});`,
    path.join(JAIL, 'state', 'memory.json'),
    'where is the rotation baking explanation',
  ],
  { encoding: 'utf8' },
);
const remote = JSON.parse(child);
assert.equal(remote.ok, true);
assert.equal(remote.count, 1);
assert.equal(remote.top.path, 'docs/rotate.md');
console.log('[durability-proof] run 2 (separate node process) recalled:', JSON.stringify(remote.top));

// A tampered/corrupt file fails honestly, never half-loads.
fs.writeFileSync(path.join(JAIL, 'state', 'memory.json'), '{oops');
const bad = rt.loadMemoryStore(new MemoryStore(), fs, path.join(JAIL, 'state', 'memory.json').replace(/\\/g, '/'));
assert.equal(bad.ok, false);
assert.equal(bad.reason, 'not valid JSON');

fs.rmSync(JAIL, { recursive: true, force: true });
console.log(`[durability-proof] jail root: ${JAIL} (cleaned up)`);
console.log('[durability-proof] gates seen:', seen.join(', '));
console.log('[durability-proof] ALL ASSERTIONS PASSED (cross-process durability, jailed writes, honest failure §60)');
