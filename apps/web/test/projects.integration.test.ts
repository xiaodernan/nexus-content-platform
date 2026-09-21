import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/design-model';
import { createProject, listProjects, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * 集成测试打真实 Postgres 容器（docs/TESTING.md：禁止 mock 数据库）。
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
    .values({ displayName: 'Integration Tester', email: `it+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = user!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

/** createProject 返回的就是从库里读回来的文档，其 id 即项目 id */
async function newProject(name: string) {
  const document = await createProject(ownerId, { name, kind: 'website' });
  created.push(document.id);
  return { document, id: document.id };
}

describe('项目领域层（真实数据库）', () => {
  it('创建项目后可以原样读回设计文档，且 id 稳定', async () => {
    const { document, id } = await newProject('Roundtrip Site');
    expect(document.pages).toHaveLength(1);
    expect(document.id).toBe(id);

    const first = await loadDocument(id);
    const second = await loadDocument(id);
    expect(first).not.toBeNull();
    expect(first!.name).toBe('Roundtrip Site');
    expect(first!.id).toBe(id);
    expect(first!.tokens.length).toBeGreaterThan(0);
    expect(first!.activePageId).toBe(first!.pages[0]!.id);
    // 页面/节点 id 必须逐字保留：模型即真值，库里不得二次发号（§9）
    expect(second!.pages[0]!.id).toBe(first!.pages[0]!.id);
    expect(Object.keys(second!.pages[0]!.nodes).sort()).toEqual(Object.keys(first!.pages[0]!.nodes).sort());
    expect(first!.pages[0]!.nodes[first!.pages[0]!.rootId]!.type).toBe('frame');
  });

  it('保存后的节点改动在重新读取时仍然存在（§15-16 真值回写）', async () => {
    const { document, id } = await newProject('Edit Site');
    const page = document.pages[0]!;
    const hero = createNode({ type: 'section', name: 'Hero', parentId: page.rootId, size: { width: 'fill', height: 420 } });
    page.nodes[hero.id] = hero;
    page.nodes[page.rootId]!.children = [hero.id];

    await saveDocument(id, document);
    const loaded = await loadDocument(id);
    const pageAfter = findPage(loaded!)!;
    expect(pageAfter.nodes[hero.id]!.size.height).toBe(420);
    expect(pageAfter.nodes[pageAfter.rootId]!.children).toContain(hero.id);
  });

  it('保存一个项目不会动到另一个项目的节点', async () => {
    const a = await newProject('Isolation A');
    const b = await newProject('Isolation B');
    const pageA = a.document.pages[0]!;
    const nodeA = createNode({ type: 'text', name: 'OnlyInA', text: 'A', parentId: pageA.rootId });
    pageA.nodes[nodeA.id] = nodeA;
    pageA.nodes[pageA.rootId]!.children = [nodeA.id];
    await saveDocument(a.id, a.document);

    const reloadedB = await loadDocument(b.id);
    const namesB = Object.values(reloadedB!.pages[0]!.nodes).map((n) => n.name);
    expect(namesB).not.toContain('OnlyInA');
    expect(Object.keys(reloadedB!.pages[0]!.nodes).length).toBeGreaterThan(0);
  });

  it('同一作者下重名项目会得到不同 slug', async () => {
    const first = await newProject('Duplicate Name');
    const second = await newProject('Duplicate Name');
    expect(second.id).not.toBe(first.id);
    const list = await listProjects(ownerId);
    const slugs = list.filter((p) => p.name === 'Duplicate Name').map((p) => p.slug);
    expect(slugs).toHaveLength(2);
    expect(new Set(slugs).size).toBe(2);
  });
});
