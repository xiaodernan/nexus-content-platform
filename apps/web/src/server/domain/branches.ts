import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { duplicateDocument, remapAssetIds, diffDocuments, type DesignDocument } from '@nexus/design-model';
import { getDb } from '../db/client';
import { branches, projects, snapshots } from '../db/schema';
import { isUuid } from './ids';
import { createProject, loadDocument, saveDocument } from './projects';
import { copyProjectAssets } from './assets';
import {
  createSnapshot,
  documentsMatch,
  readSnapshot,
  type SnapshotMeta,
} from './snapshots';

/**
 * §28 分支：一条有名字的快照线。
 *
 * 这里刻意不引入"当前分支"这一列——`projects.currentSnapshotId` 已经说明了
 * 工作区停在哪一份快照上，分支的 head 指回它的就是当前分支。少一个状态就少一处会漂移的地方。
 * 切换分支 = 把当前现场存回原分支，再把目标分支的 head 恢复进工作区，所以切来切去都不丢东西。
 */

export interface BranchMeta {
  id: string;
  name: string;
  isDefault: boolean;
  headSnapshotId: string | null;
  createdAt: string;
  /** 工作区现在就停在这条线上 */
  current: boolean;
}

export interface SwitchResult {
  document: DesignDocument;
  fromBranchId: string | null;
  snapshot: SnapshotMeta;
}

export type CreateBranchResult =
  | { ok: true; branch: BranchMeta }
  | { ok: false; reason: string };

/** 分支名要能出现在 URL 与提示里，所以限制字符集；中文允许，空格与斜杠不允许 */
const BRANCH_NAME = /^[0-9A-Za-z_\u4e00-\u9fa5][0-9A-Za-z._\-\u4e00-\u9fa5]{0,39}$/;

function toMeta(
  row: typeof branches.$inferSelect,
  currentSnapshotId: string | null,
): BranchMeta {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    headSnapshotId: row.headSnapshotId,
    createdAt: row.createdAt.toISOString(),
    current: !!row.headSnapshotId && row.headSnapshotId === currentSnapshotId,
  };
}

/**
 * 老项目（分支功能之前创建的）没有 branches 行：这里补一条 main，
 * 并把历史上没挂分支的快照归到 main 上。不这么做，它们就永远切不回去。
 */
