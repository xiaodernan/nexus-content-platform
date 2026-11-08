import { describe, expect, it } from 'vitest';
import {
  applyResponsive,
  createNode,
  makeTokenRef,
  type BreakpointName,
  type DesignNode,
  type Layout,
  type ResponsiveRule,
} from '@nexus/design-model';
import {
  RESPONSIVE_CHANNELS,
  designValueOf,
  hasResponsiveRule,
  projectedValueOf,
  responsiveChannelsFor,
  responsiveChannelsOf,
  responsiveImpactDetailOf,
  responsiveImpactOf,
  responsiveOverrideOf,
  withResponsiveValue,
  withoutResponsiveChannel,
  withoutResponsiveRule,
  type ResponsiveChannel,
} from '../src/studio/responsive-editor';
/**
 * §14 断点规则编辑内核的单测。
 *
 * 这块逻辑唯一的产品要求是"写下去的键真的改变那一档的投影"，而投影由模型
 * （`applyResponsive` + 级联次序）决定，所以这里的断言一律**跑真投影**，
 * 不比对手抄的中间值——比对手抄的那份迟早和 layout.ts 分家。
 */

function mkNode(patch: Partial<DesignNode> = {}): DesignNode {
  const node = createNode({
    type: 'frame',
    name: '卡片',
    size: { width: 1280, height: 640 },
    style: { opacity: 1 },
  });
  return { ...node, ...patch };
}

/** 一个真能排布的容器：`layout.*` 那几格只对**有子节点**的元素摆得出输入口 */
function mkContainer(patch: Partial<DesignNode> = {}): DesignNode {
  return mkNode({ name: '容器', children: ['child-a', 'child-b'], ...patch });
}

function mkText(): DesignNode {
  return createNode({ type: 'text', name: '标题', text: '标题' });
}

/** 只换排布里点名的那几个键，`padding`/`justify`/`items` 仍用模型给的默认值 */
function withLayout(node: DesignNode, layout: Partial<Layout>): DesignNode {
  return { ...node, layout: { ...node.layout, ...layout } };
}

const json = (value: unknown): string => JSON.stringify(value);

function rule(rules: ResponsiveRule[], breakpoint: BreakpointName): ResponsiveRule | undefined {
  return rules.find((r) => r.breakpoint === breakpoint);
}

function withRules(node: DesignNode, rules: ResponsiveRule[]): DesignNode {
  return { ...node, responsive: rules };
}

describe('§14 断点规则写入的键级语义', () => {
  it('第一次写入长出一条规则，且投影真的在 mobile 变、design 不变', () => {
    const node = mkNode();
    const next = withResponsiveValue(node, 'mobile', 'visible', false);

    expect(next).toEqual([{ breakpoint: 'mobile', patch: { visible: false } }]);
    const hidden = applyResponsive({ ...node, responsive: next }, 'mobile');
    expect(hidden.visible).toBe(false);
    // 设计尺寸那一档一个字节都不该被改（缺参数=作者发布的那一份，ADR-0069 第一条约束）
    expect(applyResponsive({ ...node, responsive: next }, undefined).visible).toBe(true);
  });

  it('同档第二个键不抹掉第一个：写宽再写透明度，两条都在（applyResponsive 按组 Object.assign）', () => {
    const node = mkNode();
    const first = withResponsiveValue(node, 'tablet', 'size.width', 700);
    const second = withResponsiveValue({ ...node, responsive: first }, 'tablet', 'style.opacity', 0.4);

    expect(second).toHaveLength(1);
    expect(rule(second, 'tablet')!.patch).toEqual({ size: { width: 700 }, style: { opacity: 0.4 } });
    const projected = applyResponsive({ ...node, responsive: second }, 'tablet');
    expect(projected.size.width).toBe(700);
    expect(projected.style.opacity).toBe(0.4);
  });

  it('同档内别的键也不动：抹掉宽度只抹宽度', () => {
    const node = withRules(mkNode(), [
      { breakpoint: 'tablet', patch: { size: { width: 700, height: 200 }, style: { opacity: 0.4 } } },
    ]);
    const next = withoutResponsiveChannel(node, 'tablet', 'size.width');

    expect(rule(next, 'tablet')!.patch).toEqual({ size: { height: 200 }, style: { opacity: 0.4 } });
  });

  it('抹掉最后一个键 → 整条规则消失，不留一条不改任何东西的空壳', () => {
    const node = withRules(mkNode(), [{ breakpoint: 'desktop', patch: { visible: false } }]);
    expect(withoutResponsiveChannel(node, 'desktop', 'visible')).toEqual([]);

    const sized = withRules(mkNode(), [{ breakpoint: 'desktop', patch: { size: { width: 900 } } }]);
    expect(withoutResponsiveChannel(sized, 'desktop', 'size.width')).toEqual([]);
  });
});

