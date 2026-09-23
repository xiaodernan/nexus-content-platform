// NEXUS M2 v51 (exec-host) — THE HOST KEEPS ITS OWN RECORD proof (ADR 0016 amendment 51).
// Measured before writing anything: every process this stack ever pays for is born inside ONE
// function (ExecHost.run — seven call sites, all of them inside @nexus/exec-host: the six git
// doors, execTestRunner, and the generic exec.run tool), and that function kept no record of its
// own. `appendExecRun` has existed since v30, and product code called it EXACTLY ZERO times: the
// only writers of a spawn record were a proof and a unit test. So the single strongest safety event
// in the sandbox — the policy saying NO to a command while a §28 checkpoint was saying YES — left
// no trace at all, and "which processes really ran, with what argv, under which allowlist rule"
// was recoverable only from the agent's own narrated results, one layer up, after every door had
// parsed them into its own preferred shape.
// This proof watches a journaled host against REAL git and against a spawn counter that does not
// know anything about journals:
//   §1 the policy under test is COMPOSED from the shipped door factories (nobody hand-copied a flag),
//      and the union gives six rules where the doors themselves use only four of them;
//   §2 every record matches a real process one-for-one, in the order they happened, argv verbatim —
//      and the record carries the exact argv, the cwd, the rule index, the signal and the budget
//      flags, five keys that appear NOWHERE in what the doors handed back;
//   §3 what a caller CANNOT see: an approving human + a refusing policy = `rule: null`,
//      `planned: false`, zero processes, and one durable line saying so; a failure whose words the
//      door compresses to one line keeps the program's FULL output in the record;
//   §4 a cold reader, given only the file, re-derives the story byte-for-byte and joins it to the
//      doors' own answers; malformed 0 and no gap in `seq`, i.e. every record landed;
//   §5 what the journal does NOT claim: a §28 veto at the registry is a decision by the HUMAN, and
//      it lives in the ledger receipts, not here. Different subjects, deliberately not merged.
// §9 holds throughout: real writes only inside os.tmpdir (the journal too), and this repo's HEAD is
// compared byte-wise at the end.
// Run after `npm run build`:  node docs/evidence/agents/spawnlog-proof.mjs
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
  GIT_ENV_NAMES,
  NODE_SPAWN,
  createExecHost,
  gitCommitPolicy,
  gitEnv,
  gitLogPolicy,
  gitReadOnlyPolicy,
  gitShowPolicy,
  gitStagedPolicy,
  loadExecAudits,
  registerExecHostTools,
  registerGitCommitTool,
  registerGitLogTool,
  registerGitShowTool,
  registerGitStagedTool,
} = eh;

/** The journal is a real file, written by the host through an injected fs. */
const fsDisk = {
  readFileSync: (file, encoding) => readFileSync(file, encoding),
  mkdirSync: (dir) => mkdirSync(dir, { recursive: true }),
  writeFileSync: (file, data, encoding) => writeFileSync(file, data, encoding),
};

/** Every key the host appends on top of what it returned to its caller. */
const AUDIT_KEYS = ['argv', 'cwd', 'signal', 'killedByBudget', 'truncated', 'spawnError', 'exitCode', 'stdout', 'stderr', 'reason', 'ran', 'planned', 'seq', 'rule'];

/** A spawn wrapper that knows nothing about journals: it only reports which processes were born. */
const countingSpawn = (sink) => (command, args, opts) => {
  sink.push(`${command} ${args.join(' ')}`);
  const child = NODE_SPAWN(command, args, opts);
  return {
    onData: (listener) => child.onData((stream, chunk) => listener(stream, chunk)),
    onEnd: (listener) => child.onEnd(listener),
    kill: () => child.kill(),
  };
};

/** Collect every KEY NAME appearing anywhere inside a JSON value (arrays included). */
const keyNames = (value, into = new Set()) => {
  if (Array.isArray(value)) for (const v of value) keyNames(v, into);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { into.add(k); keyNames(v, into); }
  return into;
};

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// ---------- §1: the policy is composed from the shipped factories, not retyped ----------
const arcPolicyRules = (root) => [
  gitStagedPolicy(root).allow[0], // 0  git diff --no-ext-diff --no-textconv --cached
  gitStagedPolicy(root).allow[1], // 1  the same + --stat (a shape the arc never plans)
  gitCommitPolicy(root).allow[0], // 2  git commit -m <message>
  gitLogPolicy(root).allow[0], //   3  git log --oneline -n <count>
  gitShowPolicy(root).allow[0], //    4  git show … -- <path>
  gitReadOnlyPolicy(root).allow[0], //5  git status --short (granted here, never asked)
];
{
  const rules = arcPolicyRules('X:/repo');
  assert.equal(rules.length, 6, 'six allowlist rules in ONE host: the doors used to each own a one-rule policy, so `rule` meant nothing');
  assert.deepEqual(rules[0].argv, gitStagedPolicy('X:/repo').allow[0].argv, 'rule 0 is the shipped staged argv shape, flags and all (interpolated, not copied)');
  assert.deepEqual(rules[4].argv, gitShowPolicy('X:/repo').allow[0].argv, 'rule 4 is the shipped show argv shape');
  const execs = new Set(rules.map((r) => r.argv[0]));
  assert.deepEqual([...execs], ['git'], 'one executable for the whole host: composing policies did not widen what may run, only which rule answers');
  console.log(`[spawnlog-proof] §1 1 host, 6 rules, derived from the 4 shipped policy factories: ${rules.map((r) => r.argv.join(' ')).join(' | ')}`);
}

