import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq, inArray } from 'drizzle-orm';
import { createNode, createPage } from '@nexus/design-model';
import type { DesignDocument, DesignNode } from '@nexus/design-model';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { designNodes, pages, projects, users } from '../src/server/db/schema';

/**
 * §147 的上半截：`writeDocument` 以前是「整删重插」，一次保存要重写整份文档（10000 节点 583-763ms）。
 * 现在它是增量的：先在同一事务里读回当前那几行，再只对变化的行发 SQL。
 *
 * 这一节钉的不是「快了」，而是「变快了但语义没变」。增量保存最容易在这三处悄悄改语义，逐条都有变异写法：
 *  ① 少比一列（`data`）→ 用户改的文字 / 样式存不进去（探针：把 `stableKey(a.data) === stableKey(b.data)` 去掉 → 第 1 条红）；
 *  ② 只增改、不删 → 删掉的节点在库里永生（探针：把 nodeDiff.removed 那段删掉 → 第 2、3 条红）；
 *  ③ 换页走 UPDATE → 主键是 (page_id, id)，一行都匹配不到，节点留在旧页（探针：把 movedNodes 归进更新 → 第 4 条红）。
 * 另外两条钉「增量」本身：改一个节点只该写一行，没改动的保存一行都不该写。
 */

let owner: string;

function findNode(document: DesignDocument, name: string): { pageId: string; node: DesignNode } | null {
  for (const page of document.pages) {
    const node = Object.values(page.nodes).find((candidate) => candidate.name === name);
    if (node) return { pageId: page.id, node };
  }
  return null;
}

function attachText(document: DesignDocument, pageId: string, name: string, text: string): DesignNode {
  const page = document.pages.find((candidate) => candidate.id === pageId)!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name, text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children = [...root.children, node.id];
  return node;
}

async function nodeRows(projectId: string) {
  const pageRows = await getDb()
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.projectId, projectId));
  const ids = pageRows.map((page) => page.id);
  if (!ids.length) return [];
  return getDb()
    .select({ id: designNodes.id, pageId: designNodes.pageId, updatedAt: designNodes.updatedAt })
    .from(designNodes)
    .where(inArray(designNodes.pageId, ids))
    .orderBy(asc(designNodes.id));
}

async function nodeStamps(projectId: string): Promise<Map<string, string>> {
  const rows = await nodeRows(projectId);
  return new Map(rows.map((row) => [row.id, row.updatedAt.toISOString()]));
}

