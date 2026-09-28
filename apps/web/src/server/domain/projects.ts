import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  clone,
  createDocument,
  createPage,
  type AssetRef,
  type ComponentDefinition,
  type DesignDocument,
  type DesignNode,
  type Page,
  type ProjectType,
  type Token,
} from '@nexus/design-model';
import { recordAudit } from './audit';
import { syncDesignKnowledge } from './knowledge';
import { getDb } from '../db/client';
import { assets, branches, components, designNodes, designTokens, pages, projects, snapshots } from '../db/schema';

/**
 * 领域写入的唯一入口（ADR-0001：M6 之后由 Java 侧接管，接口形状保持不变）。
 * 设计文档以规范化行存储（pages / design_nodes / design_tokens / components），
 * 读取时重组为 DesignDocument —— 模型仍是唯一真值（§9）。
 */

export const PROJECT_KINDS: ProjectType[] = [
  'website',
  'webapp',
  'mobile-ui',
  'game',
  'interactive-story',
  '3d-experience',
  'dashboard',
  'design-system',
  'prototype',
];

function kindToProjectType(kind: string): ProjectType {
  return (PROJECT_KINDS as string[]).includes(kind) ? (kind as ProjectType) : 'website';
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'project';
}

export interface CreateProjectInput {
  name: string;
  kind: ProjectType;
  /** 首屏 prompt，仅用于给页面命名等轻量上下文，不做假生成 */
  seedDesign?: boolean;
  /** Duplicate（§27）：以这份文档为起点，而不是空白起手页 */
  fromDocument?: DesignDocument;
}

export async function createProject(ownerId: string, input: CreateProjectInput): Promise<DesignDocument> {
  const db = getDb();
  const document = input.fromDocument
    ? { ...clone(input.fromDocument), name: input.name }
    : createDocument(input.name, input.kind);
  const slugBase = slugify(input.name);
  let slug = slugBase;
  for (let i = 2; i < 50; i += 1) {
    const clash = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.ownerId, ownerId), eq(projects.slug, slug)))
      .limit(1);
    if (!clash.length) break;
    slug = `${slugBase}-${i}`;
  }

  let projectId = '';
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({
        ownerId,
        slug,
        name: input.name,
        kind: input.kind,
        activePageId: document.activePageId,
        // 起点文档自带的主题 mode 也要落库，否则 Duplicate 一份带主题的项目会丢掉它
        activeMode: document.activeMode ?? null,
        modes: document.metadata.modes ?? null,
      })
      .returning({ id: projects.id });
    projectId = row!.id;
    document.id = projectId;
    await writeDocument(tx, projectId, document);
    // §28：项目一开始就有 main 分支，快照挂在它下面，head 指向初始版本
    const [branch] = await tx
      .insert(branches)
      .values({ projectId, name: 'main', isDefault: true })
      .returning({ id: branches.id });
    const [initial] = await tx
      .insert(snapshots)
      .values({
        projectId,
        branchId: branch!.id,
        label: '初始版本',
        source: 'manual',
        document: document as unknown as Record<string, unknown>,
        summary: '项目创建',
      })
      .returning({ id: snapshots.id });
    await tx.update(branches).set({ headSnapshotId: initial!.id }).where(eq(branches.id, branch!.id));
    await tx.update(projects).set({ currentSnapshotId: initial!.id }).where(eq(projects.id, projectId));
  });

  // 返回从库里读回来的那份，而不是内存里的那份：创建路径本身也要被验证
  const stored = await loadDocument(projectId);
  // 同上（§49 Documents）：Duplicate 一份带文案的项目，落地那一刻文案就该查得到，
  // 而不是等用户第一次按保存。切的是**读回来**的那份——库里没有的文字不配进语料。
  await syncDesignKnowledge(projectId, stored ?? document);
  return stored ?? document;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