const dir = mkTmp('nexus-spawnlog-');
const logDir = mkTmp('nexus-spawnlog-logs-');
try {
  const posix = dir.replace(/\\/g, '/');
  // The journal sits OUTSIDE the repo it watches — measured in an earlier run of this proof, a log
  // file inside the throwaway showed up in git's own `Untracked files:` list, i.e. the record
  // contaminated the thing being recorded.
  const journalFile = `${logDir.replace(/\\/g, '/')}/spawn-audit.jsonl`;
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'master');
  git('config', 'user.name', 'NEXUS Spawn Log Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // neutralized INSIDE the throwaway only
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  writeFileSync(join(dir, 'README.md'), 'human seed\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'chore: human seed commit');

  // THE HUMAN ACT: staging stays a human act (§28/§9). Two lines, one of them multibyte.
  const LINES = ['intent: the host records itself', '意图：宿主自己记账'];
  writeFileSync(join(dir, 'intent.md'), `${LINES.join('\n')}\n`);
  git('add', 'intent.md');

  const spawns = [];
  const RULES = arcPolicyRules(posix);
  const host = createExecHost(
    { root: posix, allow: RULES, envAllow: GIT_ENV_NAMES, maxTimeoutMs: 30_000, maxOutputBytes: 262_144 },
    { spawnLike: countingSpawn(spawns), journal: { disk: fsDisk, file: journalFile } },
  );
  let registry = new ToolRegistry();
  registry = registerExecHostTools(registry, host);
  registry = registerGitStagedTool(registry, host, { env: gitEnv() });
  registry = registerGitCommitTool(registry, host, { env: gitEnv() });
  registry = registerGitLogTool(registry, host, { env: gitEnv() });
  registry = registerGitShowTool(registry, host, { env: gitEnv() });
  const grant = { checkpoint: () => true };
  const deny = { checkpoint: () => false };
  const call = (callId, tool, args, gate = grant) => registry.invoke({ callId, tool, args }, gate);

  // ---------- §2: a walk of four doors, cross-checked against the processes themselves ----------
  const staged = await call('w:staged', 'git.staged', {});
  assert.equal(staged.ok, true, staged.error);
  const MESSAGE = 'feat(agent): v51 self-record — 一条中文';
  const committed = await call('w:commit', 'git.commit', { message: MESSAGE });
  assert.equal(committed.output.record.subject, MESSAGE, 'the door parsed its own commit');
  const logged = await call('w:log', 'git.log', { count: 2 });
  assert.equal(logged.output.commits[0].subject, MESSAGE);
  const shown = await call('w:show', 'git.show', { path: 'intent.md' });
  assert.deepEqual(shown.output.addedLines, LINES, 'and HEAD holds exactly what the human staged');
  assert.equal(spawns.length, 4, 'four doors, four real processes');

  const audits = loadExecAudits(fsDisk, journalFile);
  assert.equal(audits.malformed, 0, 'every line the host wrote reads back as an audit record');
  assert.equal(audits.records.length, 4, 'one record per outcome, no extras');
  assert.deepEqual(audits.records.map((r) => r.seq), [1, 2, 3, 4], 'the host wrote its own order');
  assert.deepEqual(audits.records.map((r) => r.rule), [0, 2, 3, 4], 'and WHICH RULE let each one through: the --stat rule (1) and the status rule (5) are visible as absences — an unused allowlist entry is now measurable, not folklore');
  assert.deepEqual(audits.records.map((r) => r.argv.join(' ')), spawns, 'RECORDS ≡ PROCESSES, line for line, in the order they happened, argv verbatim including one multibyte message');
  assert.equal(audits.records.every((r) => r.ran && r.planned && r.exitCode === 0 && r.spawnError === ''), true, 'all four ran and answered 0');
  assert.equal(audits.records.every((r) => r.cwd === posix), true, 'every process reports the jail it ran in');
  assert.equal(audits.records.every((r) => r.truncated === false && r.killedByBudget === false), true, 'and no budget bit here — so the flags below cannot be attributed to a cut');

  // The asymmetry that justified the increment: five facts exist ONLY in the host's record.
  const doorKeys = new Set([...keyNames(staged.output), ...keyNames(committed.output), ...keyNames(logged.output), ...keyNames(shown.output)]);
  const hostOnly = ['argv', 'cwd', 'signal', 'killedByBudget', 'spawnError'].filter((k) => !doorKeys.has(k));
  assert.deepEqual(hostOnly.sort(), ['argv', 'cwd', 'killedByBudget', 'signal', 'spawnError'], 'what a reader of the doors alone could never learn: the exact argv, the cwd, the signal, and both budget flags');
  assert.equal(doorKeys.has('rule'), false, 'and WHICH RULE authorized a process was not knowable at all from a door answer');
  console.log(`[spawnlog-proof] §2 4 real git processes ↔ 4 journal lines, argv byte-identical, rules [${audits.records.map((r) => r.rule).join(',')}] with 2 of 6 rules never used; 5 keys plus "rule" exist only in the host record`);

  // ---------- §3: what a caller cannot see — the human said yes and the policy said no ----------
  const beforeSpawns = spawns.length;
  const beforeLines = audits.records.length;
  const push = await call('w:push', 'exec.run', { argv: ['git', 'push'] });
  assert.equal(push.ok, false, 'the tool surfaces a policy refusal as an ERROR, never a silent success');
  assert.match(push.error, /default-deny/);
  const refused = loadExecAudits(fsDisk, journalFile);
  assert.equal(refused.records.length, beforeLines + 1, 'and the refusal is ON THE RECORD — v30–v50 had no way to say this at all');
  const line = refused.records.at(-1);
  assert.equal(line.rule, null, 'no rule let it through: `rule: null` ⟺ `planned: false`, the writer invariant the reader re-checks');
  assert.equal(line.planned, false);
  assert.equal(line.ran, false);
  assert.deepEqual(line.argv, [], 'an unapproved command carries no argv — the attempt is in `reason`, quoted below, so a record cannot be mistaken for an order to run');
  assert.match(line.reason, /\["git","push"\]/, 'the stated refusal names what was asked, JSON-quoted');
  assert.equal(spawns.length, beforeSpawns, 'ZERO processes for a §28-approved, policy-refused command');

  // A failure whose words the door compresses to one line keeps the program's FULL output here.
  const again = await call('w:commit2', 'git.commit', { message: 'second: nothing staged' });
  assert.equal(again.output.ok, false, 'a commit over a clean index is honest DATA, not a crash');
  assert.equal(again.output.exitCode, 1);
  const failed = loadExecAudits(fsDisk, journalFile).records.at(-1);
  assert.equal(failed.rule, 2, 'the same commit rule answered, and said no on the program’s behalf');
  assert.equal(failed.exitCode, 1);
  assert.match(failed.stdout, /nothing to commit|nothing added to commit|no changes added/, "git's own verdict survives in the record");
  // Measured, not assumed: git's FIRST stdout line is a branch banner and its LAST is the reason.
  // v52 moved the door from the first to the last, so the caller's sentence finally says WHY — while
  // this record keeps BOTH, because a record that summarizes stops being one.
  assert.match(again.output.detail, /nothing to commit, working tree clean/, 'what the caller got: git VERDICT line (v52)');
  assert.equal(/On branch master/.test(again.output.detail), false, 'the banner left the sentence and stayed in the record — the two files differ on purpose');
  assert.match(again.output.detail, /exit 1/);
  assert.match(failed.stdout, /On branch master/, 'the record still carries the banner the door dropped');
  assert.equal(spawns.length, beforeSpawns + 1, 'two more records, ONE more process: the refusal cost nothing and the failed commit cost exactly what it did');
  console.log(`[spawnlog-proof] §3 human said yes, policy said no → 1 durable line (rule null, planned false, 0 spawns) · a failed commit keeps ${failed.stdout.split('\n').filter((l) => l.trim() !== '').length} lines of git's own words where the door states 1 ("${again.output.detail}")`);

  // ---------- §4: a cold reader, given only the file ----------
  const cold = loadExecAudits(fsDisk, journalFile);
  assert.equal(cold.malformed, 0);
  assert.deepEqual(cold.records.map((r) => r.seq), [1, 2, 3, 4, 5, 6], 'contiguous seq: every record landed (a gap would mean a write that failed, which fails the CALL)');
  assert.deepEqual(cold.records.map((r) => r.rule), [0, 2, 3, 4, null, 2], 'the whole arc re-read from disk, as rules: staged → commit → log → show, then a refusal, then a second commit');
  // Each record's argv must fit the allowlist entry its own `rule` names — the pattern is read back
  // from the shipped factories, so no flag string is re-typed here (a proof that copies a flag stops
  // being a proof the day the flag moves).
  const fitsRule = (r) => r.rule === null ? false : RULES[r.rule].argv.length === r.argv.length && RULES[r.rule].argv.every((t, i) => t === '*' || t === r.argv[i]);
  assert.equal(cold.records.filter(fitsRule).length, 5, 'every granted record fits the shape of the rule that authorized it, wildcard slot included');
  assert.equal(cold.records[1].argv[3], MESSAGE, 'and the one floating token — the commit message — is verbatim what was asked');
  assert.equal(cold.records[3].argv.at(-1), 'intent.md', '…the show path likewise');
  assert.equal(cold.records.every((r) => r.planned === (r.rule !== null)), true, 'the invariant holds on disk, not just in memory');
  // Join the two records that describe ONE fact from two sides.
  const hash = git('rev-parse', 'HEAD').trim();
  const commitLine = cold.records[1];
  assert.equal(commitLine.stdout.includes(hash.slice(0, 7)), true, 'git’s own long hash appears in the host record');
  assert.equal(commitLine.stdout.includes(committed.output.record.hash), true, '…and the SHORT hash the door reported comes from the same bytes');
  assert.equal(logged.output.commits[0].hash, committed.output.record.hash, 'the read-back door agreed, as it has since v37');
  const showLine = cold.records[3];
  assert.equal(showLine.stdout.includes(LINES[1]), true, 'the multibyte staged line is in the record exactly once …');
  assert.equal(showLine.stdout.split('\n').filter((l) => l === `+${LINES[1]}`).length, 1, '…as one `+` line, not a fragment of one');
  assert.deepEqual(cold.records.map((r) => Object.keys(r).sort()), cold.records.map(() => [...AUDIT_KEYS].sort()), 'every line has exactly the audit shape — the 12 fields the caller was handed, plus seq and rule, nothing else');
  console.log(`[spawnlog-proof] §4 cold reader: 6 records / malformed 0 / seq contiguous · commit record's bytes contain the hash git reports from OUTSIDE the sandbox (${committed.output.record.hash}) · joined to the door's own answer`);

  // ---------- §5: what this record does NOT claim ----------
  const linesBeforeVeto = loadExecAudits(fsDisk, journalFile).records.length;
  const spawnsBeforeVeto = spawns.length;
  const vetoed = await call('w:veto', 'git.staged', {}, deny);
  assert.equal(vetoed.ok, false);
  assert.match(vetoed.error, /checkpoint/i, 'the registry refused before the impl ran');
  assert.equal(loadExecAudits(fsDisk, journalFile).records.length, linesBeforeVeto, 'a §28 veto NEVER reaches the host, so it leaves no host record — by design: the veto is the HUMAN act, and the human act is journalled in the ledger receipts (v41/v50), not here. Two records, two subjects, deliberately not merged (§60)');
  assert.equal(spawns.length, spawnsBeforeVeto, 'and it cost no process either');
  console.log(`[spawnlog-proof] §5 a human veto added 0 lines and 0 processes: the journal is the machine's memory, not the human's`);

  // ---------- §6: the file is honest about its own size, and lives where §9 allows ----------
  const bytes = readFileSync(journalFile).length;
  const payload = cold.records.reduce((n, r) => n + Buffer.byteLength(r.stdout, 'utf8') + Buffer.byteLength(r.stderr, 'utf8'), 0);
  assert.ok(existsSync(journalFile), 'the journal existed while the walk ran');
  assert.ok(journalFile.startsWith(tmpdir().replace(/\\/g, '/')), '§9: the record lives under os.tmpdir, like every other real write in these proofs');
  assert.ok(!journalFile.startsWith(posix), '…and NOT inside the repo it watches — an earlier run of this proof put it there, and git itself reported it as an untracked file: a record that changes what the read reads is not a record');
  assert.ok(bytes > payload, `the journal carries the output verbatim, so it grows with what was read (${bytes} B of file for ${payload} B of stdout+stderr): no rotation, stated`);
  console.log(`[spawnlog-proof] §6 ${bytes} bytes of journal for ${payload} bytes of captured output · file under os.tmpdir, outside the repo · §9 keeps this repo's working tree out of it`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(logDir, { recursive: true, force: true });
  assert.ok(!existsSync(dir) && !existsSync(logDir), 'the throwaway repo AND its journal are gone');
}

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every write here lived in os.tmpdir');
console.log('[spawnlog-proof] ALL ASSERTIONS PASSED (the sandbox now remembers what it did, including the times it said no)');

function mkTmp(prefix) {
  const base = join(tmpdir(), prefix);
  let n = 0;
  while (existsSync(`${base}${n}`)) n += 1;
  mkdirSync(`${base}${n}`, { recursive: true });
  return `${base}${n}`;
}
