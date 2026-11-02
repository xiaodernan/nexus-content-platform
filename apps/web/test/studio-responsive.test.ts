import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, generatePageComponent, type DesignNode } from '@nexus/design-model';
import { StudioStore, type ViewportMode } from '../src/studio/store';
import { hasResponsiveRule, RESPONSIVE_CHANNELS } from '../src/studio/responsive-editor';
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

function nodeOf(studio: StudioStore, id: string): DesignNode {
  return studio.getSnapshot().page!.nodes[id]!;
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

describe('§14 第三片：排布与字号也接进事务', () => {
  it('容器写间距/排布、文字写字号：一格一条可撤销事务，撤销栈那句话和面板同源', async () => {
    const studio = await readyStudio();
    const actions = nodeNamed(studio, 'Actions');
    const headline = nodeNamed(studio, 'Headline');

    expect(studio.setResponsiveValue([actions.id], 'mobile', 'layout.gap', 64)).toBe(1);
    expect(rules(studio, actions.id)).toEqual([{ breakpoint: 'mobile', patch: { layout: { gap: 64 } } }]);
    expect(studio.setResponsiveValue([actions.id], 'mobile', 'layout.mode', 'vertical')).toBe(1);
    expect(studio.setResponsiveValue([headline.id], 'mobile', 'typography.fontSize', 32)).toBe(1);

    // 同档同组第二次写入是**加一个键**，不是把那一组换掉
    expect(rules(studio, actions.id)).toEqual([
      { breakpoint: 'mobile', patch: { layout: { gap: 64, mode: 'vertical' } } },
    ]);
    // 标签由 `responsiveChannelLabel` 拼：面板上那行的字与撤销栈里那句是同一份来源
    expect(studio.getSnapshot().history.map((h) => h.label).slice(-3)).toEqual([
      '手机断点：改间距',
      '手机断点：改排布',
      '手机断点：改字号',
    ]);

    // 三次写入 = 三条事务：一次撤销只退一格
    studio.undo();
    expect(rules(studio, headline.id)).toBeUndefined();
    studio.undo();
    expect(rules(studio, actions.id)).toEqual([{ breakpoint: 'mobile', patch: { layout: { gap: 64 } } }]);
    studio.undo();
    expect(rules(studio, actions.id)).toBeUndefined();
  });

  it('这些键真的移动画布：间距把第二个按钮推开 64，排布把那一行翻成上下', async () => {
    const studio = await readyStudio();
    const actions = nodeNamed(studio, 'Actions');
    const primary = nodeNamed(studio, 'Primary CTA');
    const secondary = nodeNamed(studio, 'Secondary CTA');

    const pair = (viewport: ViewportMode) => {
      studio.setViewport(viewport);
      const layout = studio.getSnapshot().layout!;
      return { a: layout.nodes[primary.id]!, b: layout.nodes[secondary.id]! };
    };
    /** 第二个按钮相对第一个的下沿/右沿间距（横排读 x，竖排读 y） */
    const gapX = (p: { a: { x: number; width: number }; b: { x: number } }) => p.b.x - (p.a.x + p.a.width);

    // 设计档：横排、gap 是 `{space.3}` token 解出来的那个数
    const design = pair('design');
    expect(design.b.y, '横排同一行：上沿齐平').toBe(design.a.y);
    expect(gapX(design)).toBeGreaterThan(0);
    const designGap = gapX(design);

    studio.setResponsiveValue([actions.id], 'mobile', 'layout.gap', 64);
    const gapped = pair('mobile');
    expect(gapX(gapped), '这一档的间距就是写下去的那个数').toBe(64);
    expect(gapped.b.y).toBe(gapped.a.y);

    studio.setResponsiveValue([actions.id], 'mobile', 'layout.mode', 'vertical');
    const stacked = pair('mobile');
    // 翻成竖排后第二个落在第一个**下面**，同一份间距改吃纵轴
    expect(stacked.b.y - (stacked.a.y + stacked.a.height)).toBe(64);
    // 设计档一个像素都没动：断点规则只在这几档生效（ADR-0069）
    expect(gapX(pair('design'))).toBe(designGap);
  });

  it('抹掉一组里最后一个键，那一组跟着走：模型里不留 `{layout:{}}` 那种空壳', async () => {
    const studio = await readyStudio();
    const actions = nodeNamed(studio, 'Actions');
    studio.setResponsiveValue([actions.id], 'mobile', 'layout.gap', 64);
    studio.setResponsiveValue([actions.id], 'mobile', 'layout.mode', 'vertical');
    studio.setResponsiveValue([actions.id], 'mobile', 'visible', false);

    expect(studio.clearResponsiveChannel([actions.id], 'mobile', 'layout.mode')).toBe(1);
    expect(rules(studio, actions.id)).toEqual([
      { breakpoint: 'mobile', patch: { visible: false, layout: { gap: 64 } } },
    ]);

    // 只剩 layout.gap 这一键：抹掉它那一组就空了，规则整条消失，而不是留下一条什么都不改的
    expect(studio.clearResponsiveChannel([actions.id], 'mobile', 'layout.gap')).toBe(1);
    expect(rules(studio, actions.id)).toEqual([{ breakpoint: 'mobile', patch: { visible: false } }]);
    // 最后一条也没了 → 数组空。store 写回的是数组本身，而所有读者（投影/codegen/徽标/发布闸门）
    // 读的都是 `responsive?.length`，空数组与"没有这个键"在这些读者眼里同一件事
    expect(studio.clearResponsiveChannel([actions.id], 'mobile', 'visible')).toBe(1);
    expect(rules(studio, actions.id)).toEqual([]);
    expect(hasResponsiveRule(nodeOf(studio, actions.id), 'mobile')).toBe(false);
  });
});

describe('§14 第六片：对齐那两键接进事务与画布', () => {
  it('主轴对齐把第二个按钮顶到那一行的右端、交叉轴把它压到下沿：一格一条事务，撤销各退各的', async () => {
    const studio = await readyStudio();
    const actions = nodeNamed(studio, 'Actions');
    const primary = nodeNamed(studio, 'Primary CTA');
    const secondary = nodeNamed(studio, 'Secondary CTA');

    const box = (id: string) => {
      studio.setViewport('mobile');
      return studio.getSnapshot().layout!.nodes[id]!;
    };
    /** 下面几句"贴到容器边"只在容器没有内边距时成立——那是前提，不是我以为 */
    const pad = (side: 'top' | 'right' | 'bottom' | 'left') =>
      nodeOf(studio, actions.id).layout.padding?.[side] ?? 0;
    expect([pad('top'), pad('right'), pad('bottom'), pad('left')]).toEqual([0, 0, 0, 0]);

    // 先撑出富余：hug 容器的主轴就是内容尺寸，没有富余时 `space-between` 无处可摆，
    // 那一格按下去什么都不动——面板会把这种档位摆出来吗？不会（`alignableAt` 只看排布），
    // 所以这里用真富余来证"写下去的键确实移动画布"，而不是只落进模型。
    expect(studio.setResponsiveValue([actions.id], 'mobile', 'size.width', 800)).toBe(1);
    expect(studio.setResponsiveValue([actions.id], 'mobile', 'size.height', 400)).toBe(1);
    const row = box(actions.id);
    expect(row.width).toBe(800);
    const tightGap = box(secondary.id).x - (box(primary.id).x + box(primary.id).width);

    expect(studio.setResponsiveValue([actions.id], 'mobile', 'layout.justify', 'space-between')).toBe(1);
    const spread = box(secondary.id).x - (box(primary.id).x + box(primary.id).width);
    expect(spread, '整份富余都落进两个按钮之间').toBeGreaterThan(tightGap);
    // 两端贴容器边（没有内边距）：第一个还在左沿，第二个的右沿顶到右端
    expect(box(primary.id).x).toBe(row.x);
    expect(box(secondary.id).x + box(secondary.id).width).toBe(row.x + row.width);

    expect(studio.setResponsiveValue([actions.id], 'mobile', 'layout.items', 'end')).toBe(1);
    const after = box(actions.id);
    expect(box(secondary.id).y + box(secondary.id).height, '交叉轴：那一行压到下沿').toBe(after.y + after.height);

    expect(rules(studio, actions.id)).toEqual([
      {
        breakpoint: 'mobile',
        patch: { layout: { justify: 'space-between', items: 'end' }, size: { width: 800, height: 400 } },
      },
    ]);
    // 撤销栈那句话与面板那一行同源（都读 `RESPONSIVE_CHANNELS` 的 label）
    expect(studio.getSnapshot().history.map((h) => h.label).slice(-2)).toEqual([
      '手机断点：改主轴对齐',
      '手机断点：改交叉轴',
    ]);

    // 一格一条事务：退掉交叉轴那一条，那一行回到上沿；主轴对齐那条还在
    studio.undo();
    expect(box(secondary.id).y + box(secondary.id).height).toBeLessThan(box(actions.id).y + box(actions.id).height);
    expect(box(secondary.id).x + box(secondary.id).width).toBe(box(actions.id).x + box(actions.id).width);

    // 设计档一个像素都没动：这两键只写进手机那一档（§14）
    studio.setViewport('design');
    const design = studio.getSnapshot().layout!;
    const designSecondary = design.nodes[secondary.id]!;
    expect(designSecondary.x + designSecondary.width).toBeLessThan(800);
  });

  it('那一档解成网格时，面板与代码都不认这两格：按下去什么都不动的按钮不摆（§159）', async () => {
    const studio = await readyStudio();
    const actions = nodeNamed(studio, 'Actions');
    // 把这一档翻成网格：`applyResponsive` 之后这一档的排布是 grid，求解器不看对齐
    expect(studio.setResponsiveValue([actions.id], 'mobile', 'layout.mode', 'grid')).toBe(1);
    const node = nodeOf(studio, actions.id);
    const specs = RESPONSIVE_CHANNELS.filter(
      (spec) => spec.id === 'layout.justify' || spec.id === 'layout.items',
    );
    expect(specs).toHaveLength(2);
    specs.forEach((spec) => {
      expect(spec.appliesTo(node, 'mobile'), `${spec.id} 在网格那一档不该摆出输入口`).toBe(false);
    });
    // 而代码那一寸也不发：发得出与读得回是同一判据（codegen / code-parse / layout 共用 types.ts 的 ALIGNABLE_MODES）
    const code = generatePageComponent(studio.getSnapshot().page!, {}, 'Home').contents;
    const line = code.split('\n').find((l) => l.includes(actions.id))!;
    expect(line).not.toContain('justify-');
    expect(line).not.toContain('items-');
    // 竖排那一档仍然摆得出这两格：收回去的判据是排布，不是节点
    studio.setResponsiveValue([actions.id], 'mobile', 'layout.mode', 'horizontal');
    expect(specs.every((spec) => spec.appliesTo(nodeOf(studio, actions.id), 'mobile'))).toBe(true);
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
