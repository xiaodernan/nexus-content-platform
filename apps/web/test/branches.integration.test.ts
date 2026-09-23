import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage, type DesignDocument } from '@nexus/design-model';
import {
  createBranch,
  currentBranchId,
  duplicateProject,
  ensureDefaultBranch,
  listBranches,
  switchBranch,
} from '../src/server/domain/branches';
import { createSnapshot, listSnapshots } from '../src/server/domain/snapshots';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { branches, projects, snapshots, users } from '../src/server/db/schema';

/**
 * §28 分支 + §27 Duplicate。打真实 Postgres（docs/TESTING.md 禁止 mock 数据库）：
 * 先 `npm run infra:up && npm run db:migrate`。
 */
let ownerId: string;
const created: string[] = [];

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [user] = await db
    .insert(users)
    .values({ displayName: 'Branch Tester', email: `branch+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = user!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function newProject(name: string) {
  const document = await createProject(ownerId, { name, kind: 'website' });
  created.push(document.id);
  return document.id;
}

/** 往首页挂一个带名字的文本节点并落库——用它标记"这是哪一版设计" */
async function putMarker(projectId: string, text: string): Promise<void> {
  const document = await loadDocument(projectId);
  const page = findPage(document!)!;
  const node = createNode({ type: 'text', name: text, text, parentId: page.rootId });
  page.nodes[node.id] = node;
  page.nodes[page.rootId]!.children = [...page.nodes[page.rootId]!.children, node.id];
  await saveDocument(projectId, document!);
}

const hasText = async (projectId: string, text: string) => {
  const document = await loadDocument(projectId);
  return Object.values(findPage(document!)!.nodes).some((n) => n.text === text);
};

const pageIds = (document: DesignDocument) => document.pages.map((p) => p.id).sort();

describe('分支与副本（真实数据库）', () => {
  it('新项目自带 main，head 就是初始快照，且当前分支可推导', async () => {
    const id = await newProject('Branch Init');
    const list = await listBranches(id);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('main');
    expect(list[0]!.isDefault).toBe(true);
    expect(list[0]!.current).toBe(true);

    const initial = await listSnapshots(id);
    expect(list[0]!.headSnapshotId).toBe(initial[0]!.id);
    expect(initial[0]!.branchId).toBe(list[0]!.id);
    expect(await currentBranchId(id)).toBe(list[0]!.id);
  });

  it('分支名：重名与非法字符都会被拒绝并说明原因', async () => {
    const id = await newProject('Branch Names');
    expect((await createBranch(id, { name: 'design-v1' })).ok).toBe(true);
    const clash = await createBranch(id, { name: 'design-v1' });
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.reason).toContain('已经有叫 design-v1 的分支');
    const bad = await createBranch(id, { name: 'bad name / with slash' });
    expect(bad.ok).toBe(false);
  });

  it('开分支带着当前现场切过去；切换分支来回都不丢东西', async () => {
    const id = await newProject('Branch Roundtrip');
    const main = (await listBranches(id))[0]!;

    await putMarker(id, 'main 上的方向');
    const v1 = await createBranch(id, { name: 'design-v1' });
    expect(v1.ok).toBe(true);
    if (!v1.ok) throw new Error(v1.reason);
    // 开分支 = checkout -b：带着刚才的现场切到新分支上继续做
    expect(await currentBranchId(id)).toBe(v1.branch.id);
    expect(await hasText(id, 'main 上的方向')).toBe(true);
    // 这份现场同时被存回了 main：切回去不会看不到自己刚做的东西
    const branchesOnMain = await listBranches(id);
    const mainNow = branchesOnMain.find((b) => b.id === main.id)!;
    expect(mainNow.headSnapshotId).not.toBe(v1.branch.headSnapshotId);
    // 每条线都得有自己的 head：两条分支共用一个 head 时，"当前分支是谁"就由查询顺序决定了
    const heads = branchesOnMain.map((b) => b.headSnapshotId);
    expect(new Set(heads).size).toBe(heads.length);
    await switchBranch(id, main.id);
    expect(await hasText(id, 'main 上的方向')).toBe(true);

    // 回到 v1 上做另一个方向
    await switchBranch(id, v1.branch.id);
    await putMarker(id, 'v1 的方向');
    await switchBranch(id, main.id);
    expect(await hasText(id, 'v1 的方向')).toBe(false);
    expect(await hasText(id, 'main 上的方向')).toBe(true);
    await switchBranch(id, v1.branch.id);
    expect(await hasText(id, 'v1 的方向')).toBe(true);
    expect(await hasText(id, 'main 上的方向')).toBe(true);
    expect((await loadDocument(id))!.pages).toHaveLength(1);
  });

  it('内容没变时反复切换不会堆噪音快照，切换本身仍留下一条历史', async () => {
    const id = await newProject('Branch Noise');
    const [main] = await listBranches(id);
    const v2 = await createBranch(id, { name: 'design-v2' });
    if (!v2.ok) throw new Error(v2.reason);
    const before = await listSnapshots(id);
    await switchBranch(id, main!.id);
    await switchBranch(id, v2.branch.id);
    const after = await listSnapshots(id);
    // 两条"切换到"标记是如实历史；不该再出现"切到 X 前的现场"
    expect(after.filter((s) => s.label?.startsWith('切到'))).toHaveLength(0);
    const created = after
      .filter((s) => !before.some((b) => b.id === s.id))
      .map((s) => s.label ?? '(无标签)');
    // 断言写成"新增的就是这两条切换标记"，而不是只比长度：
    // 只比长度时偶发失败只会说 expected 5 to be 4，看不出多出来的是哪一条
    expect(created).toEqual([expect.stringMatching(/^切换到/), expect.stringMatching(/^切换到/)]);
  });

  it('从历史快照开分支：起点是那份快照，当前现场先存回原分支', async () => {
    const id = await newProject('Branch From Snapshot');
    const [main] = await listBranches(id);
    const baseline = (await listSnapshots(id))[0]!;
    await putMarker(id, '分叉之后的改动');
    const result = await createBranch(id, { name: 'experimental', fromSnapshotId: baseline.id });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    // 新分支落在起点内容上
    expect(await hasText(id, '分叉之后的改动')).toBe(false);
    // 而刚才的现场没丢：它被存回 main 了
    const mainHead = (await listBranches(id)).find((b) => b.id === main!.id)!;
    expect(mainHead.headSnapshotId).not.toBe(baseline.id);
    await switchBranch(id, main!.id);
    expect(await hasText(id, '分叉之后的改动')).toBe(true);
  });

  it('Duplicate：新项目内容一致、id 全部换号，源项目不受影响', async () => {
    const id = await newProject('Duplicate Source');
    await putMarker(id, '要一起复制走的标记');
    const source = (await loadDocument(id))!;

    const copy = await duplicateProject(ownerId, id, '另一种可能');
    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe(id);
    expect(copy!.name).toBe('另一种可能');
    expect(pageIds(copy!)).not.toEqual(pageIds(source));
    expect(await hasText(copy!.id, '要一起复制走的标记')).toBe(true);
    // 副本有自己的 main 分支与初始快照，之后各写各的历史
    const copyBranches = await listBranches(copy!.id);
    expect(copyBranches.map((b) => b.name)).toEqual(['main']);
    expect((await listSnapshots(copy!.id)).map((s) => s.source)).toEqual(['manual']);
    // 默认名字
    const unnamed = await duplicateProject(ownerId, id);
    expect(unnamed!.name).toBe('Duplicate Source 副本');
    created.push(copy!.id, unnamed!.id);
    // 源项目没被动过
    expect(pageIds((await loadDocument(id))!)).toEqual(pageIds(source));
  });

  it('分支功能之前的老项目：自动补 main，并把无主快照归到这条线上', async () => {
    const id = await newProject('Legacy Project');
    await putMarker(id, '老项目的改动');
    await createSnapshot(id, {
      document: (await loadDocument(id))!,
      source: 'manual',
      label: '无分支时期的快照',
    });
    const db = getDb();
    await db.delete(branches).where(eq(branches.projectId, id));
    await db.update(snapshots).set({ branchId: null }).where(eq(snapshots.projectId, id));

    const mainId = await ensureDefaultBranch(id);
    expect(mainId).toBeTruthy();
    const list = await listBranches(id);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('main');
    expect((await listSnapshots(id)).every((s) => s.branchId === mainId)).toBe(true);
    // head 回到工作区当前停的那份快照上，所以当前分支推导得出来
    expect(await currentBranchId(id)).toBe(mainId);
  });

  it('跨项目隔离：不能把别的项目的分支切过来；同名分支各自独立', async () => {
    const a = await newProject('Branch Owner A');
    const b = await newProject('Branch Owner B');
    const foreign = (await listBranches(a))[0]!;
    expect(await switchBranch(b, foreign.id)).toBeNull();
    await createBranch(a, { name: 'design-v1' });
    const sameName = await createBranch(b, { name: 'design-v1' });
    expect(sameName.ok).toBe(true);
    expect((await listBranches(a)).map((x) => x.name)).toEqual(['main', 'design-v1']);
    expect((await listBranches(b)).map((x) => x.name)).toEqual(['main', 'design-v1']);
  });
});