export async function ensureDefaultBranch(projectId: string): Promise<string | null> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(branches)
    .where(eq(branches.projectId, projectId))
    .limit(1);
  if (existing) return existing.id;
  const [project] = await db
    .select({ currentSnapshotId: projects.currentSnapshotId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;
  const [created] = await db
    .insert(branches)
    .values({ projectId, name: 'main', isDefault: true, headSnapshotId: project.currentSnapshotId })
    .returning({ id: branches.id });
  // 分支功能之前建的快照都在这条线上：不给 branchId，它们就切不回去、列表也归不了类
  await db
    .update(snapshots)
    .set({ branchId: created!.id })
    .where(and(eq(snapshots.projectId, projectId), isNull(snapshots.branchId)));
  return created!.id;
}

export async function listBranches(projectId: string): Promise<BranchMeta[]> {
  const db = getDb();
  await ensureDefaultBranch(projectId);
  const [project] = await db
    .select({ currentSnapshotId: projects.currentSnapshotId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const rows = await db
    .select()
    .from(branches)
    .where(eq(branches.projectId, projectId))
    .orderBy(desc(branches.isDefault), branches.createdAt);
  return rows.map((row) => toMeta(row, project?.currentSnapshotId ?? null));
}

export async function currentBranchId(projectId: string): Promise<string | null> {
  const db = getDb();
  const [project] = await db
    .select({ currentSnapshotId: projects.currentSnapshotId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project?.currentSnapshotId) return null;
  const [row] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.projectId, projectId), eq(branches.headSnapshotId, project.currentSnapshotId)))
    // 正常情况下 head 唯一指回 currentSnapshotId；真撞上两条线共用一个 head（半途失败的脏数据），
    // 也要给出可复现的答案，而不是让 Postgres 的返回顺序决定"当前分支"是谁。
    .orderBy(asc(branches.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/**
 * 离开当前分支前把现场存回原分支。内容与那条分支的 head 一致时不重复存——
 * 否则每切一次都多两条噪音快照。
 */
async function stashCurrent(
  projectId: string,
  fromBranchId: string | null,
  current: DesignDocument,
  label: string,
  actor: { createdById?: string | null },
): Promise<void> {
  if (!fromBranchId) return;
  const db = getDb();
  const [row] = await db
    .select({ headSnapshotId: branches.headSnapshotId })
    .from(branches)
    .where(eq(branches.id, fromBranchId))
    .limit(1);
  const stored = row?.headSnapshotId
    ? await readSnapshot(projectId, row.headSnapshotId)
    : null;
  if (stored && documentsMatch(current, stored.document)) return;
  // 把"为什么要存这一条"写进快照自己的 summary：切换留下的噪音快照偶发到过一次、单独跑五次都复现不出来，
  // 靠猜没意义。下一次真出现时，历史列表里那条就带着原因（差在哪一处 / 根本读不到 head），
  // 而不是留一个只有时间没有理由的行
  const reason = stored
    ? `与「${label}」的差异：${diffDocuments(stored.document, current).entries.slice(0, 3).map((entry) => `${entry.kind} ${entry.nodeName}`).join('、') || '字段顺序或序列化不同'}`
    : '离开的分支没有可读的 head 快照，只能把现场存一条新的';
  await createSnapshot(projectId, {
    document: current,
    source: 'branch',
    label,
    summary: reason,
    branchId: fromBranchId,
    ...actor,
  });
}

export async function createBranch(
  projectId: string,
  input: { name: string; fromSnapshotId?: string | null; createdById?: string | null },
): Promise<CreateBranchResult> {
  const name = input.name.trim();
  if (!BRANCH_NAME.test(name)) {
    return { ok: false, reason: '分支名只能包含字母、数字、下划线、点、连字符或中文，且不超过 40 个字符' };
  }
  const db = getDb();
  await ensureDefaultBranch(projectId);
  const clash = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.projectId, projectId), eq(branches.name, name)))
    .limit(1);
  if (clash.length) return { ok: false, reason: `已经有叫 ${name} 的分支` };

  const [project] = await db
    .select({ currentSnapshotId: projects.currentSnapshotId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const fromId = input.fromSnapshotId ?? project?.currentSnapshotId ?? null;
  if (!fromId) return { ok: false, reason: '项目还没有任何快照，无法开新分支' };
  const origin = await readSnapshot(projectId, fromId);
  if (!origin) return { ok: false, reason: '起点快照不属于这个项目' };
  const current = await loadDocument(projectId);
  if (!current) return { ok: false, reason: '项目不存在或已被删除' };

  // 指名了起点快照就从那份快照的内容出发；没指名就是从当前工作区出发（checkout -b）。
  // 两者必须分清：用户点"从这条历史开分支"时，期待看到的就是那条历史，而不是手上一半的改动。
  const startDocument = input.fromSnapshotId ? origin.document : current;
  const movingWorkspace = !documentsMatch(startDocument, current);

  // 离开的是哪条线必须在新分支插进去之前问：那一刻两条线的 head 都可能指着
  // `currentSnapshotId`，"当前分支"就变成由查询顺序决定的了。
  const fromBranchId = await currentBranchId(projectId);
  // head 留空，等 createSnapshot 补上它自己那条：直接复用起点的 id 会让两条分支同时指回
  // currentSnapshotId，"当前分支"就不确定了。这条快照同时也是历史里"从哪儿分出来的"的记录。
  const [row] = await db
    .insert(branches)
    .values({ projectId, name, headSnapshotId: null })
    .returning();
  // 开分支会挪走 currentSnapshotId（相当于切过去）：先把工作区现场存回被离开的分支，
  // 否则那些"改了还没进快照"的东西会在切走时消失。
  await stashCurrent(projectId, fromBranchId, current, `分出「${name}」前的现场`, input);
  const head = await createSnapshot(projectId, {
    document: startDocument,
    source: 'branch',
    label: `开分支「${name}」`,
    summary: `起点：${origin.label ?? origin.id}`,
    branchId: row!.id,
    createdById: input.createdById,
  });
  if (movingWorkspace) {
    await saveDocument(projectId, { ...startDocument, id: projectId });
  }
  return { ok: true, branch: { ...toMeta(row!, null), headSnapshotId: head.id, current: true } };
}

/**
 * 切换分支。先把工作区现场存回当前分支（内容与该分支 head 相同就不重复存），
 * 再把目标分支的 head 写回工作区——两步都留快照，切错了也能切回来。
 */
export async function switchBranch(
  projectId: string,
  branchId: string,
  actor: { createdById?: string | null } = {},
): Promise<SwitchResult | null> {
  // 两个 id 都是路由路径参数：形状不对按"没有这条分支"处理（domain/ids.ts）
  if (!isUuid(projectId) || !isUuid(branchId)) return null;
  const db = getDb();
  const [target] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.projectId, projectId)))
    .limit(1);
  if (!target || !target.headSnapshotId) return null;
  const head = await readSnapshot(projectId, target.headSnapshotId);
  if (!head) return null;
  const current = await loadDocument(projectId);
  if (!current) return null;

  const fromBranchId = await currentBranchId(projectId);
  if (fromBranchId !== target.id) {
    await stashCurrent(
      projectId,
      fromBranchId,
      current,
      `切到「${target.name}」前的现场`,
      actor,
    );
  }

  const restored: DesignDocument = { ...head.document, id: projectId };
  await saveDocument(projectId, restored);
  const snapshot = await createSnapshot(projectId, {
    document: restored,
    source: 'branch',
    label: `切换到「${target.name}」`,
    summary: `来自快照 ${head.id}`,
    branchId: target.id,
    createdById: actor.createdById,
  });
  return {
    document: (await loadDocument(projectId)) ?? restored,
    fromBranchId,
    snapshot,
  };
}

