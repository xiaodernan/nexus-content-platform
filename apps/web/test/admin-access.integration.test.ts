import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { GET as getAccessSummary } from '../src/app/api/admin/access/route';
import { GET as getAccessExport } from '../src/app/api/admin/access/export/route';
import {
  apiAccessBucketOf,
  apiAccessEndpointsCsv,
  apiAccessTokensCsv,
  listApiAccessGlobal,
} from '../src/server/domain/api-tokens';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getDb } from '../src/server/db/client';
import { apiAccessBuckets, apiTokens, sessions, users } from '../src/server/db/schema';

/**
 * §188 M8 第三片全局视图 `GET /api/admin/access` + CSV 出口的门与账，打真库。
 *
 * 三道门与复核台同一句口径（401 / 403 + 一句 role=admin）。聚合的见证分两类：
 *
 * - **我们自己的行按精确值断言**（两枚新凭据、四个 `__access-test__` 端点，平台里没有
 *   第二个人会打这些名字）：调用和、端点数、项目数、榜单里两枚的先后。
 * - **总数只断"增量"**（插账前读一次、插账后读一次、比差）：这本账是全局的，
 *   开发库里别人此刻的调用也在里面——拿绝对值断言等于把别人的一次读写当成我们的。
 *   桶行数被读限流封顶，两次读之间插不进别人多少，但这个假设明写在这里，
 *   哪天它红了先看的是这句，不是聚合逻辑。
 *
 * 40 天前的那行（`calls=100`）是窗口的反证：30 天保留 + 7 天窗口都不该见到它，
 * 一个 100 次的假热点没被算进来，才说明"窗口"这两个字是真的。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(user: { id: string }): Promise<string> {
  const token = `tok-${user.id}`;
  await getDb()
    .insert(sessions)
    .values({ userId: user.id, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string): void {
  jar.clear();
  jar.set(SESSION_COOKIE, token);
}

const summaryUrl = (days?: string): string =>
  `http://test.local/api/admin/access${days === undefined ? '' : `?days=${days}`}`;

const exportUrl = (days: string, kind?: string): string =>
  `http://test.local/api/admin/access/export?days=${days}${kind === undefined ? '' : `&kind=${kind}`}`;

let regular: { id: string };
let admin: { id: string };
let ownerA: { id: string };
let ownerB: { id: string };
let regularToken: string;
let adminToken: string;
let tokenA: { id: string; name: string };
let tokenB: { id: string; name: string };
let before: Awaited<ReturnType<typeof listApiAccessGlobal>>;

beforeAll(async () => {
  const db = getDb();
  const [u1] = await db
    .insert(users)
    .values({ displayName: '访问账门-普通人', email: 'accessgate+plain@nexus.test' })
    .returning({ id: users.id });
  const [u2] = await db
    .insert(users)
    .values({ displayName: '访问账门-审核员', email: 'accessgate+admin@nexus.test', role: 'admin' })
    .returning({ id: users.id });
  const [u3] = await db
    .insert(users)
    .values({ displayName: '访问账-主人甲', email: 'accessowner+a@nexus.test' })
    .returning({ id: users.id });
  const [u4] = await db
    .insert(users)
    .values({ displayName: '访问账-主人乙', email: 'accessowner+b@nexus.test' })
    .returning({ id: users.id });
  regular = u1!;
  admin = u2!;
  ownerA = u3!;
  ownerB = u4!;
  regularToken = await identityFor(regular);
  adminToken = await identityFor(admin);

  const [t1] = await db
    .insert(apiTokens)
    .values({
      userId: ownerA.id,
      name: '扫描, "甲"',
      tokenHash: await hashToken('access-test-token-a'),
      hint: 'acca0001',
      scopes: ['design:read'],
    })
    .returning({ id: apiTokens.id, name: apiTokens.name });
  const [t2] = await db
    .insert(apiTokens)
    .values({
      userId: ownerB.id,
      name: '访问账-乙',
      tokenHash: await hashToken('access-test-token-b'),
      hint: 'accb0002',
      scopes: ['design:read'],
    })
    .returning({ id: apiTokens.id, name: apiTokens.name });
  tokenA = t1!;
  tokenB = t2!;

  const now = new Date();
  const staleAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  // 总数的基线在插账**之前**读：之后的差才是我们这 6 行买来的
  before = await listApiAccessGlobal(7);
  await db.insert(apiAccessBuckets).values([
    { tokenId: tokenA.id, endpoint: '/__access-test__/alpha', projectId: 'proj-alpha-1', bucket: apiAccessBucketOf(now), lastSeen: now, calls: 5 },
    // 同一端点、不同项目：端点榜是一行（8 次），凭据榜的"项目数"要数出两个
    { tokenId: tokenA.id, endpoint: '/__access-test__/alpha', projectId: 'proj-alpha-2', bucket: apiAccessBucketOf(now), lastSeen: now, calls: 3 },
    { tokenId: tokenA.id, endpoint: '/__access-test__/beta', projectId: 'proj-alpha-1', bucket: apiAccessBucketOf(now), lastSeen: now, calls: 2 },
    // 集合类端点（空串项目）：进"端点数"，不进"项目数"
    { tokenId: tokenA.id, endpoint: '/__access-test__/delta', projectId: '', bucket: apiAccessBucketOf(now), lastSeen: now, calls: 1 },
    { tokenId: tokenB.id, endpoint: '/__access-test__/gamma', projectId: '', bucket: apiAccessBucketOf(now), lastSeen: now, calls: 9 },
    // 40 天前的假热点：落在 30 天保留与 7 天窗口之外，哪张榜都不该有它
    { tokenId: tokenA.id, endpoint: '/__access-test__/old', projectId: '', bucket: apiAccessBucketOf(staleAt), lastSeen: staleAt, calls: 100 },
  ]);
});

afterAll(async () => {
  const db = getDb();
  // users 级联带走 tokens → buckets（迁移 0020 的 FK），不留一行测试账
  await db.delete(users).where(inArray(users.id, [regular.id, admin.id, ownerA.id, ownerB.id]));
});

describe('§188 全局访问账的门', () => {
  it('没登录 → 401', async () => {
    jar.clear();
    const res = await getAccessSummary(new Request(summaryUrl()));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthenticated');
  });

  it('不是 role=admin → 403，连一格总数都不给', async () => {
    asUser(regularToken);
    const res = await getAccessSummary(new Request(summaryUrl()));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(body.message).toContain('role=admin');
    expect(body.totalCalls).toBeUndefined();
    expect(body.tokens).toBeUndefined();
  });

  it('窗口名单外的值 → 400 并说清可选值（不悄悄按 7 天算）', async () => {
    asUser(adminToken);
    const res = await getAccessSummary(new Request(summaryUrl('411')));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_window');
    expect(body.message).toContain('1 / 7 / 30');
  });
});

describe('§188 全局访问账的聚合', () => {
  it('admin → 200：我们两枚凭据的和/端点数/项目数是精确值，总数是"插账后的增量"', async () => {
    asUser(adminToken);
    const res = await getAccessSummary(new Request(summaryUrl('7')));
    expect(res.status).toBe(200);
    const body = await res.json();

    // 总数只断增量：全局账里有别人（开发库是活的），绝对值不归我们说
    expect(body.totalCalls - before.totalCalls).toBe(20);
    expect(body.activeTokens - before.activeTokens).toBe(2);
    expect(body.activeOwners - before.activeOwners).toBe(2);

    const rowA = body.tokens.find((row: { tokenId: string }) => row.tokenId === tokenA.id);
    const rowB = body.tokens.find((row: { tokenId: string }) => row.tokenId === tokenB.id);
    expect(rowA).toBeTruthy();
    expect(rowB).toBeTruthy();
    // 甲：5 + 3 + 2 + 1 = 11，三个端点（alpha/beta/delta），两个项目（空串不算）
    expect({ calls: rowA.calls, endpoints: rowA.endpoints, projects: rowA.projects }).toEqual({
      calls: 11,
      endpoints: 3,
      projects: 2,
    });
    expect(rowA.ownerName).toBe('访问账-主人甲');
    // 乙：9 次、一个端点、零个项目
    expect({ calls: rowB.calls, endpoints: rowB.endpoints, projects: rowB.projects }).toEqual({
      calls: 9,
      endpoints: 1,
      projects: 0,
    });
    // 榜单按调用排：甲（11）先于乙（9），且都不在 40 天前那行之后
    expect(body.tokens.findIndex((r: { tokenId: string }) => r.tokenId === tokenA.id)).toBeLessThan(
      body.tokens.findIndex((r: { tokenId: string }) => r.tokenId === tokenB.id),
    );

    const alpha = body.endpoints.find((row: { endpoint: string }) => row.endpoint === '/__access-test__/alpha');
    expect(alpha).toEqual({ endpoint: '/__access-test__/alpha', calls: 8, tokens: 1 });
    const old = body.endpoints.find((row: { endpoint: string }) => row.endpoint === '/__access-test__/old');
    expect(old).toBeUndefined();
  });

  it('30 天窗口也装不下 40 天前那 100 次（保留期与窗口不是一回事）', async () => {
    const body = await listApiAccessGlobal(30);
    const old = body.endpoints.find((row) => row.endpoint === '/__access-test__/old');
    expect(old).toBeUndefined();
    const rowA = body.tokens.find((row) => row.tokenId === tokenA.id);
    expect(rowA?.calls).toBe(11);
  });

  it('回执形状：windowDays 回读入参，三格是数、两榜是数组', async () => {
    // "真·空窗口"在活库里造不出来（1/7/30 天里总有别人的调用，白名单也没有 0），
    // 所以这条钉形状而不是钉空：哪天空窗口来了，`listApiAccessGlobal` 返回 0 和 [] 而不是 null
    const body = await listApiAccessGlobal(1);
    expect(body.windowDays).toBe(1);
    expect(typeof body.totalCalls).toBe('number');
    expect(typeof body.activeTokens).toBe('number');
    expect(typeof body.activeOwners).toBe('number');
    expect(Array.isArray(body.tokens)).toBe(true);
    expect(Array.isArray(body.endpoints)).toBe(true);
  });
});

describe('§188 CSV 出口', () => {
  it('门同视图：没登录 401，非 admin 403', async () => {
    jar.clear();
    expect((await getAccessExport(new Request(exportUrl('7')))).status).toBe(401);
    asUser(regularToken);
    const res = await getAccessExport(new Request(exportUrl('7')));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
  });

  it('kind / days 白名单：名单外回 400，不默默兜底', async () => {
    asUser(adminToken);
    expect((await getAccessExport(new Request(exportUrl('7', 'everything')))).status).toBe(400);
    expect((await getAccessExport(new Request(exportUrl('411')))).status).toBe(400);
  });

  it('凭据榜 CSV：BOM + 英文表头 + 逗号引号正确转义，甲那行各列是精确值', async () => {
    asUser(adminToken);
    const res = await getAccessExport(new Request(exportUrl('7', 'tokens')));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('api-access-tokens-7d-');
    const bytes = new Uint8Array(await res.arrayBuffer());
    // BOM 是线上的字节（EF BB BF）：`res.text()` 按 fetch 规范会把它剥掉，所以断言走字节不走文本
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    const lines = text.split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('token_id,token_name,hint,owner,calls,endpoints,projects,last_seen');
    const lineA = lines.find((line) => line.startsWith(`${tokenA.id},`));
    expect(lineA).toBeTruthy();
    // 名字里的逗号与引号按 RFC 4180 包装：`扫描, "甲"` → `"扫描, ""甲"""`
    expect(lineA).toContain('"扫描, ""甲"""');
    expect(lineA).toContain(',11,3,2,');
    // 不截断：每一枚窗口内的凭据都有一行（我们两枚都在）
    expect(lines.some((line) => line.startsWith(`${tokenB.id},`))).toBe(true);
    expect(lines.filter((line) => line.startsWith(`${tokenA.id},`))).toHaveLength(1);
  });

  it('端点榜 CSV：alpha 一行 8 次，40 天前的 old 不在文件里', async () => {
    asUser(adminToken);
    const res = await getAccessExport(new Request(exportUrl('7', 'endpoints')));
    expect(res.status).toBe(200);
    const text = new TextDecoder().decode(await res.arrayBuffer());
    const lines = text.split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('endpoint,calls,tokens');
    expect(lines).toContain('/__access-test__/alpha,8,1');
    expect(lines.some((line) => line.startsWith('/__access-test__/old,'))).toBe(false);
  });
});

describe('§188 CSV 构造器（纯函数，钉住转义与行尾）', () => {
  it('token 表：换行也要包引号；端点表：数字不加引号', () => {
    const tokenCsv = apiAccessTokensCsv([
      {
        tokenId: 'tid-1',
        tokenName: '带,逗号和"引号"',
        tokenHint: 'ab000001',
        ownerName: '张三',
        calls: 7,
        endpoints: 2,
        projects: 1,
        lastSeen: '2026-10-13T00:00:00.000Z',
      },
    ]);
    expect(tokenCsv).toContain('tid-1,"带,逗号和""引号""",ab000001,张三,7,2,1,');
    const endpointCsv = apiAccessEndpointsCsv([{ endpoint: '/api/x', calls: 3, tokens: 1 }]);
    expect(endpointCsv).toBe('\uFEFFendpoint,calls,tokens\r\n/api/x,3,1\r\n');
  });
});
