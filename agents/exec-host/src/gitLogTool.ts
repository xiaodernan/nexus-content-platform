import type { ExecPolicy, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import { budgetFlags, GIT_ENV_NAMES, cutNotAbsence, gitEnv, gitVerdict, logWindowNotice, quoteVerdict, refusedNotAbsence, stdoutWasCut, windowField } from './gitTools.js';
import type { ExecHost, ExecRunResult } from './execHost.js';

/**
 * M2 v67 (ADR 0016 amendment 67): the two tokens the shape says so that a repository cannot. See the
 * note on `gitLogPolicy` for what each one was measured to do.
 */
/**
 * M2 v68 (ADR 0016 amendment 68): this door's COUNT is the sixth member of the WINDOW family. v66 put
 * `AT LEAST` on the three doors that read a diff and left `git.log` alone; measured on a 25-commit
 * repository, 24 of its 24 whole-line cut budgets printed a census (`8 commit(s)`, `24 commit(s)` …) with
 * only v56's pipe clause beside them. A log read differs from a diff read in one way that changes the
 * sentence rather than softening it: every line names exactly ONE commit and git prints them NEWEST FIRST,
 * so a cut cannot shorten an entry the way it shortens a hunk — it can only stop handing over the older
 * ones (measured: 0 of those 24 windows lost the newest entry). So the door says both halves: the count is
 * a floor, and what IS named is still HEAD's newest.
 */
export const GIT_LOG_FLAGS = ['--no-decorate', '--no-color'];

/**
 * M2 v37 (ADR 0016 amendment 37): the git LOG read-back tool — the last corner of the
 * see (v32) → touch (v35) → confirm (v37) circle. After a §28-approved commit the agent
 * can READ ITS OWN HISTORY and check the record it was handed actually landed. The
 * policy allows exactly ONE argv shape, `git log --oneline <flags> -n <count>` — the second
 * production use of the '*' ARG wildcard: shape fixed, count floats, arity enforced.
 * Read-only like v32: nothing here can write; only a real process spawns, and §28 gates it.
 *
 * M2 v67 (ADR 0016 amendment 67) put two more fixed tokens in that shape, and both of them sit in the
 * one field this door names. `log.decorate` is a repository setting that makes git print its OWN refs
 * inside `--oneline`'s subject, and `color.*` wraps the hash in ANSI — so an unpinned `--oneline` lets
 * the repository being read rewrite both halves of the line this door parses. Measured by
 * `color-proof.mjs` over a 3-commit throwaway repo: 26 escapes across its 3 lines, after which
 * `parseGitLog` had `{commits: [], skipped: 3}` and the door answered `0 commit(s)` at exit 0 (§3).
 * `--no-color` does NOT reach the refs: §4 measures the same read with `--no-color` alone, 0 escapes and
 * a hash followed by `(HEAD -> main, tag: v1.0, feature)` still inside the subject, so `--no-decorate`
 * has to be said as well. And neither flag may be replaced by a strip: that fixture's newest commit is
 * TITLED `(HEAD -> main) I titled myself like a decoration`, so with decoration fully pinned off the output
 * still contains `(HEAD -> main)` — as the title git was handed — while `tag:` appears nowhere. The door's
 * answer is then checked against git's own `--format=%s`, a format that has never had room for a ref, byte
 * for byte on every commit (§4). `--no-decorate` costs nothing where no decoration exists: §6 compares the
 * whole pinned shape with v37's own and the two are byte-identical in a repository that asks for neither.
 * `git show --format=` needed only the color half — §1 measures 19 escapes reaching that face while no ref
 * decoration does, because an empty format prints no subject — so the content door gained the pin that
 * GIT_DIFF_FLAGS carries for all three.
 */
export function gitLogPolicy(root: string, options: { timeoutMs?: number; maxOutputBytes?: number } = {}): ExecPolicy {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxOutputBytes = options.maxOutputBytes ?? 65_536;
  return {
    root,
    allow: [{ argv: ['git', 'log', '--oneline', ...GIT_LOG_FLAGS, '-n', '*'], timeoutMs, maxOutputBytes }],
    envAllow: GIT_ENV_NAMES,
    maxTimeoutMs: timeoutMs,
    maxOutputBytes,
  };
}

export interface GitLogEntry {
  hash: string;
  subject: string;
}

/** `git log --oneline` echo: `<hash> <subject>` per line; lines that echo no hash are COUNTED, not guessed. */
export function parseGitLog(stdout: string): { commits: GitLogEntry[]; skipped: number } {
  const commits: GitLogEntry[] = [];
  let skipped = 0;
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const m = /^([0-9a-f]{4,}) (.*)$/.exec(line);
    if (m) commits.push({ hash: m[1]!, subject: m[2]!.trim() });
    else skipped += 1;
  }
  return { commits, skipped };
}

