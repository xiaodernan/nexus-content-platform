// NEXUS M2 v9 — §25 role-pipeline proof (ADR 0016 amendment 9).
// Headless, offline, key-free. A researcher tool-session over the REAL repo produces a
// structured handoff (refs only — no chat), the host persists it to memory JSON + patch
// ledger in a jailed temp root, then a SEPARATE node child process loads that memory and
// completes the editor stage memory-first. The handoff therefore survives a process
// boundary — multi-agent cooperation as durable data, honestly in demo mode (§60).
// Run from the repo root after `npm run build`:  node docs/evidence/agents/pipeline-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { ToolRegistry, InMemoryWorkspace, MemoryStore, RoleRegistry, DEMO_ROLES, registerWorkspaceTools, registerMemoryTools, collectTextFiles, runRolePipeline } = rt;

const JAIL = path.join(os.tmpdir(), 'nexus-pipeline-proof').replace(/\\/g, '/');
fs.rmSync(JAIL, { recursive: true, force: true });
fs.mkdirSync(`${JAIL}/state`, { recursive: true });

const roles = new RoleRegistry();
DEMO_ROLES.forEach((r) => roles.register(r));

const files = collectTextFiles('.', fs);
const ws = new InMemoryWorkspace(files);
const store = new MemoryStore();
const registry = registerMemoryTools(registerWorkspaceTools(new ToolRegistry(), ws), store, 'pipeline');
registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
  ok: Object.values(ws.snapshot()).some((c) => c.includes('NOTE (DEMO MODE · agent pip-9')),
  detail: 'editor must annotate a handed-off file',
}));

const task = { id: 'pip-9', goal: 'embedTokens bag of tokens normalization' };
const res = await runRolePipeline(task, {
  roles, registry, store, checkpoint: () => true, fsLike: fs,
  memoryFile: `${JAIL}/state/handoff.json`, ledgerFile: `${JAIL}/state/ledger.jsonl`, evaluationFile: `${JAIL}/state/eval.jsonl`,
  snapshot: () => ws.snapshot(),
});
assert.equal(res.ok, true, JSON.stringify(res));
assert.equal(res.handoff.via, 'fs.index');
assert.equal(res.editorOutcome.status, 'completed');
assert.equal(res.editorOutcome.plan.steps[0].tool, 'memory.recall', 'editor researches from the handoff, not a cold index');
assert.equal(res.evaluation.score, 1);
console.log(`[pipeline-proof] handoff ${res.handoff.from}→${res.handoff.to} via ${res.handoff.via}: ${res.handoff.refs.map((r) => r.path).join(', ')}`);

// Cross-process: a fresh node child loads ONLY the handoff JSON (no repo ingest needed for
// research) and completes the editor stage from memory.
const target = res.handoff.refs[0].path;
const child = execFileSync(
  process.execPath,
  [
    '-e',
    `const DIST=${JSON.stringify(pathToFileURL('./agents/runtime/dist/index.js').href)};
     (async()=>{
       const rt=await import(DIST);
       const fs=require('fs');
       const store=new rt.MemoryStore();
       const loaded=rt.loadMemoryStore(store,fs,process.argv[1]);
       if(!loaded.ok) throw new Error(loaded.reason);
       const ws=new rt.InMemoryWorkspace(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
       const reg=rt.registerMemoryTools(rt.registerWorkspaceTools(new rt.ToolRegistry(),ws),store,'pipeline');
       reg.register({name:'test.run',description:'',permissions:['exec'],args:[]},()=>({ok:ws.read(process.argv[4]).includes('NOTE (DEMO MODE'),detail:'x'}));
       const roles=new rt.RoleRegistry(); rt.DEMO_ROLES.forEach(r=>roles.register(r));
       const out=await rt.runTask({id:'pip-9-child',goal:${JSON.stringify(task.goal)}},{registry:roles.scopedRegistry('editor',reg),checkpoint:()=>true,snapshot:()=>ws.snapshot()});
       const ev=rt.scoreRun(out);
       console.log(JSON.stringify({status:out.status,step0:out.plan.steps[0].tool,score:ev.score,added:out.changeSet?out.changeSet.files[0].added:0}));
     })().catch(e=>{console.error(String(e));process.exit(1)});`,
    `${JAIL}/state/handoff.json`,
    (() => {
      const f = `${JAIL}/state/target.json`;
      fs.writeFileSync(f, JSON.stringify({ [target]: files[target] }));
      return f;
    })(),
    'unused-argv3',
    target,
  ],
  { encoding: 'utf8' },
);
const remote = JSON.parse(child);
assert.equal(remote.status, 'completed');
assert.equal(remote.step0, 'memory.recall');
assert.equal(remote.score, 1);
console.log('[pipeline-proof] child process completed from the persisted handoff:', JSON.stringify(remote));

// Ledger + evaluation files record the parent stages.
assert.equal(rt.loadLedger(fs, `${JAIL}/state/ledger.jsonl`).runs.length, 1);
assert.equal(rt.loadEvaluations(fs, `${JAIL}/state/eval.jsonl`).evaluations[0].score, 1);

fs.rmSync(JAIL, { recursive: true, force: true });
console.log('[pipeline-proof] ALL ASSERTIONS PASSED (§25 handoff as durable data across a process boundary, §60 demo mode)');
