// NEXUS M2 v48 (exec-host) — BUDGETS THAT BITE proof (ADR 0016 amendment 48).
// v29 wrote two budgets into every plan and v30 made the host honour them, and the unit tests
// checked the numbers. Nobody checked what the agent HEARD when a budget bit. Probing real git
// for this amendment answered the question the ugly way: a byte cap that cut inside a line made
// a truncated `git.staged` hand back `addedLines: ["staged line 01 \ufffd"]` — a line the human
// never staged and git never printed, complete with a replacement character, counted as content
// by every parser downstream. The cap was enforced; the sentence it produced was a lie.
// This proof measures the fix at the one layer that owns budgets:
//   §1 budgets are POLICY data and stay policy data (a request cannot raise its own cap);
//   §2 against REAL git, at budgets that land inside a line, the door claims only whole lines
//      the human actually staged — and the legacy byte-prefix is recomputed here to show it
//      really did invent one at the same budget (a counterfactual measured, not asserted);
//   §3 a large multibyte read arrives in several chunks and re-joins byte-exactly, so the cap
//      is not the only place a decoder used to go wrong;
//   §4 the TIMEOUT bites a REAL verify: the same vitest argv that passes under a generous
//      budget FAILS its TestReport under a small one, naming the budget and the signal.
// §9 holds throughout: real writes only inside os.tmpdir, this repo's HEAD compared byte-wise.
// Run after `npm run build`:  node docs/evidence/agents/budgets-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec, registerTestTools } = rt;
const {
  GIT_DIFF_FLAGS,
  NODE_SPAWN,
  createExecHost,
  execTestRunner,
  gitEnv,
  gitStagedPolicy,
  parseStagedDiff,
  registerGitStagedTool,
} = eh;
const REPLACER = String.fromCodePoint(0xfffd);

