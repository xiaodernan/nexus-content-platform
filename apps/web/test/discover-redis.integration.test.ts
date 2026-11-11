import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import {
  getDiscoverCache,
  __resetDiscoverCacheDriverForTests,
  DEFAULT_KEY_PREFIX,
  DISCOVER_REDIS_URL_ENV,
  DISCOVER_CACHE_TTL_MS,
} from '@/server/cache/discoverRedis';
import type { DiscoverResult } from '@/server/domain/social';

/**
 * The Redis driver for `/api/discover`'s anonymous route — proof that what the route caches lives on
 * the shared Redis, not in any one process. Hits a real Redis; the DEAD_URL case proves that
 * unavailability surfaces as `redis-unavailable` rather than silent fallback (the whole point of the
 * "no in-memory fallback" rule).
 */
const REDIS_URL = process.env[DISCOVER_REDIS_URL_ENV]?.trim() || 'redis://127.0.0.1:56379';
const DEAD_URL = 'redis://127.0.0.1:56399';

const sample = (suffix: string): DiscoverResult => ({
  sort: 'new',
  cards: [{
    publicationId: `pub-${suffix}`,
    path: `/n/test-owner/pub-${suffix}`,
    name: `Publication ${suffix}`,
    owner: 'Test Owner',
    handle: 'test-owner',
    publishedAt: new Date(0).toISOString(),
    views: 0,
    likes: 0,
    comments: 0,
    remixes: 0,
    kind: 'website',
    coverAssetId: null,
    ownerHandle: 'test-owner',
  }],
  hiddenAuthors: 0,
  method: null,
  unavailable: [],
});

beforeAll(() => __resetDiscoverCacheDriverForTests());
afterEach(() => {
  vi.unstubAllEnvs();
  __resetDiscoverCacheDriverForTests();
});

describe('discoverRedis — SHARED cache across processes', () => {
  it("drivers made from fresh env pick the right backend", async () => {
    vi.stubEnv(DISCOVER_REDIS_URL_ENV, '');
    __resetDiscoverCacheDriverForTests();
    const memory = getDiscoverCache();
    expect(memory.driver()).toBe('memory');

    vi.stubEnv(DISCOVER_REDIS_URL_ENV, REDIS_URL);
    __resetDiscoverCacheDriverForTests();
    const redis = getDiscoverCache();
    expect(redis.driver()).toBe('redis');

    // cleanup: wipe test keys so the real dev Redis stays
    await redis.clear();
  });

  it('caches under a shared prefix; a second freshly-built driver sees the same value', async () => {
    vi.stubEnv(DISCOVER_REDIS_URL_ENV, REDIS_URL);
    __resetDiscoverCacheDriverForTests();
    const first = getDiscoverCache();
    await first.clear();
    await first.set('new', sample('a'));

    __resetDiscoverCacheDriverForTests();
    const second = getDiscoverCache();
    const read = await second.get('new');
    expect(read?.cards[0]?.publicationId).toBe('pub-a');

    await second.clear();
  });

  it('SET with PX applies a bounded TTL (not forever)', async () => {
    vi.stubEnv(DISCOVER_REDIS_URL_ENV, REDIS_URL);
    __resetDiscoverCacheDriverForTests();
    const cache = getDiscoverCache();
    await cache.clear();
    await cache.set('new', sample('px'));

    const probe = new Redis(REDIS_URL);
    try {
      const ttlMs = await probe.pttl(`${DEFAULT_KEY_PREFIX}new`);
      expect(ttlMs).toBeGreaterThan(0);
      expect(ttlMs).toBeLessThanOrEqual(DISCOVER_CACHE_TTL_MS);
    } finally {
      await cache.clear();
      await probe.quit();
    }
  });

  it('an unreachable lane reports redis-unavailable, not a silent memory swap', async () => {
    vi.stubEnv(DISCOVER_REDIS_URL_ENV, DEAD_URL);
    __resetDiscoverCacheDriverForTests();
    const cache = getDiscoverCache();
    try {
      const read = await cache.get('new');
      expect(read).toBeUndefined();
      expect(cache.driver()).toBe('redis-unavailable');
    } finally {
      // ioredis will keep trying; close it so the test exits cleanly
      const anyCache = cache as unknown as { client?: Redis };
      await anyCache.client?.quit().catch(() => undefined);
    }
  });
});
