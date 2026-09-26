import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/design-model';
import { parseDocument } from '../src/server/validation';
import { createProject, listProjects, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { designTokens, projects, users } from '../src/server/db/schema';

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

  /**
   * #40 的根因：`design_tokens` 以前没有一列记"文档里的顺序"，读回来是**没有 ORDER BY 的 SELECT**
   * 给的物理行序。后果有两层：设计系统面板里的 token 顺序会自己重排；
   * 更隐蔽的是 `documentsMatch` 对数组按序比，于是"内容没变"的分支切换会被判成有改动，
   * 每次切换多出一条"切到 X 前的现场"的噪音快照（那条偶发找了很久，因为它偶发在读取顺序上，不在比较逻辑上）。
   * 这里测的是修好之后的不变式：**顺序穿过一次存取不变**，而且存的不是字母序的巧合。
   */
  it('token 表的数组顺序穿过一次存取不变（§16：顺序也是模型的一部分）', async () => {
    const { id } = await newProject('Token Order');
    const first = await loadDocument(id);
    expect(first!.tokens.length).toBeGreaterThan(3);

    // 故意打乱成"既不是原序、也不是字母序"的一份：把最后一项挪到最前面
    const shuffled = [...first!.tokens];
    const moved = shuffled.pop()!;
    const wanted = [moved, ...shuffled].map((t) => t.key);
    // 前置条件：这份顺序不是字母序，否则下面"等于 wanted"可以被 sortIndex 全 0 的兜底蒙对
    expect(wanted).not.toEqual([...wanted].sort());

    await saveDocument(id, { ...first!, tokens: [moved, ...shuffled] });
    expect((await loadDocument(id))!.tokens.map((t) => t.key)).toEqual(wanted);
    // 再走一轮：第二次读取不能漂（这才是"没有 ORDER BY"那一条的反面——它漂不漂取决于行序）
    expect((await loadDocument(id))!.tokens.map((t) => t.key)).toEqual(wanted);

    // 反向对照：把**这个项目**那一列全抹成同一个值，读回来的顺序就再也不是文档那一份了。
    // 这一条证明测的是 sortIndex 在起作用，而不是"postgres 恰好按插入顺序返回"
    await getDb().update(designTokens).set({ sortIndex: 0 }).where(eq(designTokens.projectId, id));
    const degraded = (await loadDocument(id))!.tokens.map((t) => t.key);
    expect(degraded).not.toEqual(wanted);
    expect(degraded).toEqual([...wanted].sort());
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

  it('主题 mode 与 mode 名单存得下来（§12）', async () => {
    const { document, id } = await newProject('Theme Site');
    expect(document.activeMode).toBeNull();
    expect(document.metadata.modes).toEqual(['light', 'dark']);

    const extra = await loadDocument(id);
    extra!.metadata.modes = ['light', 'dark', 'high-contrast'];
    extra!.activeMode = 'high-contrast';
    await saveDocument(id, extra!);

    const loaded = await loadDocument(id);
    expect(loaded!.activeMode).toBe('high-contrast');
    expect(loaded!.metadata.modes).toEqual(['light', 'dark', 'high-contrast']);
    // 回到默认主题也要存得住，而不是"null 就等于没改"
    loaded!.activeMode = null;
    await saveDocument(id, loaded!);
    expect((await loadDocument(id))!.activeMode).toBeNull();
  });

  /**
   * §30/§174 的视觉语言与品牌包存在 projects 行的 jsonb 列里。saveDocument 一直会写，
   * loadDocument 曾经不读回来：编辑器内存里还在，刷新/服务端装配（§68）就看不到，
   * 于是"提取了 DNA 却按内置配色生成"。这条测的是闭环，不是配色算法。
   */
  it('视觉语言与品牌包存进去就读得回来（§30/§174/§68）', async () => {
    const { id } = await newProject('Dna Site');
    const doc = await loadDocument(id);
    doc!.visualDna = {
      source: { assetId: 'asset_x', method: 'pixel-stats', extractedAt: '2026-09-24T00:00:00.000Z', notes: ['只支持非隔行 8bit PNG'] },
      palette: [{ role: 'color.accent.brand', color: '#14b8a6' }],
      descriptors: ['高饱和', '冷色倾向'],
    };
    doc!.brandKit = { name: 'Nexus', tokenKeys: { color: ['color.background'], typography: [] }, toneOfVoice: ['克制'] };
    await saveDocument(id, doc!);

    const loaded = await loadDocument(id);
    expect(loaded!.visualDna?.descriptors).toEqual(['高饱和', '冷色倾向']);
    expect(loaded!.visualDna?.palette).toEqual([{ role: 'color.accent.brand', color: '#14b8a6' }]);
    expect(loaded!.visualDna?.source?.method).toBe('pixel-stats');
    expect(loaded!.brandKit?.name).toBe('Nexus');

    // 撤销 DNA 后不能"删不掉"：写回 null 必须让下一份读到的文档也没有
    delete loaded!.visualDna;
    delete loaded!.brandKit;
    await saveDocument(id, loaded!);
    const cleared = await loadDocument(id);
    expect(cleared!.visualDna).toBeUndefined();
    expect(cleared!.brandKit).toBeUndefined();
  });

  it('metadata.createdAt 是项目真正被创建的时间，不是每次读到的"现在"', async () => {
    const { document, id } = await newProject('Timestamped');
    const first = await loadDocument(id);
    const before = Date.now();
    const second = await loadDocument(id);
    expect(second!.metadata.createdAt).toBe(first!.metadata.createdAt);
    expect(Date.parse(second!.metadata.createdAt)).toBeLessThanOrEqual(before);
    expect(Date.parse(document.metadata.createdAt)).toBeLessThanOrEqual(before);
  });

  /**
   * 单条 INSERT 的参数上限是 65,535，节点行 9 个参数 → 不切块时一个页面超过约 7,281 个节点
   * 就**整体存不下去**（MAX_PARAMETERS_EXCEEDED）。§146 的规模目标正是 10,000 节点，
   * 而模型层的基准只测内存里的文档，所以这条断链一直没人碰到。
   */
  it('一个页面 8,000 个节点仍然存得下来也读得回来（§146 规模）', async () => {
    const { document, id } = await newProject('Scale Page');
    const page = document.pages[0]!;
    const existing = Object.keys(page.nodes).length;
    let prev = page.rootId;
    const ids: string[] = [];
    for (let i = 0; i < 8000; i += 1) {
      const node = createNode({ type: 'text', name: `t${i}` });
      node.parentId = prev;
      page.nodes[node.id] = node;
      ids.push(node.id);
      if (i % 50 === 0) prev = node.id;
    }
    await saveDocument(id, document);

    const loaded = await loadDocument(id);
    const nodes = loaded!.pages[0]!.nodes;
    expect(Object.keys(nodes)).toHaveLength(existing + 8000);
    // 切块插入不能改变行的内容，也不能丢掉最后一条父子关系
    expect(nodes[ids[7999]!]?.name).toBe('t7999');
    expect(nodes[ids[7999]!]?.parentId).toBeTruthy();
  }, 120_000);

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

/**
 * 写路径的门：字段不全的节点不能进库。
 * 之前它能写进去并且读得出来，然后健康度与排版在 Object.entries(undefined) 上抛，
 * 用户看到的是整页白屏（1000 节点压测撞出来的，见 docs/PERFORMANCE.md）。
 * 测的是 parseDocument —— `/api/projects/[id]` 的 PUT 就是拿它当门，
 * 门在这里挡住的，路由一定也挡住。
 */
describe('PUT 文档时的结构门（§146 的白屏回归）', () => {
  it('缺 style.cornerRadius / layout.padding 的节点被挡下，并说清是哪个节点', async () => {
    const id = (await createProject(ownerId, { name: '残缺节点写入', kind: 'website' })).id;
    const document = (await loadDocument(id))!;
    const page = document.pages[0]!;
    const root = page.nodes[page.rootId]!;
    page.nodes.perf_bad = {
      id: 'perf_bad',
      type: 'text',
      name: '残缺',
      parentId: root.id,
      children: [],
      position: { x: 0, y: 0 },
      size: { width: 200, height: 24 },
      style: { fills: [] },
      layout: { mode: 'none' },
      visible: true,
      locked: false,
      text: '压测',
    } as never;
    root.children.push('perf_bad');

    const parsed = parseDocument(document);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error('本该被挡下');
    const joined = parsed.issues.join('；');
    expect(joined).toContain('incomplete-node-style');
    expect(joined).toContain('incomplete-node-layout');
    expect(joined).toContain('残缺');

    // 门后面没有别的路：走同一道门的 saveDocument 也不该被调用到
    expect((await loadDocument(id))!.pages[0]!.nodes.perf_bad).toBeUndefined();
  });

  it('完整节点照常写得进去（门不能把正常文档也挡住）', async () => {
    const id = (await createProject(ownerId, { name: '正常写入', kind: 'website' })).id;
    const document = (await loadDocument(id))!;
    const page = document.pages[0]!;
    const root = page.nodes[page.rootId]!;
    const good = createNode({ type: 'text', name: '正常', text: 'hi', parentId: root.id });
    page.nodes[good.id] = good;
    root.children.push(good.id);
    expect(parseDocument(document).ok).toBe(true);
    await saveDocument(id, document);
    expect((await loadDocument(id))!.pages[0]!.nodes[good.id]).toBeTruthy();
  });
});
