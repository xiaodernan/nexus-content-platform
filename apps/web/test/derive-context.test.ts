import { describe, expect, it } from 'vitest';
import { createDocument, createNode, findPage } from '@nexus/design-model';
import type { DesignDocument } from '@nexus/design-model';
import { ANNOTATION_CONTEXT_LIMIT, deriveContextFromDocument } from '@/server/ai/derive-context';

/**
 * `derive-context.ts` 的第一份单测。
 *
 * 为什么这一格值得补：它是「这一轮的现场」唯一的算法（§68），
 * 而它有**两个调用方**——服务端装配 AI 请求（`server/ai/assemble.ts`）
 * 与 Python 侧夹具生成（`scripts/ai-request-fixture.ts`）。
 * 它自己的注释写着"改了这里的形状，导出的夹具和 `test_prompt.py` 会当场不一致"——
 * 但那是**手工**才发现的：没人改的时候，两边一致只是"碰巧还一致"。
 *
 * 这一份钉住的是那件更要紧的事：**现场由权威文档回答，不由调用方自述**。
 * 客户端说"我选了这些节点"，服务端得自己核对；认不出的 id 要如实带下去（§159），
 * 不能当作现场、也不能悄悄丢掉。
 *
 * 纯函数：不读库、不碰时钟（所以不需要真库，也不会因为库里某天多了一行而变红）。
 */

/** 造一份文档：一个页面（Home）+ 一个挂在页面上的子节点 */
function documentWith(): { doc: DesignDocument; pageId: string; childId: string } {
  const doc = createDocument('derive-probe');
  const page = findPage(doc)!;
  const child = createNode({ type: 'text', parentId: page.rootId, name: '标题', text: '你好' });
  page.nodes[child.id] = child;
  page.nodes[page.rootId]!.children.push(child.id);
  return { doc, pageId: page.id, childId: child.id };
}

describe('deriveContextFromDocument · 选中由文档核对', () => {
  it('客户端报来的 id 文档里没有 → 如实进 missing，不进 entries', () => {
    const { doc } = documentWith();
    const derived = deriveContextFromDocument(doc, { selection: ['根本没这个节点'] });
    expect(derived.selectionDigest.missing).toEqual(['根本没这个节点']);
    expect(derived.selectionDigest.entries.map((e) => e.nodeId)).not.toContain('根本没这个节点');
  });

  it('重复的 id 只算一次（digest 不重复列同一处）', () => {
    const { doc, childId } = documentWith();
    const derived = deriveContextFromDocument(doc, { selection: [childId, childId, childId] });
    expect(derived.selectionDigest.entries.filter((e) => e.nodeId === childId)).toHaveLength(1);
  });

  it('文档里有但走不到的节点 → 进 unreachable，仍然有 entry（它真的在文档里）', () => {
    const { doc } = documentWith();
    const orphan = createNode({ type: 'text', name: '孤儿' });
    doc.pages[0]!.nodes[orphan.id] = orphan; // 放进 nodes 但不挂进 children → 走不到

    const derived = deriveContextFromDocument(doc, { selection: [orphan.id] });
    expect(derived.selectionDigest.unreachable).toEqual([orphan.id]);
    expect(derived.selectionDigest.entries.map((e) => e.nodeId)).toContain(orphan.id);
  });

  it('同一份文档同一份选中 → 两次结果逐字相同（纯函数、结果确定）', () => {
    const { doc, childId } = documentWith();
    const a = deriveContextFromDocument(doc, { selection: [childId] });
    const b = deriveContextFromDocument(doc, { selection: [childId] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('deriveContextFromDocument · 批注由文档定位', () => {
  it('批注的页面名与节点名取自文档，不取自调用方给的', () => {
    const { doc, pageId, childId } = documentWith();
    const derived = deriveContextFromDocument(doc, {
      selection: [],
      annotations: [{ nodeId: childId, body: '这里再大一点' }],
    });
    expect(derived.annotations).toHaveLength(1);
    expect(derived.annotations[0]).toMatchObject({
      nodeId: childId,
      pageId,
      pageName: 'Home',
      nodeName: '标题',
      body: '这里再大一点',
    });
  });

  it('批注钉的节点已经不在文档里 → 不带，并说明有几条没带', () => {
    const { doc } = documentWith();
    const derived = deriveContextFromDocument(doc, {
      selection: [],
      annotations: [{ nodeId: '已删除的节点', body: '还在吗' }],
    });
    expect(derived.annotations).toHaveLength(0);
    expect(derived.annotationsNote).toContain('已经不在文档里');
  });

  it('正文为空的批注 → 不带（空话不进模型）', () => {
    const { doc, childId } = documentWith();
    const derived = deriveContextFromDocument(doc, {
      selection: [],
      annotations: [{ nodeId: childId, body: '   ' }],
    });
    expect(derived.annotations).toHaveLength(0);
  });

  it('正文超长 → 截断到 1000 字', () => {
    const { doc, childId } = documentWith();
    const derived = deriveContextFromDocument(doc, {
      selection: [],
      annotations: [{ nodeId: childId, body: 'x'.repeat(1200) }],
    });
    expect(derived.annotations[0]!.body).toHaveLength(1000);
  });

  it('超过上限的批注 → 只带前 N 条，并说明总数与截断', () => {
    const { doc, childId } = documentWith();
    const annotations = Array.from({ length: ANNOTATION_CONTEXT_LIMIT + 5 }, (_, i) => ({
      nodeId: childId,
      body: `第 ${i} 条`,
    }));
    const derived = deriveContextFromDocument(doc, { selection: [], annotations });
    expect(derived.annotations).toHaveLength(ANNOTATION_CONTEXT_LIMIT);
    expect(derived.annotationsNote).toContain(`批注共 ${ANNOTATION_CONTEXT_LIMIT + 5} 条`);
  });

  it('没有要说的话 → 不产生 annotationsNote 这个字段（不是空串）', () => {
    const { doc, childId } = documentWith();
    const derived = deriveContextFromDocument(doc, {
      selection: [],
      annotations: [{ nodeId: childId, body: '一句正常的话' }],
    });
    expect(derived.annotationsNote).toBeUndefined();
  });
});

describe('deriveContextFromDocument · 设计系统摘要', () => {
  it('token 与组件按文档原样带出（key/type/value 与 props 的类型缺省）', () => {
    const { doc } = documentWith();
    const derived = deriveContextFromDocument(doc, { selection: [] });
    expect(derived.designSystemDigest.tokens.length).toBe(doc.tokens.length);
    const first = derived.designSystemDigest.tokens[0]!;
    expect(Object.keys(first).sort()).toEqual(['key', 'type', 'value']);
    expect(derived.designSystemDigest.components).toEqual([]);
  });

  it('组件的 props 带出类型与缺省值（模型里没有的不补）', () => {
    const { doc } = documentWith();
    doc.components.push({
      id: 'cmp-1',
      name: '按钮',
      rootId: 'x',
      props: [{ name: 'size', type: 'select', options: ['sm', 'lg'], default: 'sm' }],
      variants: [],
      slots: [],
    });
    const derived = deriveContextFromDocument(doc, { selection: [] });
    expect(derived.designSystemDigest.components).toEqual([
      { id: 'cmp-1', name: '按钮', props: { size: { type: 'select', default: 'sm' } } },
    ]);
  });
});
