import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planExec } from '@nexus/agent-runtime';
import {
  GIT_ABSENT_CONFIG,
  GIT_FORCED_CONFIG,
  GIT_ISOLATION_ENV,
  GIT_ISOLATION_ENV_NAMES,
  GIT_PASS_THROUGH_ENV_NAMES,
  forcedConfigEnv,
} from '../src/gitEnvIsolation.js';
import { GIT_DIFF_FLAGS, GIT_ENV_NAMES, gitEnv, gitReadOnlyPolicy } from '../src/gitTools.js';

describe('forcedConfigEnv (git\'s counted env override, built from data)', () => {
  it('numbers slots from zero in SORTED key order, so the env is stable across property enumeration', () => {
    const env = forcedConfigEnv();
    expect(env.GIT_CONFIG_COUNT).toBe(String(Object.keys(GIT_FORCED_CONFIG).length));
    expect([env.GIT_CONFIG_KEY_0, env.GIT_CONFIG_KEY_1, env.GIT_CONFIG_KEY_2, env.GIT_CONFIG_KEY_3, env.GIT_CONFIG_KEY_4]).toEqual([
      'core.attributesFile',
      'core.excludesFile',
      'core.fsmonitor',
      'core.quotePath',
      'status.showUntrackedFiles',
    ]);
    expect(Object.keys(env).every((k) => k === 'GIT_CONFIG_COUNT' || k.startsWith('GIT_CONFIG_KEY_') || k.startsWith('GIT_CONFIG_VALUE_'))).toBe(true);
  });

  it('an empty table still says so — COUNT is never left unset for git to fill in from somewhere else', () => {
    expect(forcedConfigEnv({})).toEqual({ GIT_CONFIG_COUNT: '0' });
  });

  it('the table is data: a caller can force a different set and get exactly that', () => {
    expect(forcedConfigEnv({ 'diff.mnemonicPrefix': 'false' })).toEqual({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'diff.mnemonicPrefix',
      GIT_CONFIG_VALUE_0: 'false',
    });
  });

  it('every forced key confines something MEASURED: a command git would EXECUTE, a blind that hides files, or the shape of a PATH (v46, v61)', () => {
    expect(Object.keys(GIT_FORCED_CONFIG).sort()).toEqual(['core.attributesFile', 'core.excludesFile', 'core.fsmonitor', 'core.quotePath', 'status.showUntrackedFiles']);
    expect(GIT_FORCED_CONFIG['status.showUntrackedFiles']).toBe('all'); // an enum, not an off-switch
    expect(GIT_FORCED_CONFIG['core.fsmonitor']).toBe('');
    expect(GIT_FORCED_CONFIG['core.quotePath']).toBe('false'); // v61: git's default `true` renders a non-ASCII path as an escaped STRING, which no door can open
  });

  it('the counted slots stop exactly where the count does — no orphan slot for git to read past the table', () => {
    const env = forcedConfigEnv();
    expect(Object.keys(GIT_FORCED_CONFIG)).toHaveLength(5);
    expect(env[`GIT_CONFIG_KEY_${Object.keys(GIT_FORCED_CONFIG).length}`]).toBeUndefined();
    expect([env.GIT_CONFIG_VALUE_0, env.GIT_CONFIG_VALUE_1, env.GIT_CONFIG_VALUE_2, env.GIT_CONFIG_VALUE_3, env.GIT_CONFIG_VALUE_4]).toEqual(['', '', '', 'false', 'all']);
  });

  it('diff.external is NOT force-pinned, and the reason is measured: no value is inert (empty → exit 128)', () => {
    expect(Object.keys(GIT_FORCED_CONFIG)).not.toContain('diff.external');
    expect(GIT_DIFF_FLAGS).toContain('--no-ext-diff'); // so it is confined by the argv shape instead
  });

  // v65: the table holds what has no command-line answer. The four prefix keys (`diff.noprefix`,
  // `diff.mnemonicPrefix`, `diff.srcPrefix`, `diff.dstPrefix`) all DO have one — and the command line
  // outranks the repository's config, so naming the prefixes in the shape covers the three keys nobody
  // has measured yet as well as the four git 2.52 honours. Adding them here instead would enumerate a
  // moving list and still lose to `git -c` from a caller.
  it('v65: NO diff.* key is in the table, because the shape says the prefixes itself', () => {
    expect(GIT_DIFF_FLAGS).toEqual(['--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/']);
    expect(Object.keys(GIT_FORCED_CONFIG).filter((k) => k.startsWith('diff.'))).toEqual([]);
  });
});

describe('the pinned environment (v46: the env is part of the policy)', () => {
  it('GIT_ISOLATION_ENV_NAMES is exactly what the pinning can emit — the envAllow list has to keep up', () => {
    expect(GIT_ISOLATION_ENV_NAMES).toEqual([...Object.keys(GIT_ISOLATION_ENV), ...Object.keys(forcedConfigEnv())]);
  });

  it('EVERY name gitEnv emits is allowlisted, or planExec would silently drop the isolation', () => {
    const env = gitEnv({ PATH: '/bin', SYSTEMROOT: 'C:/w', HOME: '/h', USERPROFILE: 'P', GITHUB_TOKEN: 'secret' });
    expect(Object.keys(env).every((k) => GIT_ENV_NAMES.includes(k))).toBe(true);
    const planned = planExec({ argv: ['git', 'status', '--short'], env: { ...env, GITHUB_TOKEN: 'secret' } }, gitReadOnlyPolicy('X:/repo'));
    if (!planned.ok) throw new Error('the shipped read shape must stay allowed');
    expect(planned.plan.droppedEnv).toEqual(['GITHUB_TOKEN']); // the secret is dropped; nothing we pin is
    expect(planned.plan.env).toEqual(env);
    expect(planned.plan.env.GIT_CONFIG_COUNT).toBe(forcedConfigEnv().GIT_CONFIG_COUNT);
  });

  it('the pass-through list is only what git needs to run — and never a config-discovery var we do not pin', () => {
    expect(GIT_PASS_THROUGH_ENV_NAMES).toEqual(['PATH', 'SYSTEMROOT', 'HOME', 'USERPROFILE']);
    expect(GIT_ENV_NAMES.filter((k) => k.startsWith('GIT_'))).toEqual(GIT_ISOLATION_ENV_NAMES);
  });

  it('config discovery is pointed at a file that must not exist, and this machine agrees', () => {
    expect(GIT_ISOLATION_ENV.GIT_CONFIG_GLOBAL).toBe(GIT_ABSENT_CONFIG);
    expect(GIT_ISOLATION_ENV.GIT_CONFIG_SYSTEM).toBe(GIT_ABSENT_CONFIG);
    expect(existsSync(GIT_ABSENT_CONFIG)).toBe(false);
  });

  it('the hygiene flags are pinned too: no pager process, no prompt, no optional locks', () => {
    expect(GIT_ISOLATION_ENV).toMatchObject({ GIT_CONFIG_NOSYSTEM: '1', GIT_ATTR_NOSYSTEM: '1', GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' });
  });

  it('gitEnv is idempotent: feeding it its own answer changes nothing (so proofs may pass gitEnv() through)', () => {
    const once = gitEnv({ PATH: '/bin' });
    expect(gitEnv(once)).toEqual(once);
  });
});
