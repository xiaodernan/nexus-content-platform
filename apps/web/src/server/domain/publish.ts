import { cache } from 'react';
import { and, desc, eq, isNotNull, isNull, ne, sql as rawSql } from 'drizzle-orm';
import { analyzeHealth, type DesignDocument, type HealthReport } from '@nexus/design-model';
import type { RealtimeEvent } from '@nexus/schemas';
import { getDb } from '../db/client';
import { recordAudit } from './audit';
import { assets, games, projects, publishedProjects, users } from '../db/schema';
import { recordScan, scanPublication, type AssetProvenance, type ModerationScan } from './moderation';
import { loadDocument } from './projects';
import { currentBranchId } from './branches';
import { emit } from './notifications';
import { createSnapshot, readSnapshot } from './snapshots';
import { channels, getRealtimeBus } from '../realtime/bus';
import { DELETED_USER_LABEL } from './audit';

/**
 * §56 / §57：Publish 与分享链接 `/n/<handle>/<slug>`。
 *
 * 一条 path 只有一行 published_projects（唯一索引），重复发布是"就地换版本"，
 * 历史由 snapshots（source='publish'）承担——那里已经有整份文档，不必再存一份。
 *
 * §131 落地后的 moderation 语义：机检只升级不认证。
 * 每一次"往外公开"的发布都会跑一遍机检并留下一行 moderation_cases；
 * 命中硬红线（blocked）的发布直接被挡下，需要人看的（review）照常发布但进人工队列，
 * 而 published_projects.moderation 仍然停在 'pending' —— 只有 role='admin' 的人工裁决
 * 才把它写成 approved / rejected（见 resolveCase）。所以"机检跑过"绝不能读成"审核通过"。
 */

export type Visibility = 'private' | 'unlisted' | 'public';

/**
 * §179 Quality Gate：门禁 = §178 健康度里参与 gating 的那几行。
 * 两者共用 `analyzeHealth` 一份算法，所以 Studio 里实时显示的分和服务器挡下发布时
 * 算的分是同一个数——分开算迟早对不上。
 */
export type GateReport = HealthReport;

export interface Publication {
  id: string;
  projectId: string;
  path: string;
  visibility: Visibility;
  version: number;
  moderation: string;
  snapshotId: string | null;
  /** §50 / ADR-0009：这一版有没有钉住游戏设计——决定公开页要不要出现「可玩」入口 */
  hasGame: boolean;
  views: number;
  publishedAt: string;
}

/** 发布门禁：只报告我们真能自动检查的项，其余列进 notRun（§159 不谎称已验证） */
export function runPublishGate(document: DesignDocument): GateReport {
  return analyzeHealth(document);
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
    hasGame: row.gameDocument !== null && row.gameDocument !== undefined,
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
  | { ok: true; publication: Publication; gate: GateReport; scan: ModerationScan; snapshotId: string }
  | { ok: false; reason: string; gate: GateReport; scan: ModerationScan };

/** 公开页引用到的资产出处（§130：机检判断不了画面，只能知道它是从外面进来的） */
async function assetProvenance(projectId: string): Promise<AssetProvenance[]> {
  const rows = await getDb()
    .select({ id: assets.id, name: assets.name, kind: assets.kind, source: assets.source })
    .from(assets)
    .where(eq(assets.projectId, projectId));
  return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, source: row.source as AssetProvenance['source'] }));
}

/**
 * §163：`build.status` 与 `preview.status` 的第一（也是今天唯一）个生产者。
 * 之所以是发布：它是仓库里唯一**真的分步走完**的构建动作——门禁 → 机检 → 钉快照 → 落 publication 行
 * → 公网 URL 生效或收回。每一格都挂在一个真发生了的节点上，中间不插刻度（同 §163 对生成进度的口径）。
 *
 * `preview.status` 不是"库里有行就说就绪"：它读的是 `resolvePublishedPath` 那一遍**真实解析**的结果，
 * 也就是公开页自己用的那条路。人工裁决 rejected、快照读不出来、行没写上一致——这些情况这里会说 `failed`，
 * 而不是跟着发布意图报就绪。
 */
function emitBuildStatus(projectId: string, status: 'building' | 'ok' | 'failed', log: string): void {
  const event: RealtimeEvent = { type: 'build.status', projectId, status, log };
  getRealtimeBus().publish(channels.project(projectId), event);
}

function emitPreviewStatus(projectId: string, status: 'ready' | 'idle' | 'failed', url: string): void {
  const event: RealtimeEvent = { type: 'preview.status', projectId, status, url };
  getRealtimeBus().publish(channels.project(projectId), event);
}

/**
 * 把"公网那一条路径现在到底解不解得出来"翻成 `preview.status` 的一格。
 * 判据来自解析结果而不是 `visibility`：往外发布却解析不出来 = `failed`（多半是人工裁决挡的），
 * 收回之后还解析得出来同样 = `failed`（该断的没断），而不是闭眼报 `idle`。
 */
