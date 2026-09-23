/**
 * M2 v46 (ADR 0016 amendment 46): the ENVIRONMENT is part of the policy.
 *
 * v29–v43 confined the argv: exact tokens, `'*'` only in argument positions, cwd
 * jailed, budgets clamped, secrets dropped. What none of that confines is what git
 * decides to DO with a perfectly-shaped argv, because git consults config files this
 * process never chose to read — `~/.gitconfig` (found through the allowlisted
 * `HOME`/`USERPROFILE`, which must be passed through or git cannot run) and the repo's
 * own `.git/config`. Measured against real git 2.52, with exit code 0 throughout:
 *
 *   `[diff] external = <program>`      → `git diff` and `git diff --cached` run that
 *                                        program INSTEAD of producing a diff: the door
 *                                        both EXECUTES and returns an empty answer, so
 *                                        `git.diff` reports "0 files" about a dirty tree.
 *                                        (`git show` measured NOT to consult it — on both
 *                                        an added and a modified path.)
 *   `[core] fsmonitor = <command>`     → `git status` runs that command while scanning
 *   `[core] excludesFile = <all-*>`    → untracked files vanish from `git status`
 *   `[status] showUntrackedFiles = no` → same blind, set one level up
 *   `.gitattributes` `*.dat diff=drv`
 *   + `[diff "drv"] textconv = <cmd>`  → EVERY door that diffs runs the command, the
 *                                        content door included, and both sides convert to
 *                                        the same text, so git reports NO CHANGE about a
 *                                        real one. This is the only measured vector that
 *                                        reaches `git show`, and it is repo DATA, which no
 *                                        env key can name (`core.attributesFile` is the
 *                                        GLOBAL attributes file).
 *
 * Two layers close it, because they cover two different sources:
 *   • the ENV pins below make the machine's unreviewed config inert (and deterministic
 *     across machines, which every proof in this repo quietly assumes), and force four
 *     repo values past `.git/config` — measured: the counted override really does win;
 *   • the argv shape (`--no-ext-diff --no-textconv`, see gitTools) confines what env
 *     pinning cannot: the repo's OWN config and committed `.gitattributes`, which §9 puts
 *     off-limits — we will not rewrite a human's repository to make our read safe.
 */

/** Vars passed through from the host process because git needs them to run at all. */
export const GIT_PASS_THROUGH_ENV_NAMES = ['PATH', 'SYSTEMROOT', 'HOME', 'USERPROFILE'];

/** Naming a file git cannot open is how you tell git to read NOTHING from a config source. */
export const GIT_ABSENT_CONFIG = '/nexus-git-config-absent';

/** Flags git honours straight from the environment — no config file involved. */
export const GIT_ISOLATION_ENV: Record<string, string> = {
  GIT_CONFIG_GLOBAL: GIT_ABSENT_CONFIG, // ~/.gitconfig, $HOME/.config/git/config
  GIT_CONFIG_SYSTEM: GIT_ABSENT_CONFIG, // /etc/gitconfig, %ProgramFiles%\Git\config
  GIT_CONFIG_NOSYSTEM: '1', // belt and braces: never even look for the system file
  GIT_ATTR_NOSYSTEM: '1', // a system .gitattributes can name a diff driver → a command
  GIT_PAGER: 'cat', // no pager process between us and the bytes we parse
  GIT_TERMINAL_PROMPT: '0', // a credential prompt would hang the run until the budget kills it
  GIT_OPTIONAL_LOCKS: '0', // a read must not take — or write — the index lock
};

/**
 * Config keys forced to a safe value through git's own counted env override. Measured on
 * real git 2.52: these DO beat the repo's own `.git/config` (`core.fsmonitor=` kept the
 * status door program-free in a repo that had one configured).
 *
 * `diff.external` is deliberately absent: measured against real git, no value of it is
 * inert. An empty value makes `git diff` exit 128 (git re-invokes itself as the "driver"),
 * and `true`/`false`/`none`/`default` each change the diff's bytes. That key is confined by
 * the argv shape instead — which is also where it belongs: the shape does the confining.
 * `core.attributesFile` is forced because a global attributes file can name a diff driver;
 * it reaches NOTHING in the tree itself, so the shape carries `.gitattributes`.
 */
export const GIT_FORCED_CONFIG: Record<string, string> = {
  'core.fsmonitor': '', // a non-empty value is a COMMAND git runs while scanning the tree
  'core.excludesFile': '', // an ignore file of `*` silently hides untracked files
  'core.attributesFile': '', // attributes select diff drivers, and a diff driver is a command
  'status.showUntrackedFiles': 'all', // `no` is a silent blind, not an error
};

/** git's env-level config override: GIT_CONFIG_COUNT plus GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n. */
export function forcedConfigEnv(forced: Record<string, string> = GIT_FORCED_CONFIG): Record<string, string> {
  const keys = Object.keys(forced).sort(); // numbered slots must not depend on property order
  const env: Record<string, string> = { GIT_CONFIG_COUNT: String(keys.length) };
  keys.forEach((key, i) => {
    env[`GIT_CONFIG_KEY_${i}`] = key;
    env[`GIT_CONFIG_VALUE_${i}`] = forced[key]!;
  });
  return env;
}

/** Every name the pinned env can emit — a policy's `envAllow` must list them or the scrubber drops them. */
export const GIT_ISOLATION_ENV_NAMES = [...Object.keys(GIT_ISOLATION_ENV), ...Object.keys(forcedConfigEnv())];
