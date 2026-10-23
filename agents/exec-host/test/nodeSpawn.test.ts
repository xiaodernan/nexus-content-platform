import { describe, expect, it } from 'vitest';

import { NODE_SPAWN } from '../src/execHost.js';

/**
 * v468 — the REAL spawn adapter, graded directly.
 *
 * Every case in `execHost.test.ts` injects a fake spawn, and that file’s own row says so: zero real
 * processes in vitest. The DEFAULT is `NODE_SPAWN` — the one adapter every host actually runs on —
 * and until now it had no case of its own. These run against REAL processes: the very interpreter
 * running this suite, asked to print, to fail, to carry an argument and an env var, and to be killed.
 * A fake cannot answer for `shell: false`; only a real shell-less spawn can.
 */

interface RunResult {
  out: string;
  err: string;
  end: { code: number | null; signal: string | null; error?: string };
  pid: number | undefined;
}

/** Run the interpreter running this suite with `-e <script>`, collecting both streams to the end. */
function runNode(script: string, args: string[] = [], env: Record<string, string> = { ...process.env } as Record<string, string>): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    let out = '';
    let err = '';
    const child = NODE_SPAWN(process.execPath, ['-e', script, ...args], { cwd: process.cwd(), env });
    child.onData((stream, chunk) => {
      if (stream === 'stdout') out += String(chunk);
      else err += String(chunk);
    });
    child.onEnd((end) => resolve({ out, err, end, pid: child.pid }));
  });
}

describe('NODE_SPAWN — the real adapter, against real processes (v468)', () => {
  it('spawns argv-as-data and carries stdout and stderr on their own streams', async () => {
    const r = await runNode('process.stdout.write("out");process.stderr.write("err")');
    expect(r.out).toBe('out');
    expect(r.err).toBe('err');
    expect(r.end.error).toBeUndefined();
    expect(r.end.code).toBe(0);
  });

  it('surfaces the OS pid — the handle that makes killing a tree possible at all', async () => {
    const r = await runNode('process.stdout.write("x")');
    expect(typeof r.pid).toBe('number');
    expect(r.pid!).toBeGreaterThan(0);
  });

  it('a nonzero exit arrives as a CODE, not as an error', async () => {
    const r = await runNode('process.exit(3)');
    expect(r.end.error).toBeUndefined();
    expect(r.end.code).toBe(3);
    expect(r.end.signal).toBeNull();
  });

  it('an argument carrying shell metacharacters arrives as ONE argv token — shell:false, nothing re-parsed', async () => {
    const weird = 'a;b&c|d$e`f"g<h>i';
    const r = await runNode('process.stdout.write(process.argv[1])', [weird]);
    expect(r.out).toBe(weird);
  });

  it('the env it is handed crosses into the child verbatim', async () => {
    const r = await runNode('process.stdout.write(process.env.NEXUS_PROBE ?? "absent")', [], {
      ...process.env,
      NEXUS_PROBE: 'probe-42',
    } as Record<string, string>);
    expect(r.out).toBe('probe-42');
  });

  it('kill() ends the child — the handle the timeout budget relies on', async () => {
    const child = NODE_SPAWN(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
      cwd: process.cwd(),
      env: { ...process.env } as Record<string, string>,
    });
    expect(typeof child.pid).toBe('number');
    const ended = new Promise<{ code: number | null; signal: string | null }>((resolve) => child.onEnd(resolve));
    child.kill();
    const end = await ended;
    expect(end.code !== null || end.signal !== null).toBe(true);
  });
});
