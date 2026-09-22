import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import { EXEC_TOOL_SPECS, planExec, registerExecTools, validatePolicy, type ExecPolicy } from '../src/execSandbox.js';

const POLICY: ExecPolicy = {
  root: 'X:/jail',
  allow: [
    { argv: ['node', 'scripts/build.js'] },
    { argv: ['git', 'status', '*'], timeoutMs: 5_000, maxOutputBytes: 4_096 },
  ],
  envAllow: ['PATH', 'LANG'],
};

describe('planExec (v29: the policy decision, pure data, nothing spawns)', () => {
  it('an allowlisted argv plans with a jail-resolved cwd, rule budgets and executes:false', () => {
    const d = planExec({ argv: ['git', 'status', '--short'], cwd: 'sub', env: { PATH: '/bin', SECRET: 'x' } }, POLICY);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.plan).toEqual({
      argv: ['git', 'status', '--short'],
      cwd: 'X:/jail/sub',
      root: 'X:/jail',
      env: { PATH: '/bin' },
      droppedEnv: ['SECRET'],
      timeoutMs: 5_000,
      maxOutputBytes: 4_096,
      matchedRule: 1,
      executes: false,
    });
  });

  it('default-deny: an unlisted command is refused with the argv quoted in the reason', () => {
    const d = planExec({ argv: ['curl', 'http://evil.test'] }, POLICY);
    expect(d).toEqual({ ok: false, reason: 'no allowlist rule matches ["curl","http://evil.test"] (default-deny)' });
  });

  it("'*' matches one argument token but a shell-ish one-token command still dies at default-deny", () => {
    expect(planExec({ argv: ['git', 'status', 'anything'] }, POLICY).ok).toBe(true);
    // 'git commit -m hi' as a single token is not shell injection, it is just an unknown arg — but a combined
    // executable+args string never matches any bare-name executable slot.
    const d = planExec({ argv: ['git commit -m hi'] }, POLICY);
    expect(d.ok).toBe(false);
  });

  it('arity matters: a two-token pattern does not match a three-token argv', () => {
    expect(planExec({ argv: ['node', 'scripts/build.js', 'extra'] }, POLICY).ok).toBe(false);
  });

  it('the executable must be a bare name — paths (slash, backslash, drive) are refused before allowlisting', () => {
    for (const bad of [['X:/Windows/system32/cmd.exe'], ['bin/evil'], ['bin\\evil']]) {
      const d = planExec({ argv: bad }, POLICY);
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toBe('executable must be a bare name, not a path');
    }
  });

  it('a malformed request (non-array, empty, or non-string/empty tokens) is refused with a stated reason', () => {
    const reason = 'argv must be a non-empty array of non-empty strings (no shell strings)';
    for (const bad of [undefined, 'node build.js', [], ['node', 42], ['node', '']]) {
      expect(planExec({ argv: bad }, POLICY)).toEqual({ ok: false, reason });
    }
  });

  it('cwd is confined by guardedJoin: .., absolute and drive-letter cwds are refused; missing cwd means the root', () => {
    for (const bad of ['../outside', 'X:/Windows', '/etc', 'a/../../b']) {
      const d = planExec({ argv: ['node', 'scripts/build.js'], cwd: bad }, POLICY);
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toMatch(/^cwd refused: /);
    }
    const rootPlan = planExec({ argv: ['node', 'scripts/build.js'] }, POLICY);
    expect(rootPlan.ok && rootPlan.plan.cwd).toBe('X:/jail');
  });

  it('env is scrubbed to the allowlist; every dropped name is listed sorted, non-string values never pass', () => {
    const d = planExec({ argv: ['node', 'scripts/build.js'], env: { TZ: 'UTC', AWS_SECRET: 'k', PATH: '/bin', LANG: 7 } }, POLICY);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.plan.env).toEqual({ PATH: '/bin' });
    expect(d.plan.droppedEnv).toEqual(['AWS_SECRET', 'LANG', 'TZ']);
  });

  it('budgets are policy-capped: a rule asking for more than the ceiling is clamped DOWN, silently generous defaults bounded', () => {
    const d = planExec({ argv: ['git', 'status', '--short'] }, {
      ...POLICY,
      maxTimeoutMs: 2_000,
      maxOutputBytes: 1_024,
    });
    expect(d.ok && d.plan.timeoutMs).toBe(2_000);
    expect(d.ok && d.plan.maxOutputBytes).toBe(1_024);
    const def = planExec({ argv: ['node', 'scripts/build.js'] }, POLICY);
    expect(def.ok && def.plan.timeoutMs).toBe(30_000);
    expect(def.ok && def.plan.maxOutputBytes).toBe(65_536);
  });

  it('an EMPTY allow array denies everything (a policy is not a policy until it names what is allowed)', () => {
    expect(planExec({ argv: ['node', 'scripts/build.js'] }, { root: 'X:/jail', allow: [] })).toEqual({
      ok: false,
      reason: 'no allowlist rule matches ["node","scripts/build.js"] (default-deny)',
    });
  });

  it('decisions are deterministic and the plan owns its data (no shared references to the request)', () => {
    const req = { argv: ['node', 'scripts/build.js'], env: { PATH: '/bin' } };
    const a = planExec(req, POLICY);
    req.env.PATH = '/mutated';
    (req.argv as string[]).push('surprise');
    const b = planExec({ argv: ['node', 'scripts/build.js'], env: { PATH: '/bin' } }, POLICY);
    expect(a).toEqual(b);
    if (a.ok && b.ok) expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
  });

  it('an INVALID policy is a stated refusal, evaluated before the request', () => {
    const d = planExec({ argv: ['node', 'scripts/build.js'] }, { root: 'X:/jail', allow: [{ argv: ['*', 'x'] }] });
    expect(d).toEqual({ ok: false, reason: "policy invalid: rule 0: '*' may not match the executable" });
  });
});