describe('§14 冗余判据：基准是这一档的投影，不是设计值', () => {
  // 级联（layout.ts 的 applyResponsive：`<=` 过滤 + 窄到宽应用）意味着
  // "和设计值不同"这个判据会做反两件事：
  // 1) 把不改任何东西的键存下来（tablet 写回设计值 1，可 mobile 那条 0.5 已经生效到 tablet）；
  // 2) 把真的改东西的键当冗余剪掉（tablet 写 0.5 看着和设计值 1 不同、和 mobile 相同……）。
  // 这里钉的就是这两条各按投影判定后的正确结果。
  const cascaded = withRules(mkNode(), [{ breakpoint: 'mobile', patch: { style: { opacity: 0.5 } } }]);

  it('tablet 写回设计值 1 要存下：它把 mobile 继承过来的 0.5 顶掉了', () => {
    const next = withResponsiveValue(cascaded, 'tablet', 'style.opacity', 1);

    expect(rule(next, 'tablet')!.patch).toEqual({ style: { opacity: 1 } });
    expect(applyResponsive({ ...cascaded, responsive: next }, 'tablet').style.opacity).toBe(1);
    // mobile 那一档不受影响：更宽的档覆盖不了更窄的那一档
    expect(applyResponsive({ ...cascaded, responsive: next }, 'mobile').style.opacity).toBe(0.5);
  });

  it('tablet 写 0.5 要剪掉：这一档的投影本来就是 0.5，存下来就是一条不改任何东西的规则', () => {
    const next = withResponsiveValue(cascaded, 'tablet', 'style.opacity', 0.5);

    expect(rule(next, 'tablet')).toBeUndefined();
    expect(next).toEqual(cascaded.responsive);
    // 剪掉的是"这一档自己那条规则"，不是这一档的差别：tablet 的投影仍和设计不同（mobile 带上来的）
    expect(hasResponsiveRule({ ...cascaded, responsive: next }, 'tablet')).toBe(false);
    expect(responsiveImpactOf({ ...cascaded, responsive: next }, 'tablet')).toBe(1);
  });

  it('剪掉不影响更宽的档：tablet 那条键没了，desktop/wide 的投影一个像素都没变', () => {
    const withTablet = withResponsiveValue(cascaded, 'tablet', 'style.opacity', 0.5);
    const explicitly = withResponsiveValue(cascaded, 'tablet', 'style.opacity', 0.51);
    for (const bp of ['desktop', 'wide'] as BreakpointName[]) {
      expect(applyResponsive({ ...cascaded, responsive: explicitly }, bp).style.opacity).toBe(0.51);
      expect(applyResponsive({ ...cascaded, responsive: withTablet }, bp).style.opacity).toBe(0.5);
    }
  });

  it('把覆盖改成投影原值 = 抹掉这个键，而不是新增一条规则', () => {
    const authored = withRules(mkNode(), [
      { breakpoint: 'mobile', patch: { size: { width: 375, height: 200 } } },
    ]);
    const back = withResponsiveValue(authored, 'mobile', 'size.height', 640);

    expect(rule(back, 'mobile')!.patch).toEqual({ size: { width: 375 } });
    expect(back).toHaveLength(1);
  });
});