async function publishPreviewStatus(projectId: string, path: string, outward: boolean): Promise<void> {
  const reachable = await resolvePublishedPath(path);
  if (outward) emitPreviewStatus(projectId, reachable ? 'ready' : 'failed', path);
  else emitPreviewStatus(projectId, reachable ? 'failed' : 'idle', path);
}

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
  // 真的开工了才推 building：项目不存在、文档读不出来这些情况连这一步都没到，不该有一条事件
  emitBuildStatus(projectId, 'building', `门禁与机检 · 可见性 ${input.visibility}`);
  const gate = runPublishGate(document);
  // 门禁与机检都只管"往外公开"的方向：切成 private 是把链接收回来的下架动作，
  // 拿质量标准或审核去挡住作者下架，等于逼着一个不合格/有问题的页面继续挂在公网上的反面
  const outward = input.visibility !== 'private';
  // 一条 path 一行、换版本而不是新增，所以"这次是第几版"要先问出来（机检挡下时也要记在这个版本号上）
  const [existing] = await db
    .select()
    .from(publishedProjects)
    .where(eq(publishedProjects.projectId, projectId))
    .orderBy(desc(publishedProjects.version))
    .limit(1);
  const version = (existing?.version ?? 0) + 1;
  const scan = scanPublication(document, await assetProvenance(projectId));
  if (outward && !gate.passed) {
    // 事件里的 log 与返回给客户端的 reason 是同一个字符串，不是各写一遍的两句同义话
    const reason = `门禁未通过：${gate.blockers[0] ?? '见检查清单'}`;
    emitBuildStatus(projectId, 'failed', reason);
    return { ok: false, reason, gate, scan };
  }
  if (outward && scan.decision === 'blocked') {
    // 挡下也要立案：这次没有 publication 行可挂，所以 publicationId 为 null
    await recordScan({
      projectId,
      publicationId: null,
      publicationVersion: version,
      visibility: input.visibility,
      scan,
    });
    const hit = scan.findings.find((f) => f.level === 'blocked');
    const reason = `发布被机检挡下（${hit?.rule ?? 'redline'}）：${hit?.why ?? '命中 §129 硬红线'}`;
    emitBuildStatus(projectId, 'failed', reason);
    return { ok: false, reason, gate, scan };
  }

  const handle = await ensureHandle(project.ownerId);
  const path = `/n/${handle}/${project.slug}`;
  const snapshot = await createSnapshot(projectId, {
    document,
    source: 'publish',
    label: `发布 v${version}`,
    summary: `可见性：${input.visibility}`,
    branchId: await currentBranchId(projectId),
    createdById: input.createdById,
  });
  // §50 / ADR-0009：游戏设计一起钉进这一版。原样存，不在这里做"能解析才存"的筛选——
  // 解析失败要在公开页上明说，而不是悄悄变成"这个游戏没有内容"
  const [gameRow] = await db
    .select({ document: games.document })
    .from(games)
    .where(eq(games.projectId, projectId))
    .limit(1);

  let row: typeof publishedProjects.$inferSelect | undefined;
  if (existing) {
    // 一条 path 一行：换版本而不是新增，否则同一个 URL 会有两行在抢唯一索引
    [row] = await db
      .update(publishedProjects)
      .set({
        snapshotId: snapshot.id,
        gameDocument: gameRow?.document ?? null,
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
        gameDocument: gameRow?.document ?? null,
        path,
        visibility: input.visibility,
        version: 1,
        publishedById: input.createdById,
      })
      .returning();
  }
  await db.update(projects).set({ visibility: input.visibility }).where(eq(projects.id, projectId));
  if (outward) {
    await recordScan({
      projectId,
      publicationId: row!.id,
      publicationVersion: version,
      visibility: input.visibility,
      scan,
    });
  }
  const publication = toPublication(row!);
  // §80 / §84：把一页内容放到公网上这一步，是"谁在什么时候让外面能看到的"这个问题的答案。
  // 记的是这次发布本身（含切成 private 的下架），不是发布尝试失败——那类原因在案卷里
  await recordAudit({
    actorId: input.createdById,
    action: input.visibility === 'private' ? 'publish.retract' : 'publish',
    targetType: 'publication',
    targetId: publication.id,
    allowed: true,
    detail: { visibility: input.visibility, version, path: publication.path },
  });
  // §164：四类里只有"发布完成"今天真的有服务端终态，所以它是这一条的主体而不是装饰。
  // 收件人是项目所有者——他可能已经把这个标签页关掉了，回执不该只活在刚才那次请求里。
  await emit({
    kind: 'publish',
    recipientId: project.ownerId,
    projectId,
    projectName: project.name,
    publicationId: publication.id,
    path: publication.path,
    version,
    visibility: input.visibility,
  });
  // 到这里才是"这一版构建产物真的落库了"：publication 行写好、审计与通知都记上了
  emitBuildStatus(projectId, 'ok', `v${version} · ${publication.path} · 可见性 ${input.visibility}`);
  await publishPreviewStatus(projectId, publication.path, outward);
  return { ok: true, publication, gate, scan, snapshotId: snapshot.id };
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
export async function unpublishProject(projectId: string, actorId: string | null = null): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(publishedProjects)
    .where(eq(publishedProjects.projectId, projectId))
    .returning({ id: publishedProjects.id, path: publishedProjects.path });
  if (deleted.length) {
    await db.update(projects).set({ visibility: 'private' }).where(eq(projects.id, projectId));
    // 删行这一笔必须留痕：URL 从这一刻起 404，但"谁撤的、撤的是哪一条"不能跟着行一起消失。
    // targetId 记的是被删掉的那条 publication（行已经没了，只存在于这条审计里）。
    // 没发布过再取消（deleted 为空）不写——没发生的事不记。
    await recordAudit({
      actorId,
      action: 'publish.unpublish',
      targetType: 'publication',
      targetId: deleted[0]!.id,
      allowed: true,
      detail: { projectId, path: deleted[0]!.path },
    });
    // 下架不是"构建"，所以这里只有 preview.status；而那一格读的还是解析结果——
    // 行删了但路径仍解析得出来（例如另一行抢到了同一条 path）就是真故障，不能闭眼报 idle
    await publishPreviewStatus(projectId, deleted[0]!.path, false);
  }
  return deleted.length > 0;
}

