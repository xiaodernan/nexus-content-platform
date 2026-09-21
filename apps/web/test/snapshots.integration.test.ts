import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/design-model';
import {
  createSnapshot,
  listSnapshots,
  readSnapshot,
  restoreSnapshot,
} from '../src/server/domain/snapshots';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §27 / §108：Snapshot 是用户项目历史（不是 git 开发历史）。
 * 这些测试打真实 Postgres（docs/TESTING.md 禁止 mock 数据库）：
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
    .values({ displayName: 'Snapshot Tester', email: `snap+${Date.now()}@nexus.test` })
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
  return { document, id: document.id };
}

/** 往首页根节点挂一个可见节点并落库，返回节点 id */
async function addBanner(projectId: string, name: string): Promise<string> {
  const document = await loadDocument(projectId);
  const page = findPage(document!)!;
  const banner = createNode({ type: 'text', name, text: name, parentId: page.rootId });
  page.nodes[banner.id] = banner;
  page.nodes[page.rootId]!.children = [...page.nodes[page.rootId]!.children, banner.id];
  await saveDocument(projectId, document!);
  return banner.id;
}

const hasNode = async (projectId: string, nodeId: string) => {
  const document = await loadDocument(projectId);
  return Object.keys(findPage(document!)!.nodes).includes(nodeId);
};

describe('快照领域层（真实数据库）', () => {
  it('创建项目自带初始快照，手动快照接在链尾并推进 currentSnapshotId', async () => {
    const { id } = await newProject('Snapshot Chain');
    const initial = await listSnapshots(id);
    expect(initial).toHaveLength(1);
    expect(initial[0]!.parentId).toBeNull();

    const second = await createSnapshot(id, {
      document: (await loadDocument(id))!,
      source: 'manual',
      label: '改配色前',
    });
    expect(second.parentId).toBe(initial[0]!.id);

    const list = await listSnapshots(id);
    expect(new Set(list.map((s) => s.label))).toEqual(new Set(['改配色前', initial[0]!.label]));

    const db = getDb();
    const [row] = await db
      .select({ currentSnapshotId: projects.currentSnapshotId })
      .from(projects)
      .where(eq(projects.id, id));
    expect(row!.currentSnapshotId).toBe(second.id);
  });

  it('恢复会把项目切回目标文档，并且恢复动作本身留下一条历史', async () => {
    const { id } = await newProject('Snapshot Restore');
    const bannerId = await addBanner(id, '恢复前存在的横幅');
    const point = await createSnapshot(id, {
      document: (await loadDocument(id))!,
      source: 'manual',
      label: '含横幅',
    });
    expect(await hasNode(id, bannerId)).toBe(true);

    // 快照之后继续编辑：横幅被删掉
    const document = await loadDocument(id);
    const page = findPage(document!)!;
    delete page.nodes[bannerId];
    page.nodes[page.rootId]!.children = page.nodes[page.rootId]!.children.filter((c) => c !== bannerId);
    await saveDocument(id, document!);
    expect(await hasNode(id, bannerId)).toBe(false);

    const result = await restoreSnapshot(id, point.id, { createdById: ownerId });
    expect(result).not.toBeNull();
    expect(result!.safetySnapshot).not.toBeNull();
    expect(await hasNode(id, bannerId)).toBe(true);
    // 恢复后服务端返回的文档必须能直接喂给工作台
    expect(result!.document.id).toBe(id);
    expect(findPage(result!.document)!.nodes[bannerId]).toBeDefined();

    const labels = (await listSnapshots(id)).map((s) => s.label);
    expect(labels[0]).toBe('恢复到「含横幅」');
    expect(labels).toContain('恢复前自动保存');
  });

  it('当前状态与目标一致时不留下多余的安全快照（jsonb 不保留键顺序，见 stableKey）', async () => {
    // 这里比的是 loadDocument 重建出的文档与 snapshots.document：
    // 后者经过 jsonb 存取后键顺序不同，用 JSON.stringify 直接比会误判成"有改动"。
    const { id } = await newProject('Snapshot Noop');
    const point = await createSnapshot(id, {
      document: (await loadDocument(id))!,
      source: 'manual',
      label: '基线',
    });
    const before = await listSnapshots(id);
    const result = await restoreSnapshot(id, point.id, { createdById: ownerId });
    expect(result!.safetySnapshot).toBeNull();
    const after = await listSnapshots(id);
    expect(after).toHaveLength(before.length + 1);
  });

  it('快照按项目隔离：拿不到别的项目的快照', async () => {
    const a = await newProject('Snapshot Owner A');
    const b = await newProject('Snapshot Owner B');
    const [snapshot] = await listSnapshots(a.id);
    const point = await createSnapshot(a.id, {
      document: (await loadDocument(a.id))!,
      source: 'manual',
      label: 'A 专属',
    });
    expect(snapshot).toBeDefined();
    expect(await readSnapshot(b.id, point.id)).toBeNull();
    expect(await restoreSnapshot(b.id, point.id, { createdById: ownerId })).toBeNull();
    // A 的列表不会混进 B 的快照
    expect((await listSnapshots(b.id)).every((s) => s.label !== 'A 专属')).toBe(true);
  });

  it('快照存的是全量文档，读回可以直接 Compare（§27）', async () => {
    const { id } = await newProject('Snapshot Compare');
    const bannerId = await addBanner(id, '用于比较的横幅');
    const point = await createSnapshot(id, {
      document: (await loadDocument(id))!,
      source: 'manual',
      label: '比较点',
    });
    const entry = await readSnapshot(id, point.id);
    expect(entry!.document.id).toBe(id);
    expect(findPage(entry!.document)!.nodes[bannerId]!.name).toBe('用于比较的横幅');
  });
});