describe('§14 断点格上的徽标数：这一档"值得看一眼"的改动', () => {
  // 徽标那句人话是"这一档改了几处投影"，所以它必须回答作者真正会问的问题：
  // 我停在这一档，画布/访客跟设计尺寸比到底哪里不一样、这一档自己有没有在顶着什么。
  // 只数"自己那条规则"会读出一个谎：平板档画布已经按手机那条藏起来了，格子却标 0
  // （e2e/responsive-authoring.spec.ts 腿 E 抓到的就是这个）。
  it('只有更窄那一档的规则：这一档没有规则，但投影和设计不一样 ⇒ 1，不是 0', () => {
    const node = withRules(mkNode(), [{ breakpoint: 'mobile', patch: { visible: false } }]);

    expect(hasResponsiveRule(node, 'tablet')).toBe(false);
    expect(responsiveImpactOf(node, 'tablet')).toBe(1);
    expect(responsiveImpactOf(node, 'mobile')).toBe(1);
    // 宽屏同样吃到级联
    expect(responsiveImpactOf(node, 'wide')).toBe(1);
  });

  it('这一档的规则把更窄档的改动顶回设计值 ⇒ 也数 1：删掉它，这一档立刻变', () => {
    const reverted = withRules(mkNode(), [
      { breakpoint: 'mobile', patch: { style: { opacity: 0.5 } } },
      { breakpoint: 'tablet', patch: { style: { opacity: 1 } } }, // 和设计值 1 相同
    ]);

    // 只跟设计值比会读成 0，可这条规则一摘掉 tablet 就跟着 mobile 走成 0.5
    expect(projectedValueOf(reverted, 'tablet', 'style.opacity')).toBe(1);
    expect(designValueOf(reverted, 'style.opacity')).toBe(1);
    expect(hasResponsiveRule(reverted, 'tablet')).toBe(true);
    expect(responsiveImpactOf(reverted, 'tablet')).toBe(1);
    // 而它只顶 tablet 及以上：mobile 那一档还是 0.5
    expect(responsiveImpactOf(reverted, 'mobile')).toBe(1);
  });

  it('真正的 0：这一档的投影和设计一样、摘掉它的规则也一样', () => {
    const plain = mkNode();
    expect(responsiveImpactOf(plain, 'tablet')).toBe(0);
    expect(hasResponsiveRule(plain, 'tablet')).toBe(false);

    // 手抄进来的空覆盖（AI 配方/代码视图能写出这种）：有规则，但一处都没改
    const dead = withRules(mkNode(), [{ breakpoint: 'tablet', patch: { style: { opacity: 1 } } }]);
    expect(hasResponsiveRule(dead, 'tablet')).toBe(true);
    expect(responsiveImpactOf(dead, 'tablet')).toBe(0);
  });

  it('模型里有这个键、但这一格摆不出输入口：清档那颗仍要按得动，徽标也不该假装看不见', () => {
    // frame 没有 typography 对象，`applyResponsive` 那一遍压根没处 assign（layout.ts:175 的
    // `rule.patch.typography && merged.typography`）——这条规则真的什么都不改，所以徽标读 0。
    // 而"这一档有没有规则"看的是模型里那一条，不是面板摆不摆得出格子。
    const typo = withRules(mkNode(), [{ breakpoint: 'tablet', patch: { typography: { fontSize: 14 } } }]);
    expect(responsiveChannelsOf(typo, 'tablet'), '字号这个键确实在模型里').toEqual(['typography.fontSize']);
    expect(
      responsiveChannelsFor(typo, 'tablet').map((s) => s.id),
      '这个元素摆不出字号那一格'
    ).not.toContain('typography.fontSize');
    expect(hasResponsiveRule(typo, 'tablet')).toBe(true);
    expect(responsiveImpactOf(typo, 'tablet')).toBe(0);
    // 一处投影都没改，也就用不着那句"面板没有输入口"的点名
    expect(responsiveImpactDetailOf(typo, 'tablet').outsidePanel).toEqual([]);
  });

  it('文字节点的字号：画布与访客真的在变，而这一格现在摆得出输入口', () => {
    const node = withRules(mkText(), [{ breakpoint: 'tablet', patch: { typography: { fontSize: 14 } } }]);
    expect(responsiveChannelsOf(node, 'tablet')).toEqual(['typography.fontSize']);
    expect(responsiveChannelsFor(node, 'tablet').map((s) => s.id)).toContain('typography.fontSize');
    expect(responsiveImpactOf(node, 'tablet')).toBe(1);
    const detail = responsiveImpactDetailOf(node, 'tablet');
    expect(detail.panelChannels).toBe(1);
    expect(detail.outsidePanel).toEqual([]);
  });

  it('总数拆开说：面板内外的键各归各，一条规则里两边都有时不混成一格', () => {
    // 容器有子节点 ⇒ 排布/间距这两格摆得出；`layout.padding` 在面板上没有那一格，单独点名
    const node = withRules(mkContainer(), [
      {
        breakpoint: 'tablet',
        patch: { style: { opacity: 0.4 }, layout: { gap: 8, padding: { top: 4, right: 4, bottom: 4, left: 4 } } },
      },
    ]);
    expect(responsiveImpactDetailOf(node, 'tablet')).toEqual({
      total: 3,
      panelChannels: 2,
      outsidePanel: ['layout.padding'],
    });
  });

  it('AI 配方那条移动档规则（layout 三个键 + size.width）在徽标里是 4 处，其中三处有了输入口', () => {
    // 配方挑的就是这种容器：横排按钮行在手机档折成竖排、单列、宽度填满
    const row = createNode({
      type: 'frame',
      name: '按钮行',
      size: { width: 640, height: 120 },
      layout: { mode: 'horizontal', gap: 16 },
    });
    const node = withRules({ ...row, children: ['a', 'b'] }, [
      {
        breakpoint: 'mobile',
        patch: { layout: { mode: 'vertical', columns: 1, gap: 12 }, size: { width: 'fill' } },
      },
    ]);
    const detail = responsiveImpactDetailOf(node, 'mobile');
    expect(detail.total).toBe(4);
    expect(detail.panelChannels).toBe(3); // 排布 / 间距 / 宽
    // 只有 `layout.columns` 摆不出格子：这一档投影出来的排布是竖排，不是网格
    expect(detail.outsidePanel).toEqual(['layout.columns']);
    expect(responsiveImpactOf(node, 'wide')).toBe(4);
  });

  it('配方写在设计值上的那个键不进徽标：mode 本来就是 vertical ⇒ 只剩 gap 一处', () => {
    // 与上一条同一份补丁形状，只是起点是竖排的容器：`layout.mode` 这一键真的什么都不改
    const node = withRules(mkContainer(), [
      { breakpoint: 'mobile', patch: { layout: { mode: 'vertical', gap: 12 }, size: { width: 'fill' } } },
    ]);
    expect(responsiveImpactDetailOf(node, 'mobile')).toEqual({
      total: 2,
      panelChannels: 2,
      outsidePanel: [],
    });
  });

  it('排布改成网格，列数那一格跟着出现——那一格只在网格档摆出来', () => {
    const row = withLayout(mkContainer(), { mode: 'horizontal', gap: 16 });
    expect(
      responsiveChannelsFor(row, 'mobile').map((s) => s.id),
      '横排的元素摆不出列数那一格'
    ).not.toContain('layout.columns');
    const toGrid = withResponsiveValue(row, 'mobile', 'layout.mode', 'grid');
    expect(rule(toGrid, 'mobile')!.patch).toEqual({ layout: { mode: 'grid' } });
    const atMobile = { ...row, responsive: toGrid };
    expect(projectedValueOf(atMobile, 'mobile', 'layout.mode')).toBe('grid');
    expect(responsiveChannelsFor(atMobile, 'mobile').map((s) => s.id)).toContain('layout.columns');
    const authored = withResponsiveValue(atMobile, 'mobile', 'layout.columns', 2);
    expect(rule(authored, 'mobile')!.patch).toEqual({ layout: { mode: 'grid', columns: 2 } });
    // 设计档没有 columns 这个键，所以"写 2 就是改投影"，两档各数各的
    expect(designValueOf({ ...row, responsive: authored }, 'layout.columns')).toBeUndefined();
    expect(responsiveImpactDetailOf({ ...row, responsive: authored }, 'mobile')).toEqual({
      total: 2,
      panelChannels: 2,
      outsidePanel: [],
    });
  });

  it('对齐那两格跟着这一档解出来的排布走：翻成网格就收回去、那句点名接管', () => {
    // 求解器的 grid / wrap 分支在用到 justify/items 之前就 return 了，所以那两档下
    // 这一格按下去什么都改不了——面板不摆（§159），codegen 也不发（同一份 ALIGNABLE_MODES）
    const row = withLayout(mkContainer(), { mode: 'horizontal', justify: 'start', items: 'center' });
    expect(
      responsiveChannelsFor(row, 'mobile').map((s) => s.id),
      '横排的容器摆得出主轴对齐那一格'
    ).toEqual(expect.arrayContaining(['layout.justify', 'layout.items']));

    const justified = withResponsiveValue(row, 'mobile', 'layout.justify', 'space-between');
    expect(rule(justified, 'mobile')!.patch).toEqual({ layout: { justify: 'space-between' } });
    const atMobile = { ...row, responsive: justified };
    expect(projectedValueOf(atMobile, 'mobile', 'layout.justify')).toBe('space-between');
    expect(responsiveImpactDetailOf(atMobile, 'mobile')).toEqual({
      total: 1,
      panelChannels: 1,
      outsidePanel: [],
    });

    // 同一档再翻成网格：那一格没了输入口，但键还在模型里 ⇒ 改成要点名的那一处
    const toGrid = withResponsiveValue(atMobile, 'mobile', 'layout.mode', 'grid');
    expect(rule(toGrid, 'mobile')!.patch).toEqual({ layout: { justify: 'space-between', mode: 'grid' } });
    const gridTier = { ...row, responsive: toGrid };
    expect(
      responsiveChannelsFor(gridTier, 'mobile').map((s) => s.id),
      '网格档摆不出对齐那一格（按下去什么都不改）'
    ).not.toContain('layout.justify');
    const detail = responsiveImpactDetailOf(gridTier, 'mobile');
    expect(detail.total).toBe(2);
    expect(detail.outsidePanel).toEqual(['layout.justify']);

    // 翻回横排：网格那条键顶回设计值 ⇒ 剪掉，只剩 justify 一处，那一格又摆得出来了
    const back = withResponsiveValue(gridTier, 'mobile', 'layout.mode', 'horizontal');
    expect(rule(back, 'mobile')!.patch).toEqual({ layout: { justify: 'space-between' } });
    const backTier = { ...row, responsive: back };
    expect(responsiveChannelsFor(backTier, 'mobile').map((s) => s.id)).toContain('layout.justify');
    expect(responsiveImpactDetailOf(backTier, 'mobile')).toEqual({
      total: 1,
      panelChannels: 1,
      outsidePanel: [],
    });
  });

  it('对齐的冗余判据吃这一档的投影：把更窄那档顶回设计值要存下，写成本来的值要剪掉', () => {
    const row = withLayout(mkContainer(), { mode: 'vertical', justify: 'start', items: 'start' });
    const withMobile = withRules(row, [
      { breakpoint: 'mobile', patch: { layout: { justify: 'center' } } },
    ]);
    // tablet 写 start：投影本来是 center（手机那条级联上来），这一键真的顶掉了东西
    const pushed = withResponsiveValue(withMobile, 'tablet', 'layout.justify', 'start');
    expect(rule(pushed, 'tablet')!.patch).toEqual({ layout: { justify: 'start' } });
    // tablet 再写 center 就是它本来的投影（手机那条级联上来的）⇒ 那条 tablet 规则整个长不出来
    expect(json(withResponsiveValue({ ...withMobile, responsive: pushed }, 'tablet', 'layout.justify', 'center')))
      .toBe(json(withMobile.responsive));
    // 模型里没有的拼法不当"改成默认"处理：一条事务都不产生
    expect(json(withResponsiveValue(withMobile, 'tablet', 'layout.justify', 'middle'))).toBe(
      json(withMobile.responsive),
    );
    expect(json(withResponsiveValue(withMobile, 'tablet', 'layout.items', 'between'))).toBe(
      json(withMobile.responsive),
    );
  });

  it('一组里的嵌套对象算一处：layout.padding 整个换掉，不拆成四格', () => {
    const node = withRules(mkNode(), [
      { breakpoint: 'mobile', patch: { layout: { padding: { top: 8, right: 8, bottom: 8, left: 8 } } } },
    ]);
    expect(responsiveImpactDetailOf(node, 'mobile')).toEqual({
      total: 1,
      panelChannels: 0,
      outsidePanel: ['layout.padding'],
    });
  });

  it('同一个键被两档各写一次只算一处：数的是投影，不是规则条数', () => {
    const node = withRules(mkNode(), [
      { breakpoint: 'mobile', patch: { style: { opacity: 0.5 } } },
      { breakpoint: 'tablet', patch: { style: { opacity: 0.3 } } },
    ]);
    expect(responsiveImpactOf(node, 'tablet')).toBe(1);
    // 但 tablet 那一档自己那条也在顶着：摘掉它 mobile 的 0.5 就漏上来
    expect(responsiveImpactDetailOf(node, 'tablet').total).toBe(1);
    expect(responsiveImpactOf(node, 'mobile')).toBe(1);
  });

  it('候选集只吃本档与更窄那几档的规则：更宽那一档的键不参与这一档的计数', () => {
    const node = withRules(mkNode(), [
      { breakpoint: 'wide', patch: { layout: { gap: 24 } } },
    ]);
    expect(responsiveImpactOf(node, 'tablet')).toBe(0);
    expect(responsiveImpactOf(node, 'wide')).toBe(1);
  });
});