/**
 * §29：把一份算好的候选方案落成一条新分支，**工作区不动**。
 * 候选方向是给人挑的，不是自动采纳：四条方案各自躺在自己的分支线上，
 * 用户点"切到这个方向"才走 switchBranch。所以这里的快照 advanceWorkspace=false。
 */
export async function createVariantBranch(
  projectId: string,
  input: {
    name: string;
    document: DesignDocument;
    label: string;
    summary?: string;
    createdById?: string | null;
  },
): Promise<BranchMeta | null> {
  const db = getDb();
  await ensureDefaultBranch(projectId);
  const clash = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.projectId, projectId), eq(branches.name, input.name)))
    .limit(1);
  if (clash.length) return null;
  const [row] = await db
    .insert(branches)
    .values({ projectId, name: input.name, headSnapshotId: null })
    .returning();
  const head = await createSnapshot(projectId, {
    document: input.document,
    source: 'branch',
    label: input.label,
    summary: input.summary,
    branchId: row!.id,
    createdById: input.createdById,
    advanceWorkspace: false,
  });
  return { ...toMeta(row!, null), headSnapshotId: head.id, current: false };
}

/** §27 Duplicate：整份项目复制成一个新项目（同一份设计内容，新 id、新分支线） */
export async function duplicateProject(
  ownerId: string,
  projectId: string,
  name?: string | null,
): Promise<DesignDocument | null> {
  const source = await loadDocument(projectId);
  if (!source) return null;
  const trimmed = (name ?? '').trim();
  const copyName = (trimmed || `${source.name} 副本`).slice(0, 120);
  const created = await createProject(ownerId, {
    name: copyName,
    kind: source.metadata.projectType ?? 'website',
    // 副本必须换页面/组件 id：它们在库里是全局主键（§27）
    fromDocument: duplicateDocument(source, copyName),
  });
  // 资产同样换号并复制字节：行上的 project_id 是 cascade 外键，共享一份记录
  // 等于"删掉源项目就把副本的图片一起删了"，而且所有权判定会认不出副本（§80）
  const copied = await loadDocument(created.id);
  if (!copied) return created;
  const idMap = await copyProjectAssets(projectId, created.id, ownerId);
  if (!idMap.size) return copied;
  const rekeyed = remapAssetIds(copied, idMap);
  await saveDocument(created.id, rekeyed);
  return rekeyed;
}
