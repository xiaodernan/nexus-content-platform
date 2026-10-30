import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, type DesignNode } from '@nexus/design-model';
import { StudioStore } from '../src/studio/store';
import { setStudioReadOnly } from '../src/studio/read-only';

/**
 * §14 断点规则的 store 半边：面板每一次写入都必须是**一条可撤销事务**（§150），
 * 而"不改任何东西的写入"必须一条都不产生（§159）。
 *
 * 剪掉冗余的判据在 `responsive-editor` 里（单测已经钉过），这里钉的是它接到 store 之后
 * 剩下的三件事：① 事务与 dirty 的记账；② 多选广播时**每个节点各算各的**（同一份值贴过去
 * 是错的，因为每个节点自己的投影不一样）；③ 画布预览与发布页共用同一份 `resolveLayout`
 * ——切 viewport 就能看到规则生效，不存在"改了但界面不认"的第二条渲染路径（ADR-0063）。
 */

function installFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: unknown, init?: { method?: string }) => {
      const method = init?.method ?? 'GET';
      const json = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload });
      if (method === 'PATCH' || method === 'PUT') return json({ ok: true, savedAt: '2026-10-30T00:00:00.000Z' });
      if (String(_input).includes('/snapshots')) return json({ snapshots: [], branches: [] });
      if (String(_input).includes('/publication')) return json({ publication: null });
      if (String(_input).includes('/annotations')) return json({ annotations: [] });
      return json({ document: createDocument('断点编辑', 'website') });
    }),
  );
}

async function readyStudio(): Promise<StudioStore> {
  const studio = new StudioStore();
  await studio.load('p1');
  return studio;
}

function nodeNamed(studio: StudioStore, name: string): DesignNode {
  const page = studio.getSnapshot().page!;
  const node = Object.values(page.nodes).find((n) => n.name === name);
  if (!node) throw new Error(`起手页里找不到 ${name}`);
  return node;
}

function rules(studio: StudioStore, id: string): unknown {
  return studio.getSnapshot().page!.nodes[id]!.responsive;
}

function historyLength(studio: StudioStore): number {
  return studio.getSnapshot().history.length;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  setStudioReadOnly(false);
  installFetch();
});

describe('§14 断点规则写入的事务记账', () => {
  it('写一条隐藏规则：落到模型、多一条可撤销事务、标脏', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    const before = historyLength(studio);

    expect(studio.setResponsiveValue([cta.id], 'mobile', 'visible', false)).toBe(1);
    expect(rules(studio, cta.id)).toEqual([{ breakpoint: 'mobile', patch: { visible: false } }]);
    expect(historyLength(studio)).toBe(before + 1);
    expect(studio.getSnapshot().dirty).toBe(true);

    studio.undo();
    expect(rules(studio, cta.id)).toBeUndefined();
    // 快照里的 history 是"undo 栈 + redo 栈"摊平的那条线（HistoryPanel 用的就是它），
    // 所以撤销一次长度不掉——长度掉的是 redo：那一次改动整个回到 undo 那一侧
    expect(historyLength(studio)).toBe(before + 1);
    studio.redo();
    expect(rules(studio, cta.id)).toEqual([{ breakpoint: 'mobile', patch: { visible: false } }]);
  });

  it('写一个不改任何东西的值：返回 0、不多一条事务、不标脏（撤销栈不被废改动占满）', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    const before = historyLength(studio);
    // CTA 在设计尺寸本来就可见 → 在 mobile 写 visible=true 不改任何投影
    expect(studio.getSnapshot().dirty).toBe(false);

    expect(studio.setResponsiveValue([cta.id], 'mobile', 'visible', true)).toBe(0);
    expect(historyLength(studio)).toBe(before);
    expect(studio.getSnapshot().dirty).toBe(false);
    expect(rules(studio, cta.id)).toBeUndefined();
  });

  it('级联基准接到 store 之后仍然是投影：mobile 改成 0.5 后，tablet 写 0.5 是零改动、写 1 才是改动', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    expect(studio.setResponsiveValue([cta.id], 'mobile', 'style.opacity', 0.5)).toBe(1);

    // 设计值是 1。拿设计值当基准会把这两条判反：tablet 写 1 看着"和 mobile 的 0.5 不同"，
    // 但它其实顶掉了继承过来的 0.5 ⇒ 真改动；tablet 写 0.5 看着"和设计值不同"，
    // 可这一档的投影本来就是 0.5 ⇒ 零改动。
    expect(studio.setResponsiveValue([cta.id], 'tablet', 'style.opacity', 0.5)).toBe(0);
    expect(rules(studio, cta.id)).toEqual([{ breakpoint: 'mobile', patch: { style: { opacity: 0.5 } } }]);

    expect(studio.setResponsiveValue([cta.id], 'tablet', 'style.opacity', 1)).toBe(1);
    expect(rules(studio, cta.id)).toEqual([
      { breakpoint: 'mobile', patch: { style: { opacity: 0.5 } } },
      { breakpoint: 'tablet', patch: { style: { opacity: 1 } } },
    ]);
  });

  it('多选广播：两个节点合成一条命令，撤销一次全回去', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    const headline = nodeNamed(studio, 'Headline');
    const before = historyLength(studio);

    expect(studio.setResponsiveValue([cta.id, headline.id], 'mobile', 'size.width', 300)).toBe(2);
    expect(rules(studio, cta.id)).toEqual([{ breakpoint: 'mobile', patch: { size: { width: 300 } } }]);
    expect(rules(studio, headline.id)).toEqual([{ breakpoint: 'mobile', patch: { size: { width: 300 } } }]);
    expect(historyLength(studio)).toBe(before + 1);

    studio.undo();
    expect(rules(studio, cta.id)).toBeUndefined();
    expect(rules(studio, headline.id)).toBeUndefined();
  });

  it('各节点按自己的投影算：已经隐藏的那个不重复收一次，返回真正落到的 1 个', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    const headline = nodeNamed(studio, 'Headline');
    studio.setResponsiveValue([headline.id], 'mobile', 'visible', false);
    const before = historyLength(studio);

    expect(studio.setResponsiveValue([cta.id, headline.id], 'mobile', 'visible', false)).toBe(1);
    expect(historyLength(studio)).toBe(before + 1);
    expect(rules(studio, cta.id)).toEqual([{ breakpoint: 'mobile', patch: { visible: false } }]);
  });
});