describe('§14 输入边界', () => {
  it('非法值原样回去：NaN、负宽、非布尔可见性都不产生改动', () => {
    const node = withRules(mkNode(), [{ breakpoint: 'mobile', patch: { visible: false } }]);
    const before = json(node.responsive);

    for (const [channel, value] of [
      ['size.width', Number.NaN],
      ['size.width', -12],
      ['size.height', 'narrow'],
      ['visible', 'yes'],
      ['visible', undefined],
    ] as [ResponsiveChannel, unknown][]) {
      expect(json(withResponsiveValue(node, 'mobile', channel, value))).toBe(before);
    }
  });

  it('透明度夹进 [0,1]、尺寸取非负整数（与属性面板其余字段同一口径）', () => {
    const node = mkNode();
    // -0.3 夹成 0：和设计值 1 不同 → 存得下
    expect(withResponsiveValue(node, 'mobile', 'style.opacity', -0.3)).toEqual([
      { breakpoint: 'mobile', patch: { style: { opacity: 0 } } },
    ]);
    // 1.7 夹成 1，而这一档的投影本来就是 1 → 冗余判据把它剪掉（不是"存了一条不改任何东西的规则"）
    expect(withResponsiveValue(node, 'mobile', 'style.opacity', 1.7)).toEqual([]);
    expect(withResponsiveValue(node, 'mobile', 'size.width', 375.6)).toEqual([
      { breakpoint: 'mobile', patch: { size: { width: 376 } } },
    ]);
  });

  it('写时拷贝：输入节点与它自己的规则数组都不被改动（§16 的唯一写入方）', () => {
    const node = withRules(mkNode(), [{ breakpoint: 'mobile', patch: { size: { width: 375 } } }]);
    const snapshotOfInput = json(node.responsive);

    withResponsiveValue(node, 'tablet', 'style.opacity', 0.3);
    withoutResponsiveChannel(node, 'mobile', 'size.width');
    withoutResponsiveRule(node, 'mobile');

    expect(json(node.responsive)).toBe(snapshotOfInput);
    expect(node.responsive![0]!.patch.size).toEqual({ width: 375 });
  });

  it('未知的通道名报错而不是静默改错键', () => {
    // `layout.justify`/`layout.items` 现在是真通道了，这一门要拿**仍然没那一格**的键试
    // （`layout.rowGap` 是模型里的键，面板摆不出输入口、内核也不认这个名字）
    expect(() =>
      withResponsiveValue(mkContainer(), 'mobile', 'layout.rowGap' as ResponsiveChannel, 12),
    ).toThrow(/未知的断点通道/);
    expect(() =>
      withResponsiveValue(mkNode(), 'mobile', 'size.minWidth' as ResponsiveChannel, 100),
    ).toThrow(/未知的断点通道/);
  });
});

