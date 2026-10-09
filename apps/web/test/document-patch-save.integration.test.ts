import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createNode, createPage, type DesignDocument, type DesignPatch } from '@nexus/design-model';
import { createProject, loadDocument, patchProjectDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * #62②：自动保存的补丁路径（`patchProjectDocument`）。钉的是语义，不是速度——
 * 速度的红线在 docs/TESTING.md 的浏览器门上，这里的每一条都对应"换成补丁后最容易悄悄改掉的规矩"：
 *  ① 补丁是合并不是替换：没被 op 提到的行一个字不动（对照：整份 PUT 的缺失即删在最后一节）；
 *  ② 整批要么整批落、要么一条不落：任何一条 op 打空 → ops_skipped，库里一个字没改（探针见头注释）；
 *  ③ 落库走的是同一个 writeProjectDocument：项目摘要列（activePageId…）跟着补丁一起活；
 * ④ 锁内读-改-写（ADR-0016）：补丁永远打在"库里的最新版"上，不是客户端自以为的那一版。
 * 变异探针（红一处、已还原）：把 skipped 判定删掉 → 第 3 条红（坏 op 被吞、打得中的那条照落）。
 * 第 5 条（锁内读最新版）是断言不是探针：把 loadDocument 换成陈旧缓存要构造跨调用状态，
 * 这一节不值得为探针加那种桩——并发语义另有 document-concurrent-write.integration.test.ts 钉着。
 */

let owner: string;

function attachText(document: DesignDocument, name: string, text: string) {
  const page = document.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name, text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children = [...root.children, node.id];
  return node;
}

function findText(document: DesignDocument, name: string): { text: string } | null {
  for (const page of document.pages) {
    const node = Object.values(page.nodes).find((candidate) => candidate.name === name);
    if (node) return { text: String(node.text ?? '') };
  }
  return null;
}

beforeAll(async () => {
  const rows = await getDb()
    .insert(users)
    .values([{ displayName: 'Patch Save Probe', email: `patch+${Date.now()}@nexus.test` }])
    .returning({ id: users.id });
  owner = rows[0]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

describe('补丁保存：合并语义，整批同生共死', () => {
  it('set op 只改被点名的节点；没提到的节点一个字不动', async () => {
    const project = await createProject(owner, { name: 'Patch Set', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const target = attachText(created, 'ProbeHeadline', 'before');
    attachText(created, 'ProbeUntouched', 'keep me');
    await saveDocument(project.id, created);

    const patch: DesignPatch = {
      id: 'cmd-1',
      ops: [{ op: 'set', nodeId: target.id, path: 'text', value: 'after' }],
    };
    const outcome = await patchProjectDocument(project.id, [patch]);
    expect(outcome).toMatchObject({ ok: true });

    const reloaded = (await loadDocument(project.id))!;
    expect(findText(reloaded, 'ProbeHeadline')?.text).toBe('after');
    expect(findText(reloaded, 'ProbeUntouched')?.text).toBe('keep me');
  });

  it('insert + remove 一轮落库：新节点进得来，点名删掉的出得去', async () => {
    const project = await createProject(owner, { name: 'Patch Insert Remove', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const doomed = attachText(created, 'ProbeDoomed', 'bye');
    await saveDocument(project.id, created);

    const fresh = (await loadDocument(project.id))!;
    const page = fresh.pages[0]!;
    const root = page.nodes[page.rootId]!;
    const born = createNode({ type: 'text', name: 'ProbeBorn', text: 'hello', parentId: root.id });
    const outcome = await patchProjectDocument(project.id, [
      {
        id: 'cmd-2',
        ops: [
          { op: 'insert', parentId: root.id, index: root.children.length, node: born },
          { op: 'remove', nodeId: doomed.id },
        ],
      },
    ]);
    expect(outcome).toMatchObject({ ok: true });

    const reloaded = (await loadDocument(project.id))!;
    expect(findText(reloaded, 'ProbeBorn')?.text).toBe('hello');
    expect(findText(reloaded, 'ProbeDoomed')).toBeNull();
  });

  it('任何一条 op 打空：整批 409 语义（ops_skipped），库里一个字没改', async () => {
    const project = await createProject(owner, { name: 'Patch Skipped', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const target = attachText(created, 'ProbeHeadline', 'before');
    await saveDocument(project.id, created);

    const outcome = await patchProjectDocument(project.id, [
      {
        id: 'cmd-3',
        ops: [
          { op: 'set', nodeId: target.id, path: 'text', value: 'MUST NOT LAND' },
          { op: 'set', nodeId: 'node-never-existed', path: 'text', value: 'boom' },
        ],
      },
    ]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('ops_skipped');
      if (outcome.code === 'ops_skipped') expect(outcome.skipped.length).toBeGreaterThan(0);
    }
    // 那条打得中的 set 也不许落：整批同生共死
    const reloaded = (await loadDocument(project.id))!;
    expect(findText(reloaded, 'ProbeHeadline')?.text).toBe('before');
  });

  it('addPage 走摘要列：projects.activePageId 跟着补丁一起活（同一个 writeProjectDocument）', async () => {
    const project = await createProject(owner, { name: 'Patch Add Page', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    await saveDocument(project.id, created);
    const fresh = (await loadDocument(project.id))!;

    const nextPage = createPage('第二页');
    const outcome = await patchProjectDocument(project.id, [
      { id: 'cmd-4', ops: [{ op: 'addPage', page: nextPage, setActive: true }] },
    ]);
    expect(outcome).toMatchObject({ ok: true });

    const row = await getDb().select({ activePageId: projects.activePageId }).from(projects).where(eq(projects.id, project.id));
    expect(row[0]?.activePageId).toBe(nextPage.id);
    const reloaded = (await loadDocument(project.id))!;
    expect(reloaded.pages.map((page) => page.id)).toContain(nextPage.id);
    expect(reloaded.pages[0]?.id).toBe(fresh.pages[0]?.id);
  });

  it('补丁永远打在库里的最新版上：另一路全量写入之后，补丁不覆盖它的改动（ADR-0016）', async () => {
    const project = await createProject(owner, { name: 'Patch Sees Latest', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const a = attachText(created, 'ProbeA', 'a0');
    const b = attachText(created, 'ProbeB', 'b0');
    await saveDocument(project.id, created);

    // 另一路（比如另一个标签页的全量 PUT）先改了 B —— 补丁这一路当时还没看见
    const other = (await loadDocument(project.id))!;
    for (const page of other.pages) {
      const node = Object.values(page.nodes).find((candidate) => candidate.name === 'ProbeB');
      if (node) node.text = 'b-from-other-write';
    }
    await saveDocument(project.id, other);

    const outcome = await patchProjectDocument(project.id, [
      { id: 'cmd-5', ops: [{ op: 'set', nodeId: a.id, path: 'text', value: 'a1' }] },
    ]);
    expect(outcome).toMatchObject({ ok: true });

    const reloaded = (await loadDocument(project.id))!;
    expect(findText(reloaded, 'ProbeA')?.text).toBe('a1');
    // 锁内读到的是另一路写完之后的版本：b 的改动必须还在（补丁不是"拿客户端旧文档盖回去"）
    expect(findText(reloaded, 'ProbeB')?.text).toBe('b-from-other-write');
    void b;
  });

  it('打完补丁的文档过不了形状门：document_rejected，库里一个字没改', async () => {
    const project = await createProject(owner, { name: 'Patch Gate', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const target = attachText(created, 'ProbeHeadline', 'before');
    await saveDocument(project.id, created);

    // applyPatch 自己的守卫拦的是"这条 op 打空"（打不中的节点、重复 id、删最后一页，都被
    // 记进 skipped）；而门（parseDocument 的规模/形状）拦的是"每条 op 都落成了、合起来却不再是
    // 一份合法文档"。addPage 带一个超限的 width 就是后者：op 打得中，门必须拒。
    const fresh = (await loadDocument(project.id))!;
    const existingPage = fresh.pages[0]!;
    const outcome = await patchProjectDocument(project.id, [
      {
        id: 'cmd-7',
        ops: [
          { op: 'set', nodeId: target.id, path: 'text', value: 'MUST NOT LAND' },
          { op: 'addPage', page: { ...existingPage, id: 'page-too-wide', width: 99999 } },
        ],
      },
    ]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('document_rejected');

    const reloaded = (await loadDocument(project.id))!;
    expect(findText(reloaded, 'ProbeHeadline')?.text).toBe('before');
    expect(reloaded.pages.some((page) => page.id === 'page-too-wide')).toBe(false);
  });

  it('对照：同一份"少了一个节点"的文档，补丁合并留着它，整份 PUT 缺失即删', async () => {
    const project = await createProject(owner, { name: 'Patch vs Replace', kind: 'website' });
    const created = (await loadDocument(project.id))!;
    const keep = attachText(created, 'ProbeKeep', 'k');
    const later = attachText(created, 'ProbeLater', 'l');
    await saveDocument(project.id, created);

    // 补丁只动 Keep：Later 虽然"客户端那份旧文档里没有的更新"，照样活着
    const outcome = await patchProjectDocument(project.id, [
      { id: 'cmd-6', ops: [{ op: 'set', nodeId: keep.id, path: 'text', value: 'k2' }] },
    ]);
    expect(outcome).toMatchObject({ ok: true });
    expect(findText((await loadDocument(project.id))!, 'ProbeLater')?.text).toBe('l');

    // 整份 PUT：文档里没有的节点就是被删掉的（ADR-0017 的替换语义原样保留）
    const trimmed = (await loadDocument(project.id))!;
    const page = trimmed.pages[0]!;
    const root = page.nodes[page.rootId]!;
    delete page.nodes[later.id];
    root.children = root.children.filter((id) => id !== later.id);
    await saveDocument(project.id, trimmed);
    expect(findText((await loadDocument(project.id))!, 'ProbeLater')).toBeNull();
  });
});
