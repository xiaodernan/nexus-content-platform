import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import {
  createNode,
  findPage,
  validateDocument,
  type DesignDocument,
  type Page,
} from '@nexus/design-model';
import { currentBranchId, listBranches, switchBranch } from '../src/server/domain/branches';
import { listSnapshots } from '../src/server/domain/snapshots';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { generateVariants, listVariants, mergeVariants } from '../src/server/domain/variants';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §29 多方案。打真实 Postgres：候选方案要落成"一条分支 + 一份 head 快照"，
 * 而最关键的一条是**生成不能动工作区**——用户点"生成 4 个方案"不是"把我现在的稿子换掉"。
 */

let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [user] = await db
    .insert(users)
    .values({ displayName: 'Variant Tester', email: `variant+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = user!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function newProject(name: string): Promise<string> {
  const document = await createProject(ownerId, { name, kind: 'website' });
  return document.id;
}

/** 首页文案的形状：方案之间必须在这儿分出可见的差别（含排布与对齐，不然"居中开场"看不出来） */
const shapeOf = (page: Page) =>
  Object.values(page.nodes)
    .map(
      (n) =>
        `${n.name}|${n.type}|${n.layout.mode}|${n.layout.items}|${n.layout.justify}|${JSON.stringify(
          n.layout.padding,
        )}|${n.typography?.align ?? ''}|${n.text ?? ''}`,
    )
    .sort()
    .join('\n');

const activeShape = (document: DesignDocument) =>
  shapeOf(findPage(document, document.activePageId) ?? document.pages[0]!);

const tokenKeys = (document: DesignDocument) =>
  document.tokens.map((t) => `${t.key}=${JSON.stringify(t.value)}`).sort().join(';');

async function addMarker(projectId: string, text: string): Promise<void> {
  const document = await loadDocument(projectId);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: text, text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(projectId, document!);
}

describe('多方案生成与合成（真实数据库）', () => {
  it('生成四条方案：各成一条分支，工作区与当前分支都不动', async () => {
    const id = await newProject('Variants Generate');
    const before = await loadDocument(id);
    const snapshotsBefore = await listSnapshots(id);
    const mainBefore = await currentBranchId(id);

    const result = await generateVariants(id, { count: 4, createdById: ownerId });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value).toHaveLength(4);
    expect(result.notes).toEqual([]);

    // 工作区一个字都没变
    expect(await loadDocument(id)).toEqual(before);
    expect(await currentBranchId(id)).toBe(mainBefore);
    // 历史列表里多了四条"生成方案 X"，都挂在自己的分支上
    const snapshots = await listSnapshots(id);
    expect(snapshots.length - snapshotsBefore.length).toBe(4);
    expect(snapshots.filter((s) => s.label?.startsWith('生成方案')).map((s) => s.label).sort()).toEqual([
      '生成方案 A（居中开场 · 编辑部 · 纸面）',
      '生成方案 B（左右分栏 · 影院 · 暗色）',
      '生成方案 C（三卡并列 · 赛博 · 霓虹）',
      '生成方案 D（导航开场 · 暖阳 · 圆润）',
    ]);

    const names = (await listBranches(id)).map((b) => b.name);
    expect(names.sort()).toEqual(['concept-a', 'concept-b', 'concept-c', 'concept-d', 'main']);

    // 四条方案彼此不同、且都与源文档不同；每条都还是合法文档
    const shapes = new Set<string>();
    const tokens = new Set<string>();
    for (const variant of result.value) {
      expect(activeShape(variant.document)).not.toBe(activeShape(before!));
      expect(validateDocument(variant.document).filter((i) => i.severity === 'error')).toEqual([]);
      shapes.add(activeShape(variant.document));
      tokens.add(tokenKeys(variant.document));
    }
    expect(shapes.size).toBe(4);
    expect(tokens.size).toBe(4);
  });

  it('比较板列出所有方向（含当前那条），并标出哪条是当前', async () => {
    const id = await newProject('Variants List');
    await generateVariants(id, { count: 2, createdById: ownerId });
    const list = await listVariants(id);
    expect(list.map((v) => v.branch.name).sort()).toEqual(['concept-a', 'concept-b', 'main']);
    expect(list.find((v) => v.branch.name === 'main')?.branch.current).toBe(true);
    expect(list.find((v) => v.branch.name === 'concept-a')?.branch.current).toBe(false);
    // main 那张卡画的就是工作区当前那一版（比形状：快照与库里重建的文档不保证逐字段相等）
    expect(activeShape(list.find((v) => v.branch.name === 'main')!.document)).toBe(
      activeShape((await loadDocument(id))!),
    );
  });

  it('采纳某条方案后才换工作区；再切回 main 时原稿还在', async () => {
    const id = await newProject('Variants Adopt');
    await addMarker(id, '原稿标记');    const generated = await generateVariants(id, { count: 3, createdById: ownerId });
    if (!generated.ok) throw new Error(generated.reason);
    const [a, b] = generated.value;
    const main = (await listBranches(id)).find((entry) => entry.name === 'main')!;

    const hasMarker = async () => {
      const document = await loadDocument(id);
      return Object.values(findPage(document!, document!.activePageId)!.nodes).some(
        (n) => n.text === '原稿标记',
      );
    };
    expect(await hasMarker()).toBe(true);

    const switched = await switchBranch(id, a!.branch.id, { createdById: ownerId });
    expect(switched).not.toBeNull();
    // 采纳的是那条方案的文档：换掉了排布与配色，但没有丢掉用户写过的内容
    expect(tokenKeys((await loadDocument(id))!)).toBe(tokenKeys(a!.document));
    expect(await hasMarker()).toBe(true);
    // 采纳一条方向不该顺手把项目改名
    expect((await loadDocument(id))!.name).toBe('Variants Adopt');
    expect(await currentBranchId(id)).toBe(a!.branch.id);
    // 切回 main：原稿回来，方案 A 的改动留在它自己那条线上
    await switchBranch(id, main.id, { createdById: ownerId });
    expect(tokenKeys((await loadDocument(id))!)).not.toBe(tokenKeys(a!.document));
    const back = await listVariants(id);
    const cardA = back.find((v) => v.branch.id === a!.branch.id)!;
    expect(tokenKeys(cardA.document)).toBe(tokenKeys(a!.document));
    // 方案 B 从没被采纳，仍然停在生成时那一版
    const cardB = back.find((v) => v.branch.id === b!.branch.id)!;
    expect(activeShape(cardB.document)).toBe(activeShape(b!.document));
  });

  it('重复生成不会撞名：第二条线自动加序号', async () => {
    const id = await newProject('Variants Repeat');
    const first = await generateVariants(id, { count: 2, createdById: ownerId });
    expect(first.ok).toBe(true);
    const second = await generateVariants(id, { count: 2, createdById: ownerId });
    if (!second.ok) throw new Error(second.reason);
    expect(second.value.map((v) => v.branch.name)).toEqual(['concept-a-2', 'concept-b-2']);
    expect(second.notes.join('')).toContain('已经存在');
    expect((await listBranches(id)).map((b) => b.name).sort()).toEqual([
      'concept-a',
      'concept-a-2',
      'concept-b',
      'concept-b-2',
      'main',
    ]);
  });

  it('Combine：布局取自一条、视觉取自另一条，结果是新的一条线', async () => {
    const id = await newProject('Variants Merge');
    const generated = await generateVariants(id, { count: 4, createdById: ownerId });
    if (!generated.ok) throw new Error(generated.reason);
    const [a, , c] = generated.value;
    const before = await loadDocument(id);

    const merged = await mergeVariants(id, {
      layoutBranchId: a!.branch.id,
      visualBranchId: c!.branch.id,
      createdById: ownerId,
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error(merged.reason);
    expect(merged.value.branch.name).toBe('mix-a-c');
    expect(merged.notes).toEqual([]);
    // 结构 = A 的结构；配色 = C 的配色
    expect(activeShape(merged.value.document)).toBe(activeShape(a!.document));
    expect(tokenKeys(merged.value.document)).toBe(tokenKeys(c!.document));
    expect(merged.value.document.visualDna?.descriptors).toEqual(c!.document.visualDna?.descriptors);
    expect(validateDocument(merged.value.document).filter((i) => i.severity === 'error')).toEqual([]);
    // 仍然是"不动工作区"的操作
    expect(await loadDocument(id)).toEqual(before);
    const list = await listVariants(id);
    expect(list.map((v) => v.branch.name)).toContain('mix-a-c');
    // 两个来源都还在比较板上：合成没有把它们吃掉
    expect(list.map((v) => v.branch.name).sort()).toEqual([
      'concept-a',
      'concept-b',
      'concept-c',
      'concept-d',
      'main',
      'mix-a-c',
    ]);
  });

  it('合成的那条线采纳后，画布上就是 A 的结构配 C 的配色', async () => {
    const id = await newProject('Variants Merge Adopt');
    const generated = await generateVariants(id, { count: 4, createdById: ownerId });
    if (!generated.ok) throw new Error(generated.reason);
    const [a, , c] = generated.value;
    const merged = await mergeVariants(id, {
      layoutBranchId: a!.branch.id,
      visualBranchId: c!.branch.id,
      name: '方向-终选',
      createdById: ownerId,
    });
    if (!merged.ok) throw new Error(merged.reason);
    expect(merged.value.branch.name).toBe('方向-终选');
    await switchBranch(id, merged.value.branch.id, { createdById: ownerId });
    const workspace = await loadDocument(id);
    expect(activeShape(workspace!)).toBe(activeShape(a!.document));
    expect(tokenKeys(workspace!)).toBe(tokenKeys(c!.document));
  });

  it('来源不存在或名字非法时如实拒绝', async () => {
    const id = await newProject('Variants Reject');
    const generated = await generateVariants(id, { count: 2, createdById: ownerId });
    if (!generated.ok) throw new Error(generated.reason);
    const [a] = generated.value;
    const bad = await mergeVariants(id, { layoutBranchId: a!.branch.id, visualBranchId: 'nope' });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error('不该成功');
    expect(bad.reason).toContain('视觉来源分支不存在');

    const badName = await mergeVariants(id, {
      layoutBranchId: a!.branch.id,
      visualBranchId: generated.value[1]!.branch.id,
      name: 'bad name / with slash',
    });
    expect(badName.ok).toBe(false);
    if (badName.ok) throw new Error('不该成功');
    expect(badName.reason).toContain('方案名');

    const missing = await generateVariants('00000000-0000-0000-0000-000000000000', { count: 2 });
    expect(missing.ok).toBe(false);
  });

  it('跨项目隔离：一个项目的方案不会出现在另一个项目的比较板上', async () => {
    const a = await newProject('Variants A');
    const b = await newProject('Variants B');
    await generateVariants(a, { count: 3, createdById: ownerId });
    expect((await listVariants(a)).map((v) => v.branch.name).sort()).toEqual([
      'concept-a',
      'concept-b',
      'concept-c',
      'main',
    ]);
    expect((await listVariants(b)).map((v) => v.branch.name)).toEqual(['main']);
    const cross = await mergeVariants(b, {
      layoutBranchId: (await listVariants(a))[0]!.branch.id,
      visualBranchId: (await listVariants(a))[1]!.branch.id,
    });
    expect(cross.ok).toBe(false);
  });

  it('并发双发"生成方案"：同名分支永远只有一条（#170）', async () => {
    const id = await newProject('Variant Race');
    // 同一份文档算出来的方案名是确定的：双击按钮就是两个请求同时到。
    // 这里键的是结果不变式：不抛异常、同名分支只有一条。
    // （确定性地杀变异的那条在 branches.integration：直接对同名的
    //  createVariantBranch 发两发，两边的 clash 预检都先于任何 insert 发出）。
    const [a, b] = await Promise.all([
      generateVariants(id, { count: 2 }),
      generateVariants(id, { count: 2 }),
    ]);
    const names = (await listVariants(id)).map((v) => v.branch.name);
    expect(new Set(names).size, '同名分支出现了两条').toBe(names.length);
    expect(names).toContain('main');
    const landed = (a.ok ? a.value.length : 0) + (b.ok ? b.value.length : 0);
    expect(landed, '每条落地的方案都对应一条分支').toBe(names.length - 1);
  });
});
