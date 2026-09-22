import { and, desc, eq, isNull, sql as rawSql } from 'drizzle-orm';
import { lintDesign, validateDocument, type DesignDocument } from '@nexus/design-model';
import { getDb } from '../db/client';
import { projects, publishedProjects, users } from '../db/schema';
import { loadDocument } from './projects';
import { currentBranchId } from './branches';
import { createSnapshot, readSnapshot } from './snapshots';

/**
 * §56 / §57：Publish 与分享链接 `/n/<handle>/<slug>`。
 *
 * 一条 path 只有一行 published_projects（唯一索引），重复发布是"就地换版本"，
 * 历史由 snapshots（source='publish'）承担——那里已经有整份文档，不必再存一份。
 *
 * 刻意不做的事：moderation 仍写 'pending'。平台还没有审核管线，
 * 把它写成 'approved' 就是假状态；UI 里如实显示"审核：未接入"。
 */

export type Visibility = 'private' | 'unlisted' | 'public';

export interface GateCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface GateReport {
  passed: boolean;
  checks: GateCheck[];
  /** 挡下发布的具体问题（最多列 8 条，其余只报数量） */
  blockers: string[];
  /** §179 里我们还没实现成自动门禁的项：宁可写出来，也不假装全绿 */
  notRun: string[];
}

export interface Publication {
  id: string;
  projectId: string;
  path: string;
  visibility: Visibility;
  version: number;
  moderation: string;
  snapshotId: string | null;
  views: number;
  publishedAt: string;
}

export const GATES_NOT_RUN = [
  '构建与测试（Build / Tests）',
  '性能预算 LCP / CLS / INP / bundle',
  '键盘可达性与完整 ARIA 检查',
  '视觉回归与 Design Critic',
];

function slugList(issues: { message: string }[]): string[] {
  return issues.slice(0, 8).map((i) => i.message);
}

/** 发布门禁：只报告我们真能自动检查的项，其余列进 notRun（§159 不谎称已验证） */
export function runPublishGate(document: DesignDocument): GateReport {
  const structural = validateDocument(document);
  const design = lintDesign(document);
  const errors = [...structural, ...design].filter((i) => i.severity === 'error');
  const warnings = [...structural, ...design].filter((i) => i.severity === 'warning');
  const hasContent = document.pages.some((page) =>
    Object.values(page.nodes).some((node) => node.id !== page.rootId && node.visible),
  );

  const checks: GateCheck[] = [
    {
      name: '设计模型自洽',
      passed: structural.every((i) => i.severity !== 'error'),
      detail: structural.length ? `${structural.length} 条问题（其中 error ${structural.filter((i) => i.severity === 'error').length}）` : '无错误',
    },
    {
      name: '对比度 / 点击目标 / 间距',
      passed: design.every((i) => i.severity !== 'error'),
      detail: design.length ? `${design.length} 条（warning ${warnings.length}）` : '无发现',
    },
    { name: '有可发布的内容', passed: hasContent, detail: hasContent ? `${document.pages.length} 个页面` : '页面是空的' },
  ];
  return {
    passed: checks.every((c) => c.passed),
    checks,
    blockers: errors.map((e) => e.message),
    notRun: [...GATES_NOT_RUN],
  };
}

function toPublication(row: typeof publishedProjects.$inferSelect): Publication {
  return {
    id: row.id,
    projectId: row.projectId,
    path: row.path,
    visibility: row.visibility as Visibility,
    version: row.version,
    moderation: row.moderation,
    snapshotId: row.snapshotId,
    views: row.views,
    publishedAt: row.publishedAt.toISOString(),
  };
}

/** guest 也要有能出现在 URL 里的 handle（§56）：首次发布时按 id 生成一个稳定的 */
async function ensureHandle(userId: string): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ handle: users.handle }).from(users).where(eq(users.id, userId)).limit(1);
  if (row?.handle) return row.handle;
  const base = `u${userId.replace(/-/g, '').slice(0, 8)}`;
  let handle = base;
  for (let i = 2; i < 50; i += 1) {
    const clash = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
    if (!clash.length) break;
    handle = `${base}-${i}`;
  }
  await db.update(users).set({ handle }).where(eq(users.id, userId));
  return handle;
}

