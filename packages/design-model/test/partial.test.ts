import { describe, expect, it } from 'vitest';
import { createNode, createPage } from '../src/nodes';
import { resolveLayout } from '../src/layout';
import { geometryToBox, projectViewport } from '../src/partial';
import type { DesignNode, Page } from '../src/types';

/**
 * 首屏投影（§147 下一片的第一片）的**红线**。
 *
 * 这一层只做投影，**不改任何现有行为** ⇒ 它唯一该被钉住的是：
 * **投影里的东西与全量解逐项相等**（几何与内容都是）——
 * 投影是为了"少传字节"，不是为了"少传真相"。
 * 少一个字段、少一个节点、坐标差一像素 ⇒ 画布上就会少东西或串位。
 *
 * 另一条红线：**编码可逆**（数组只是省字节，不是换语义）。
 */

/**
 * 一页：500 个节点（一排兄弟）——**必须超过 400**（`CANVAS_VIRTUALIZATION_THRESHOLD`），
 * 否则画布按规矩**不裁**（"那点儿 DOM 不值得改变可观察行为"）⇒ 投影就会带全量 ⇒ 裁剪那条量不到。
 */
function scene(): Page {
  const page = createPage('Partial', 1440, 900);
  const root = page.nodes[page.rootId]!;
  const kids: DesignNode[] = [];
  for (let i = 0; i < 500; i += 1) {
    const node = createNode({
      type: 'text',
      name: `t-${i}`,
      text: `第 ${i} 行`,
      parentId: root.id,
      position: { x: 0, y: i * 40 },
    });
    page.nodes[node.id] = node;
    kids.push(node);
  }
  root.children = kids.map((k) => k.id);
  return page;
}

describe('首屏投影：与全量解逐项相等', () => {
  it('几何逐项相等（数组编码可逆）', () => {
    const page = scene();
    const layout = resolveLayout(page);
    const view = { x: 0, y: 0, width: 1440, height: 900 };
    const projection = projectViewport(layout, view);

    for (const [id, entry] of Object.entries(layout.nodes)) {
      const geometry = projection.geometry[id];
      expect(geometry, `节点 ${id} 没有几何`).toBeTruthy();
      const box = geometryToBox(geometry!);
      expect(box.x).toBe(entry.x);
      expect(box.y).toBe(entry.y);
      expect(box.width).toBe(entry.width);
      expect(box.height).toBe(entry.height);
      expect(box.depth).toBe(entry.depth);
      expect(box.parentId).toBe(entry.parentId);
      expect(box.children).toEqual(entry.children);
    }
  });

  it('视口内的内容与全量解**逐项相等**（同一个对象的内容，不是重造的）', () => {
    const page = scene();
    const layout = resolveLayout(page);
    const view = { x: 0, y: 0, width: 1440, height: 900 };
    const projection = projectViewport(layout, view);

    for (const [id, node] of Object.entries(projection.content)) {
      expect(node, `内容 ${id} 与全量解不等`).toEqual(layout.nodes[id]!.node);
    }
  });

  it('视口外的内容**不在**投影里（根节点除外：它是画布的容器）', () => {
    const page = scene();
    const layout = resolveLayout(page);
    // 只看最上面 200px ⇒ 只有前几个节点在视口内
    const view = { x: 0, y: 0, width: 1440, height: 200 };
    const projection = projectViewport(layout, view);

    const outside = Object.keys(layout.nodes).filter(
      (id) => id !== layout.rootId && !projection.content[id],
    );
    expect(outside.length, '视口外的节点本该被裁掉，却还在投影里').toBeGreaterThan(0);
    // 被裁掉的那些**几何还在**（画布要靠它知道"那儿有个东西"）
    for (const id of outside) {
      expect(projection.geometry[id], `被裁掉的节点 ${id} 连几何都没了`).toBeTruthy();
    }
    // 根节点永远在内容里
    expect(projection.content[layout.rootId]).toBeTruthy();
  });

  it('换视口 ⇒ 内容集合跟着换（这一格不是"固定带那几十个"）', () => {
    const page = scene();
    const layout = resolveLayout(page);
    const top = projectViewport(layout, { x: 0, y: 0, width: 1440, height: 200 });
    const bottom = projectViewport(layout, { x: 0, y: 1200, width: 1440, height: 200 });
    const topIds = Object.keys(top.content).sort();
    const bottomIds = Object.keys(bottom.content).sort();
    expect(topIds).not.toEqual(bottomIds);
    // 两边都还带着根节点
    expect(topIds).toContain(layout.rootId);
    expect(bottomIds).toContain(layout.rootId);
  });

  it('几何与内容都齐的那一份，加起来比整份文档小得多（省字节是这个存在的理由）', () => {
    const page = scene();
    const layout = resolveLayout(page);
    const projection = projectViewport(layout, { x: 0, y: 0, width: 1440, height: 900 });
    const full = JSON.stringify(layout).length;
    const partial = JSON.stringify(projection).length;
    expect(partial, '投影反而更大了').toBeLessThan(full);
  });
});
