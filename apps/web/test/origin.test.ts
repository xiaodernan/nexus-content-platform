import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * §166 SEO 的绝对 URL 来源（`lib/origin.ts`）的第一份单测。
 *
 * 这个模块此前**零测试引用**，而它管着 `og:url` / `canonical` / `sitemap` 的 `<loc>`——
 * 一条"谁说了算"的信任链，顺序错了就是把爬虫引到别人域名上（注释里点名了 Host 头那件事）：
 * 1. 配置 `NEXUS_PUBLIC_ORIGIN` 优先，忽略请求头（部署时唯一值得信任的说法）；
 * 2. 没配置时从请求推导，但 **`x-forwarded-host` 只在同时给了 `x-forwarded-proto` 时才采信**
 *    （成对出现 = 前面有一层会改写协议的代理；只有一个的更可能是客户端自己塞的头）；
 * 3. 都拿不到 → null，调用方省略绝对 URL，而不是编一个 localhost 进生产页面的 head。
 */

const headerStore = vi.hoisted(() => new Map<string, string | null>());
const headerThrow = vi.hoisted(() => ({ value: false }));

vi.mock('next/headers', () => ({
  headers: async () => {
    if (headerThrow.value) throw new Error('headers() called outside a request scope');
    return { get: (name: string) => headerStore.get(name) ?? null };
  },
}));

// 模块级 latch（warnedBadOrigin）跨用例共享：warn 一次的用例必须排在其它"坏配置"用例之前，
// 否则 latch 已被别的用例翻掉，断言"没再 warn"就失去意义。文件内用例顺序即执行顺序。
const { requestOrigin, absoluteUrl } = await import('../src/lib/origin');

const ORIGINAL_ENV = process.env.NEXUS_PUBLIC_ORIGIN;

beforeEach(() => {
  headerStore.clear();
  headerThrow.value = false;
  delete process.env.NEXUS_PUBLIC_ORIGIN;
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NEXUS_PUBLIC_ORIGIN;
  else process.env.NEXUS_PUBLIC_ORIGIN = ORIGINAL_ENV;
});

describe('requestOrigin：配置优先（部署时唯一值得信任的说法）', () => {
  it('配置了合法 origin → source=config，且路径被剥掉（URL().origin 的语义）', async () => {
    process.env.NEXUS_PUBLIC_ORIGIN = 'https://nexus.example.com/some/path';
    headerStore.set('host', 'evil.example.net');
    const result = await requestOrigin();
    expect(result).toEqual({ origin: 'https://nexus.example.com', source: 'config' });
  });

  it('配置非法 → 不 500、不静默，退化到请求头推导并 warn 一次', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.NEXUS_PUBLIC_ORIGIN = 'not a url';
    headerStore.set('host', 'localhost:3100');

    const first = await requestOrigin();
    expect(first).toEqual({ origin: 'http://localhost:3100', source: 'request' });
    expect(warn).toHaveBeenCalledTimes(1);

    // 第二次：latch 已翻，不再重复 warn（否则每个公开页都会刷一行）
    await requestOrigin();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('requestOrigin：从请求推导（三条规则按可信度排序）', () => {
  it('没有配置 → 用 host 头；localhost 推 http，其余推 https', async () => {
    headerStore.set('host', 'localhost:3100');
    await expect(requestOrigin()).resolves.toEqual({ origin: 'http://localhost:3100', source: 'request' });

    headerStore.set('host', '127.0.0.1:3100');
    await expect(requestOrigin()).resolves.toEqual({ origin: 'http://127.0.0.1:3100', source: 'request' });

    headerStore.set('host', 'nexus.example.com');
    await expect(requestOrigin()).resolves.toEqual({ origin: 'https://nexus.example.com', source: 'request' });
  });

  it('x-forwarded-host 单独出现 → **不采信**（只有一个头的更可能是客户端自己塞的）', async () => {
    headerStore.set('host', 'real.example.com');
    headerStore.set('x-forwarded-host', 'evil.example.net');
    await expect(requestOrigin()).resolves.toEqual({ origin: 'https://real.example.com', source: 'request' });
  });

  it('x-forwarded-host 与 x-forwarded-proto 成对出现 → 采信 forwarded 那一对', async () => {
    headerStore.set('host', 'internal:3000');
    headerStore.set('x-forwarded-host', 'public.example.com');
    headerStore.set('x-forwarded-proto', 'https');
    await expect(requestOrigin()).resolves.toEqual({ origin: 'https://public.example.com', source: 'request' });
  });

  it('x-forwarded-proto 带列表时取第一段（代理链的最近一跳）', async () => {
    headerStore.set('x-forwarded-host', 'public.example.com');
    headerStore.set('x-forwarded-proto', 'https, http');
    await expect(requestOrigin()).resolves.toEqual({ origin: 'https://public.example.com', source: 'request' });
  });

  it('只有 forwarded-proto 没有 forwarded-host → 用 host 头 + forwarded 的协议', async () => {
    headerStore.set('host', 'real.example.com');
    headerStore.set('x-forwarded-proto', 'http');
    await expect(requestOrigin()).resolves.toEqual({ origin: 'http://real.example.com', source: 'request' });
  });

  it('两个头都没有 → null / none（调用方省略绝对 URL，不编 localhost）', async () => {
    await expect(requestOrigin()).resolves.toEqual({ origin: null, source: 'none' });
  });

  it('headers() 在没有请求上下文时抛错 → 同样回落 null / none，不 500', async () => {
    headerThrow.value = true;
    await expect(requestOrigin()).resolves.toEqual({ origin: null, source: 'none' });
  });
});

describe('absoluteUrl：origin 为 null 时让调用方走"省略这条标签"的分支', () => {
  it('null → null', () => {
    expect(absoluteUrl(null, '/n/a/b')).toBeNull();
  });

  it('带前导斜杠的路径直接拼', () => {
    expect(absoluteUrl('https://x.example', '/n/a/b')).toBe('https://x.example/n/a/b');
  });

  it('不带前导斜杠也补上（不产生 https://x.examplen/... 那种拼错的地址）', () => {
    expect(absoluteUrl('https://x.example', 'n/a/b')).toBe('https://x.example/n/a/b');
  });
});
