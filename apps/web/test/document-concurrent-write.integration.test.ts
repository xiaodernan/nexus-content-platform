import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createNode } from '@nexus/design-model';
import type { DesignDocument } from '@nexus/design-model';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { designNodes, pages, projects, users } from '../src/server/db/schema';

/**
 * #64：同一个项目的两个并发 PUT 会互相踩（生产日志里已经红过一次）。
 *
 * `writeDocument` 从前的做法是"把本项目全部 pages/nodes/tokens/components 删掉，再按文档重插"
 *（2026-09-28 起改成增量：只写真正变化的行，见 `document-incremental-save.integration.test.ts`）。
 * 单看一次事务没问题，但两个并发事务各自都从**同一份旧文档**出发：
 * A 删完 → B 删完 → A 插 p_x → B 插同一个 p_x ⇒ `pages_pkey` 冲突，整个 PUT 报 500。
 * 2026-09-26 那次生产日志里的 `insert into "pages"` 失败就是这个形状（库里没有半写状态，事务回滚了，
 * 但用户侧是一次保存失败）。这不是假想场景：Studio 有自动保存，两个标签页 / 脚本与人工同时写同一项目都会撞上。
 *
 * 增量保存改的是写放大，不是并发语义：锁还在原来的位置，最后完成的那个事务仍然整体胜出。
 * 所以下面三条断言一个字都没改——真要有人把语义换成"合并"，第二条就会红（读回来会是两份混在一起）。
 *
 * 这一节钉三件事，缺一不可：
 * ① 两个并发保存**都成功**（挡住的是"保存会失败"）；
 * ② 读回来是**其中一份完整的文档**，不是两份混在一起，也不是"页面在、节点半截"
 *    （整删整插的语义就是最后写的人整体胜出，这里要的是它别混）；
 * ③ 库里的节点行数与文档里的节点数对得上（挡住"回滚不干净/留下孤儿行"）。
 */

const WRITERS = 3; // 三个并发写，比两个更贴近"多个标签页 + 自动保存"，也让单轮侥幸通过的概率更低
const NODES_PER_DOC = 600; // 够大到两个事务必然重叠；小了会偶发假绿（race 窗口没撞上）

function variant(base: DesignDocument, tag: string, rootId: string, pageId: string): DesignDocument {
  const document = structuredClone(base);
  const page = document.pages.find((p) => p.id === pageId);
  if (!page) throw new Error('起手文档里找不到那一页，前提就不成立');
  const root = page.nodes[rootId];
  if (!root) throw new Error('起手文档里找不到根节点');
  for (let i = 0; i < NODES_PER_DOC; i += 1) {
    const node = createNode({ type: 'text', name: `${tag}${i}`, text: `${tag}${i}`, parentId: root.id });
    page.nodes[node.id] = node;
    root.children!.push(node.id);
  }
  return document;
}

function countTagged(document: DesignDocument, tag: string): number {
  return document.pages.reduce(
    (sum, page) => sum + Object.values(page.nodes).filter((n) => String(n.name ?? '').startsWith(tag)).length,
    0,
  );
}

let owner: string;

beforeAll(async () => {
  const rows = await getDb()
    .insert(users)
    .values([{ displayName: 'Concurrent Write Probe', email: `cw+${Date.now()}@nexus.test` }])
    .returning({ id: users.id });
  owner = rows[0]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

describe('同一项目的并发保存（#64 增量保存下依然是"最后胜出"语义）', () => {
  it(`${WRITERS} 个并发 saveDocument 都成功，并且读回来是其中一份完整文档`, async () => {
    const project = await createProject(owner, { name: 'Concurrent Save', kind: 'website' });
    const base = await loadDocument(project.id);
    if (!base) throw new Error('刚建的项目读不回来');
    const page = base.pages[0]!;
    const rootId = page.rootId;

    const drafts = Array.from({ length: WRITERS }, (_, i) =>
      variant(base, `w${i}_`, rootId, page.id),
    );
    const results = await Promise.allSettled(drafts.map((d) => saveDocument(project.id, d)));
    const failures = results.flatMap((r, i) =>
      r.status === 'rejected' ? [`写入 ${i} 失败：${String(r.reason).slice(0, 220)}`] : [],
    );
    // 失败原因放进第一条断言消息里：这里最要紧的是"是哪一道约束撞的"，别让人再去翻日志
    expect(failures, `并发保存有 ${failures.length} 个失败\n${failures.join('\n')}`).toEqual([]);

    const loaded = await loadDocument(project.id);
    expect(loaded).not.toBeNull();
    const counts = drafts.map((_, i) => countTagged(loaded!, `w${i}_`));
    // 恰好一份完整胜出：既不能混（两份都在 = 整删没生效），也不能半截（0 < n < 上限）
    const winners = counts.filter((c) => c === NODES_PER_DOC);
    const losers = counts.filter((c) => c === 0);
    expect(
      winners.length === 1 && losers.length === WRITERS - 1,
      `读回来的各写入方节点数是 [${counts.join(', ')}]，应该是"一份完整 ${NODES_PER_DOC} + 其余为 0"（混了或半截都说明整删重插被踩）`,
    ).toBe(true);
    expect(loaded!.pages).toHaveLength(1);
    expect(loaded!.tokens.length).toBeGreaterThan(0); // tokens 也增量，最后写的人胜出
  }, 180_000);

  it('并发保存之后库里没有孤儿节点行（③：行数与文档对得上）', async () => {
    const project = await createProject(owner, { name: 'No Orphans', kind: 'website' });
    const base = await loadDocument(project.id);
    const page = base!.pages[0]!;
    const drafts = [variant(base!, 'x_', page.rootId, page.id), variant(base!, 'y_', page.rootId, page.id)];
    await Promise.all(drafts.map((d) => saveDocument(project.id, d)));

    const loaded = await loadDocument(project.id);
    const docNodeCount = loaded!.pages.reduce((sum, p) => sum + Object.keys(p.nodes).length, 0);
    const pageRows = await getDb()
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.projectId, project.id));
    const dbNodes = await getDb()
      .select({ n: rawSql<number>`count(*)::int` })
      .from(designNodes)
      .where(inArray(designNodes.pageId, pageRows.map((p) => p.id)));
    const rows = Number(dbNodes[0]?.n ?? -1);
    expect(rows, `库里有 ${rows} 行节点，文档只有 ${docNodeCount} 个 —— 有孤儿行或重复行`).toBe(docNodeCount);
  }, 180_000);
});