describe('§14 清除的两层粒度', () => {
  it('抹掉一个键只抹这个键；清掉整档把这一档全清、别的档不动', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    studio.setResponsiveValue([cta.id], 'mobile', 'visible', false);
    studio.setResponsiveValue([cta.id], 'mobile', 'style.opacity', 0.4);
    studio.setResponsiveValue([cta.id], 'wide', 'style.opacity', 0.1);
    expect(rules(studio, cta.id)).toEqual([
      { breakpoint: 'mobile', patch: { visible: false, style: { opacity: 0.4 } } },
      { breakpoint: 'wide', patch: { style: { opacity: 0.1 } } },
    ]);

    expect(studio.clearResponsiveChannel([cta.id], 'mobile', 'style.opacity')).toBe(1);
    expect(rules(studio, cta.id)).toEqual([
      { breakpoint: 'mobile', patch: { visible: false } },
      { breakpoint: 'wide', patch: { style: { opacity: 0.1 } } },
    ]);

    expect(studio.dropResponsiveRule([cta.id], 'mobile')).toBe(1);
    expect(rules(studio, cta.id)).toEqual([{ breakpoint: 'wide', patch: { style: { opacity: 0.1 } } }]);

    // 已经没有这一档 → 第二次清是零改动，不该再多一条事务
    const before = historyLength(studio);
    expect(studio.dropResponsiveRule([cta.id], 'mobile')).toBe(0);
    expect(historyLength(studio)).toBe(before);
  });
});

describe('§14 画布预览与发布同一份投影', () => {
  it('setViewport(mobile) 让这条规则当场生效；切回 design 又原样回来', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');

    expect(studio.getSnapshot().layout!.paintOrder).toContain(cta.id);

    studio.setResponsiveValue([cta.id], 'mobile', 'visible', false);
    studio.setViewport('mobile');
    const atMobile = studio.getSnapshot().layout!;
    expect(atMobile.nodes[cta.id]!.node.visible, '布局求解里这一档该是隐藏的').toBe(false);
    expect(atMobile.paintOrder, '隐藏的元素不该进绘制次序').not.toContain(cta.id);
    expect(atMobile.width, '根画框按断点宽重解（ADR-0069 的机制，不是第二条渲染路径）').toBe(375);

    studio.setViewport('design');
    const atDesign = studio.getSnapshot().layout!;
    expect(atDesign.nodes[cta.id]!.node.visible).toBe(true);
    expect(atDesign.paintOrder).toContain(cta.id);
    expect(atDesign.width).toBe(studio.getSnapshot().page!.width);

    // 切视口是视图偏好（read-only.ts 的例外那条）：不该因此多出事务，也不该重播那次隐藏
    const historyAfterRule = historyLength(studio);
    studio.setViewport('wide');
    studio.setViewport('design');
    expect(historyLength(studio)).toBe(historyAfterRule);
    expect(rules(studio, cta.id)).toEqual([{ breakpoint: 'mobile', patch: { visible: false } }]);
  });
});

describe('§14 viewer 只读闸', () => {
  it('只读时三种断点写入全部零改动：不进撤销栈、不标脏、不写模型', async () => {
    const studio = await readyStudio();
    const cta = nodeNamed(studio, 'Primary CTA');
    studio.setResponsiveValue([cta.id], 'mobile', 'visible', false);
    setStudioReadOnly(true);
    const before = historyLength(studio);
    const dirtyBefore = studio.getSnapshot().dirty;

    expect(studio.setResponsiveValue([cta.id], 'wide', 'visible', false)).toBe(0);
    expect(studio.clearResponsiveChannel([cta.id], 'mobile', 'visible')).toBe(0);
    expect(studio.dropResponsiveRule([cta.id], 'mobile')).toBe(0);

    expect(historyLength(studio)).toBe(before);
    expect(studio.getSnapshot().dirty).toBe(dirtyBefore);
    expect(rules(studio, cta.id)).toEqual([{ breakpoint: 'mobile', patch: { visible: false } }]);
  });
});
