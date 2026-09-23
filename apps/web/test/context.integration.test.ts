import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { ProjectContextSchema } from '@nexus/schemas';
import { buildDesignIndex, createNode } from '@nexus/design-model';
import { createWorld } from '@nexus/world-model';
import { buildProjectContext } from '../src/server/domain/context';
import { addMemory } from '../src/server/domain/memories';
import { createProjectCharacter } from '../src/server/domain/characters';
import { saveWorld } from '../src/server/domain/worlds';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users, worlds } from '../src/server/db/schema';

/**
 * §67 Context Engine 的服务端装配，打真实 Postgres：世界/角色/记忆/语料分别住在不同表里，
 * 拼不出真数值的装配在这里就没有意义。
 */

let owner: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [row] = await db
    .insert(users)
    .values({ displayName: 'Context Owner', email: `ctx+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = row!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(owner, { name, kind: 'website' })).id;
}

describe('buildProjectContext（§66-71 一次装配）', () => {
  it('新项目也能装配出目录：设计与代码两个分支都索引到位', async () => {
    const id = await newProject('Ctx Bare');
    const result = await buildProjectContext(id, owner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const context = result.context;

    expect(ProjectContextSchema.safeParse(context).success).toBe(true);
    expect(context.design.totals.pages).toBe(1);
    expect(context.design.totals.nodes).toBeGreaterThan(3);
    expect(context.sizes.indexChars).toBeLessThan(context.sizes.fullDocumentChars);

    const byName = Object.fromEntries(context.branches.map((b) => [b.name, b]));
    expect(byName.Design?.status).toBe('indexed');
    // §69 落地后这一支不再是 not-indexed；note 里给的是真数出来的文件与符号数
    expect(byName.Code?.status).toBe('indexed');
    expect(byName.Code?.note).toContain('§69');
    expect(byName.Code?.note).toMatch(/\d+ 个文件、\d+ 个符号/);
    expect(context.branches).toHaveLength(7);
    // §66 的清单里选不中的那几项必须显式交代，不然面板只能沉默
    expect(context.unavailable.join(' ')).toContain('选中');
    // 代码正文没有通道，这句得写在明面上，别让"有 Code Index"被读成"代码都能拿到了"
    expect(context.unavailable.join(' ')).toContain('代码正文');
  });

  it('代码目录说的是真话：中文页面名、code-only 区域与解析失败各自有位置（§69）', async () => {
    const id = await newProject('Ctx Code');
    const document = (await loadDocument(id))!;
    const page = document.pages[0]!;
    page.name = '结算页';
    const root = page.nodes[page.rootId]!;
    const region = createNode({ type: 'code', name: '优惠券倒计时', parentId: root.id });
    region.code = { language: 'tsx', readOnly: false, content: 'export function CouponCountdown() {\n  return <b>10</b>;\n}\n' };
    page.nodes[region.id] = region;
    root.children.push(region.id);
    await saveDocument(id, document);

    const result = await buildProjectContext(id, owner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const code = result.context.code;

    expect(result.context.sizes.codeIndexChars).toBeGreaterThan(0);
    expect(code.totals.pageFiles).toBe(1);
    expect(code.totals.nodeRegionFiles).toBe(1);
    const pageFile = code.files.find((file) => file.origin.kind === 'page');
    // 中文页面名进不了文件名（pascalCase 只留 ASCII），所以归属必须由 origin 带
    expect(pageFile?.path).toBe('components/nexus/Page1.tsx');
    expect(pageFile?.origin.kind === 'page' && pageFile.origin.pageName).toBe('结算页');
    expect(pageFile?.symbols.map((symbol) => symbol.name)).toEqual(['Page1']);
    expect(pageFile?.symbols[0]?.kind).toBe('component');

    const regionFile = code.files.find((file) => file.origin.kind === 'node-region');
    expect(regionFile?.symbols.map((symbol) => symbol.name)).toEqual(['CouponCountdown']);
    expect(regionFile?.symbols[0]?.kind).toBe('component');
    expect(regionFile?.syntaxErrors).toBe(0);
    // 目录是完整的：没有解析失败也没有被预算裁掉，才允许分支写 indexed
    expect(code.totals.unreadableFiles).toBe(0);
    expect(code.dropped).toBeUndefined();
    expect(code.omissions.length).toBeGreaterThan(0);
  });

  it('世界、角色、记忆各自进来后计数都对得上；空世界与满世界不是一回事', async () => {
    const id = await newProject('Ctx Full');
    const skeleton = createWorld('灰塔诸领', id);
    const filled = {
      ...skeleton,
      summary: '塔里的王不说话。',
      nodes: skeleton.nodes.map((node) =>
        node.kind === 'lore' ? { ...node, title: '灰塔', body: '塔在盐海北岸立了三百年。' } : node,
      ),
    };
    expect((await saveWorld(id, owner, filled)).ok).toBe(true);
    const character = await createProjectCharacter(id, owner, { name: '守塔人' });
    expect(character.ok).toBe(true);
    expect(await addMemory({ ownerId: owner, projectId: id, scope: 'world', subjectId: `world:${filled.id}`, content: '盐海的水位每年降一寸。' })).toBeTruthy();

    const before = await buildProjectContext(id, owner);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const context = before.context;

    expect(context.world.present).toBe(true);
    expect(context.world.name).toBe('灰塔诸领');
    expect(context.world.kinds.find((k) => k.kind === 'lore')?.count).toBe(1);
    expect(context.characters.count).toBe(1);
    expect(context.characters.items[0]?.name).toBe('守塔人');
    expect(context.memory.total).toBe(1);
    expect(context.memory.scopes.find((s) => s.scope === 'world')?.count).toBe(1);
    // 存世界会自动建语料（§49），装配只是把它读出来，不顺手重建
    expect(context.knowledge.chunks).toBeGreaterThan(0);
    expect(context.knowledge.vectorAvailable).toBe(false);
    expect(context.publishing.published).toBe(false);
    expect(context.recentChanges.length).toBeGreaterThan(0);
  });

  it('库里的世界读不出来时：原因进报文，装配不整体失败也不假装没有世界', async () => {
    const id = await newProject('Ctx Broken World');
    const world = createWorld('坏掉的世界', id);
    expect((await saveWorld(id, owner, world)).ok).toBe(true);
    const db = getDb();
    await db
      .update(worlds)
      .set({ document: { id: world.id, projectId: id, name: 42 } })
      .where(eq(worlds.projectId, id));

    const result = await buildProjectContext(id, owner);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.world.present).toBe(false);
    expect(result.context.world.reason ?? '').toContain('契约');
    // 一个域读不出来不该连带把设计目录也弄没
    expect(result.context.design.totals.pages).toBe(1);
  });

  it('预算压过分米时：totals 仍是未裁的那份，被裁的东西逐条交代', async () => {
    const id = await newProject('Ctx Budget');
    const document = await loadDocument(id);
    expect(document).not.toBeNull();
    const page = document!.pages[0]!;
    const root = page.nodes[page.rootId]!;
    for (let i = 0; i < 160; i += 1) {
      const node = createNode({
        type: 'text',
        name: `Pad ${i}`,
        parentId: root.id,
        text: `第 ${i} 段占位正文，够长才能把目录撑过预算`,
      });
      page.nodes[node.id] = node;
      root.children.push(node.id);
    }
    await saveDocument(id, document!);
    const reloaded = await loadDocument(id);
    expect(reloaded).not.toBeNull();
    const unbudgeted = buildDesignIndex(reloaded!);
    expect(unbudgeted.totals.nodes).toBeGreaterThan(160);

    const result = await buildProjectContext(id, owner, { maxIndexChars: 800 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const context = result.context;
    expect(context.sizes.budgetChars).toBe(800);
    expect(context.design.totals.nodes).toBe(unbudgeted.totals.nodes);
    expect(context.design.edges.length).toBeLessThan(unbudgeted.edges.length);
    expect(context.design.dropped).toBeTruthy();
    expect((context.design.trimmed ?? []).join(' ')).toContain('文字预览');
    // 页面清单是骨架：任何预算都不该少页
    expect(context.design.pages.map((p) => p.id)).toEqual(unbudgeted.pages.map((p) => p.id));
  });

  it('读不出设计文档（已删除）的项目：装配如实拒绝，不返回一份空目录充数', async () => {
    const id = await newProject('Ctx Deleted');
    const db = getDb();
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, id));
    const result = await buildProjectContext(id, owner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('设计文档');
  });
});
