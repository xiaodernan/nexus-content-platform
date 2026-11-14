import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetWorldViewCacheForTests,
  getWorldViewCache,
  WORLD_VIEW_CACHE_TTL_MS,
  WORLD_VIEW_REDIS_URL_ENV,
} from '@/server/cache/worldViewCache';

/**
 * v710 / ADR 0143 - the world-document read cache semantics contract.
 * Memory driver = deterministic, no DB, no Redis (same shape as discover tests):
 *
 * 1. Hit short-circuits the underlying read - first miss stores, second read hits
 * 2. "No world" (null) is a cacheable, DEL-able answer (hot path for empty projects)
 * 3. del() must return to miss - write-path DEL is half of correctness; TTL cannot substitute
 * 4. Redis unreachable: get/set/del all resolve (failure is a miss, not an error, never a wrong answer)
 * 5. worlds.ts write paths (insert / applyWorldUpdate) both call DEL - pinned by static gates
 */

const DOMAIN = join(process.cwd(), 'apps/web/src/server/domain/worlds.ts');

const sampleDoc = {
  id: 'w-1',
  projectId: 'p-1',
  nodes: [],
  links: [],
  positions: {},
  name: 'fixture',
  summary: '',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

beforeEach(() => {
  vi.stubEnv(WORLD_VIEW_REDIS_URL_ENV, ''); // memory driver
  __resetWorldViewCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  __resetWorldViewCacheForTests();
});

describe('world view cache - memory driver semantics', () => {
  it('miss -> store -> hit: underlying compute runs once; value round-trips', async () => {
    let computes = 0;
    const compute = async () => {
      computes += 1;
      return { ok: true as const, document: { ...sampleDoc } };
    };
    const cache = getWorldViewCache();
    expect(cache.driver()).toBe('memory');

    expect(await cache.get('p-1')).toBeUndefined();
    const first = await compute();
    await cache.set('p-1', first);
    const second = await cache.get('p-1');
    expect(second?.ok).toBe(true);
    expect(computes).toBe(1);
    expect(await cache.liveSize()).toBe(1);
  });

  it('"no world" (null) is cacheable and del() returns to miss', async () => {
    const cache = getWorldViewCache();
    await cache.set('p-empty', null);
    expect(await cache.get('p-empty')).toBeNull();
    await cache.del('p-empty');
    expect(await cache.get('p-empty')).toBeUndefined();
  });

  it('del does not touch other projects; TTL pinned at 30s (change it via an ADR)', async () => {
    expect(WORLD_VIEW_CACHE_TTL_MS).toBe(30_000);
    const cache = getWorldViewCache();
    await cache.set('p-a', { ok: true as const, document: { ...sampleDoc } });
    await cache.set('p-b', null);
    await cache.del('p-a');
    expect(await cache.get('p-a')).toBeUndefined();
    expect(await cache.get('p-b')).toBeNull();
  });

  it('Redis unreachable: get/set/del all resolve - failure is a miss, not an error', async () => {
    vi.stubEnv(WORLD_VIEW_REDIS_URL_ENV, 'redis://127.0.0.1:6390'); // no listener
    __resetWorldViewCacheForTests();
    const cache = getWorldViewCache();
    await expect(cache.get('p-x')).resolves.toBeUndefined();
    await expect(cache.set('p-x', null)).resolves.toBeUndefined();
    await expect(cache.del('p-x')).resolves.toBeUndefined();
    expect(cache.driver()).toBe('redis-unavailable');
  }, 15_000);
});

describe('world view cache - static gates on worlds.ts (both write paths must DEL)', () => {
  const source = readFileSync(DOMAIN, 'utf8');

  it('loadWorld asks the cache first; currentRow only on the miss path', () => {
    const body = source.slice(source.indexOf('export async function loadWorld'));
    const hitIdx = body.indexOf('cache.get(projectId)');
    const rowIdx = body.indexOf('computeWorldResult(projectId)');
    expect(hitIdx).toBeGreaterThanOrEqual(0);
    expect(rowIdx).toBeGreaterThan(hitIdx);
  });

  it('insert path (onConflictDoNothing succeeded) invalidates before returning', () => {
    const idx = source.indexOf('if (inserted)');
    const segment = source.slice(idx, idx + 400);
    expect(segment).toContain('invalidateWorldViewCache(projectId)');
  });

  it('update path (applyWorldUpdate succeeded) invalidates AFTER the SQL update', () => {
    const idx = source.indexOf('async function applyWorldUpdate');
    const segment = source.slice(idx, idx + 2500);
    expect(segment).toContain('invalidateWorldViewCache(projectId)');
    expect(segment.indexOf('invalidateWorldViewCache(projectId)')).toBeGreaterThan(segment.indexOf('.update(worlds)'));
  });
});
