/**
 * §PULSE-3 platformPulseCached · TTL 与 single-flight 的缓存语义
 *
 * 钉三件事（ADR 0094 薄门）：
 * 1. TTL 内命中直接返回已缓存值（loader 只调一次）；
 * 2. TTL 过期后重新调用 loader；
 * 3. 飞行中（loader 尚未返回）的并发调用共享同一份结果，loader 不会重复跑。
 * 4. loader 失败 → in-flight 释放；下次调用重试；缓存不会塞进错误值。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { platformPulseCached, resetPulseCache } from '@/server/domain/pulse';
import type { PlatformPulse } from '@/server/domain/pulse';

const fakePulse = (marker: string): PlatformPulse => ({ generatedAt: marker } as unknown as PlatformPulse);

beforeEach(() => {
  resetPulseCache();
});

describe('platformPulseCached', () => {
  it('TTL 内命中：loader 只调一次，两次拿的是同一份结果', async () => {
    let t = 1_000_000;
    const now = () => t;
    const load = vi.fn(async () => fakePulse('a'));
    const first = await platformPulseCached(now, load);
    const second = await platformPulseCached(now, load);
    expect(first).toBe(second);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('TTL 过期：重新调用 loader 取新值', async () => {
    let t = 1_000_000;
    const now = () => t;
    const load = vi.fn(async () => fakePulse(`g${load.mock.calls.length}`));
    const a = await platformPulseCached(now, load);
    expect(a.generatedAt).toBe('g1');
    t += 29_999; // 仍在 TTL 内
    const b = await platformPulseCached(now, load);
    expect(b.generatedAt).toBe('g1');
    t += 2; // 跨过 30_000
    const c = await platformPulseCached(now, load);
    expect(c.generatedAt).toBe('g2');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('飞行中并发：共享同一份 in-flight，loader 只跑一次', async () => {
    const now = () => 1_000_000;
    let resolve!: (value: PlatformPulse) => void;
    const load = vi.fn(() => new Promise<PlatformPulse>((res) => { resolve = res; }));
    const p1 = platformPulseCached(now, load);
    const p2 = platformPulseCached(now, load);
    // 先等 loader 真的被 call 起来（redis 探测会让 load 在一绕过 microtask 后才发生）
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    resolve(fakePulse('shared'));
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loader 失败：in-flight 释放，下一次调用重试，缓存不会塞进错误值', async () => {
    const now = () => 1_000_000;
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(fakePulse('after'));
    await expect(platformPulseCached(now, load)).rejects.toThrow('db down');
    const next = await platformPulseCached(now, load);
    expect(next.generatedAt).toBe('after');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
