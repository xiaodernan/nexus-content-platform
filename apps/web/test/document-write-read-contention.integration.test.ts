import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';
import { eq } from 'drizzle-orm';
import { createDocument, createNode, createPage } from '@nexus/design-model';
import type { DesignDocument } from '@nexus/design-model';

/**
 * §146/§147：大文档写入期间，同一项目的读取不该被挡住。
 *
 * 起因是 `npm run perf:browser` 观察到的一次现象：把文档从 120 节点一次 PUT 到 1000 节点之后，
 * 紧接着的刷新 60 秒画布全空，而同规模再跑只要 237-378ms（记在 docs/PERFORMANCE.md）。
 * 浏览器那一层复现不稳定，所以在数据层直接量：一边写 1000 节点，一边连续读同一个项目。
 * 如果读被串行化，这里的数字会立刻说话——那才是那天那次卡住的候选解释。
 */

function bigDocument(nodes: number): DesignDocument {
  const document = createDocument('写入并发');
  const page = createPage('压测页');
  document.pages.push(page);
  document.activePageId = page.id;
  const root = page.nodes[page.rootId]!;
  for (let i = 0; i < nodes; i += 1) {
    const node = createNode({ type: 'text', name: `Perf ${i}`, text: `压测文本 ${i}`, parentId: root.id });
    page.nodes[node.id] = node;
    root.children.push(node.id);
  }
  return document;
}

let owner: string;

beforeAll(async () => {
  const rows = await getDb()
    .insert(users)
    .values([{ displayName: 'Contention Probe', email: `contention+${Date.now()}@nexus.test` }])
    .returning({ id: users.id });
  owner = rows[0]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

describe('大文档写入与读取的并发（§146 浏览器端那次 60 秒空白的数据层验证）', () => {
  it('写 1000 个节点的同时，读同一个项目不该被排到秒级', async () => {
    const project = await createProject(owner, { name: 'Contention Probe', kind: 'website' });
    const readLatencies: number[] = [];
    let stop = false;

    const reader = (async () => {
      while (!stop) {
        const started = performance.now();
        const loaded = await loadDocument(project.id);
        readLatencies.push(performance.now() - started);
        if (!loaded) throw new Error('读回来是空的：写入并发这条前提就不成立');
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })();

    const writeStarted = performance.now();
    await saveDocument(project.id, bigDocument(1000));
    const writeMs = performance.now() - writeStarted;
    stop = true;
    await reader;

    const slowest = readLatencies.length ? Math.max(...readLatencies) : Number.NaN;
    console.log(
      `写入 1000 节点耗时 ${writeMs.toFixed(0)}ms；期间读了 ${readLatencies.length} 次，` +
        `中位 ${readLatencies.sort((a, b) => a - b)[Math.floor(readLatencies.length / 2)]?.toFixed(0)}ms，最慢 ${slowest.toFixed(0)}ms`,
    );

    // 阈值说人话：单次读在写入进行时也不该慢到"用户以为页面挂了"的程度。
    // 2026-09-24 实测基线是写入 600ms / 同期读中位 37ms / 最慢 105ms，所以这条线要挡的不是"慢一点"，
    // 而是"读被整个排在写后面"那种量级（那会变成 ≥600ms 并随文档继续长大）；2000ms 留了足够余量。
    expect(slowest).toBeLessThan(2000);
    await getDb().update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, project.id));
  });
});
