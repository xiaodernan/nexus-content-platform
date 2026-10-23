import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  applyPatch,
  clone,
  createDocument,
  createPage,
  type AssetRef,
  type ComponentDefinition,
  type DesignDocument,
  type DesignNode,
  type DesignPatch,
  type Page,
  type ProjectType,
  type Token,
} from '@nexus/design-model';
import { parseDocument } from '../validation';
import { recordAudit } from './audit';
import { isUuid } from './ids';
import { syncDesignKnowledge } from './knowledge';
import { stableKey } from './stable-key';
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

/**
 * 把一个字符串收成合法的项目类型，**不认识就落到 `website`**。
 *
 * 这是**界面**那条路的语义：那个输入是 `<select>`，送不出坏值，所以兜底只是防御。
 * 公开 API 那条路**不许用这个语义**——外部调用方写错类型时要拿到 400 与可选值清单，
 * 而不是一个类型悄悄不对的项目（`/api/v1/projects` 里就是这么做的）。
 */
export function kindToProjectType(kind: string): ProjectType {
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
type Db = ReturnType<typeof getDb>;

/**
 * 能读文档的那个东西：独立连接，或者调用方已经开着的事务。
 * 只 `Pick` 出 select 与 execute——读取路径不该拿到写的能力，事务归 `writeDocument` 那边管。
 *
 * `execute` 是 2026-10-21 加的：`design_nodes` 那一读**要绕开 drizzle 的逐行映射**
 * （那一层在 10000 行上要多花 0.6~1.0 秒，而它对 jsonb 载荷纯属白做——映射完还是直接取 `data`）。
 */
export type DocumentReader = Pick<Db, 'select' | 'execute'>;

/** 调用方开好的事务：§188 的公开 API 补丁要在同一事务里读—改—写，类型得能带出这个文件 */
export type DocumentTx = Tx;

/**
 * 同一项目的写入必须串行（ADR-0016）：两个并发事务各自从同一份旧文档出发会互相踩。
 * 单独成一个函数是因为"读—改—写"那条路（§188 公开 API 的补丁）必须在**读之前**就拿到它，
 * 而 `writeDocument` 里那句锁来得太晚——它保护的是写与写之间，保护不了读与写之间。
 * 事务级 advisory lock 可重入，同一事务里拿两次不会自锁，commit/rollback 时自动释放。
 */
export async function lockProjectWrites(tx: Tx, projectId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${projectId}, 0))`);
}

/**
 * 文档写入的唯一实现（`createProject` 与 `saveDocument` 都走它）。
 *
 * 这是**增量**的一版：只对真正变化的行发 SQL。语义没变，仍然是「整份文档替换」——客户端每次发的都是
 * 完整文档，文档里没有的节点就是被删掉的，所以缺失即删。做成「只增改、不删」看着更像合并，实际会让删除
 * 静默失效（删掉一个节点再保存，读回来它还在），那是设计模型与库漂移（§16），不是优化。
 *
 * 为什么值得先算一遍差异：原来的写放大是「一次保存重写 10000 行」（§147 记的那半截，4000 节点实测 1525ms）。
 * 差异怎么算也很要紧——2026-09-28 在 4000 节点上量过三种算法：
 *   · 把全部节点行读回 JS（3.5MB jsonb）再逐字段比：读 957ms + 比对 470ms；
 *   · 只读 id 判增删：10ms；
 *   · 内容差异交给 Postgres 比（jsonb 相等本身就是键序无关的）：一次差集查询 180ms。
 * 所以这里只把 id 读回 JS，内容差异让库自己算——写 1 行而不是 10000 行，代价也不再随文档大小线性涨在 JS 侧。
 *
 * 已知限度：仍然要把整份文档（3.5MB）序列化成一个 jsonb 参数发给库，而 `saveDocument` 之后的
 * §49 语料同步是全量重切（4000 节点 146ms）。**2026-10-09 补上**：客户端自动保存已经改成
 * 发补丁（`patchProjectDocument`，`PATCH /api/projects/<id>/design`），全量 PUT 只留给
 * 补丁词汇表表达不了的改动（setMode / 快照恢复…）与兜底——见 ADR-0033。
 */
async function writeDocument(tx: Tx, projectId: string, document: DesignDocument): Promise<void> {
  // 写与写之间串行（形状与成因见 lockProjectWrites 那段注释：2026-09-26 生产日志里的 pages_pkey 冲突）
  await lockProjectWrites(tx, projectId);

  const current = await loadCurrentDocumentState(tx, projectId);

  // ---- 令牌：按 key 对齐。顺序是文档的一部分（§16），sortIndex 参与比较 ----
  const incomingTokens = document.tokens.map((token, index) => ({
    key: token.key,
    type: token.type,
    value: token.value as unknown as Record<string, unknown>,
    modes: token.modes ?? null,
    description: token.description ?? null,
    sortIndex: index,
  }));
  const tokenDiff = diffByKey(Array.from(current.tokens.values()), incomingTokens, (token) => token.key);
  for (const token of tokenDiff.removed) {
    await tx.delete(designTokens).where(and(eq(designTokens.projectId, projectId), eq(designTokens.key, token.key)));
  }
  for (const token of tokenDiff.added) {
    await tx.insert(designTokens).values({ projectId, key: token.key, type: token.type, value: token.value, modes: token.modes, description: token.description, sortIndex: token.sortIndex });
  }
  for (const token of tokenDiff.updated) {
    await tx.update(designTokens).set({ type: token.type, value: token.value, modes: token.modes, description: token.description, sortIndex: token.sortIndex, updatedAt: new Date() }).where(and(eq(designTokens.projectId, projectId), eq(designTokens.key, token.key)));
  }

  // 节点这一段的判断依据：库里现在有哪些行（只取 id 与所在页，不取 data）
  const existingNodes = await tx
    .select({ id: designNodes.id, pageId: designNodes.pageId })
    .from(designNodes)
    .innerJoin(pages, eq(designNodes.pageId, pages.id))
    .where(eq(pages.projectId, projectId));

  // ---- 页面：按 id 对齐。删页面时它下面的节点由外键级联删掉（design_nodes.page_id onDelete: cascade）----
  const incomingPages = document.pages.map((page) => ({
    id: page.id,
    name: page.name,
    rootNodeId: page.rootId,
    width: page.width,
    height: page.height,
    backgroundColor: typeof page.backgroundColor === 'string' ? page.backgroundColor : null,
  }));
  const pageDiff = diffByKey(Array.from(current.pages.values()), incomingPages, (page) => page.id);
  const removedPageIds = new Set(pageDiff.removed.map((page) => page.id));
  const addedPageIds = new Set(pageDiff.added.map((page) => page.id));
  for (const page of pageDiff.removed) {
    await tx.delete(pages).where(and(eq(pages.projectId, projectId), eq(pages.id, page.id)));
  }
  for (const page of pageDiff.added) {
    await tx.insert(pages).values({ id: page.id, projectId, name: page.name, rootNodeId: page.rootNodeId, width: page.width, height: page.height, backgroundColor: page.backgroundColor });
    await writeNodes(tx, document.pages.find((candidate) => candidate.id === page.id)!);
  }
  for (const page of pageDiff.updated) {
    await tx.update(pages).set({ name: page.name, rootNodeId: page.rootNodeId, width: page.width, height: page.height, backgroundColor: page.backgroundColor, updatedAt: new Date() }).where(and(eq(pages.projectId, projectId), eq(pages.id, page.id)));
  }

  // ---- 组件：按 id 对齐。放在页面之后：它引用 pages（外键），页面得先存在 ----
  const incomingComponents = document.components.map((component) => ({
    id: component.id,
    name: component.name,
    pageId: component.pageId || null,
    rootNodeId: component.rootId,
    variants: component.variants ?? null,
    props: component.props ?? null,
    slots: component.slots ?? null,
  }));
  const componentDiff = diffByKey(Array.from(current.components.values()), incomingComponents, (component) => component.id);
  for (const component of componentDiff.removed) {
    await tx.delete(components).where(and(eq(components.projectId, projectId), eq(components.id, component.id)));
  }
  for (const component of componentDiff.added) {
    await tx.insert(components).values({ projectId, id: component.id, name: component.name, pageId: component.pageId, rootNodeId: component.rootNodeId, variants: component.variants, props: component.props, slots: component.slots });
  }
  for (const component of componentDiff.updated) {
    await tx.update(components).set({ name: component.name, pageId: component.pageId, rootNodeId: component.rootNodeId, variants: component.variants, props: component.props, slots: component.slots, updatedAt: new Date() }).where(and(eq(components.projectId, projectId), eq(components.id, component.id)));
  }

  // ---- 节点：只在 JS 里对齐 id，内容差异交给 Postgres（见函数开头那三种算法的读数）----
  // 两个过滤器都有用：新增页面里的节点上面已经整块写过了，不该再算一次「新增」；
  // 删掉的页面的节点由级联负责，不该进删除清单。
  const incomingNodes = document.pages
    .filter((page) => !addedPageIds.has(page.id) && !removedPageIds.has(page.id))
    .flatMap((page) =>
      Object.values(page.nodes).map((node, index) => ({
        id: node.id,
        pageId: page.id,
        parentId: node.parentId,
        nodeType: node.type,
        name: node.name,
        sortIndex: index,
        data: node as unknown as Record<string, unknown>,
        visible: node.visible,
        locked: node.locked,
      })),
    );
  const incomingById = new Map(incomingNodes.map((node) => [node.id, node]));
  // 被删页面的那些行已经随页面级联删掉了，不能再拿它们的 id 当「库里已经有了」：
  // 否则「同一份文档里删掉一页、同时把该页的一个节点搬到留下的页上」会把这个节点整个吞掉
  //（级联删了旧行，而这里又判成「非新增」，于是既不插也不改 —— 设计模型与库就此漂移，§16）。
  const survivingRows = existingNodes.filter((row) => !removedPageIds.has(row.pageId));
  const existingIds = new Set(survivingRows.map((row) => row.id));
  const existingPageOf = new Map(survivingRows.map((row) => [row.id, row.pageId]));

  // 只在库里、不在文档里 = 删（换个页的节点在下面按「删旧 + 插新」处理，不走删除清单）。
  // 按 (page_id, id) 分组删：design_nodes 的主键就是这两列，单独按 id 删用不上索引、会全表扫描
  // ——本机测试库积了十万行，一次保存凭空多几百毫秒（2026-09-28 量到的）。
  const deletedByPage = new Map<string, string[]>();
  for (const row of survivingRows) {
    if (incomingById.has(row.id)) continue;
    const ids = deletedByPage.get(row.pageId);
    if (ids) ids.push(row.id);
    else deletedByPage.set(row.pageId, [row.id]);
  }
  // 只在文档里、不在库里 = 增
  const addedNodes = incomingNodes.filter((node) => !existingIds.has(node.id));
  // 两边都有、内容或所在页不同 = 改
  const nodePayload = JSON.stringify(
    incomingNodes.map((node) => ({ id: node.id, pageId: node.pageId, data: node.data })),
  );
  const changedRows = await tx.execute<{ id: string }>(sql`
    with incoming as (
      select (r->>'id') as id, (r->>'pageId') as page_id, (r->'data') as data
      from jsonb_array_elements(${nodePayload}::jsonb) as r
    )
    select n.id as id
    from design_nodes n
    join pages p on p.id = n.page_id
    join incoming i on i.id = n.id
    where p.project_id = ${projectId}
      and (n.data is distinct from i.data or n.page_id is distinct from i.page_id)
  `);
  const changedIds = new Set(changedRows.map((row) => row.id));
  const updatedNodes = incomingNodes.filter((node) => changedIds.has(node.id) && existingPageOf.get(node.id) === node.pageId);
  // 换页的节点不能走 UPDATE：主键是 (page_id, id)，按新 page_id 去 UPDATE 一行都匹配不到，
  // 节点会悄悄留在旧页上。按「删旧行 + 插新行」处理。
  const movedNodes = incomingNodes.filter((node) => changedIds.has(node.id) && existingPageOf.get(node.id) !== node.pageId);
  for (const node of movedNodes) {
    await tx.delete(designNodes).where(and(eq(designNodes.pageId, existingPageOf.get(node.id)!), eq(designNodes.id, node.id)));
  }
  if (addedNodes.length || movedNodes.length) {
    for (const part of chunked([...addedNodes, ...movedNodes])) {
      await tx.insert(designNodes).values(part);
    }
  }
  for (const node of updatedNodes) {
    await tx.update(designNodes)
      .set({ parentId: node.parentId, nodeType: node.nodeType, name: node.name, sortIndex: node.sortIndex, data: node.data, visible: node.visible, locked: node.locked, updatedAt: new Date() })
      .where(and(eq(designNodes.pageId, node.pageId), eq(designNodes.id, node.id)));
  }
  for (const [pageId, ids] of deletedByPage) {
    for (const part of chunked(ids)) {
      await tx.delete(designNodes).where(and(eq(designNodes.pageId, pageId), inArray(designNodes.id, part)));
    }
  }
}

/**
 * 单条 INSERT / DELETE 的参数上限是 65,535，节点行每行 9 个参数 —— 不切块的话，
 * 一个页面超过约 7,200 个节点就**整体存不下去**（`MAX_PARAMETERS_EXCEEDED`），
 * 而 §146 的规模目标正是 10,000 节点。切块只改「几条语句」，不改事务语义。
 */
const INSERT_CHUNK = 500;

function chunked<T>(items: T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * 按 key 把两份清单分成 added / updated / removed。
 * 相等默认用 `stableKey` 比（键序无关）：jsonb 读回来的键序是库重排过的，
 * 拿 `JSON.stringify` 比会把「没变」判成「变了」，于是每次保存都把整份文档重写一遍。
 * 只用在行数很少的表上（令牌 / 页面 / 组件）：节点是 10000 行那一档，走库里的 jsonb 差集。
 */
function diffByKey<T>(
  current: T[],
  incoming: T[],
  keyFn: (item: T) => string,
  equal: (a: T, b: T) => boolean = (a, b) => stableKey(a) === stableKey(b),
): { added: T[]; updated: T[]; removed: T[] } {
  const currentMap = new Map(current.map((item) => [keyFn(item), item]));
  const incomingMap = new Map(incoming.map((item) => [keyFn(item), item]));
  const added: T[] = [];
  const updated: T[] = [];
  const removed: T[] = [];
  for (const [key, item] of incomingMap) {
    const before = currentMap.get(key);
    if (!before) added.push(item);
    else if (!equal(before, item)) updated.push(item);
  }
  for (const [key, item] of currentMap) {
    if (!incomingMap.has(key)) removed.push(item);
  }
  return { added, updated, removed };
}

/**
 * 读回这个项目当前的小表（同一事务里，已持有 advisory lock）。
 * **节点不在这里读**：那是 10000 行 / 3.5MB 那一档，读回 JS 再比是这一刀之前最贵的一步（957ms + 470ms），
 * 现在只取 id 与所在页（10ms），内容差异交给库里的 jsonb 差集（180ms）。
 * 只取参与比对的列：createdAt / updatedAt 这类时间戳不是内容，放进比较会让每次保存都判「变了」。
 */
async function loadCurrentDocumentState(
  tx: Tx,
  projectId: string,
): Promise<{
  pages: Map<string, { id: string; name: string; rootNodeId: string; width: number; height: number; backgroundColor: string | null }>;
  tokens: Map<string, { key: string; type: string; value: unknown; modes: unknown; description: string | null; sortIndex: number }>;
  components: Map<string, { id: string; name: string; pageId: string | null; rootNodeId: string; variants: unknown; props: unknown; slots: unknown }>;
}> {
  const pageRows = await tx
    .select({ id: pages.id, name: pages.name, rootNodeId: pages.rootNodeId, width: pages.width, height: pages.height, backgroundColor: pages.backgroundColor })
    .from(pages)
    .where(eq(pages.projectId, projectId));
  const tokenRows = await tx
    .select({ key: designTokens.key, type: designTokens.type, value: designTokens.value, modes: designTokens.modes, description: designTokens.description, sortIndex: designTokens.sortIndex })
    .from(designTokens)
    .where(eq(designTokens.projectId, projectId));
  const componentRows = await tx
    .select({ id: components.id, name: components.name, pageId: components.pageId, rootNodeId: components.rootNodeId, variants: components.variants, props: components.props, slots: components.slots })
    .from(components)
    .where(eq(components.projectId, projectId));

  return {
    pages: new Map(pageRows.map((row) => [row.id, row])),
    tokens: new Map(tokenRows.map((row) => [row.key, row])),
    components: new Map(componentRows.map((row) => [row.id, row])),
  };
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
/**
 * 项目归谁（软删的不算）。
 * 存储配额要按**所有者**的档位算（§133 的 storage 一格），而摄取门手里只有 projectId，
 * 所以这一格得现查一次；查不到返回 null，调用方按"没有归属就不做配额判断"处理。
 */
export async function projectOwnerId(projectId: string): Promise<string | null> {
  // 形状不对的 id 按"查不到"处理：eq() 会把 22P02 抛成 500（见 domain/ids.ts）
  if (!isUuid(projectId)) return null;
  const [row] = await getDb()
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  return row?.ownerId ?? null;
}

/**
 * 项目的名字与类型。通知标题、导出清单这些地方都要它——没有名字，标题就会变成"《prj_9f3c…》"，
 * 那种标题没人读得懂（与 `agent-tasks.ts` 里为通知顺手取项目名同一条理由）；
 * `kind` 则不在设计文档里（文档只管内容，类型是项目这一行的事），所以导出清单要从这里取。
 * 不存在或已软删时返回 null，调用方按"没有这个项目"处理。
 */
export async function loadProjectIdentity(
  projectId: string,
): Promise<{ name: string; kind: string } | null> {
  if (!isUuid(projectId)) return null;
  const [row] = await getDb()
    .select({ name: projects.name, kind: projects.kind })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  return row ? { name: row.name, kind: row.kind } : null;
}

export async function projectBelongsTo(projectId: string, ownerId: string): Promise<boolean> {
  // 32 条路由走这一道门：形状不对的 projectId 一律 false（404），
  // 不再让 22P02 变成 500——"不在你名下"与"不存在"给同一个答案
  if (!isUuid(projectId)) return false;
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

export async function loadDocument(projectId: string, reader: DocumentReader = getDb()): Promise<DesignDocument | null> {
  // 形状不对的 id 按"没有这个项目"处理（见 domain/ids.ts）
  if (!isUuid(projectId)) return null;
  // 传事务进来时，这次读就落在同一把 advisory lock 后面（§188 公开 API 的读—改—写要的就是这个）
  const db = reader;
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
    //
    // **这一读绕开 drizzle 的行映射**（2026-10-21）：`design_nodes` 的载荷整份在 `data` 那一列里
    // （jsonb），drizzle 那一层映射（每行一个 JS 对象 + 列名与类型转换）对它纯属白做——
    // 量过：同样 10000 行，那一层多花 **0.6~1.0 秒**（首屏那 1.3 秒的大头就在这儿）。
    // 用 `execute` 拿**原始行**：内容逐项不变（红线的回归测试见
    // `apps/web/test/load-document-identity.integration.test.ts`），只是不替我们做那层无用功。
    const nodeRows = await reader.execute(
      sql`SELECT id, data FROM design_nodes WHERE page_id = ${row.id} ORDER BY id`,
    );
    const nodes: Record<string, DesignNode> = {};
    for (const nodeRow of nodeRows) {
      const raw = nodeRow as { id: string; data: unknown };
      nodes[raw.id] = raw.data as DesignNode;
    }
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

/**
 * 在调用方的事务里把整份文档落库（文档行 + 项目行那一份摘要列）。
 *
 * 从 `saveDocument` 里抽出来只为了一个理由：**写文档的实现必须只有一处**。§188 的公开 API 补丁
 * 需要"读—改—写在同一个事务里"，如果它自己再写一遍 `update projects set name=…`，这两处迟早漂开，
 * 漂开的那一半就是"文档改了但项目名还是旧的"这类账。
 */
export async function writeProjectDocument(tx: Tx, projectId: string, document: DesignDocument): Promise<void> {
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
}

export async function saveDocument(projectId: string, document: DesignDocument): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await writeProjectDocument(tx, projectId, document);
  });
  // §49 的 Documents 那一格：设计正文要能被检索，改一句就得换一块。
  // 必须放在事务**外面**：同步走的是 `getDb()` 那条独立连接，它在事务里写的 chunk
  // 不会跟着外层回滚——文档没存成而语料里已经是新句子，检索就会回答一份不存在的设计。
  // 只删/插 `design` 这一类，别动世界/角色/分镜那些（它们各自的写入方负责）。
  await syncDesignKnowledge(projectId, document);
}

export type PatchProjectOutcome =
  | { ok: true; document: DesignDocument }
  | { ok: false; code: 'not_found' }
  | { ok: false; code: 'ops_skipped'; skipped: { index: number; reason: string }[] }
  | { ok: false; code: 'document_rejected'; issues: string[] };

/**
 * #62② 自动保存的补丁路径：客户端发 §150 的 Command 补丁而不是整份文档。
 *
 * 与 `saveDocument`（整份替换、缺失即删）的分工：补丁是**合并**语义——锁内读到的
 * 最新版上逐条 apply，库里没被 op 提到的行一个字不动；整批补丁里任何一条 op 打空
 * （`skipped`，§159）就整批一条不写，调用方拿 409 去走全量兜底，不写半截。
 * 打完补丁的文档仍要过同一道 `parseDocument` 规模门，落库走同一个
 * `writeProjectDocument`（文档行 + 项目摘要列只有一处实现），语料同步与
 * `saveDocument` 同一条纪律：在事务外面、按打完补丁的整份文档重切。
 * 并发口径不变（ADR-0016）：先 `lockProjectWrites` 再读，最后完成的事务整体胜出。
 */
export async function patchProjectDocument(
  projectId: string,
  patches: readonly DesignPatch[],
): Promise<PatchProjectOutcome> {
  const db = getDb();
  const written = await db.transaction(async (tx) => {
    await lockProjectWrites(tx, projectId);
    const current = await loadDocument(projectId, tx);
    if (!current) return { kind: 'not_found' } as const;
    let document = current;
    const skipped: { index: number; reason: string }[] = [];
    for (const patch of patches) {
      const applied = applyPatch(document, patch);
      document = applied.document;
      skipped.push(...applied.skipped);
    }
    if (skipped.length) return { kind: 'ops_skipped', skipped } as const;
    const gate = parseDocument(document);
    if (!gate.ok) return { kind: 'rejected_by_gate', issues: gate.issues } as const;
    await writeProjectDocument(tx, projectId, gate.document);
    return { kind: 'ok', document: gate.document } as const;
  });
  if (written.kind === 'not_found') return { ok: false, code: 'not_found' };
  if (written.kind === 'ops_skipped') return { ok: false, code: 'ops_skipped', skipped: written.skipped };
  if (written.kind === 'rejected_by_gate') {
    return { ok: false, code: 'document_rejected', issues: written.issues };
  }
  await syncDesignKnowledge(projectId, written.document);
  return { ok: true, document: written.document };
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
  // 形状不对的 id 按"不存在"处理：eq(projects.id, …) 会撞 22P02 变 500（domain/ids.ts）。
  // v1 的 DELETE 直达这个函数（不像界面那条先过 projectBelongsTo），所以这道门必须落在域层。
  if (!isUuid(projectId)) return { ok: false, code: 'not_found' };
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
