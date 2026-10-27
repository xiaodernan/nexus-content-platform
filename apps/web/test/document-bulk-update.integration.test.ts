import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createNode } from '@nexus/design-model';
import type { DesignDocument } from '@nexus/design-model';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §147：`writeDocument` 的 `updatedNodes` 从逐条 UPDATE 改成一条 `UPDATE … FROM (VALUES …)`，
 * 并按 500 条一块（Postgres 单条 65535 参数上限）。普通自动保存只改 1 个节点，走不到分块；
 * 这里专门改 **620** 个节点（跨 500 的分块边界），钉住「批量 UPDATE 的语义与逐条一致」。
 *
 * 变异探针：把分块大小设成 1（退回逐条）功能不变但慢；把 VALUES 的列顺序或 cast 写错 → 这条会红。
 */

let owner: string;
const N = 620;

function attachTexts(document: DesignDocument, count: number): string[] {
  const page = document.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const node = createNode({ type: 'text', name: `Bulk ${i}`, text: `before-${i}`, parentId: root.id });
    page.nodes[node.id] = node;
    root.children.push(node.id);
    ids.push(node.id);
  }
  return ids;
}

function textById(document: DesignDocument): Map<string, string> {
  const out = new Map<string, string>();
  for (const page of document.pages) for (const node of Object.values(page.nodes)) out.set(node.id, node.text ?? '');
  return out;
}

beforeAll(async () => {
  const rows = await getDb()
    .insert(users)
    .values([{ displayName: 'Bulk Update Probe', email: `bulk+${Date.now()}@nexus.test` }])
    .returning({ id: users.id });
  owner = rows[0]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

describe('批量 UPDATE：改 >500 个节点（跨 chunk 边界）语义不变', () => {
  it('620 个节点全改文字 → 全部落库', async () => {
    const project = await createProject(owner, { name: 'Bulk Update', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const ids = attachTexts(created, N);
    await saveDocument(project.id, created);

    const edited = (await loadDocument(project.id))!;
    for (const page of edited.pages) {
      for (const node of Object.values(page.nodes)) {
        if (node.name.startsWith('Bulk ')) node.text = `after-${node.name.slice(5)}`;
      }
    }
    await saveDocument(project.id, edited);

    const reloaded = (await loadDocument(project.id))!;
    const texts = textById(reloaded);
    // 每一个都改了：覆盖第一个 chunk、边界那一条、以及第二个 chunk
    for (const id of ids) expect(texts.get(id)).toMatch(/^after-/);
    expect(ids).toHaveLength(N);
  });
});