export interface PublishedPage {
  publication: Publication;
  document: DesignDocument;
  ownerName: string;
  /** 公开资产 URL 与作者主页都按 handle 寻址（§56/§57），SEO 标签要它（§166）。
   *  发布时 ensureHandle 一定补齐了，这里保留 null 只是不把"库里不可能有 null"写进类型里 */
  ownerHandle: string | null;
  projectName: string;
  description: string | null;
  /** 发布时钉住的那份 §54 游戏文档（原样 jsonb，可能解析不了）；没有就是 null */
  gameDocument: unknown;
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
  // §131：人工裁决 rejected 之后，公开 URL 立刻不可达（下架由这里生效，不靠删行）
  if (row.pub.moderation === 'rejected') return null;
  if (row.pub.visibility === 'private') return null;
  if (row.project.deletedAt) return null;
  if (!row.pub.snapshotId) return null;
  const snapshot = await readSnapshot(row.pub.projectId, row.pub.snapshotId);
  if (!snapshot) return null;
  return {
    publication: toPublication(row.pub),
    document: snapshot.document,
    // 作者注销之后，公开面上不再挂他的名字（ADR-0025 决定二）：真名照旧留在库里，
    // 因为审计与互动要靠它认人；但一个"点进主页是空的"的名字挂在公开页上，
    // 对读者来说就是一句还活着的话。`DELETED_USER_LABEL` 与审计那处同一串字。
    ownerName: row.owner.deletedAt ? DELETED_USER_LABEL : row.owner.displayName,
    ownerHandle: row.owner.handle,
    projectName: row.project.name,
    description: row.project.description,
    gameDocument: row.pub.gameDocument ?? null,
  };
}

/**
 * `generateMetadata` 与页面组件在同一次渲染里要读同一条发布记录。
 * React 的 `cache` 按请求去重：两个调用点共享同一份 Promise，不会读两次库、
 * 也不会各读一次快照文档（快照可能上百 KB）。
 */
export const getPublishedPage = cache(resolvePublishedPath);

/**
 * §166 sitemap 的一行：路径 + 对外可抓的那一版的发布时间。
 */
export interface SitemapEntry {
  path: string;
  publishedAt: Date;
}

/**
 * sitemap 只收"爬虫点开真的能看到东西"的链接——口径与 resolvePublishedPath 一致：
 * unlisted 一律不进（它的语义是只认精确链接，列进清单等于把它交出去）、
 * rejected 不进、项目已删除不进、没有快照的不进。
 *
 * 唯一不在这个函数里判的是"快照行已被删"：那种发布要 join 到 snapshots 再按 JSON 体积判定，
 * 成本随发布数量线性涨，而它只会在人工清理快照后出现——交给 resolvePublishedPath 兜 404。
 */
export async function listSitemapEntries(limit = 1000): Promise<SitemapEntry[]> {
  const db = getDb();
  return db
    .select({
      path: publishedProjects.path,
      publishedAt: publishedProjects.publishedAt,
    })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(
      and(
        eq(publishedProjects.visibility, 'public'),
        ne(publishedProjects.moderation, 'rejected'),
        isNotNull(publishedProjects.snapshotId),
        isNull(projects.deletedAt),
      ),
    )
    .orderBy(desc(publishedProjects.publishedAt))
    .limit(limit);
}

/** 浏览量只在真正对外可见的访问上累加；计数失败不该拖垮一次公开渲染 */
export async function recordView(publicationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(publishedProjects)
    .set({ views: rawSql`${publishedProjects.views} + 1` })
    .where(eq(publishedProjects.id, publicationId));
}