describe('§14 数组秩序与去重', () => {
  it('先写 wide 再写 mobile：数组按窄到宽排，和 applyResponsive 的应用次序同一份秩序', () => {
    const wide = withResponsiveValue(mkNode(), 'wide', 'style.opacity', 0.9);
    const both = withResponsiveValue({ ...mkNode(), responsive: wide }, 'mobile', 'style.opacity', 0.2);

    expect(both.map((r) => r.breakpoint)).toEqual(['mobile', 'wide']);
  });

  it('同档挤进两条（AI 配方与代码视图各写各的）→ 并成一条，两边的键都不丢', () => {
    const dup = withRules(mkNode(), [
      { breakpoint: 'tablet', patch: { size: { width: 700 } } },
      { breakpoint: 'tablet', patch: { visible: false } },
    ]);
    const merged = withResponsiveValue(dup, 'tablet', 'style.opacity', 0.6);

    expect(merged.filter((r) => r.breakpoint === 'tablet')).toHaveLength(1);
    expect(rule(merged, 'tablet')!.patch).toEqual({ size: { width: 700 }, visible: false, style: { opacity: 0.6 } });
  });

  it('「清掉这一档」把同档的规则一次全清，别的档一根手指都不碰', () => {
    const node = withRules(mkNode(), [
      { breakpoint: 'mobile', patch: { visible: false } },
      { breakpoint: 'tablet', patch: { size: { width: 700 } } },
      { breakpoint: 'tablet', patch: { style: { opacity: 0.5 } } },
      { breakpoint: 'wide', patch: { style: { opacity: 0.2 } } },
    ]);
    const cleared = withoutResponsiveRule(node, 'tablet');

    expect(cleared.map((r) => r.breakpoint)).toEqual(['mobile', 'wide']);
  });
});

