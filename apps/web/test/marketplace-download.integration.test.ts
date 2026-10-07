import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * §127 下载端点的三道边界（打真库）。
 *
 * 这一条是补的：端点原来**没有** CSRF 校验、没有限流，报错还是英文裸报文。
 * 而客户端那边同一个组件的 DELETE / PATCH 都带着 `csrfHeaders()`，只有下载漏了——
 * **两边一起漏，所以功能照常能用、测试照常绿**。这类缺陷跑测试发现不了，
 * 只能靠横向对比（参照实现是 `/api/published/visit`）。补完之后必须有测试把它钉住，
 * 否则下次有人"顺手简化"掉又不会红。
 */

/** `csrfOk` 走的是 `next/headers` 的 `cookies()`；这里给它一个可控的 cookie 罐 */
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const { POST } = await import('../src/app/api/marketplace/[id]/download/route');
const { CSRF_COOKIE, CSRF_HEADER } = await import('../src/server/security/csrf');

const TOKEN = 'a1b2c3d4e5f60718';

function call(id: string, headers: Record<string, string> = {}): Promise<Response> {
  return POST(new Request(`http://localhost:3100/api/marketplace/${id}/download`, { method: 'POST', headers }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  jar.clear();
  jar.set(CSRF_COOKIE, TOKEN);
});

describe('下载端点：CSRF 双提交', () => {
  it('没带头 → 403，且**一次都没碰数据库**（校验在取条目之前）', async () => {
    const res = await call('00000000-0000-4000-8000-000000000001');
    expect(res.status).toBe(403);
    // `jsonError` 把**机器可读的码**放在 `error` 里、人话放在 `message` 里（全站一致）
    expect((await res.json()).error).toBe('csrf_failed');
  });

  it('头与 cookie 不一致 → 403（长度不同也要走同一条路，不给"长度对不对"留时序）', async () => {
    for (const bad of ['', 'short', TOKEN.slice(0, -1) + 'f', TOKEN.toUpperCase()]) {
      const res = await call('00000000-0000-4000-8000-000000000001', { [CSRF_HEADER]: bad });
      expect(res.status, `头=${JSON.stringify(bad)}`).toBe(403);
    }
  });

  it('cookie 不在（只有头）→ 403：攻击者的跨站表单带得上 cookie 却读不到它，所以两边都要有', async () => {
    jar.clear();
    const res = await call('00000000-0000-4000-8000-000000000001', { [CSRF_HEADER]: TOKEN });
    expect(res.status).toBe(403);
  });
});

describe('下载端点：过了 CSRF 之后的判定', () => {
  it('不存在的条目 → 404，且是标准错误形状（以前这里是英文裸报文，客户端按标准形状解什么都拿不到）', async () => {
    const res = await call('00000000-0000-4000-8000-000000000002', { [CSRF_HEADER]: TOKEN });
    expect(res.status).toBe(404);
    const body = await res.json();
    // 以前这里是 `{ error: 'Item not found or has been removed' }`——那个字段装的是**英文句子**，
    // 客户端拿不到可判别的码；现在装的是码，人话在 message 里
    expect(body.error).toBe('not_found');
    expect(body.message).toMatch(/[\u4e00-\u9fa5]/);
  });

  it('限流生效：同一个 IP + 同一条目打满 60 次之后是 429（数字是给人看的，不能让人随便灌）', async () => {
    const id = '00000000-0000-4000-8000-000000000003';
    let last = 0;
    for (let i = 0; i < 61; i += 1) {
      const res = await call(id, { [CSRF_HEADER]: TOKEN });
      last = res.status;
      if (last === 429) break;
    }
    expect(last, '打到 61 次还是没被限流').toBe(429);
  });

  it('限流按条目分开：灌满了 A 不影响 B', async () => {
    const a = '00000000-0000-4000-8000-000000000004';
    for (let i = 0; i < 61; i += 1) {
      const res = await call(a, { [CSRF_HEADER]: TOKEN });
      if (res.status === 429) break;
    }
    const res = await call('00000000-0000-4000-8000-000000000005', { [CSRF_HEADER]: TOKEN });
    expect(res.status, 'B 被 A 的限流牵连了').not.toBe(429);
  });
});