// ---------- §1: the budgets are policy, and the fix did not move one number ----------
{
  const shipped = gitStagedPolicy('X:/repo');
  assert.equal(shipped.allow[0].maxOutputBytes, 65_536, 'the door DEFAULTS are untouched — v48 changed what a cut means, not where the cut falls');
  assert.equal(shipped.allow[0].timeoutMs, 10_000);
  assert.equal(shipped.maxOutputBytes, 65_536, 'rule and cap agree, so nothing is quietly clamped twice');
  const tight = gitStagedPolicy('X:/repo', { maxOutputBytes: 900, timeoutMs: 250 });
  const plan = planExec({ argv: ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached'] }, tight);
  assert.equal(plan.ok, true, 'the shipped argv shape plans under a tight budget: only the numbers moved');
  assert.deepEqual(plan.plan.argv, ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached'], 'v46-hardened shape is exactly the shape this budget applies to');
  assert.equal(plan.plan.maxOutputBytes, 900);
  assert.equal(plan.plan.timeoutMs, 250);
  const widening = { ...tight, allow: [{ argv: ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached'], timeoutMs: 9_999_999, maxOutputBytes: 999_999_999 }] };
  const clamped = planExec({ argv: ['git', 'diff', ...GIT_DIFF_FLAGS, '--cached'] }, widening);
  assert.equal(clamped.plan.maxOutputBytes, tight.maxOutputBytes, 'a rule can never raise its own cap above the policy ceiling');
  assert.equal(clamped.plan.timeoutMs, tight.maxTimeoutMs);
  console.log('[budgets-proof] §1 budgets: policy-owned, clamped, and unchanged by the fix (65_536 / 10_000 still the door default)');
}

// A spawn wrapper that counts PROCESSES and BYTE CHUNKS, so "the output really arrived in N
// pieces" is a measurement instead of an assumption about pipes.
const countingSpawn = (sink) => (command, args, opts) => {
  sink.push(`${command} ${args.join(' ')}`);
  const child = NODE_SPAWN(command, args, opts);
  return {
    onData: (listener) => child.onData((stream, chunk) => listener(stream, chunk)),
    onEnd: (listener) => child.onEnd(listener),
    kill: () => child.kill(),
  };
};

/** One §28-gated `git.staged` read of `repo`, under a policy whose ONLY variable is the budget. */
const stagedRead = async (repo, budget, sink) => {
  let registry = new ToolRegistry();
  const host = createExecHost(gitStagedPolicy(repo, { maxOutputBytes: budget, timeoutMs: 10_000 }), { spawnLike: countingSpawn(sink) });
  registry = registerGitStagedTool(registry, host, { env: gitEnv() });
  const out = await registry.invoke({ callId: `b${budget}`, tool: 'git.staged', args: {} }, { checkpoint: () => true });
  if (!out.ok) throw new Error(out.error);
  return out.output;
};

/** Does a cut that KEEPS the first `cut` bytes break a UTF-8 character in half? */
const splitsChar = (buf, cut) => cut > 0 && cut < buf.length && (buf[cut] & 0xc0) === 0x80;

/** The cut v30–v47 made: keep the first N bytes and decode them. Reconstructed HERE, so the
 *  before/after claim is computed from the same bytes rather than remembered. */
const legacyPrefix = (text, budget) => Buffer.from(text, 'utf8').subarray(0, budget).toString('utf8');

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// ---------- §2: a truncated door may only claim WHOLE lines the human staged ----------
const dir = mkdtempSync(join(tmpdir(), 'nexus-budgets-'));
try {
  const posix = dir.replace(/\\/g, '/');
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'master');
  git('config', 'user.name', 'NEXUS Budget Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // neutralized INSIDE the throwaway only
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false'); // the bytes we stage are the bytes git records
  writeFileSync(join(dir, 'README.md'), 'human seed\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'chore: human seed commit');

  // THE HUMAN ACT: staged content with multibyte lines, so a byte cut can land INSIDE a character.
  const LINES = [];
  for (let i = 1; i <= 24; i++) LINES.push(`staged line ${String(i).padStart(2, '0')} — 中文注释 ${i}`);
  writeFileSync(join(dir, 'intent.md'), `${LINES.join('\n')}\n`);
  git('add', 'intent.md');
  const indexBytes = git('show', ':intent.md');
  assert.equal(indexBytes, `${LINES.join('\n')}\n`, 'sanity: the index holds exactly what the human wrote');
  const human = new Set(LINES);

  const spawns = [];
  const full = await stagedRead(posix, 65_536, spawns);
  assert.equal(full.truncated, false, 'an uncut read says nothing about truncation');
  assert.equal(full.files[0].addedLines.length, 24, 'the whole index reads back in one piece');
  assert.equal(full.files[0].addedLines.join('\n') + '\n', indexBytes, 'ground truth first: re-joining the claimed lines reproduces the INDEX bytes');
  assert.equal(full.text.includes(REPLACER), false);
  assert.equal(spawns.length, 1, 'one read, one process');

  // Every '+' content line of the real diff, with its byte range, so the budgets below are
  // DERIVED from git's own output instead of guessed at.
  const raw = Buffer.from(full.text, 'utf8');
  const offsets = [];
  let at = 0;
  for (const line of full.text.split('\n')) {
    const len = Buffer.byteLength(line, 'utf8');
    if (line.startsWith('+') && !line.startsWith('+++')) offsets.push({ start: at, end: at + len });
    at += len + 1;
  }
  assert.equal(offsets.length, 24, 'git printed one + line per staged line');

  let midLine = 0;
  let midChar = 0;
  for (const o of offsets.slice(0, 8)) {
    const budget = o.start + Math.ceil((o.end - o.start) / 2); // strictly INSIDE the line
    // and a budget that also lands INSIDE one character — the worst case for a decoder
    let charCut = -1;
    for (let i = o.start + 1; i < o.end; i++) if (splitsChar(raw, i)) { charCut = i; break; }
    for (const [label, cut] of [['mid-line', budget], ['mid-char', charCut]]) {
      assert.ok(cut > 0, `${label}: a case that cannot be built is not a case`);
      const prefix = raw.subarray(0, cut);
      assert.notEqual(prefix[prefix.length - 1], 0x0a, `${label} budget ${cut} genuinely lands before a newline (else the case proves nothing)`);
      const t = await stagedRead(posix, cut, spawns);
      assert.equal(t.truncated, true, `${label} budget ${cut}: the door SAYS it was cut`);
      assert.match(t.detail, /output truncated at budget/, 'the sentence carries the budget, so a short answer is never mistaken for a small index');
      assert.equal(t.text.endsWith('\n'), true, `${label} budget ${cut}: a cut stream ends at a line boundary, never mid-line`);
      assert.equal(t.text.includes(REPLACER), false, 'no replacement character entered through the cap');
      const claimed = t.files.flatMap((f) => f.addedLines);
      const lies = claimed.filter((l) => !human.has(l));
      assert.deepEqual(lies, [], `a truncated door invented content at budget ${cut} (${label}): ${JSON.stringify(lies)}`);
      assert.deepEqual(claimed, LINES.slice(0, claimed.length), 'and what it keeps is a PREFIX of the staged lines, in order — truncation loses, never invents');
      // the counterfactual, recomputed from the same bytes: this is what v30–v47 handed back.
      const legacyText = legacyPrefix(full.text, cut);
      assert.equal(legacyText.endsWith('\n'), false, `${label} budget ${cut}: the old cut DID end mid-line`);
      const legacyClaims = parseStagedDiff(legacyText).files.flatMap((f) => f.addedLines);
      const legacyLies = legacyClaims.filter((l) => !human.has(l));
      assert.ok(legacyLies.length >= 1, `${label} budget ${cut}: expected the legacy prefix to invent a line — the case stopped being a case`);
      assert.equal(legacyText.includes(REPLACER), splitsChar(raw, cut), 'the replacement char appears exactly when the byte cut broke a character');
      if (label === 'mid-char') midChar += 1;
      else midLine += 1;
    }
  }
  console.log(`[budgets-proof] §2 real git: ${midLine + midChar} budgets landing inside a line (${midChar} of them inside one CHARACTER) — the shipped door claimed whole staged lines only at every one, while the legacy byte-prefix at the SAME budgets invented a line git never printed at every one (${midLine + midChar}/${midLine + midChar})`);

  // The fix's OWN new hazard, measured rather than argued about. A stream trimmed to whole lines
  // can leave NOTHING to parse — and a door that reads "no lines" as "nothing staged" would state
  // an absence the budget invented, at the exact moment a human is about to be asked to commit.
  const starved = await stagedRead(posix, 4, spawns); // 4 bytes = `diff`, not one newline
  assert.equal(starved.truncated, true);
  assert.deepEqual(starved.files, [], 'nothing survived the cap, so there is nothing to claim');
  assert.match(starved.detail, /no complete line survived the output budget/);
  assert.equal(starved.detail.includes('index is EMPTY'), false, 'a cut is not an absence (§60)');
  assert.equal(parseStagedDiff(legacyPrefix(full.text, 4)).files.length, 0, 'the pre-v48 door parsed an empty index from these same bytes and then SAID so — this is the sentence v48 had to retire');
  // and an absence is still speakable, in the same repo through the same door, when no budget bit
  git('rm', '--cached', '-q', 'intent.md');
  const clean = await stagedRead(posix, 65_536, spawns);
  assert.equal(clean.truncated, false, 'this read is under no budget pressure at all');
  assert.match(clean.detail, /the index is EMPTY — nothing is staged/);
  assert.equal(clean.detail.includes('budget'), false, 'the EMPTY sentence carries no cut wording');
  assert.equal(spawns.length, 19, '1 full + 16 mid-line/mid-char + starved + clean: every read cost exactly ONE process — a cut does not retry');
  console.log("[budgets-proof] §2b the cap's own side effect: at a 4-byte budget nothing survives to parse, and the door says so (no 'index is EMPTY' lie) — while a genuinely clean index, same door, no budget pressure, is still stated EMPTY");
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}

// ---------- §3: multi-chunk output, no budget pressure, byte-exact anyway ----------
const big = mkdtempSync(join(tmpdir(), 'nexus-budgets-big-'));
try {
  const posix = big.replace(/\\/g, '/');
  const git = (...args) => execFileSync('git', ['-C', big, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'master');
  git('config', 'user.name', 'NEXUS Budget Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks');
  git('config', 'core.autocrlf', 'false');
  const MANY = [];
  for (let i = 1; i <= 2000; i++) MANY.push(`line ${String(i).padStart(4, '0')} — 多字节内容会被分块切断 ${i}`);
  writeFileSync(join(big, 'big.md'), `${MANY.join('\n')}\n`);
  git('add', 'big.md');
  const bigIndex = git('show', ':big.md');
  const spawns = [];
  const chunks = [];
  let registry = new ToolRegistry();
  // A cap BIGGER than the diff, on purpose: this section is about chunk boundaries, not budgets.
  const host = createExecHost(gitStagedPolicy(posix, { timeoutMs: 20_000, maxOutputBytes: 4_000_000 }), {
    spawnLike: (command, args, opts) => {
      spawns.push(`node ${args.join(' ')}`);
      const child = NODE_SPAWN(command, args, opts);
      return {
        onData: (listener) => child.onData((stream, chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')); listener(stream, chunk); }),
        onEnd: (listener) => child.onEnd(listener),
        kill: () => child.kill(),
      };
    },
  });
  registry = registerGitStagedTool(registry, host, { env: gitEnv() });
  const out = await registry.invoke({ callId: 'big', tool: 'git.staged', args: {} }, { checkpoint: () => true });
  assert.equal(out.ok, true, out.error);
  assert.ok(chunks.length > 1, `the point of this section is multi-chunk arrival; git delivered ${chunks.length} chunk(s) — widen the file until it is a real case`);
  const joined = Buffer.concat(chunks);
  assert.equal(out.output.truncated, false, 'this read ran under a raised cap: the decoder, not the budget, is on trial here');
  assert.equal(out.output.text.includes(REPLACER), false, 'a character split across a CHUNK boundary used to decode into U+FFFD even with no budget pressure');
  assert.equal(out.output.files[0].addedLines.join('\n') + '\n', bigIndex, `${MANY.length} multibyte lines, ${chunks.length} chunks, re-joined byte-for-byte equal to the index`);
  const perChunk = chunks.map((c) => c.toString('utf8')).join('');
  console.log(`[budgets-proof] §3 ${chunks.length} chunks / ${joined.length} bytes: whole-stream decode exact · decoding each chunk on its own would${perChunk === out.output.text ? ' have agreed by luck (no boundary split a character this run — the split case is pinned in execHost.test.ts)' : ' have corrupted the text (it differs here)'}`);
} finally {
  rmSync(big, { recursive: true, force: true });
  assert.ok(!existsSync(big), 'the big throwaway is gone');
}

// ---------- §4: the TIMEOUT budget bites a REAL verify, and the report says so ----------
{
  const SUITE_ARGV = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--root', 'packages/design-model'];
  const ENV_NAMES = ['PATH', 'SYSTEMROOT', 'PATHEXT', 'COMSPEC', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
  const suiteEnv = () => {
    const o = {};
    for (const n of ENV_NAMES) if (typeof process.env[n] === 'string') o[n] = process.env[n];
    return o;
  };
  const root = process.cwd().replace(/\\/g, '/');
  const suitePolicy = (timeoutMs) => ({
    root,
    allow: [{ argv: SUITE_ARGV, timeoutMs, maxOutputBytes: 1_048_576 }],
    envAllow: ENV_NAMES,
    maxTimeoutMs: 180_000,
    maxOutputBytes: 1_048_576,
  });
  const spawns = [];
  const run = async (timeoutMs) => {
    const host = createExecHost(suitePolicy(timeoutMs), { spawnLike: countingSpawn(spawns) });
    let registry = new ToolRegistry();
    // the registry's exec gate is the single §28 checkpoint for test.run (v31's contract)
    registry = registerTestTools(registry, execTestRunner(host, SUITE_ARGV, { preApproved: true, cwd: '', env: suiteEnv() }));
    const t0 = Date.now();
    const out = await registry.invoke({ callId: `t${timeoutMs}`, tool: 'test.run', args: {} }, { checkpoint: () => true });
    return { out, ms: Date.now() - t0 };
  };

  const impatient = await run(400);
  assert.equal(impatient.out.ok, true, 'the TOOL answered — a killed command is a failing verdict, not a crash');
  const killed = impatient.out.output;
  assert.equal(killed.ok, false, 'a verify that never finished may not report green');
  assert.match(killed.detail, /killed at timeout budget/, 'the report NAMES the budget as the reason, distinct from a test failure');
  assert.match(killed.detail, /SIGTERM/);
  assert.match(killed.detail, /exit null/, 'the process never reported an exit code, and the report says null rather than inventing one');
  assert.equal(killed.report.passed, 0);
  assert.ok(impatient.ms < 15_000, `the timeout actually cut the wait short (took ${impatient.ms}ms)`);

  const patient = await run(180_000);
  assert.equal(patient.out.output.ok, true, 'the SAME argv under a generous budget passes — so the failure above WAS the budget, nothing else');
  assert.equal(patient.out.output.detail.includes('killed at timeout budget'), false, 'and the label is only spoken when it bites');

  assert.equal(spawns.length, 2, 'exactly two processes for two verifies');
  assert.deepEqual([...new Set(spawns)], ['node node_modules/vitest/vitest.mjs run --root packages/design-model'], 'every spawn carried the allowlisted argv and nothing else, executable included');
  console.log(`[budgets-proof] §4 real vitest: killed at 400ms → FAILING report "${killed.report.failures[0].message}" in ${impatient.ms}ms · same argv at 180s budget → green in ${patient.ms}ms · 2 spawns`);
}

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every write here lived in os.tmpdir');
console.log('[budgets-proof] ALL ASSERTIONS PASSED (a budget may cut an answer short; it may not change what the answer says)');
