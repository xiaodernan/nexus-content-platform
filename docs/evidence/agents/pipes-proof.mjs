// NEXUS M2 v56 (exec-host) — THE BUDGET NAMES THE PIPE IT CUT (ADR 0016 amendment 56).
// v53 gave each stream its own ceiling; it did NOT give the host a way to say which ceiling was
// hit. `truncated: true` is one bit about two pipes, and that bit is load-bearing twice over: it is
// the clause a door appends for a human to weigh, and it is the condition v48's
// "no complete line survived the output budget" hedge turns on. Measured before writing any of this:
// a program printing a 32-byte answer on stdout and 8 KB of progress on stderr, under a 1 024-byte
// ceiling, came back with `→ exit 0 (output truncated)` beside a stdout that was BYTE-IDENTICAL to
// the answer. The door was doubting the one thing it had received whole — and the mirror case (the
// answer on the overflowing pipe) produced the SAME sentence, so no reader could tell them apart.
//
//   §1 the answer arrived whole, and the sentence says so by naming the other pipe;
//   §2 the mirror: the answer WAS cut, and the sentence says that instead;
//   §3 the two sentences differ where the aggregate flag made them identical — measured on the
//      same command with the streams swapped, so the before/after is arithmetic, not memory;
//   §4 a REAL git door with a REAL cut: 24 multibyte staged lines and budgets DERIVED from git's own
//      byte offsets, so every landing inside a line must produce v48's hedge AND name stdout;
//   §5 what the shipped git doors actually do with their two pipes (measured, not assumed: git
//      answers a read on ONE stream, so §1/§2's hazard reaches them through stdout cuts only — this
//      increment is honest about where its own bug lives);
//   §6 the v51 audit record carries the same naming, so "whose bytes were dropped" is answerable a
//      week later from the file alone;
//   §7 §9: every write inside os.tmpdir, this repo's HEAD compared byte-wise at the end.
// Run after `npm run build`:  node docs/evidence/agents/pipes-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const {
  GIT_DIFF_FLAGS,
  NODE_SPAWN,
  budgetFlags,
  createExecHost,
  gitEnv,
  gitStagedPolicy,
  loadExecAudits,
  registerExecHostTools,
  registerGitStagedTool,
} = eh;

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workRoot = mkTmp('nexus-v56-proof');
const B = (s) => Buffer.byteLength(s ?? '', 'utf8');
const ANSWER = 'ANSWER-LINE-1\nANSWER-LINE-2\n';
const NOISE = (fill) => `${fill.repeat(99)}\n`.repeat(80); // 8 000 bytes of whole lines, like any progress stream
const fsDisk = {
  readFileSync: (file, encoding) => readFileSync(file, encoding),
  mkdirSync: (dir) => mkdirSync(dir, { recursive: true }),
  writeFileSync: (file, data, encoding) => writeFileSync(file, data, encoding),
};

/** Run one argv through the SHIPPED exec.run door: the tool a §28 reviewer actually reads. */
async function throughExecRun(argv, cap, { journal, root = workRoot } = {}) {
  const policy = {
    root,
    allow: [{ argv, timeoutMs: 30_000, maxOutputBytes: cap }],
    envAllow: ['PATH', 'SYSTEMROOT', 'HOME', 'USERPROFILE'],
    maxTimeoutMs: 30_000,
    maxOutputBytes: cap,
  };
  const options = { spawnLike: NODE_SPAWN };
  if (journal) options.journal = { disk: fsDisk, file: journal };
  const registry = registerExecHostTools(new ToolRegistry(), createExecHost(policy, options));
  const res = await registry.invoke({ callId: `v56:${cap}`, tool: 'exec.run', args: { argv, cwd: ''} /* the policy root IS the jail; cwd stays relative (§9) */ }, { checkpoint: () => true });
  if (!res.ok) throw new Error(`exec.run failed: ${res.error}`);
  return res.output;
}
const writes = (stdoutFirst) => [
  'node',
  '-e',
  stdoutFirst
    ? `process.stdout.write(${JSON.stringify(ANSWER)}); process.stderr.write(${JSON.stringify(NOISE('E'))})`
    : `process.stderr.write(${JSON.stringify(NOISE('E'))}); process.stdout.write(${JSON.stringify(ANSWER)})`,
];

