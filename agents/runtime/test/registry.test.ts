import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import type { ToolCall } from '../src/types.js';

const echo = new ToolRegistry()
  .register({ name: 'greet', description: '', permissions: ['read'], args: [{ name: 'who', type: 'string', required: true }] }, (a) => `hi ${String(a.who)}`)
  .register({ name: 'mutate', description: '', permissions: ['write'], args: [] }, () => 'done')
  .register({ name: 'boom', description: '', permissions: ['exec'], args: [] }, () => { throw new Error('kaput'); });

const call = (tool: string, args: Record<string, unknown> = {}): ToolCall => ({ callId: `c-${tool}`, tool, args });

describe('registry: validation', () => {
  it('runs a read tool with valid args', async () => {
    const r = await echo.invoke(call('greet', { who: 'x' }));
    expect(r).toMatchObject({ ok: true, output: 'hi x' });
  });
  it('rejects unknown tool, missing required, wrong type and extra args', async () => {
    expect((await echo.invoke(call('nope'))).error).toContain('unknown tool');
    expect((await echo.invoke(call('greet'))).error).toContain('missing required');
    expect((await echo.invoke(call('greet', { who: 7 }))).error).toContain('expected string');
    expect((await echo.invoke(call('greet', { who: 'x', extra: 1 }))).error).toContain('unknown arg');
  });
  it('refuses double registration', () => {
    expect(() => echo.register({ name: 'greet', description: '', permissions: [], args: [] }, () => 1)).toThrow(/already registered/);
  });
});

describe('registry: checkpoint gate (ADR 0013)', () => {
  it('non-read tools do not run without a checkpoint', async () => {
    const r = await echo.invoke(call('mutate'));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('checkpoint required');
  });
  it('a denying checkpoint blocks the implementation', async () => {
    let ran = false;
    const reg = new ToolRegistry().register({ name: 'side', description: '', permissions: ['write'], args: [] }, () => (ran = true));
    const r = await reg.invoke(call('side'), { checkpoint: () => false });
    expect(r.error).toContain('denied at checkpoint');
    expect(ran).toBe(false);
  });
  it('an approving checkpoint lets the tool run', async () => {
    const r = await echo.invoke(call('mutate'), { checkpoint: ({ permissions }) => permissions.includes('write') });
    expect(r).toMatchObject({ ok: true, output: 'done' });
  });
  it('implementation throws become ok:false results, never rejections', async () => {
    const r = await echo.invoke(call('boom'), { checkpoint: () => true });
    expect(r).toMatchObject({ ok: false, error: 'kaput' });
  });
});
