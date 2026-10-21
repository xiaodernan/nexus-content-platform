import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createNode, createPage } from '@nexus/design-model';
import { StudioStore } from '../src/studio/store';

/**
 * §147 增量重解：**它到底在编辑器里跑没跑**（2026-10-21 查出来的一格）。
 *
 * 判据不用"数"而用**对象身份**：增量路会沿用上一帧那个对象
 * （`resolved[id] = entry` → 同一个对象），全量路会重算出一份**新的**。
 * 所以改一个节点之后，另一个**没被改**的节点的 entry 是不是同一个对象，
 * 就是"走没走增量"的证据——比任何计数器都硬（计数器只说"解了几次"，不说"省没省"）。
 *
 * 这一格查出来的三件事（都在这里钉住）：
 * ① 补丁走写时拷贝 → **文档对象每次都是新的** → 用对象身份判断"这是不是同一份文档"永远为假；
 * ② 改动集合登记在**布局求解之后** → 求解时它是空的 → 增量路从来没被走到；
 * ③ 修正后：改一个节点 → 没被改的节点**沿用同一个对象** ✓；
 *    整份换掉文档 → 代数变了 → **不再沿用** ✓（那是真的换了，不能混用）。
 */

function scene(name: string): { document: ReturnType<typeof createDocument>; aId: string; bId: string } {
  const document = createDocument(name, 'website');
  const page = createPage('Page');
  document.pages = [page];
  document.activePageId = page.id;
  const root = page.nodes[page.rootId]!;
  const a = createNode({ type: 'text', name: 'a', text: '甲' });
  const b = createNode({ type: 'text', name: 'b', text: '乙' });
  page.nodes[a.id] = a;
  page.nodes[b.id] = b;
  root.children.push(a.id, b.id);
  return { document, aId: a.id, bId: b.id };
}

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('§147 增量重解在编辑器里真的在跑', () => {
  it('改一个节点：没被改的节点沿用上一帧那个对象（省下计算真的发生了）', () => {
    stubFetch();
    const { document, aId, bId } = scene('增量');
    const studio = new StudioStore();
    studio.bootstrap(document);

    const before = studio.getSnapshot().layout!;
    expect(before.nodes[aId]).toBeTruthy();

    studio.execute('改 b', [{ op: 'set', nodeId: bId, path: 'name', value: '改了' }]);

    const after = studio.getSnapshot().layout!;
    expect(
      after.nodes[aId],
      '没被改的节点不该消失（增量路只是沿用，不是不要它）',
    ).toBeTruthy();
    expect(
      after.nodes[aId] === before.nodes[aId],
      '没被改的节点没有被沿用 → 这一帧走的是全量，"省下计算"没有发生',
    ).toBe(true);
    // 被改的那个必须是**新算**的（沿用旧的会画出旧内容）
    expect(after.nodes[bId] === before.nodes[bId]).toBe(false);
  });

  it('整份换掉文档：不再沿用上一份的解（那是真的换了，不能混用）', () => {
    stubFetch();
    const first = scene('第一份');
    const studio = new StudioStore();
    studio.bootstrap(first.document);
    const before = studio.getSnapshot().layout!;

    // 换一份**内容完全不同**的文档（同一批 id 也行，关键是它换了）
    const second = scene('第二份');
    studio.bootstrap(second.document);

    const after = studio.getSnapshot().layout!;
    expect(
      after.nodes[first.aId] === before.nodes[first.aId],
      '换了文档还在沿用上一份的解 → 增量基准认错了文档',
    ).toBe(false);
  });
});