try {
  // ---------- §1 the answer is whole, so the sentence must not implicate it ----------
  const CAP = 1024;
  const whole = await throughExecRun(writes(true), CAP);
  assert.equal(whole.result.exitCode, 0, 'the program finished on its own');
  assert.equal(whole.result.stdout, ANSWER, 'stdout is BYTE-IDENTICAL to the answer');
  const control = execFileSync('node', writes(true).slice(1), { encoding: 'utf8', maxBuffer: 1 << 26, cwd: workRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(control, ANSWER, 'control, run outside the sandbox with no ceiling: this is the whole stdout the program produces');
  assert.equal(whole.result.truncated, true, 'and yes, bytes were dropped — on the other pipe');
  assert.deepEqual(whole.result.truncatedStreams, ['stderr'], 'v56: the host says WHICH');
  assert.ok(whole.detail.includes('output truncated: stderr'), 'and the sentence a human reads carries it');
  assert.ok(!/truncated[^)]*stdout/.test(whole.detail), 'and the truncation clause does not implicate the intact pipe (the argv text still quotes the program source, which is a different thing entirely)');
  console.log(`[pipes-proof] §1 ${B(ANSWER)} B answer + ${B(NOISE('E'))} B progress @ ${CAP} B → stdout kept whole, sentence: "${/(\(output[^)]*\))/.exec(whole.detail)?.[1]}"`);

  // ---------- §2 the mirror: now the ANSWER is the one that was cut ----------
  const starved = await throughExecRun(writes(false), 8); // a ceiling smaller than the answer itself
  assert.equal(starved.result.truncated, true);
  assert.deepEqual(starved.result.truncatedStreams, ['stdout', 'stderr'], 'an 8-byte ceiling is below BOTH pipes, and the answer is now among the cut ones — the case §1 could not express');
  assert.equal(starved.result.stdout, '', 'and what survives of a 28-byte answer inside 8 bytes is nothing at all (v48: whole lines only)');
  assert.ok(starved.detail.includes('output truncated: stdout'), 'and the sentence says so');
  console.log(`[pipes-proof] §2 the same command with the pipes swapped, @ 8 B → truncatedStreams ${JSON.stringify(starved.result.truncatedStreams)}, stdout ${B(starved.result.stdout)} B of the ${B(ANSWER)} B the program tried to print`);

  // ---------- §3 the aggregate flag made §1 and §2 the SAME sentence; the naming unifies nothing ----------
  assert.equal(whole.detail.includes('output truncated'), starved.detail.includes('output truncated'), 'both WERE truncated — the shared prefix is still true');
  assert.notEqual(whole.detail, starved.detail, 'and now the two sentences differ, which is the whole increment');
  assert.deepEqual(budgetFlags({ truncated: true, truncatedStreams: ['stdout'], killedByBudget: false }), ' · output truncated at budget (stdout)', 'one builder for six doors (v52 counted the duplication; v56 removed the second one)');
  assert.deepEqual(budgetFlags({ truncated: true, killedByBudget: true }), ' · output truncated at budget · killed at timeout budget', 'with no stream evidence it names nothing rather than guessing');
  console.log('[pipes-proof] §3 the two sentences differ where one bit made them identical · the no-evidence form refuses to guess');

  // ---------- §4 a REAL git door, REAL cut stdout, budgets DERIVED from git's own bytes ----------
  const repo = `${workRoot}/repo`;
  mkdirSync(repo, { recursive: true });
  const git = (...a) => {
    try {
      return execFileSync('git', a, { cwd: repo, encoding: 'utf8', env: gitEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] }) ?? '';
    } catch (e) {
      return e.stdout ?? '';
    }
  };
  git('init', '-q', '-b', 'master');
  git('config', 'user.email', 'v56@nexus.test');
  git('config', 'user.name', 'V56 Proof');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', `${workRoot}/no-hooks-there-are-none`);
  writeFileSync(`${repo}/seed.md`, 'seed\n');
  git('add', '.');
  git('commit', '-q', '-m', 'seed');
  const LINES = Array.from({ length: 24 }, (_, i) => `line ${i + 1} — 中文 content that is genuinely multibyte ${'尾'.repeat(9)}`);
  writeFileSync(`${repo}/intent.md`, `${LINES.join('\n')}\n`);
  git('add', 'intent.md');
  const full = git('diff', ...GIT_DIFF_FLAGS, '--cached');
  const offsets = [];
  let acc = 0;
  for (const line of full.split('\n')) {
    acc += B(`${line}\n`);
    offsets.push(acc);
  }
  const wholeIndex = await stagedDoor(repo, 65_536);
  assert.equal(wholeIndex.truncated, false, 'control: at its real budget the index reads whole');
  assert.ok(!/no complete line survived/.test(wholeIndex.detail), 'and carries no hedge');
  let named = 0;
  let hedged = 0;
  // sample INSIDE the very first line too, so the case where NOTHING survives to parse is included,
  // not only the case where a partial file list survives
  for (const cap of [1, 8, 16, 24, 32, ...offsets.filter((_, i) => i % 7 === 0)]) {
    const out = await stagedDoor(repo, cap);
    if (!out.truncated) continue;
    named += 1;
    const hedges = /no complete line survived/.test(out.detail);
    if (hedges) hedged += 1;
    assert.ok(out.detail.includes('output truncated at budget (stdout)'), `cap ${cap}: a cut of the parsed stream is named as stdout`);
    assert.equal(hedges, out.files.length === 0, `cap ${cap}: the hedge appears exactly when nothing survived to parse (${out.files.length} files read)`);
  }
  assert.ok(named > 8 && hedged >= 1, `${named} budgets cut something and ${hedged} of them emptied the stream — every one of them is now attributable`);
  console.log(`[pipes-proof] §4 real staged read across ${5 + offsets.filter((_, i) => i % 7 === 0).length} derived budgets: ${named} cut, ${hedged} emptied to nothing, all of them naming stdout`);

  // ---------- §5 where the hazard actually lives in this stack (measured, not assumed) ----------
  const GIT_READS = {
    'git.status': ['status', '--short'],
    'git.diff': ['diff', ...GIT_DIFF_FLAGS],
    'git.log': ['log', '--oneline', '-n', '3'],
    'git.show': ['show', ...GIT_DIFF_FLAGS, '--format=', '--', 'seed.md'],
    'git.staged': ['diff', ...GIT_DIFF_FLAGS, '--cached'],
  };
  const pipes = [];
  for (const [tool, argv] of Object.entries(GIT_READS)) {
    const seen = await throughExecRun(['git', ...argv], 65_536, { root: repo });
    assert.equal(seen.result.exitCode, 0, `${tool}: the read succeeded, so this is about pipes, not failures`);
    pipes.push(`${tool} out=${B(seen.result.stdout)}/err=${B(seen.result.stderr)}`);
  }
  assert.ok(pipes.every((p) => p.includes('err=0')), `every shipped git read answered on ONE pipe on this box: ${pipes.join(' ')}`);
  console.log(`[pipes-proof] §5 ${pipes.join(' ')} · so §1/§2's two-pipe hazard reaches the git doors only through a cut STDOUT, which §4 measures for real`);

  // ---------- §6 the v51 record carries the naming too ----------
  const journal = `${workRoot}/journal/pipes.jsonl`;
  await throughExecRun(writes(true), CAP, { journal });
  const { records, malformed } = loadExecAudits(fsDisk, journal);
  assert.equal(malformed, 0, 'the v51 reader is unmoved by the new field');
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].truncatedStreams, ['stderr'], 'a week later, from the file alone: the audit says whose bytes were dropped');
  assert.equal(records[0].stdout, ANSWER, 'and the answer it preserved, whole');
  console.log(`[pipes-proof] §6 the record of the same run: truncatedStreams ${JSON.stringify(records[0].truncatedStreams)}, stdout ${B(records[0].stdout)} B verbatim, seq ${records[0].seq}, rule ${records[0].rule}`);
} finally {
  rmSync(workRoot, { recursive: true, force: true });
  assert.ok(!existsSync(workRoot), 'every throwaway repo and journal is gone');
}

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every write here lived in os.tmpdir');
console.log('[pipes-proof] ALL ASSERTIONS PASSED (a budget says how much it kept, and now says which pipe it took it from)');

async function stagedDoor(root, cap) {
  const registry = registerGitStagedTool(new ToolRegistry(), createExecHost(gitStagedPolicy(root, { maxOutputBytes: cap }), { spawnLike: NODE_SPAWN }), { env: {} });
  const res = await registry.invoke({ callId: `v56:staged:${cap}`, tool: 'git.staged', args: {} }, { checkpoint: () => true });
  if (!res.ok) throw new Error(`git.staged failed at ${cap}: ${res.error}`);
  return res.output;
}

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(`${base}${n}`)) n += 1;
  mkdirSync(`${base}${n}`, { recursive: true });
  return `${base}${n}`;
}