describe('§14 面板读数与投影同源', () => {
  const node = withRules(mkNode(), [
    { breakpoint: 'mobile', patch: { size: { width: 375 }, visible: false } },
  ]);

  it('responsiveChannelsOf 数的是模型里的键', () => {
    expect(responsiveChannelsOf(node, 'mobile')).toEqual(['visible', 'size.width']);
    expect(responsiveChannelsOf(node, 'tablet')).toEqual([]);
    expect(responsiveOverrideOf(node, 'mobile', 'size.height')).toBeUndefined();
    expect(responsiveOverrideOf(node, 'mobile', 'size.width')).toBe(375);
    // false 是覆盖，不是"没覆盖"：undefined 判据要把隐藏算进去
    expect(responsiveOverrideOf(node, 'mobile', 'visible')).toBe(false);
  });

  it('designValueOf 给设计值、projectedValueOf 给这一档投影出来的值', () => {
    expect(designValueOf(node, 'size.width')).toBe(1280);
    expect(projectedValueOf(node, 'mobile', 'size.width')).toBe(375);
    // tablet 继承 mobile 那条：投影跟着走，这正是"冗余判据不能拿设计值当基准"的原因
    expect(projectedValueOf(node, 'tablet', 'size.width')).toBe(375);
    expect(projectedValueOf(node, 'tablet', 'visible')).toBe(false);
  });

  /**
   * 每一格通道配一个"摆得出这一行"的载体和一个非冗余值。
   * 载体不是随便挑的：没有子节点的元素摆不出 `layout.*`，非网格排布摆不出列数，
   * 没有 typography 对象的元素摆不出字号——对着这种节点写不进去，不能算那一格是废的。
   * `Record<ResponsiveChannel, …>` 让漏掉任何一格都编译不过。
   */
  const CHANNEL_CASES: Readonly<
    Record<ResponsiveChannel, { readonly carrier: () => DesignNode; readonly value: unknown; readonly parent?: () => DesignNode | null }>
  > = {
    visible: { carrier: mkText, value: false },
    'size.width': { carrier: mkText, value: 420 },
    'size.height': { carrier: mkText, value: 420 },
    'style.opacity': { carrier: mkText, value: 0.3 },
    'style.blendMode': { carrier: mkText, value: 'multiply' },
    'style.rotation': { carrier: mkText, value: 15 },
    'layout.mode': { carrier: () => withLayout(mkContainer(), { mode: 'grid', columns: 2 }), value: 'horizontal' },
    'layout.gap': { carrier: () => withLayout(mkContainer(), { mode: 'horizontal', gap: 16 }), value: 24 },
    'layout.columns': { carrier: () => withLayout(mkContainer(), { mode: 'grid', columns: 2 }), value: 3 },
    'layout.justify': {
      carrier: () => withLayout(mkContainer(), { mode: 'horizontal', justify: 'start' }),
      value: 'space-between',
    },
    'layout.items': {
      carrier: () => withLayout(mkContainer(), { mode: 'vertical', items: 'start' }),
      value: 'center',
    },
    // 顺序这一格只在自动布局（横排 / 竖排）上摆得出来：网格与换行档读完什么都不改
    'layout.reverse': {
      carrier: () => withLayout(mkContainer(), { mode: 'vertical', gap: 16 }),
      value: true,
    },
    'layout.clipContent': { carrier: mkContainer, value: true },
    'position.x': {
      carrier: mkNode,
      value: 16,
      parent: () => withLayout(mkContainer(), { mode: 'none', gap: 0 }),
    },
    'position.y': {
      carrier: mkNode,
      value: 24,
      parent: () => withLayout(mkContainer(), { mode: 'none', gap: 0 }),
    },
    'layout.scroll': { carrier: mkContainer, value: 'vertical' },
    'typography.fontSize': { carrier: mkText, value: 28 },
    'typography.fontWeight': { carrier: mkText, value: 700 },
    'typography.lineHeight': { carrier: mkText, value: 1.8 },
    'typography.letterSpacing': { carrier: mkText, value: 2 },
    'typography.textCase': { carrier: mkText, value: 'upper' },
    'typography.decoration': { carrier: mkText, value: 'underline' },
    'typography.align': { carrier: mkText, value: 'center' },
    'typography.verticalAlign': { carrier: mkText, value: 'middle' },
  };

  it('每一个通道写一个非冗余值，impact 至少 1：不留"有规则但什么都没改"的那种规则', () => {
    for (const spec of RESPONSIVE_CHANNELS) {
      const { carrier, value } = CHANNEL_CASES[spec.id];
      const node = carrier();
      const parent = CHANNEL_CASES[spec.id].parent?.();
      expect(
        spec.appliesTo(node, 'tablet', { parent: parent ?? null }),
        `${spec.id} 的载体摆不出这一行`,
      ).toBe(true);

      const next = withResponsiveValue(node, 'tablet', spec.id, value);
      const shaped = { ...node, responsive: next };

      expect(responsiveChannelsOf(shaped, 'tablet'), spec.id).toContain(spec.id);
      expect(responsiveImpactOf(shaped, 'tablet'), `${spec.id} 写进去没改任何投影`).toBeGreaterThanOrEqual(1);
      // 写得进去的那一格不该同时出现在"面板没有输入口"的点名里
      expect(
        responsiveImpactDetailOf(shaped, 'tablet', parent ?? null).outsidePanel,
        spec.id,
      ).not.toContain(spec.readPath);
    }
  });

  it('position.x / position.y 只摆在自由定位父级里：普通 flex 父级收起（父级没传进来也收起）', () => {
    const node = mkNode();
    const flexParent = withLayout(mkContainer(), { mode: 'horizontal', gap: 8 });
    const freeParent = withLayout(mkContainer(), { mode: 'none', gap: 0 });
    const specX = RESPONSIVE_CHANNELS.find((c) => c.id === 'position.x')!;
    const specY = RESPONSIVE_CHANNELS.find((c) => c.id === 'position.y')!;
    expect(specX.appliesTo(node, 'tablet', { parent: flexParent })).toBe(false);
    expect(specY.appliesTo(node, 'tablet', { parent: flexParent })).toBe(false);
    expect(specX.appliesTo(node, 'tablet', { parent: freeParent })).toBe(true);
    expect(specY.appliesTo(node, 'tablet', { parent: freeParent })).toBe(true);
    // 父级没传进来：收起——少显示比多显示安全
    expect(specX.appliesTo(node, 'tablet')).toBe(false);
    expect(specX.appliesTo(node, 'tablet', undefined)).toBe(false);
    expect(specX.appliesTo(node, 'tablet', { parent: null })).toBe(false);
  });


  it('token 绑定的尺寸（`{space.md}` 那种字符串引用）不崩，也发不出手抄的引用', () => {
    const ref = makeTokenRef('space.md');
    const bound: DesignNode = { ...mkNode(), size: { width: ref, height: 640 } };
    expect(designValueOf(bound, 'size.width')).toBe(ref);

    // 写一个数字上去：和投影不同 → 存下
    const authored = withResponsiveValue(bound, 'mobile', 'size.width', 300);
    expect(rule(authored, 'mobile')!.patch).toEqual({ size: { width: 300 } });
    // 想把它"改回那个 token"：面板只会发数字/hug/fill，字符串引用不是它能拼出来的值 → 零改动
    expect(json(withResponsiveValue({ ...bound, responsive: authored }, 'mobile', 'size.width', ref))).toBe(
      json(authored),
    );
    // 而 hug/fill 这两个关键字是合法覆盖值，写进去就是把数字换成关键字
    const hugged = withResponsiveValue({ ...bound, responsive: authored }, 'mobile', 'size.width', 'hug');
    expect(rule(hugged, 'mobile')!.patch).toEqual({ size: { width: 'hug' } });
  });
});

