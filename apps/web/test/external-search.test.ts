import { describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_MAX_HITS,
  EXTERNAL_SNIPPET_CHARS,
  defaultExternalSearchProvider,
  externalUnavailableNote,
  wikipediaProvider,
  type ExternalSearchProvider,
} from '@/server/domain/externalSearch';

/** 可注入的假 fetch：不联网、不烧配额，只验调用形状与失败路径。 */
function stubFetch(handler: (url: string) => { ok: boolean; status: number; json: unknown }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    // RequestInfo 可能是 Request：它有 .url，别走 Object 的默认 stringification
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const r = handler(url);
    return { ok: r.ok, status: r.status, json: async () => r.json } as Response;
  }) as unknown as typeof fetch;
}

function searchThenSummary(summaryFor: (url: string) => unknown) {
  return stubFetch((url) => {
    if (url.includes('/w/api.php')) return { ok: true, status: 200, json: { query: { search: [{ title: 'X' }] } } };
    const s = summaryFor(url);
    return s && typeof s === 'object' && 'status' in (s as object)
      ? (s as { ok: boolean; status: number; json: unknown })
      : { ok: true, status: 200, json: s };
  });
}

describe('§EXT-SEARCH · wikipediaProvider', () => {
  it('两步走：先搜索端点拿候选，再逐条取摘要；URL 用服务端给的那一条', async () => {
    vi.stubGlobal(
      'fetch',
      searchThenSummary(() => ({
        title: '计算机科学',
        extract: '计算机科学是系统性研究信息与计算的学科。',
        content_urls: { desktop: { page: 'https://zh.wikipedia.org/wiki/计算机科学' } },
      })),
    );
    try {
      const res = await wikipediaProvider.search('计算机', 'zh');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.hits).toHaveLength(1);
      expect(res.hits[0]!.title).toBe('计算机科学');
      expect(res.hits[0]!.snippet).toContain('系统性研究信息与计算');
      expect(res.hits[0]!.url).toBe('https://zh.wikipedia.org/wiki/计算机科学');
      expect(res.hits[0]!.source).toBe('维基百科');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('HTML 标签与实体被剥掉，摘要短时一个字符不丢', async () => {
    vi.stubGlobal(
      'fetch',
      searchThenSummary(() => ({
        title: 'X',
        extract: '<span class="highlight">盐碱地</span>&amp;尾',
        content_urls: { desktop: { page: 'https://zh.wikipedia.org/wiki/X' } },
      })),
    );
    try {
      const res = await wikipediaProvider.search('盐碱地', 'zh');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.hits[0]!.snippet).toBe('盐碱地&尾');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('超长摘要截到 EXTERNAL_SNIPPET_CHARS 并加省略号——不是把别人的正文搬进来', async () => {
    vi.stubGlobal(
      'fetch',
      searchThenSummary(() => ({
        title: 'X',
        extract: '甲'.repeat(EXTERNAL_SNIPPET_CHARS + 500),
        content_urls: { desktop: { page: 'https://zh.wikipedia.org/wiki/X' } },
      })),
    );
    try {
      const res = await wikipediaProvider.search('查询', 'zh');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.hits[0]!.snippet).toHaveLength(EXTERNAL_SNIPPET_CHARS + 1);
      expect(res.hits[0]!.snippet.endsWith('…')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('搜索端点非 2xx ⇒ ok:false 且原因是原话，不假装"没有资料"', async () => {
    vi.stubGlobal('fetch', stubFetch(() => ({ ok: false, status: 503, json: {} })));
    try {
      const res = await wikipediaProvider.search('查询', 'zh');
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.reason).toContain('503');
      expect(res.reason).not.toContain('没有');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('网络异常 ⇒ ok:false，reason 里带异常名，不吞掉', async () => {
    vi.stubGlobal('fetch', (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch);
    try {
      const res = await wikipediaProvider.search('查询', 'en');
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.reason).toContain('TypeError');
      expect(res.reason).toContain('没连上');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('单条摘要取不到只跳过那一条，不让整块陪葬', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      stubFetch((url) => {
        if (url.includes('/w/api.php')) {
          return { ok: true, status: 200, json: { query: { search: [{ title: 'A' }, { title: 'B' }] } } };
        }
        n += 1;
        if (n === 1) return { ok: false, status: 500, json: {} };
        return { ok: true, status: 200, json: { title: 'B', extract: 'B 的摘要', content_urls: { desktop: { page: 'https://zh.wikipedia.org/wiki/B' } } } };
      }),
    );
    try {
      const res = await wikipediaProvider.search('查询', 'zh');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.hits.map((h) => h.title)).toEqual(['B']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('候选为空 ⇒ ok:true 且 hits 空（"没有匹配"与"连不上"是两件事）', async () => {
    vi.stubGlobal('fetch', stubFetch(() => ({ ok: true, status: 200, json: { query: { search: [] } } })));
    try {
      const res = await wikipediaProvider.search('查询', 'zh');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.hits).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('locale 决定问哪个语言站：zh→zh.wikipedia.org，en→en.wikipedia.org', async () => {
    const hosts: string[] = [];
    vi.stubGlobal(
      'fetch',
      stubFetch((url) => {
        hosts.push(new URL(url).host);
        if (url.includes('/w/api.php')) return { ok: true, status: 200, json: { query: { search: [{ title: 'A' }] } } };
        return { ok: true, status: 200, json: { title: 'A', extract: '摘要', content_urls: { desktop: { page: 'https://x/wiki/A' } } } };
      }),
    );
    try {
      await wikipediaProvider.search('查询', 'zh');
      await wikipediaProvider.search('query', 'en');
      expect(hosts).toContain('zh.wikipedia.org');
      expect(hosts).toContain('en.wikipedia.org');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('空查询词不白打一次网络', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', (async () => { calls += 1; return { ok: true, status: 200, json: {} } as Response; }) as unknown as typeof fetch);
    try {
      const res = await wikipediaProvider.search('   ', 'zh');
      expect(res.ok).toBe(false);
      expect(calls).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('§EXT-SEARCH · 可替换性与诚实话术', () => {
  it('业务代码只面向接口：换一个 provider 不用改页面', async () => {
    const fake: ExternalSearchProvider = {
      source: '假源',
      search: async (q) => ({ ok: true, source: '假源', hits: [{ title: q, snippet: 's', url: 'https://example.invalid', source: '假源' }], query: q }),
    };
    const res = await fake.search('任意', 'zh');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.hits[0]!.source).toBe('假源');
  });

  it('默认 provider 就是维基百科（换源只改 defaultExternalSearchProvider 一处）', () => {
    expect(defaultExternalSearchProvider()).toBe(wikipediaProvider);
    expect(defaultExternalSearchProvider().source).toBe('维基百科');
  });

  it('externalUnavailableNote：中英都说"没连上"，都不说成"没有资料"', () => {
    const zh = externalUnavailableNote('TypeError: fetch failed', 'zh');
    const en = externalUnavailableNote('TypeError: fetch failed', 'en');
    expect(zh).toContain('没连上');
    expect(zh).toContain('TypeError: fetch failed');
    expect(zh).toContain('站内的结果不受影响');
    expect(zh).not.toContain('没有资料');
    expect(en).toContain('could not be reached');
    expect(en).toContain('unaffected');
  });

  it('EXTERNAL_MAX_HITS 是个小正数：站外是增强，不是把别人的站搬进来', () => {
    expect(EXTERNAL_MAX_HITS).toBeGreaterThan(0);
    expect(EXTERNAL_MAX_HITS).toBeLessThanOrEqual(10);
  });
});