describe('validatePolicy + registerExecTools (programmer errors die at registration)', () => {
  it("rejects '*', empty argv patterns, empty tokens and path executables; accepts sane policies", () => {
    expect(validatePolicy(POLICY)).toBeNull();
    expect(validatePolicy({ root: 'r', allow: [{ argv: [] }] })).toContain('argv pattern must be non-empty');
    expect(validatePolicy({ root: 'r', allow: [{ argv: ['*', 'build'] }] })).toContain("'*' may not match the executable");
    expect(validatePolicy({ root: 'r', allow: [{ argv: ['node', ''] }] })).toContain('tokens must be non-empty strings');
    expect(validatePolicy({ root: 'r', allow: [{ argv: ['usr/bin/node'] }] })).toContain('executable must be a bare name');
  });

  it('registerExecTools throws on an invalid policy instead of installing a hole', () => {
    expect(() => registerExecTools(new ToolRegistry(), { root: 'r', allow: [{ argv: ['*'] }] })).toThrow(
      "exec policy invalid: rule 0: '*' may not match the executable",
    );
  });
});

describe('the exec.plan tool (§28 stance: it decides, so it is read-only — nothing to gate)', () => {
  const setup = () => {
    const registry = new ToolRegistry();
    registerExecTools(registry, POLICY);
    return registry;
  };

  it('exec.plan is registered with read permission per its spec', () => {
    expect(EXEC_TOOL_SPECS[0]).toMatchObject({ name: 'exec.plan', permissions: ['read'] });
  });

  it('callable WITHOUT any checkpoint (no write/exec/network permission demanded), and the output says executes:false', async () => {
    const res = await setup().invoke({ callId: 'c1', tool: 'exec.plan', args: { argv: ['node', 'scripts/build.js'], cwd: 'docs' } });
    expect(res.ok).toBe(true);
    const out = res.output as { planned: boolean; executes: boolean; plan: { cwd: string; executes: boolean } };
    expect(out).toMatchObject({ planned: true, executes: false, plan: { cwd: 'X:/jail/docs', executes: false } });
  });

  it('a refused request still succeeds AS A TOOL CALL: planned:false with the stated reason (§60 shape)', async () => {
    const res = await setup().invoke({ callId: 'c2', tool: 'exec.plan', args: { argv: ['rm', '-rf', '/'] } });
    expect(res.ok).toBe(true);
    const out = res.output as { planned: boolean; executes: boolean; reason: string };
    expect(out).toMatchObject({ planned: false, executes: false });
    expect(out.reason).toContain('default-deny');
  });

  it('registry arg validation applies: missing argv, wrong type, and a non-string array are all rejected', async () => {
    const registry = setup();
    expect((await registry.invoke({ callId: 'c3', tool: 'exec.plan', args: {} })).error).toContain('missing required arg "argv"');
    expect((await registry.invoke({ callId: 'c4', tool: 'exec.plan', args: { argv: 'node build.js' } })).error).toContain('arg "argv" expected string[], got string');
    expect((await registry.invoke({ callId: 'c5', tool: 'exec.plan', args: { argv: ['node', 3] } })).error).toContain('arg "argv" expected string[], got object');
  });
});
