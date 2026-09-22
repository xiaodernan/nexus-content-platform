import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  clone,
  createDocument,
  createPage,
  type ComponentDefinition,
  type DesignDocument,
  type DesignNode,
  type Page,
  type ProjectType,
  type Token,
} from '@nexus/design-model';
import { getDb } from '../db/client';
import { branches, components, designNodes, designTokens, pages, projects, snapshots } from '../db/schema';

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
      .values({ ownerId, slug, name: input.name, kind: input.kind, activePageId: document.activePageId })
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
  return (await loadDocument(projectId)) ?? document;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

async function writeDocument(tx: Tx, projectId: string, document: DesignDocument): Promise<void> {
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

  for (const token of document.tokens) {
    await tx.insert(designTokens).values({
      projectId,
      key: token.key,
      type: token.type,
      value: token.value as unknown as Record<string, unknown>,
      modes: token.modes ?? null,
      description: token.description ?? null,
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
  if (rows.length) await tx.insert(designNodes).values(rows);
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

export async function loadDocument(projectId: string): Promise<DesignDocument | null> {
  const db = getDb();
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
  if (!project) return null;

  const pageRows = await db.select().from(pages).where(eq(pages.projectId, projectId)).orderBy(pages.sortIndex);
  const tokenRows = await db.select().from(designTokens).where(eq(designTokens.projectId, projectId));
  const componentRows = await db.select().from(components).where(eq(components.projectId, projectId));

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

  const rebuilt: Page[] = [];
  for (const row of pageRows) {
    const nodeRows = await db.select().from(designNodes).where(eq(designNodes.pageId, row.id));
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
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  });
}

export interface ProjectSummary {
  id: string;
  name: string;
  kind: string;
  slug: string;
  visibility: string;
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
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(eq(projects.ownerId, ownerId), isNull(projects.deletedAt)))
    .orderBy(projects.updatedAt);
  return rows.map((r) => ({ ...r, visibility: r.visibility as string, updatedAt: r.updatedAt.toISOString() }));
}