beforeAll(async () => {
  const rows = await getDb()
    .insert(users)
    .values([{ displayName: 'Incremental Save Probe', email: `inc+${Date.now()}@nexus.test` }])
    .returning({ id: users.id });
  owner = rows[0]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

describe('增量保存：只写变化的行，语义仍是整份替换', () => {
  it('改一个节点的 data（文字）会落库，不是只比结构列', async () => {
    const project = await createProject(owner, { name: 'Incremental Text', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    attachText(created, created.pages[0]!.id, 'Headline', 'before');
    await saveDocument(project.id, created);

    const edited = (await loadDocument(project.id))!;
    findNode(edited, 'Headline')!.node.text = 'after';
    await saveDocument(project.id, edited);

    const reloaded = (await loadDocument(project.id))!;
    expect(findNode(reloaded, 'Headline')!.node.text).toBe('after');
  });

  it('删掉的节点真的从库里消失（缺失即删，不是只增改）', async () => {
    const project = await createProject(owner, { name: 'Incremental Delete', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const doomed = attachText(created, created.pages[0]!.id, 'Doomed', 'gone soon');
    await saveDocument(project.id, created);
    expect((await nodeRows(project.id)).some((row) => row.id === doomed.id)).toBe(true);

    const trimmed = (await loadDocument(project.id))!;
    const target = findNode(trimmed, 'Doomed')!;
    const page = trimmed.pages.find((candidate) => candidate.id === target.pageId)!;
    delete page.nodes[target.node.id];
    const root = page.nodes[page.rootId]!;
    root.children = root.children.filter((id) => id !== target.node.id);
    await saveDocument(project.id, trimmed);

    const reloaded = (await loadDocument(project.id))!;
    expect(findNode(reloaded, 'Doomed')).toBeNull();
    expect((await nodeRows(project.id)).some((row) => row.id === doomed.id)).toBe(false);
  });

  it('删一整页：页面和它下面的节点一起消失', async () => {
    const project = await createProject(owner, { name: 'Incremental Page Drop', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const second = createPage('Second');
    created.pages.push(second);
    const doomed = attachText(created, second.id, 'On Second', 'x');
    await saveDocument(project.id, created);

    const trimmed = (await loadDocument(project.id))!;
    expect(trimmed.pages).toHaveLength(2);
    await saveDocument(project.id, { ...trimmed, pages: trimmed.pages.filter((page) => page.id !== second.id) });

    const reloaded = (await loadDocument(project.id))!;
    expect(reloaded.pages.map((page) => page.id)).not.toContain(second.id);
    expect((await nodeRows(project.id)).some((row) => row.id === doomed.id)).toBe(false);
  });

  it('节点换页：库里只剩新页上那一行，旧页没有半截', async () => {
    const project = await createProject(owner, { name: 'Incremental Move', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const home = created.pages[0]!;
    const traveler = attachText(created, home.id, 'Traveler', 'moved');
    const second = createPage('Second');
    created.pages.push(second);
    await saveDocument(project.id, created);

    const edited = (await loadDocument(project.id))!;
    const from = edited.pages.find((page) => page.id === home.id)!;
    const to = edited.pages.find((page) => page.id === second.id)!;
    const node = from.nodes[traveler.id]!;
    delete from.nodes[traveler.id];
    from.nodes[from.rootId]!.children = from.nodes[from.rootId]!.children.filter((id) => id !== traveler.id);
    node.parentId = to.rootId;
    to.nodes[traveler.id] = node;
    to.nodes[to.rootId]!.children = [...to.nodes[to.rootId]!.children, traveler.id];
    await saveDocument(project.id, edited);

    const reloaded = (await loadDocument(project.id))!;
    expect(findNode(reloaded, 'Traveler')?.pageId).toBe(second.id);
    const rows = (await nodeRows(project.id)).filter((row) => row.id === traveler.id);
    expect(rows.map((row) => row.pageId)).toEqual([second.id]);
  });

  it('改一个令牌的值会落库', async () => {
    const project = await createProject(owner, { name: 'Incremental Token', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    await saveDocument(project.id, created);

    const edited = (await loadDocument(project.id))!;
    const key = edited.tokens[0]!.key;
    edited.tokens[0]!.value = '#010203';
    await saveDocument(project.id, edited);

    const reloaded = (await loadDocument(project.id))!;
    expect(reloaded.tokens.find((token) => token.key === key)!.value).toBe('#010203');
  });

  it('只改一个节点，只有那一行被写（其余行的 updated_at 一动不动）', async () => {
    const project = await createProject(owner, { name: 'Incremental Rows', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const pageId = created.pages[0]!.id;
    for (let i = 0; i < 40; i += 1) attachText(created, pageId, `Row ${i}`, `value ${i}`);
    await saveDocument(project.id, created);

    const before = await nodeStamps(project.id);
    const edited = (await loadDocument(project.id))!;
    findNode(edited, 'Row 7')!.node.text = 'changed';
    await saveDocument(project.id, edited);
    const after = await nodeStamps(project.id);

    const target = findNode(edited, 'Row 7')!.node.id;
    const written = [...after].filter(([id, stamp]) => before.get(id) !== stamp).map(([id]) => id);
    expect(written, `这次保存写了 ${written.length} 行：${written.join(', ')}`).toEqual([target]);
  });

  it('保存一份没有改动的文档：一行都不写', async () => {
    const project = await createProject(owner, { name: 'Incremental Noop', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    attachText(created, created.pages[0]!.id, 'Steady', 'same');
    await saveDocument(project.id, created);

    const before = await nodeStamps(project.id);
    await saveDocument(project.id, (await loadDocument(project.id))!);
    const after = await nodeStamps(project.id);

    expect([...after].filter(([id, stamp]) => before.get(id) !== stamp)).toEqual([]);
  });
  it('删掉一页、同时把该页的一个节点搬到留下的页上：节点要留在新页，不能整个消失', async () => {
    const project = await createProject(owner, { name: 'Incremental Drop + Move', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const home = created.pages[0]!;
    const second = createPage('Second');
    created.pages.push(second);
    const survivor = attachText(created, second.id, 'Survivor', 'still here');
    await saveDocument(project.id, created);

    const edited = (await loadDocument(project.id))!;
    const from = edited.pages.find((page) => page.id === second.id)!;
    const to = edited.pages.find((page) => page.id === home.id)!;
    const node = from.nodes[survivor.id]!;
    delete from.nodes[survivor.id];
    from.nodes[from.rootId]!.children = from.nodes[from.rootId]!.children.filter((id) => id !== survivor.id);
    node.parentId = to.rootId;
    to.nodes[survivor.id] = node;
    to.nodes[to.rootId]!.children = [...to.nodes[to.rootId]!.children, survivor.id];
    // 同一份文档里：删掉第二页，同时把它的节点搬到首页。旧行随页面级联删掉了，
    // 若还把它的 id 当成「库里已经有了」，这个节点既不插也不改，就整个没了。
    await saveDocument(project.id, { ...edited, pages: edited.pages.filter((page) => page.id !== second.id) });

    const reloaded = (await loadDocument(project.id))!;
    const found = findNode(reloaded, 'Survivor');
    expect(found?.pageId).toBe(home.id);
    expect(found?.node.text).toBe('still here');
    const rows = (await nodeRows(project.id)).filter((row) => row.id === survivor.id);
    expect(rows.map((row) => row.pageId)).toEqual([home.id]);
  });

  it('删掉一页、同时把该页的节点搬到新建的页上：节点跟着新页一起落库', async () => {
    const project = await createProject(owner, { name: 'Incremental Drop + New Page', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const second = createPage('Second');
    created.pages.push(second);
    const survivor = attachText(created, second.id, 'Survivor', 'moved over');
    await saveDocument(project.id, created);

    const edited = (await loadDocument(project.id))!;
    const from = edited.pages.find((page) => page.id === second.id)!;
    const node = from.nodes[survivor.id]!;
    delete from.nodes[survivor.id];
    from.nodes[from.rootId]!.children = [];
    const third = createPage('Third');
    edited.pages.push(third);
    node.parentId = third.rootId;
    third.nodes[survivor.id] = node;
    third.nodes[third.rootId]!.children = [survivor.id];
    await saveDocument(project.id, { ...edited, pages: edited.pages.filter((page) => page.id !== second.id) });

    const reloaded = (await loadDocument(project.id))!;
    expect(findNode(reloaded, 'Survivor')?.pageId).toBe(third.id);
    const rows = (await nodeRows(project.id)).filter((row) => row.id === survivor.id);
    expect(rows.map((row) => row.pageId)).toEqual([third.id]);
  });

});
