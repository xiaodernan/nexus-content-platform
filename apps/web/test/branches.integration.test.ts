import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage, type DesignDocument } from '@nexus/design-model';
import {
  createBranch,
  createVariantBranch,
  currentBranchId,
  duplicateProject,
  ensureDefaultBranch,
  listBranches,
  switchBranch,
} from '../src/server/domain/branches';
import { createSnapshot, documentsMatch, listSnapshots, readSnapshot } from '../src/server/domain/snapshots';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { branches, projects, snapshots, users } from '../src/server/db/schema';

/**
 * §28 分支 + §27 Duplicate。打真实 Postgres（docs/TESTING.md 禁止 mock 数据库）：
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
    .values({ displayName: 'Branch Tester', email: `branch+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = user!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function newProject(name: string) {
  const document = await createProject(ownerId, { name, kind: 'website' });
  created.push(document.id);
  return document.id;
}

/** 往首页挂一个带名字的文本节点并落库——用它标记"这是哪一版设计" */
async function putMarker(projectId: string, text: string): Promise<void> {
  const document = await loadDocument(projectId);
  const page = findPage(document!)!;
  const node = createNode({ type: 'text', name: text, text, parentId: page.rootId });
  page.nodes[node.id] = node;
  page.nodes[page.rootId]!.children = [...page.nodes[page.rootId]!.children, node.id];
  await saveDocument(projectId, document!);
}

const hasText = async (projectId: string, text: string) => {
  const document = await loadDocument(projectId);
  return Object.values(findPage(document!)!.nodes).some((n) => n.text === text);
};

const pageIds = (document: DesignDocument) => document.pages.map((p) => p.id).sort();