export interface PublishActor {
  createdById: string;
}

export type PublishResult =
  | { ok: true; publication: Publication; gate: GateReport; snapshotId: string }
  | { ok: false; reason: string; gate: GateReport };

export async function publishProject(
  projectId: string,
  input: { visibility: Visibility } & PublishActor,
): Promise<PublishResult | null> {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) return null;

  const document = await loadDocument(projectId);
  if (!document) return null;
  const gate = runPublishGate(document);
  if (!gate.passed) {
    return { ok: false, reason: `门禁未通过：${gate.blockers[0] ?? '见检查清单'}`, gate };
  }

  const handle = await ensureHandle(project.ownerId);
  const path = `/n/${handle}/${project.slug}`;
  const [existing] = await db
    .select()
    .from(publishedProjects)
    .where(eq(publishedProjects.projectId, projectId))
    .orderBy(desc(publishedProjects.version))
    .limit(1);
  const version = (existing?.version ?? 0) + 1;
  const snapshot = await createSnapshot(projectId, {
    document,
    source: 'publish',
    label: `发布 v${version}`,
    summary: `可见性：${input.visibility}`,
    branchId: await currentBranchId(projectId),
    createdById: input.createdById,
  });

  let row: typeof publishedProjects.$inferSelect | undefined;
  if (existing) {
    // 一条 path 一行：换版本而不是新增，否则同一个 URL 会有两行在抢唯一索引
    [row] = await db
      .update(publishedProjects)
      .set({
        snapshotId: snapshot.id,
        visibility: input.visibility,
        version,
        publishedById: input.createdById,
        publishedAt: new Date(),
      })
      .where(eq(publishedProjects.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(publishedProjects)
      .values({
        projectId,
        snapshotId: snapshot.id,
        path,
        visibility: input.visibility,
        version: 1,
        publishedById: input.createdById,
      })
      .returning();
  }
  await db.update(projects).set({ visibility: input.visibility }).where(eq(projects.id, projectId));
  return { ok: true, publication: toPublication(row!), gate, snapshotId: snapshot.id };
}

export async function getPublication(projectId: string): Promise<Publication | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(publishedProjects)
    .where(eq(publishedProjects.projectId, projectId))
    .orderBy(desc(publishedProjects.version))
    .limit(1);
  return row ? toPublication(row) : null;
}

/** 取消发布：URL 立刻失效（删行），项目本身回到 private，历史快照留着 */
export async function unpublishProject(projectId: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(publishedProjects)
    .where(eq(publishedProjects.projectId, projectId))
    .returning({ id: publishedProjects.id });
  if (deleted.length) await db.update(projects).set({ visibility: 'private' }).where(eq(projects.id, projectId));
  return deleted.length > 0;
}

export interface PublishedPage {
  publication: Publication;
  document: DesignDocument;
  ownerName: string;
  projectName: string;
}

/**
 * 公开访问解析（§57）：private 一律不可达（对所有人 404，包括作者本人——
 * 作者要看自己那一版走 /studio，不占公开 URL）；unlisted 只认精确路径。
 */
export async function resolvePublishedPath(path: string): Promise<PublishedPage | null> {
  const db = getDb();
  const [row] = await db
    .select({ pub: publishedProjects, project: projects, owner: users })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(eq(publishedProjects.path, path))
    .limit(1);
  if (!row) return null;
  if (row.pub.visibility === 'private') return null;
  if (row.project.deletedAt) return null;
  if (!row.pub.snapshotId) return null;
  const snapshot = await readSnapshot(row.pub.projectId, row.pub.snapshotId);
  if (!snapshot) return null;
  return {
    publication: toPublication(row.pub),
    document: snapshot.document,
    ownerName: row.owner.displayName,
    projectName: row.project.name,
  };
}

/** 浏览量只在真正对外可见的访问上累加；计数失败不该拖垮一次公开渲染 */
export async function recordView(publicationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(publishedProjects)
    .set({ views: rawSql`${publishedProjects.views} + 1` })
    .where(eq(publishedProjects.id, publicationId));
}
