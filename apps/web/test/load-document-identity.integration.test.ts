import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createNode } from '@nexus/design-model';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * `loadDocument` 读 `design_nodes` 那一段的**红线**（2026-10-21）。
 *
 * 那一读改成**绕开 drizzle 的行映射**：载荷整份在 `data` 那一列里（jsonb），
 * drizzle 那一层映射（每行一个 JS 对象 + 列名与类型转换）对它纯属白做——
 * 量过：同样 10000 行，那一层多花 **0.6~1.0 秒**（首屏那约 1.3 秒的大头就在这儿）。
 *
 * **省时间不许改内容** —— 这条测试就是那根线：
 * 读回来的文档必须与**库里的原始行逐项相等**（内容、键集合、顺序）。
 * 只比"能读出来"不够：内容悄悄少一个字段、顺序悄悄变了，用户看到的是画布上少东西/串行，
 * 而所有"读成功"的断言都还是绿的。
 */
let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [user] = await db
    .insert(users)
    .values({ displayName: 'LoadDoc Tester', email: `it+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = user!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

describe('loadDocument 读节点：内容必须与库里的原始行逐项相等（红线）', () => {
  it('读回来的每个节点都与原始行相等，键集合与顺序也不变', async () => {
    const db = getDb();
    const document = await createProject(ownerId, { name: 'Raw Read Site', kind: 'website' });
    const page = document.pages[0]!;

    // 形状各不相同的几个节点：文本、按钮、嵌套容器、带 token 引用的间距、带填充的图片节点
    const hero = createNode({ type: 'section', name: 'Hero', parentId: page.rootId, size: { width: 'fill', height: 420 } });
    const title = createNode({ type: 'text', name: 'Title', parentId: hero.id, text: '一句话标题' });
    const cta = createNode({ type: 'button', name: 'CTA', parentId: hero.id, text: '开始' });
    const nested = createNode({ type: 'frame', name: 'Nested', parentId: hero.id, size: { width: 200, height: 80 } });
    const deep = createNode({ type: 'text', name: 'Deep', parentId: nested.id, text: '深处的字' });
    const pic = createNode({ type: 'image', name: 'Pic', parentId: page.rootId });
    pic.style = { ...pic.style, fills: [{ kind: 'image', assetId: 'asset-1' }] };
    nested.layout = { ...nested.layout, padding: { top: '{space.3}', right: 0, bottom: 0, left: 0 } };
    for (const node of [hero, title, cta, nested, deep, pic]) page.nodes[node.id] = node;
    hero.children = [title.id, cta.id, nested.id];
    nested.children = [deep.id];
    page.nodes[page.rootId]!.children = [hero.id, pic.id];

    await saveDocument(document.id, document);
    const loaded = (await loadDocument(document.id))!;
    const loadedPage = loaded.pages[0]!;

    // 库里的原始行（**不走** loadDocument 的那条读法，所以这是独立的另一份真相）
    const rawRows = (await db.execute(
      rawSql`SELECT id, data FROM design_nodes WHERE page_id = ${loadedPage.id} ORDER BY id`,
    )) as unknown as Array<{ id: string; data: unknown }>;

    expect(rawRows.length, '原始行数与读回来的节点数对不上').toBe(Object.keys(loadedPage.nodes).length);
    expect(Object.keys(loadedPage.nodes).sort(), '键集合变了').toEqual(rawRows.map((r) => r.id).sort());

    // 逐项相等：内容一个字段都不许差
    for (const row of rawRows) {
      expect(loadedPage.nodes[row.id], `节点 ${row.id} 的内容与原始行不等`).toEqual(row.data);
    }

    // 顺序也是模型的一部分（#40）：根节点的孩子表与库里那份一致
    const rootRaw = rawRows.find((r) => r.id === loadedPage.rootId)!;
    expect(loadedPage.nodes[loadedPage.rootId]!.children).toEqual((rootRaw.data as { children: string[] }).children);
    // 嵌套那层也不能少
    const heroRaw = rawRows.find((r) => r.id === hero.id)!;
    expect(loadedPage.nodes[hero.id]!.children).toEqual((heroRaw.data as { children: string[] }).children);
    // 带 token 引用的间距要原样回来（不是解析后的数）
    expect(loadedPage.nodes[nested.id]!.layout.padding.top).toBe('{space.3}');
  });

  it('读两次得到的内容一致（那条读法是确定的，不是碰巧）', async () => {
    const document = await createProject(ownerId, { name: 'Twice Site', kind: 'website' });
    const first = (await loadDocument(document.id))!;
    const second = (await loadDocument(document.id))!;
    expect(Object.keys(second.pages[0]!.nodes).sort()).toEqual(Object.keys(first.pages[0]!.nodes).sort());
    expect(second.pages[0]!.nodes[second.pages[0]!.rootId]).toEqual(first.pages[0]!.nodes[first.pages[0]!.rootId]);
  });
});
