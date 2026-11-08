import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, isNull, sql as rawSql } from 'drizzle-orm';
import { GET } from '../src/app/api/projects/[projectId]/snapshots/route';
import { createBranch, currentBranchId, switchBranch, type BranchMeta } from '../src/server/domain/branches';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { createSnapshot, type SnapshotMeta } from '../src/server/domain/snapshots';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getDb } from '../src/server/db/client';
import { branches, projects, sessions, snapshots, users } from '../src/server/db/schema';

/**
 * §27 历史面板的「只看当前分支」——`GET /api/projects/<id>/snapshots?branch=current`。
 *
 * 域层早就支持按分支筛（`listSnapshots(projectId, { branchId })`），这一格钉的是**路由上才成立**的四件事：
 *
 * 1. **筛出来的每一条，branchId 都等于同一份响应里标着 current 的那条分支**。
 *    这条看着像废话，它有两处唯一证人：
 *    ① "先取分支、再取快照"这个顺序——`listBranches` 里的 `ensureDefaultBranch` 会把没挂分支的快照
 *    认领进 main；反过来先算 `currentBranchId()`，它返回 null，筛的就是 `branch_id IS NULL` 那一批，
 *    而响应里的 branchList 已把同一批算成 main 的了：面板高亮 main，行上却一个章都没盖。
 *    ② `currentBranchId()` 与 `listBranches` 的 tie-break 不同源（一个按 createdAt，一个先按 isDefault），
 *    两条线共用一个 head 时它们可以给出不一样的"当前"。这里只认响应里那一份。
 * 2. **筛选跟着"当前"走，不是跟着客户端记着的某个 id 走**：切到别的分支再拉一次，
 *    列表换线，那格勾选不需要重做。
 * 3. **只认 `current`**。`?branch=<uuid>`、`?branch=` 空串一律 400——把它们当成"没带参数"
 *    就是悄悄回全量，那句"只看当前分支"当场变成谎话。
 * 4. 筛完仍然是**时间倒序**，并且是不筛那个集合的子集（可以少，不能换顺序、不能混进别的线）。
 *
 * 真 Postgres（docs/TESTING.md 禁止 mock 数据库）：先 `npm run infra:up && npm run db:migrate`。
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

interface ListBody {
  snapshots: SnapshotMeta[];
  branches: BranchMeta[];
}

let ownerId = '';
let sessionToken = '';
const created: string[] = [];

async function newProject(name: string): Promise<string> {
  const document = await createProject(ownerId, { name, kind: 'website' });
  created.push(document.id);
  return document.id;
}

/** 走 POST /snapshots 那条路真正会走的三步：存文档 → 按当前分支建快照 */
async function snapshotNow(projectId: string, label: string): Promise<SnapshotMeta> {
  const document = await loadDocument(projectId);
  if (!document) throw new Error('项目读不到文档');
  await saveDocument(projectId, document);
  return createSnapshot(projectId, {
    document,
    source: 'manual',
    label,
    branchId: await currentBranchId(projectId),
  });
}

