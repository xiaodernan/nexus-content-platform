import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inArray, sql as rawSql } from 'drizzle-orm';
import { GET as exportAnalytics } from '../src/app/api/analytics/export/route';
import { creatorAnalytics, recordVisit } from '../src/server/domain/analytics';
import { createProject } from '../src/server/domain/projects';
import { publishProject } from '../src/server/domain/publish';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getDb } from '../src/server/db/client';
import { projects, sessions, users } from '../src/server/db/schema';

/**
 * §168 的**导出**（`GET /api/analytics/export`）打真库。
 *
 * 这一格要钉的是四件事：
 * - **导出的数字与页面同一份**（同一个 `creatorAnalytics`）⇒ 页面写几个、导出就写几个；
 * - **没采到的是空格子，不是 0** ⇒ "未采集"与"采到 0"在导出里也分得开；
 * - **含逗号的值不挪列**（RFC 4180 的转义）⇒ 一个带逗号的项目名不会把整张表挪歪；
 * - **只给本人**：别人的作品一个字节都不在里面；没登录是 401。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const RUN = `s168exp${Date.now().toString(36)}`;
const KEY = (n: number) => `${n}`.padStart(2, '0').repeat(16);

let ownerId: string;
let otherId: string;
let ownerToken: string;

/** 解析一行 CSV（处理引号里的逗号与转义的双引号）⇒ 断言要按**列**来，不能按逗号硬切 */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += ch;
  }
  cells.push(cell);
  return cells;
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

beforeAll(async () => {
  await getDb().execute(rawSql`select 1 as ok`);
  const db = getDb();
  const [owner] = await db
    .insert(users)
    .values({ displayName: `导出作者${RUN}`, email: `exp+${RUN}@nexus.test`, handle: `exp${RUN}` })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({ displayName: `导出路人${RUN}`, email: `exo+${RUN}@nexus.test`, handle: `exo${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  otherId = other!.id;
  const token = `tok-${ownerId}`;
  await db
    .insert(sessions)
    .values({ userId: ownerId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  ownerToken = token;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, otherId]));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

/** 发一个作品 ⇒ 返回它的发布 id 与路径 */
async function publish(owner: string, name: string): Promise<{ publicationId: string; path: string }> {
  const projectId = (await createProject(owner, { name, kind: 'website' })).id;
  const result = await publishProject(projectId, { visibility: 'public', createdById: owner });
  if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
  return { publicationId: result.publication.id, path: result.publication.path };
}

function call(): Promise<Response> {
  jar.clear();
  jar.set(SESSION_COOKIE, ownerToken);
  return exportAnalytics();
}

describe('§168 导出（CSV）', () => {
  it('数字与页面同一份：逐项等于 creatorAnalytics 给的那一份', async () => {
    const { publicationId, path } = await publish(ownerId, '导出那一份');
    await recordVisit({ publicationId, visitorKey: KEY(1), userId: null, open: true, visibleMs: 4321, completionPct: 42 });

    const res = await call();
    expect(res.status).toBe(200);
    // **BOM 只能在字节上看**：`Response.text()` 的 UTF-8 解码会把开头的 BOM 吃掉 ⇒
    // 用 text() 断言它就等于断言'没有 BOM'（Excel 打开就是乱码）
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0], '要给 Excel 带 BOM（无 BOM 的 UTF-8 中文会乱码）').toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    const lines = decoded.replace(/^\uFEFF/, '').trim().split('\r\n');
    const header = parseCsvLine(lines[0]!);
    const row = parseCsvLine(lines.find((line) => line.includes(path))!);

    // 页面读的那一份（**自己重算一遍**⇒ 这一格不许自己编数）
    const mine = (await creatorAnalytics(ownerId)).find((item) => item.path === path)!;
    expect(mine, '库里读不到自己刚发的那一份').toBeTruthy();
    const cell = (label: string) => row[header.indexOf(label)]!;
    expect(cell('打开次数')).toBe(String(mine.analytics.views));
    expect(cell('访客')).toBe(String(mine.analytics.visitors));
    expect(cell('平均完成度%')).toBe(String(mine.analytics.completion?.avgPct ?? ''));
    expect(cell('累计可见时长毫秒')).toBe(String(mine.analytics.playTimeMs ?? ''));
  });

  it('没采到的是空格不是 0：一条心跳都没有的作品那一格是空的', async () => {
    const { path } = await publish(ownerId, '没有人看过');
    const res = await call();
    const body = await res.text();
    const lines = body.replace(/^\uFEFF/, '').trim().split('\r\n');
    const header = parseCsvLine(lines[0]!);
    const row = parseCsvLine(lines.find((line) => line.includes(path))!);
    const cell = (label: string) => row[header.indexOf(label)]!;
    // 采集到的数：0（确实没人打开过）
    expect(cell('打开次数')).toBe('0');
    // 采不到的数：空（"未采集" ≠ 0）
    expect(cell('累计可见时长毫秒')).toBe('');
    expect(cell('平均完成度%')).toBe('');
  });

  it('含逗号的值不挪列：项目名里的逗号被引号包住，列数不变', async () => {
    const name = '带,逗号的项目';
    const { path } = await publish(ownerId, name);
    const res = await call();
    const body = await res.text();
    const lines = body.replace(/^\uFEFF/, '').trim().split('\r\n');
    const header = parseCsvLine(lines[0]!);
    const raw = lines.find((line) => line.includes(path))!;
    // 原始行里那一格是带引号的
    expect(raw, '含逗号的值必须加引号').toContain('"带,逗号的项目"');
    // 解析出来的列数与表头一致 ⇒ 整张表没有挪位
    const row = parseCsvLine(raw);
    expect(row).toHaveLength(header.length);
    expect(row[header.indexOf('项目')]).toBe(name);
  });

  it('只给本人：别人的作品不在里面；没登录是 401', async () => {
    const { path } = await publish(otherId, '别人的作品');
    const res = await call();
    const body = await res.text();
    expect(body, '别人的作品一个字节都不该进来').not.toContain(path);

    jar.clear();
    const anonymous = await exportAnalytics();
    expect(anonymous.status).toBe(401);
  });
});