/** The tool's OWN bound, above the policy's shape check: git would happily echo a huge log; we ask for a bounded window. */
export const GIT_LOG_MAX_COUNT = 100;

export const GIT_LOG_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'git.log',
    description:
      'Read back history through the confined exec host (`git log --oneline --no-decorate --no-color -n <count>` — the only argv the policy allows; default count 10, capped at 100, and the subject it reports is the commit message because the shape told git to print no ref decoration and no color). Read-only: it confirms what a granted git.commit actually wrote. Still spawns a real process, so the §28 checkpoint applies.',
    permissions: ['exec'],
    args: [
      { name: 'count', type: 'number' },
      { name: 'cwd', type: 'string' },
    ],
  },
];

export function registerGitLogTool(registry: ToolRegistry, host: ExecHost, options: { env?: Record<string, string> } = {}): ToolRegistry {
  const env = gitEnv(options.env ?? process.env); // v46: whatever the caller needs, PLUS the isolation — a caller cannot opt out
  registry.register(GIT_LOG_TOOL_SPECS[0]!, async (args) => {
    const count = args.count === undefined ? 10 : args.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > GIT_LOG_MAX_COUNT) {
      throw new Error(`count must be an integer between 1 and ${GIT_LOG_MAX_COUNT} (bounded read-back, never an unbounded log)`);
    }
    const result: ExecRunResult = await host.run({ argv: ['git', 'log', '--oneline', ...GIT_LOG_FLAGS, '-n', String(count)], cwd: args.cwd, env }, { preApproved: true }); // the registry's exec gate is the one §28 checkpoint
    if (!result.ran) throw new Error(result.reason || 'run refused');
    if (result.spawnError !== '') throw new Error(`spawn failed: ${result.spawnError}`);
    const flags = budgetFlags(result);
    if (result.exitCode !== 0 || result.killedByBudget) {
      const verdict = gitVerdict(result.stdout, result.stderr, { truncated: result.truncated || result.killedByBudget });
      return { ok: false, detail: `git.log → exit ${result.exitCode}: ${quoteVerdict(verdict)} · ${refusedNotAbsence('the repo has no commits')}${flags}`, exitCode: result.exitCode, count, commits: [], truncated: result.truncated, ...windowField(result) };
    }
    const { commits, skipped } = parseGitLog(result.stdout);
    const top = commits[0];
    // v68: v56's predicate again — a cut pipe makes this door's count a floor. The ZERO case stays v48's
    // sentence (`cutNotAbsence`, below), because there the door has nothing to floor.
    const floor = stdoutWasCut(result) && commits.length > 0;
    const detail = `git.log → exit 0: ${floor ? 'AT LEAST ' : ''}${commits.length} commit(s)${top ? ` · newest ${top.hash} "${top.subject}"` : stdoutWasCut(result) ? ` · ${cutNotAbsence('the repository has no commits')}` : ' (empty log)'}${logWindowNotice({ window: floor, read: commits.length, asked: count })}${skipped > 0 ? ` · ${skipped} line(s) without a hash, counted not guessed` : ''}${flags}`;
    return { ok: true, detail, exitCode: 0, count, commits, ...(skipped > 0 ? { skipped } : {}), truncated: result.truncated, ...windowField(result) };
  });
  return registry;
}