async function writeDocument(tx: Tx, projectId: string, document: DesignDocument): Promise<void> {
  // 同一项目的写入必须串行：下面是"整删重插"，两个并发事务各自从同一份旧文档出发，
  // A 删完 → B 删完 → A 插 p_x → B 插同一个 p_x ⇒ pages_pkey 冲突，整个 PUT 报 500
  //（2026-09-26 生产日志里那次 `insert into "pages"` 失败就是这个形状；Studio 自动保存 + 第二个标签页就会撞）。
  // 事务级 advisory lock 在 commit/rollback 时自动释放，不改任何事务语义，也不跨项目挡。
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${projectId}, 0))`);
  // 只清这个项目自己的行：先删本项目页面下的节点，再删页面
  const pageIds = await tx
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.projectId, projectId));
  const ids = pageIds.map((p) => p.id);
  if (ids.length) await tx.delete(designNodes).where(inArray(designNodes.pageId, ids));
  await tx.delete(pages).where(eq(pages.projectId, projectId));
  await tx.delete(designTokens).where(eq(designTokens.projectId, projectId));
  await tx.delete(components).where(eq(components.projectId, projectId));

  for (const [index, token] of document.tokens.entries()) {
    await tx.insert(designTokens).values({
      projectId,
      key: token.key,
      type: token.type,
      value: token.value as unknown as Record<string, unknown>,
      modes: token.modes ?? null,
      description: token.description ?? null,
      // 顺序是文档的一部分（§16）：不写这一列，读回来就是物理行序说了算（#40 那条噪音快照的根因）
      sortIndex: index,
    });
  }

  for (const page of document.pages) {
    await tx.insert(pages).values({
      id: page.id,
      projectId,
      name: page.name,
      rootNodeId: page.rootId,
      width: page.width,
      height: page.height,
      backgroundColor: typeof page.backgroundColor === 'string' ? page.backgroundColor : null,
    });
    await writeNodes(tx, page);
  }

  for (const component of document.components) {
    await tx.insert(components).values({
      id: component.id,
      projectId,
      name: component.name,
      pageId: component.pageId || null,
      rootNodeId: component.rootId,
      variants: component.variants ?? null,
      props: component.props ?? null,
      slots: component.slots ?? null,
    });
  }
}

/**
 * 单条 INSERT 的参数上限是 65,535，节点行每行 9 个参数 —— 不切块的话，
 * 一个页面超过约 7,200 个节点就**整体存不下去**（`MAX_PARAMETERS_EXCEEDED`），
 * 而 §146 的规模目标正是 10,000 节点。切块只改"几条语句"，不改事务语义。
 */
const INSERT_CHUNK = 500;

function chunked<T>(items: T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function writeNodes(tx: Tx, page: Page): Promise<void> {
  const rows = Object.values(page.nodes).map((node, index) => ({
    id: node.id,
    pageId: page.id,
    parentId: node.parentId,
    nodeType: node.type,
    name: node.name,
    sortIndex: index,
    data: node as unknown as Record<string, unknown>,
    visible: node.visible,
    locked: node.locked,
  }));
  for (const part of chunked(rows)) await tx.insert(designNodes).values(part);
}

/**
 * 归属校验（docs/SECURITY.md 数据隔离）：读写前必须调用。
 * 只返回布尔值，不暴露项目内容，避免"项目是否存在"侧信道。
 */
export async function projectBelongsTo(projectId: string, ownerId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId), isNull(projects.deletedAt)))
    .limit(1);
  return rows.length > 0;
}

/**
 * assets 行 → 模型里的 AssetRef（§16）。
 *
 * 这份映射只此一处：资产服务返回给前端的、载入文档时水合的，都用同一个形状，
 * 免得两处各自演化出"清单里有但模型里字段不一样"的资产。
 */
export function assetRowToRef(row: typeof assets.$inferSelect): AssetRef {
  const gen = (row.genMeta ?? {}) as Record<string, unknown>;
  const generatedBy =
    row.source === 'generated' && typeof gen.prompt === 'string'
      ? {
          provider: typeof gen.provider === 'string' ? gen.provider : 'unknown',
          model: typeof gen.model === 'string' ? gen.model : 'unknown',
          prompt: gen.prompt,
          // 这两格是面板上那枚 DEMO 角标和"回到那一次任务"的唯一依据。曾经没映射，
          // 于是 AssetsPanel 读一个没人写的字段：角标永远不出现，界面看着像"没有生成物"。
          ...(typeof gen.taskId === 'string' ? { taskId: gen.taskId } : {}),
          ...(typeof gen.demoMode === 'boolean' ? { demoMode: gen.demoMode } : {}),
        }
      : undefined;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as AssetRef['kind'],
    storageKey: row.storageKey,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    mimeType: row.mime ?? 'application/octet-stream',
    sizeBytes: row.bytes ?? undefined,
    ...(generatedBy ? { generatedBy } : {}),
    // 归属角色：库里这一列已经有写入方（角色场景生成），不映射进清单就等于界面上永远看不见它
    ...(row.characterId ? { characterId: row.characterId } : {}),
    // 肖像与场景的分别只写在 genMeta 里，不映射进清单，卡片就只能一律说"角色场景"
    ...(gen.characterPortrait === true ? { characterPortrait: true } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function loadDocument(projectId: string): Promise<DesignDocument | null> {
  const db = getDb();
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
  if (!project) return null;

  // 每一句 SELECT 都要有确定的顺序（#40）：没有 ORDER BY 时返回顺序由物理行序决定，
  // 而 `documentsMatch` 对数组是按序比的——同一份内容读两次可以"不一样"，
  // 于是分支切换会把它误判成"有改动"，每次多存一条噪音快照。
  const pageRows = await db
    .select()
    .from(pages)
    .where(eq(pages.projectId, projectId))
    .orderBy(asc(pages.sortIndex), asc(pages.id));
  const tokenRows = await db
    .select()
    .from(designTokens)
    .where(eq(designTokens.projectId, projectId))
    .orderBy(asc(designTokens.sortIndex), asc(designTokens.key));
  const componentRows = await db
    .select()
    .from(components)
    .where(eq(components.projectId, projectId))
    .orderBy(asc(components.id));
  const assetRows = await db
    .select()
    .from(assets)
    .where(eq(assets.projectId, projectId))
    .orderBy(asc(assets.createdAt));

  const document = createDocument(project.name, kindToProjectType(project.kind));
  document.id = projectId;
  document.name = project.name;
  document.tokens = tokenRows.map<Token>((row) => ({
    key: row.key,
    type: row.type as Token['type'],
    value: row.value as Token['value'],
    modes: (row.modes as Token['modes']) ?? undefined,
    description: row.description ?? undefined,
  }));
  document.components = componentRows.map<ComponentDefinition>((row) => ({
    id: row.id,
    name: row.name,
    pageId: row.pageId ?? '',
    rootId: row.rootNodeId,
    variants: (row.variants as ComponentDefinition['variants']) ?? undefined,
    props: (row.props as ComponentDefinition['props']) ?? undefined,
    slots: (row.slots as ComponentDefinition['slots']) ?? undefined,
  }));

  // §38/§101 资产清单：字节在对象存储，行在 assets 表，这里把清单读回模型，
  // 让投影与 Agent 上下文（§66）知道"这个项目有哪些素材、多大、什么类型"。
  // 反向不写：saveDocument 不碰 assets 表，入库只由资产服务在上传/生成时做——
  // 否则一次自动保存就可能把客户端传来的 storageKey 当成事实写回存储层（§80）。
  document.assets = assetRows.map(assetRowToRef);

  const rebuilt: Page[] = [];
  for (const row of pageRows) {
    // 节点进的是 Record（键序=返回顺序），而 `Object.values(page.nodes)` 在派生上下文与测试里都会被枚举：
    // 没有 ORDER BY 时同一份文档两次读取可以给出不同的枚举顺序（#40 同一根因的另一面）
    const nodeRows = await db.select().from(designNodes).where(eq(designNodes.pageId, row.id)).orderBy(asc(designNodes.id));
    const nodes: Record<string, DesignNode> = {};
    for (const nodeRow of nodeRows) nodes[nodeRow.id] = nodeRow.data as unknown as DesignNode;
    rebuilt.push({
      id: row.id,
      name: row.name,
      rootId: row.rootNodeId,
      nodes,
      width: row.width,
      height: row.height,
      backgroundColor: (row.backgroundColor ?? undefined) as Page['backgroundColor'],
    });
  }
  document.pages = rebuilt.length ? rebuilt : [createPage('Home')];
  document.activePageId = rebuilt.some((p) => p.id === project.activePageId) ? project.activePageId! : document.pages[0]!.id;
  // createDocument 把 createdAt 写成了"现在"：不覆盖回来的话，每次载入都在谎报这份文档刚被创建
  document.metadata.createdAt = project.createdAt.toISOString();
  document.metadata.updatedAt = project.updatedAt.toISOString();
  // §12 主题 mode：库里没有对应列时它只活在浏览器会话里，刷新就退回默认值
  document.activeMode = project.activeMode ?? null;
  if (Array.isArray(project.modes)) document.metadata.modes = project.modes as string[];
  // 视觉语言与品牌包也是文档状态（§30/§174）：saveDocument 写了这两列，这里不读回来就等于
  // "刷新后 DNA 悄悄没了"。以前只有客户端把整份文档发回来时才看得见，服务端装配（§68）把它暴露了。
  document.visualDna = (project.visualDna ?? undefined) as DesignDocument['visualDna'];
  document.brandKit = (project.brandKit ?? undefined) as DesignDocument['brandKit'];
  return document;
}

export async function saveDocument(projectId: string, document: DesignDocument): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await writeDocument(tx, projectId, document);
    await tx
      .update(projects)
      .set({
        name: document.name,
        activePageId: document.activePageId,
        brandKit: (document.brandKit ?? null) as unknown as Record<string, unknown>,
        visualDna: (document.visualDna ?? null) as unknown as Record<string, unknown>,
        // §12：主题 mode 是文档状态，不存下来就会在保存-重载后悄悄退回默认值
        activeMode: document.activeMode ?? null,
        modes: document.metadata.modes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  });
  // §49 的 Documents 那一格：设计正文要能被检索，改一句就得换一块。
  // 必须放在事务**外面**：同步走的是 `getDb()` 那条独立连接，它在事务里写的 chunk
  // 不会跟着外层回滚——文档没存成而语料里已经是新句子，检索就会回答一份不存在的设计。
  // 只删/插 `design` 这一类，别动世界/角色/分镜那些（它们各自的写入方负责）。
  await syncDesignKnowledge(projectId, document);
}

export interface ProjectSummary {
  id: string;
  name: string;
  kind: string;
  slug: string;
  visibility: string;
  /** 一句话简介（§49）：作者写了才算有，没有就是 null，不拿名字凑 */
  description: string | null;
  updatedAt: string;
}

export async function listProjects(ownerId: string): Promise<ProjectSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      kind: projects.kind,
      slug: projects.slug,
      visibility: projects.visibility,
      description: projects.description,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(eq(projects.ownerId, ownerId), isNull(projects.deletedAt)))
    .orderBy(projects.updatedAt);
  return rows.map((r) => ({ ...r, visibility: r.visibility as string, updatedAt: r.updatedAt.toISOString() }));
}

/**
 * 改项目简介（§49 / §166）。名字不在这里改 —— TopBar 的重命名走设计文档，
 * `saveDocument` 会把 `document.name` 同步到 `projects.name`，再加一个写名入口只会两边打架。
 *
 * 所有权写在 SQL 的 `where` 里而不是调用方：传别人的 projectId 只会回 null，
 * "存在但看不到"这种含糊状态没有藏身处（与 §168 同一条纪律）。
 */
export async function updateProjectDescription(
  actorId: string,
  projectId: string,
  description: string | null,
): Promise<ProjectSummary | null> {
  const trimmed = description?.trim() ?? '';
  const [row] = await getDb()
    .update(projects)
    .set({ description: trimmed || null, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, actorId), isNull(projects.deletedAt)))
    .returning({
      id: projects.id,
      name: projects.name,
      kind: projects.kind,
      slug: projects.slug,
      visibility: projects.visibility,
      description: projects.description,
      updatedAt: projects.updatedAt,
    });
  if (!row) return null;
  return { ...row, visibility: row.visibility as string, updatedAt: row.updatedAt.toISOString() };
}

/**
 * §74 把"删除项目"列为必须人工审批的动作，而 `projects.deletedAt` 从建库起就被近二十处读取
 * 谓词挡着（列表 / 搜索 / 发现 / 公开页 / 创作数据 / 收件箱里那条链接），却**全库没有一个写入方**——
 * 那些防御性判断今天全是死代码。这里补上第一个写入方。
 *
 * 审批做在服务端：确认词必须逐字等于项目名，不匹配就一条都不写。
 * 只在 UI 里放一个 `confirm()` 弹窗等于没有审批——绕过 UI 直接打接口的人不受它约束，
 * 而"删掉别人的项目"正是那种不能靠调用方自觉的动作。
 *
 * 软删而不是删行：§108 说用户的项目历史归 Snapshot 管，§164 刚把 `publication_id` 选成
 * `SET NULL` 而不是 CASCADE——同一个理由，历史记录不该跟着一次撤销一起消失。
 * 公开页从这一刻起 404（`resolvePublishedPath` 早就在挡 `deletedAt`，只是从来没人触发过它），
 * 但发布行、快照、评论都还在，恢复后原样回来。
 */
export type DeleteOutcome =
  | { ok: true; name: string }
  | { ok: false; code: 'not_found' }
  | { ok: false; code: 'approval_required' };

export async function softDeleteProject(actorId: string, projectId: string, confirmName: string): Promise<DeleteOutcome> {
  const db = getDb();
  const [row] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, actorId), isNull(projects.deletedAt)))
    .limit(1);
  // 别人的项目与不存在的项目在这里是同一个答案，不给"存在但看不到"留出侧信道
  if (!row) return { ok: false, code: 'not_found' };
  if (row.name !== confirmName.trim()) {
    await recordAudit({
      actorId,
      action: 'project.delete',
      targetType: 'project',
      targetId: projectId,
      allowed: false,
      detail: { reason: 'confirm_mismatch' },
    });
    return { ok: false, code: 'approval_required' };
  }
  // 写一次带同一谓词的 UPDATE 而不是按上面那次读的结果删：读到与写之间项目可能已经被删过，
  // 那时这里返回 0 行，调用方拿到 not_found 而不是"成功删除了一个已经删掉的东西"
  const updated = await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, actorId), isNull(projects.deletedAt)))
    .returning({ id: projects.id });
  if (!updated.length) return { ok: false, code: 'not_found' };
  await recordAudit({
    actorId,
    action: 'project.delete',
    targetType: 'project',
    targetId: projectId,
    allowed: true,
    detail: { name: row.name },
  });
  return { ok: true, name: row.name };
}

/** 恢复：只动"确实被软删过"的行，所以一个没删过的项目在这里返回 null 而不是"恢复成功" */
export async function restoreProject(actorId: string, projectId: string): Promise<{ name: string } | null> {
  const db = getDb();
  const [row] = await db
    .update(projects)
    .set({ deletedAt: null })
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, actorId), isNotNull(projects.deletedAt)))
    .returning({ name: projects.name });
  if (!row) return null;
  await recordAudit({
    actorId,
    action: 'project.restore',
    targetType: 'project',
    targetId: projectId,
    allowed: true,
    detail: { name: row.name },
  });
  return { name: row.name };
}

export interface DeletedProject {
  id: string;
  name: string;
  kind: string;
  deletedAt: string;
}

/** 回收站：按删除时间倒序，最新删掉的最好找 */
export async function listDeletedProjects(ownerId: string): Promise<DeletedProject[]> {
  const rows = await getDb()
    .select({ id: projects.id, name: projects.name, kind: projects.kind, deletedAt: projects.deletedAt })
    .from(projects)
    .where(and(eq(projects.ownerId, ownerId), isNotNull(projects.deletedAt)))
    .orderBy(desc(projects.deletedAt));
  return rows.map((r) => ({ ...r, deletedAt: (r.deletedAt ?? new Date()).toISOString() }));
}