describe('分支与副本（真实数据库）', () => {
  it('新项目自带 main，head 就是初始快照，且当前分支可推导', async () => {
    const id = await newProject('Branch Init');
    const list = await listBranches(id);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('main');
    expect(list[0]!.isDefault).toBe(true);
    expect(list[0]!.current).toBe(true);

    const initial = await listSnapshots(id);
    expect(list[0]!.headSnapshotId).toBe(initial[0]!.id);
    expect(initial[0]!.branchId).toBe(list[0]!.id);
    expect(await currentBranchId(id)).toBe(list[0]!.id);
  });

  it('分支名：重名与非法字符都会被拒绝并说明原因', async () => {
    const id = await newProject('Branch Names');
    expect((await createBranch(id, { name: 'design-v1' })).ok).toBe(true);
    const clash = await createBranch(id, { name: 'design-v1' });
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.reason).toContain('已经有叫 design-v1 的分支');
    const bad = await createBranch(id, { name: 'bad name / with slash' });
    expect(bad.ok).toBe(false);
  });

  it('开分支带着当前现场切过去；切换分支来回都不丢东西', async () => {
    const id = await newProject('Branch Roundtrip');
    const main = (await listBranches(id))[0]!;

    await putMarker(id, 'main 上的方向');
    const v1 = await createBranch(id, { name: 'design-v1' });
    expect(v1.ok).toBe(true);
    if (!v1.ok) throw new Error(v1.reason);
    // 开分支 = checkout -b：带着刚才的现场切到新分支上继续做
    expect(await currentBranchId(id)).toBe(v1.branch.id);
    expect(await hasText(id, 'main 上的方向')).toBe(true);
    // 这份现场同时被存回了 main：切回去不会看不到自己刚做的东西
    const branchesOnMain = await listBranches(id);
    const mainNow = branchesOnMain.find((b) => b.id === main.id)!;
    expect(mainNow.headSnapshotId).not.toBe(v1.branch.headSnapshotId);
    // 每条线都得有自己的 head：两条分支共用一个 head 时，"当前分支是谁"就由查询顺序决定了
    const heads = branchesOnMain.map((b) => b.headSnapshotId);
    expect(new Set(heads).size).toBe(heads.length);
    await switchBranch(id, main.id);
    expect(await hasText(id, 'main 上的方向')).toBe(true);

    // 回到 v1 上做另一个方向
    await switchBranch(id, v1.branch.id);
    await putMarker(id, 'v1 的方向');
    await switchBranch(id, main.id);
    expect(await hasText(id, 'v1 的方向')).toBe(false);
    expect(await hasText(id, 'main 上的方向')).toBe(true);
    await switchBranch(id, v1.branch.id);
    expect(await hasText(id, 'v1 的方向')).toBe(true);
    expect(await hasText(id, 'main 上的方向')).toBe(true);
    expect((await loadDocument(id))!.pages).toHaveLength(1);
  });

  it('内容没变时反复切换不会堆噪音快照，切换本身仍留下一条历史', async () => {
    const id = await newProject('Branch Noise');
    const [main] = await listBranches(id);
    const v2 = await createBranch(id, { name: 'design-v2' });
    if (!v2.ok) throw new Error(v2.reason);
    const before = await listSnapshots(id);
    await switchBranch(id, main!.id);
    await switchBranch(id, v2.branch.id);
    const after = await listSnapshots(id);
    // 分支头是什么状态、那条"前的现场"自己怎么说，都是现场证据。
    // 分支头是什么状态，直接决定 stashCurrent 会不会写那条"前的现场"：出问题时这就是现场证据
    const heads = (await listBranches(id)).map((b) => `${b.name}:${b.headSnapshotId ? '有头' : '无头'}`).join(' / ');
    // 诊断必须挂在**第一条**断言上：上一次命中时红在这里，而带诊断的那句排在第三条之后，
    // 于是红得干脆、证据一个字都没打印出来（docs/TESTING.md 已知偶发第二笔）
    const stashRows = after.filter((s) => !before.some((b) => b.id === s.id) && (s.label ?? '').startsWith('切到'));
    const evidence = `分支头现状：${heads}；多出来的那条说：${stashRows.map((s) => `${s.label} → ${s.summary ?? '(没有原因)'}`).join(' / ') || '(没有多余行)'}`;
    const created = after
      .filter((s) => !before.some((b) => b.id === s.id))
      .map((s) => s.label ?? '(无标签)');
    // 两条"切换到"标记是如实历史；不该出现"切到 X 前的现场"
    expect(created.filter((label) => label.startsWith('切到')), evidence).toEqual([]);
    expect(created.filter((label) => label.startsWith('切换到'))).toHaveLength(2);
    expect(created.length, `${evidence}；新增的应当只有两条切换标记`).toBe(2);
  });

  /**
   * 那笔偶发噪音快照的定位探针（#40）。它测的不是"切换对不对"，而是 `stashCurrent` 唯一的依据：
   * 它比的是**同一份内容的两个投影**——工作区那份由 `loadDocument` 从节点行重建，
   * head 那份从快照的 jsonb 读回。两个投影只要有任何一处不重合（页的顺序、某个字段在两条路径上
   * 一个写 null 一个不写、数字被 jsonb 规范化…），一次"内容没变的切换"就会被判成有改动，
   * 于是多出一条"切到 X 前的现场"。所以这里把不变式直接写出来，而不是等它偶发。
   */
  it('工作区与 head 快照在 documentsMatch 眼里必须相等，来回切八次也不留噪音', async () => {    const id = await newProject('Noise Probe');
    const [main] = await listBranches(id);
    const v2 = await createBranch(id, { name: 'probe-v2' });
    expect(v2.ok).toBe(true);
    if (!v2.ok) throw new Error(v2.reason);
    await switchBranch(id, main!.id);

    const headOf = async (branchId: string) => {
      const row = (await listBranches(id)).find((b) => b.id === branchId)!;
      return row.headSnapshotId ? await readSnapshot(id, row.headSnapshotId) : null;
    };
    /** 用生产那份谓词自己定位：按页二分，比在测试里重抄一份比较逻辑可靠（重抄的会漂） */
    const where = (a: DesignDocument, b: DesignDocument): string => {
      const parts: string[] = [];
      if (!documentsMatch({ ...a, pages: [] }, { ...b, pages: [] })) parts.push('token 表');
      if (a.pages.length !== b.pages.length) parts.push(`页数 ${a.pages.length} vs ${b.pages.length}`);
      const n = Math.min(a.pages.length, b.pages.length);
      for (let i = 0; i < n; i += 1) {
        if (!documentsMatch({ ...a, pages: [a.pages[i]!] }, { ...b, pages: [b.pages[i]!] })) {
          parts.push(`按位置的第 ${i + 1} 页（${a.pages[i]!.name} / ${b.pages[i]!.name}）`);
        }
      }
      if (parts.length) {
        const byId = new Map(b.pages.map((p) => [p.id, p]));
        const unmatched = a.pages.filter((p) => !byId.has(p.id) || !documentsMatch({ ...a, pages: [p] }, { ...b, pages: [byId.get(p.id)!] }));
        if (!unmatched.length) parts.push('（按 id 配对后每一页都相等 → 差的是页的顺序，不是内容）');
      }
      return parts.join('、') || '说不清（页数与逐页比较都没报差异）';
    };

    const workspace = (await loadDocument(id))!;
    const mainHead = await headOf(main!.id);
    expect(mainHead, 'main 的 head 快照读不到，探针没有可比的对象').not.toBe(null);
    expect(
      documentsMatch(workspace, mainHead!.document),
      `刚切换完的工作区与这一分支的 head 已经不等了，下一次切换必然存出噪音：${where(workspace, mainHead!.document)}`,
    ).toBe(true);

    const before = await listSnapshots(id);
    for (let i = 0; i < 8; i += 1) {
      await switchBranch(id, v2.branch.id);
      await switchBranch(id, main!.id);
    }
    const stash = (await listSnapshots(id))
      .filter((s) => !before.some((b) => b.id === s.id) && (s.label ?? '').startsWith('切到'))
      .map((s) => `${s.label} → ${s.summary ?? '(没有原因)'}`);
    expect(stash, `八次来回、一次编辑都没有，却存出 ${stash.length} 条"前的现场"：\n${stash.join('\n')}`).toEqual([]);
    // 反向对照：切换本身仍然留下历史，八次来回 = 16 条"切换到"
    const switched = (await listSnapshots(id)).filter(
      (s) => !before.some((b) => b.id === s.id) && (s.label ?? '').startsWith('切换到'),
    );
    expect(switched).toHaveLength(16);
  }, 120_000);

  it('存回原分支的那一条会带上"为什么要存"', async () => {
    // 那条偶发的噪音快照单独跑五次都复现不出来，靠猜没有意义。
    // 所以把原因写进快照自己那一行：下一次真出现时，历史里就带着"差在哪一处"
    const id = await newProject('Stash Reason');
    await putMarker(id, '要留在 main 的改动');
    const v2 = await createBranch(id, { name: 'with-reason' });
    expect(v2.ok).toBe(true);
    const stash = (await listSnapshots(id)).find((s) => (s.label ?? '').startsWith('分出'));
    expect(stash?.summary ?? '').toContain('差异');
    expect(stash?.summary ?? '').toContain('要留在 main 的改动');
    // 反向对照：内容真的一样时根本不写这一条，不是靠文案撑着的空操作
    const before = await listSnapshots(id);
    const [main] = await listBranches(id);
    await switchBranch(id, main!.id);
    const mid = await listSnapshots(id);
    expect(mid.filter((s) => !before.some((b) => b.id === s.id) && (s.label ?? '').startsWith('切到'))).toEqual([]);
  });

  it('从历史快照开分支：起点是那份快照，当前现场先存回原分支', async () => {
    const id = await newProject('Branch From Snapshot');
    const [main] = await listBranches(id);
    const baseline = (await listSnapshots(id))[0]!;
    await putMarker(id, '分叉之后的改动');
    const result = await createBranch(id, { name: 'experimental', fromSnapshotId: baseline.id });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    // 新分支落在起点内容上
    expect(await hasText(id, '分叉之后的改动')).toBe(false);
    // 而刚才的现场没丢：它被存回 main 了
    const mainHead = (await listBranches(id)).find((b) => b.id === main!.id)!;
    expect(mainHead.headSnapshotId).not.toBe(baseline.id);
    await switchBranch(id, main!.id);
    expect(await hasText(id, '分叉之后的改动')).toBe(true);
  });

  it('Duplicate：新项目内容一致、id 全部换号，源项目不受影响', async () => {
    const id = await newProject('Duplicate Source');
    await putMarker(id, '要一起复制走的标记');
    const source = (await loadDocument(id))!;

    const copy = await duplicateProject(ownerId, id, '另一种可能');
    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe(id);
    expect(copy!.name).toBe('另一种可能');
    expect(pageIds(copy!)).not.toEqual(pageIds(source));
    expect(await hasText(copy!.id, '要一起复制走的标记')).toBe(true);
    // 副本有自己的 main 分支与初始快照，之后各写各的历史
    const copyBranches = await listBranches(copy!.id);
    expect(copyBranches.map((b) => b.name)).toEqual(['main']);
    expect((await listSnapshots(copy!.id)).map((s) => s.source)).toEqual(['manual']);
    // 默认名字
    const unnamed = await duplicateProject(ownerId, id);
    expect(unnamed!.name).toBe('Duplicate Source 副本');
    created.push(copy!.id, unnamed!.id);
    // 源项目没被动过
    expect(pageIds((await loadDocument(id))!)).toEqual(pageIds(source));
  });

  it('分支功能之前的老项目：自动补 main，并把无主快照归到这条线上', async () => {
    const id = await newProject('Legacy Project');
    await putMarker(id, '老项目的改动');
    await createSnapshot(id, {
      document: (await loadDocument(id))!,
      source: 'manual',
      label: '无分支时期的快照',
    });
    const db = getDb();
    await db.delete(branches).where(eq(branches.projectId, id));
    await db.update(snapshots).set({ branchId: null }).where(eq(snapshots.projectId, id));

    const mainId = await ensureDefaultBranch(id);
    expect(mainId).toBeTruthy();
    const list = await listBranches(id);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('main');
    expect((await listSnapshots(id)).every((s) => s.branchId === mainId)).toBe(true);
    // head 回到工作区当前停的那份快照上，所以当前分支推导得出来
    expect(await currentBranchId(id)).toBe(mainId);
  });

  it('跨项目隔离：不能把别的项目的分支切过来；同名分支各自独立', async () => {
    const a = await newProject('Branch Owner A');
    const b = await newProject('Branch Owner B');
    const foreign = (await listBranches(a))[0]!;
    expect(await switchBranch(b, foreign.id)).toBeNull();
    await createBranch(a, { name: 'design-v1' });
    const sameName = await createBranch(b, { name: 'design-v1' });
    expect(sameName.ok).toBe(true);
    expect((await listBranches(a)).map((x) => x.name)).toEqual(['main', 'design-v1']);
    expect((await listBranches(b)).map((x) => x.name)).toEqual(['main', 'design-v1']);
  });

  it('老项目（分支行丢了）并发补 main：库挡下第二条，如实交出现成那条（#170）', async () => {
    const id = await newProject('Legacy Branch Race');
    const db = getDb();
    // createProject 现在就建 main，正常路径造不出"分支行丢了"的老项目，这里手工删掉；
    // snapshots.branchId 外键是 onDelete:'set null'，删分支行不伤快照。
    await db.delete(branches).where(eq(branches.projectId, id));

    // 真实竞态：另一个会话已经把 main 插进去、还没提交——两处 select 都看不见它，
    // 于是两边都走到 insert。后到者阻塞在唯一索引上，等那个事务落地后才发现插重了。
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let landed!: () => void;
    const inserted = new Promise<void>((resolve) => {
      landed = resolve;
    });
    const other = db.transaction(async (tx) => {
      await tx.insert(branches).values({ projectId: id, name: 'main', isDefault: true });
      landed();
      await gate;
    });
    await inserted;
    // 不 await：这一发要先走到 insert 并阻塞在唯一索引上，再放开那个事务
    const pending = ensureDefaultBranch(id);
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    const mine = await pending;
    await other;

    expect(mine, '并发补 main 失败了').toBeTruthy();
    const rows = await db.select({ id: branches.id }).from(branches).where(eq(branches.projectId, id));
    expect(rows).toHaveLength(1);
    expect((await listBranches(id)).filter((x) => x.name === 'main')).toHaveLength(1);
  });

  it('并发开同名分支：库挡下第二条，回执还是那句"已经有叫 X 的分支"（#171）', async () => {
    const id = await newProject('Branch Create Race');
    const db = getDb();
    // 真实竞态：另一个会话已经把同名分支插进去、还没提交——clash 预检看不见未提交行，
    // 于是照样往下走。后到者阻塞在唯一索引上，等那个事务落地后才发现插重了。
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let landed!: () => void;
    const inserted = new Promise<void>((resolve) => {
      landed = resolve;
    });
    const other = db.transaction(async (tx) => {
      await tx.insert(branches).values({ projectId: id, name: 'design-v1' });
      landed();
      await gate;
    });
    await inserted;
    const pending = createBranch(id, { name: 'design-v1' });
    // 等到这一发真的把 insert 发了出去（说明它已过 clash 预检、正阻塞在那个未提交行上）
    // 再放开那个事务：竞态窗口由此钉死，不靠 sleep 碰时序。
    let issued = false;
    for (let i = 0; i < 400 && !issued; i += 1) {
      const rows = await db.execute(
        rawSql`select 1 as hit from pg_stat_activity
               where pid <> pg_backend_pid() and state = 'active'
                 and query like '%insert into "branches"%' limit 1`,
      );
      issued = rows.length > 0;
      if (!issued) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(issued, 'createBranch 没能走到 insert——竞态窗口没造出来').toBe(true);
    release();
    const raced = await pending;
    await other;

    expect(raced.ok, '并发开同名分支该被拒，而不是 23505').toBe(false);
    if (!raced.ok) expect(raced.reason).toContain('已经有叫 design-v1 的分支');
    expect((await listBranches(id)).filter((x) => x.name === 'design-v1')).toHaveLength(1);
  });

  it('并发同名建分支：库挡下第二条，如实答 null 而不是 23505（#170）', async () => {
    const id = await newProject('Variant Branch Race');
    const document = await loadDocument(id);
    if (!document) throw new Error('新项目该有文档');
    // 两发同时到：clash 预检都在任何 insert 之前发出（各自 await 完预检才插）→
    // 两边都看不到对方 → 都 insert。库里 branches_project_name_key 挡下第二条。
    const [a, b] = await Promise.all([
      createVariantBranch(id, { name: 'concept-x', document, label: '甲', summary: '并发' }),
      createVariantBranch(id, { name: 'concept-x', document, label: '乙', summary: '并发' }),
    ]);
    expect([a, b].filter(Boolean), '同名分支落了两条').toHaveLength(1);
    const names = (await listBranches(id)).map((x) => x.name);
    expect(names.filter((n) => n === 'concept-x')).toHaveLength(1);
  });
});