async function listAt(projectId: string, query: string): Promise<{ status: number; body: unknown }> {
  const req = new Request(`http://localhost/api/projects/${projectId}/snapshots${query}`, {
    headers: { cookie: `${SESSION_COOKIE}=${sessionToken}` },
  });
  const res = await GET(req, { params: Promise.resolve({ projectId }) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function bodyAt(projectId: string, query: string): Promise<ListBody> {
  const res = await listAt(projectId, query);
  expect(res.status, `${query || '(无参数)'} 拿到 ${res.status}：${JSON.stringify(res.body)}`).toBe(200);
  return res.body as ListBody;
}

/** 直接数库里的孤儿快照，不走筛选——免得判据拿自己的结论当证据 */
async function countOrphanInDb(projectId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(and(eq(snapshots.projectId, projectId), isNull(snapshots.branchId)));
  return rows.length;
}

async function countBranchRows(projectId: string): Promise<number> {
  const rows = await getDb().select({ id: branches.id }).from(branches).where(eq(branches.projectId, projectId));
  return rows.length;
}

const idsOf = (rows: SnapshotMeta[]): string[] => rows.map((row) => row.id);
const timesOf = (rows: SnapshotMeta[]): number[] => rows.map((row) => Date.parse(row.createdAt));

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [user] = await db
    .insert(users)
    .values({ displayName: '分支筛选 Tester', email: `snapfilter+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = user!.id;
  sessionToken = `tok-snapfilter-${Date.now()}`;
  await db
    .insert(sessions)
    .values({ userId: ownerId, tokenHash: await hashToken(sessionToken), expiresAt: new Date(Date.now() + 86_400_000) });
  jar.set(SESSION_COOKIE, sessionToken);
});

afterAll(async () => {
  const db = getDb();
  // 先删快照再删分支：branches.head_snapshot_id 指着快照，反过来会撞外键
  const ids = created.slice();
  if (ids.length) {
    await db.delete(snapshots).where(inArray(snapshots.projectId, ids));
    await db.delete(branches).where(inArray(branches.projectId, ids));
  }
  await db.delete(projects).where(inArray(projects.id, ids));
  await db.delete(sessions).where(inArray(sessions.userId, [ownerId]));
  await db.delete(users).where(inArray(users.id, [ownerId]));
});

describe('快照列表的分支筛选（真实数据库 + 真路由处理函数）', () => {
  it('开分支就等于切过去：筛的是新开的那条线，不是 isDefault 的 main', async () => {
    // 域层写得很清楚（branches.ts 的 createBranch："开分支会挪走 currentSnapshotId（相当于切过去）"），
    // 所以"当前"与"默认"在这一点上必须能分开：按 isDefault 筛的实现会在这里当场红。
    const projectId = await newProject(`分支筛选-开分支 ${Date.now()}`);
    const seeded = await bodyAt(projectId, '');
    const mainId = seeded.branches.find((branch) => branch.current)!.id;
    const onMain = await snapshotNow(projectId, 'main 上的一版');

    const branch = await createBranch(projectId, { name: '方向B', createdById: ownerId });
    expect(branch.ok, branch.ok ? '' : branch.reason).toBe(true);
    const newId = branch.ok ? branch.branch.id : '';
    expect(newId, '新分支与 main 同一个 id，这一格就没有区分度了').not.toBe(mainId);

    const body = await bodyAt(projectId, '?branch=current');
    const current = body.branches.find((item) => item.current);
    expect(current, '响应里一条 current 都没有').toBeDefined();
    expect(current!.id, '开分支之后"当前"不是新那条线——域层与这里说法不一').toBe(newId);
    expect(current!.isDefault, '新分支不该是 isDefault（否则这一格分不开 current 与 default）').toBe(false);
    for (const snapshot of body.snapshots) {
      expect(snapshot.branchId, `这一行不在高亮那条线上：${snapshot.id}`).toBe(newId);
    }
    expect(idsOf(body.snapshots), 'main 上那一版该被挡在新线外面').not.toContain(onMain.id);
  });

  it('老项目（branches 表空着的那种）：第一次列历史就把孤儿快照认领进 main，而不是筛没', async () => {
    /**
     * "库里有一行 branch_id 为 NULL"这个前提，今天的写入路径给不了：`createProject` 在同一个事务里
     * 就建好 main 并把初始快照挂上去（domain/projects.ts:127），而删分支没有入口（没有 deleteBranch，
     * FK 的 set null 因此也量不到）。所以这里**造**那个状态——模拟"分支功能之前建的项目"——
     * 测的是处理的**读顺序**，不是写路径（写路径的证据在 projects / branches 自己的用例里）。
     *
     * 顺序为什么可测：处理函数先 `listBranches`（那一刻 branches 空着，它顺手建 main 并把孤儿行认领过去），
     * 再按"这份列表里高亮的那条"筛。反过来先算 `currentBranchId()`：那一刻它返回 null，
     * 筛的是 `branch_id IS NULL` 那一批，而响应里的 branchList 已经把同一批算成 main 的了——
     * 面板高亮 main、行上却一个章都没盖。于是断言三句：孤儿行**在**筛出来的列表里、
     * 每一行都盖着高亮那条线的章、跑完之后库里不再有孤儿行。
     */
    const projectId = await newProject(`分支筛选-老项目 ${Date.now()}`);
    const initial = (await bodyAt(projectId, '')).snapshots[0]!;
    const db = getDb();
    await db.delete(branches).where(eq(branches.projectId, projectId));
    // head_snapshot_id 没有外键，projects.current_snapshot_id 也没有：删完只剩孤儿快照
    expect(await countBranchRows(projectId), '删干净了才有这一格的前提').toBe(0);
    expect(await countOrphanInDb(projectId), 'FK 的 set null 没把快照变成孤儿行').toBeGreaterThan(0);
    expect(initial.branchId, '起点快照本来就该有归属（前提变了，这一格要重新想）').toBeTruthy();

    const body = await bodyAt(projectId, '?branch=current');
    const current = body.branches.find((item) => item.current);
    expect(current, '响应里没有 current：ensureDefaultBranch 建的 main 没被认成当前').toBeDefined();
    expect(idsOf(body.snapshots), '孤儿快照被筛没了，而不是被 main 认领走').toContain(initial.id);
    for (const snapshot of body.snapshots) {
      expect(snapshot.branchId, '带 current 筛完还剩没盖章的行——顺序反了').toBe(current!.id);
    }
    expect(await countOrphanInDb(projectId), 'listBranches 没把孤儿快照认领走').toBe(0);
  });

  it('两条线各建快照：current 只回当前那条线的，切过去之后跟着换', async () => {
    const projectId = await newProject(`分支筛选-两线 ${Date.now()}`);
    const seeded = await bodyAt(projectId, '');
    const mainId = seeded.branches.find((branch) => branch.current)!.id;

    await snapshotNow(projectId, 'main 上第一版');
    const onMain = await snapshotNow(projectId, 'main 上第二版');

    const branch = await createBranch(projectId, { name: '方向B', createdById: ownerId });
    expect(branch.ok, branch.ok ? '' : branch.reason).toBe(true);
    const branchId = branch.ok ? branch.branch.id : '';
    // 开分支本身就切过去了（上一格钉的就是这句），这里只需要再补一版
    const onB = await snapshotNow(projectId, '方向B 第一版');

    const filteredB = await bodyAt(projectId, '?branch=current');
    expect(filteredB.snapshots.length, '筛完是空的——当前分支一条快照都没接住').toBeGreaterThan(0);
    for (const snapshot of filteredB.snapshots) {
      expect(snapshot.branchId, '方向B 的列表里混进了别的线').toBe(branchId);
    }
    expect(idsOf(filteredB.snapshots)).toContain(onB.id);
    expect(idsOf(filteredB.snapshots), 'main 上那几条该被挡在外面').not.toContain(onMain.id);

    const all = await bodyAt(projectId, '');
    expect(idsOf(all.snapshots)).toContain(onMain.id);
    expect(all.snapshots.length).toBeGreaterThan(filteredB.snapshots.length);
    for (const snapshot of filteredB.snapshots) {
      expect(idsOf(all.snapshots), `筛出来的这条不在全量里`).toContain(snapshot.id);
    }
    const filteredTimes = timesOf(filteredB.snapshots);
    const allTimes = timesOf(all.snapshots);
    expect(filteredTimes, '筛完的顺序不再是时间倒序').toEqual([...filteredTimes].sort((a, b) => b - a));
    expect(allTimes, '全量的顺序不再是时间倒序').toEqual([...allTimes].sort((a, b) => b - a));

    expect(await switchBranch(projectId, mainId, { createdById: ownerId }), '切不回 main').not.toBeNull();
    const filteredMain = await bodyAt(projectId, '?branch=current');
    for (const snapshot of filteredMain.snapshots) {
      expect(snapshot.branchId, '切回 main 后列表还停在方向B').toBe(mainId);
    }
    expect(idsOf(filteredMain.snapshots)).toContain(onMain.id);
  });

  it('除 current 以外的值一律 400，不当成"没带参数"混回全量', async () => {
    const projectId = await newProject(`分支筛选-坏参数 ${Date.now()}`);
    const branchList = (await bodyAt(projectId, '')).branches;
    const someId = branchList[0]!.id;

    for (const query of [`?branch=${someId}`, '?branch=', '?branch=main', '?branch=CURRrent']) {
      const res = await listAt(projectId, query);
      expect(res.status, `${query} 拿到了 ${res.status}`).toBe(400);
      const issues = (res.body as { issues?: string[] }).issues ?? [];
      expect(issues.join('；'), `${query} 的 400 没说清接受什么`).toMatch(/current/);
    }

    // 反向对照：不带参数照旧是全量，别把上面那段写成"参数一律忽略"
    expect((await bodyAt(projectId, '')).snapshots.length).toBeGreaterThan(0);
  });
});