describe('§14 第八片：「顺序」那一格——反向有了输入口，取消反向也存得下来', () => {
  /** 设计值就是正序的横排容器，级联底下没有任何反向可顶 */
  const forward = () => withLayout(mkContainer(), { mode: 'horizontal', gap: 16 });

  it('这一格跟着这一档解出来的排布走：自动布局摆得出，网格档收回', () => {
    const atGrid = withLayout(mkContainer(), { mode: 'grid', columns: 2 });
    expect(
      responsiveChannelsFor(atGrid, 'tablet').map((s) => s.id),
      '网格档按下去什么都不改，这一格不摆（§159）'
    ).not.toContain('layout.reverse');
    expect(responsiveChannelsFor(forward(), 'tablet').map((s) => s.id)).toContain('layout.reverse');
    // 与发射侧、求解器同一个判据：那一档解成网格时代码也不发方向类
    const toGrid = withResponsiveValue(forward(), 'tablet', 'layout.mode', 'grid');
    expect(
      responsiveChannelsFor({ ...forward(), responsive: toGrid }, 'tablet').map((s) => s.id),
      '这一档自己翻成网格，反向那格跟着主轴对齐一起收回'
    ).not.toContain('layout.reverse');
  });

  it('写「反向」：一条规则、一处投影，撤销那一格只抹这一格', () => {
    const node = forward();
    const rules = withResponsiveValue(node, 'tablet', 'layout.reverse', true);
    expect(rule(rules, 'tablet')!.patch).toEqual({ layout: { reverse: true } });
    const shaped = { ...node, responsive: rules };
    expect(responsiveImpactOf(shaped, 'tablet')).toBe(1);
    expect(responsiveImpactDetailOf(shaped, 'tablet').outsidePanel, '这一格现在有输入口了').toEqual([]);
    const cleared = withoutResponsiveChannel(shaped, 'tablet', 'layout.reverse');
    expect(cleared, '清掉这一格，这一档的规则整个走').toEqual([]);
  });

  it('取消更窄那档的反向：这一档真顶掉了东西，存下来并算一处投影', () => {
    const reversedAtMobile = withRules(forward(), [
      { breakpoint: 'mobile', patch: { layout: { reverse: true } } },
    ]);
    expect(projectedValueOf(reversedAtMobile, 'tablet', 'layout.reverse'), 'tablet 继承手机那条反向').toBe(true);
    const shaped = {
      ...reversedAtMobile,
      responsive: withResponsiveValue(reversedAtMobile, 'tablet', 'layout.reverse', false),
    };
    expect(rule(shaped.responsive!, 'tablet')!.patch, '冗余判据吃的是这一档的投影，不是设计值').toEqual({
      layout: { reverse: false },
    });
    expect(responsiveImpactOf(shaped, 'tablet')).toBe(1);
    expect(projectedValueOf(shaped, 'tablet', 'layout.reverse')).toBe(false);
    expect(projectedValueOf(shaped, 'mobile', 'layout.reverse'), '手机那一档没被这一条改动').toBe(true);
    // 设计档没写这个键，而"没写"在这一格就是正序（`absentAs`）：读数不说"默认"这种没法按的话
    expect(designValueOf(shaped, 'layout.reverse')).toBe(false);
  });

  it('这一档本来正序：写「正序」一条规则都不存（发不出的键也不收，与代码那一侧同一判据）', () => {
    const node = forward();
    expect(withResponsiveValue(node, 'tablet', 'layout.reverse', false), '什么都没写').toEqual([]);
    const shaped = withRules(node, [{ breakpoint: 'tablet', patch: { layout: { gap: 8 } } }]);
    // 同档别的键不能被这一刀抹掉：写正序是冗余的 ⇒ 那条 gap 还在，reverse 不在
    expect(withResponsiveValue(shaped, 'tablet', 'layout.reverse', false)).toEqual(
      shaped.responsive,
    );
    expect(rule(shaped.responsive!, 'tablet')!.patch).toEqual({ layout: { gap: 8 } });
  });

  it('非布尔的取值不当"改成 false"处理：一条事务都不产生', () => {
    const node = forward();
    for (const bad of ['true', 1, null, undefined, {}]) {
      expect(json(withResponsiveValue(node, 'tablet', 'layout.reverse', bad)), JSON.stringify(bad)).toEqual('[]');
    }
  });
});
