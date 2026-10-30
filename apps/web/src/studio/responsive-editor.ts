import {
  BREAKPOINT_ORDER,
  applyResponsive,
  getByPath,
  type BreakpointName,
  type DesignNode,
  type ResponsiveRule,
  type SizeValue,
} from '@nexus/design-model';

/**
 * §14 断点规则的编辑内核（纯函数，不碰 store、不碰 DOM）。
 *
 * 规则的形状是模型定的（`ResponsiveRule.patch` 只有 layout/size/position/style/typography/visible
 * 六个组，`applyResponsive` 按组 `Object.assign`），这里只补上"人工一次改一个键"那一寸：
 * 写一个键不抹掉同组别的键、空了的组不留、整条空了就删、同档只留一条、按窄到宽排。
 *
 * **一条存下来的键必须真的改变这一档的投影**（§159「证明不了会变的按钮不摆」同一条纪律）。
 * 判据不是"和设计值不同"，而是"和**这一档没有自己那条规则时**的投影不同"——
 * 因为规则向更宽的档继承（mobile 的规则四档都生效，tablet 的三档生效），
 * 设计值早就被更窄的档改过了。少这一条判据，面板会存下一堆什么都不改的规则，
 * 而访客切视口时看见"我明明改了，页面没变"。
 */

/** 面板能直接编辑的通道：每个都是 patch 里的**一个键**，不是一整组 */
export type ResponsiveChannel = 'visible' | 'size.width' | 'size.height' | 'style.opacity';

interface ChannelSpec {
  readonly id: ResponsiveChannel;
  readonly label: string;
  /** 写进 patch 的那一组：`applyResponsive` 按组 Object.assign，所以组名就是"抹掉谁"的边界 */
  readonly group: 'visible' | 'size' | 'style';
  readonly key: 'width' | 'height' | 'opacity' | null;
  /** 从投影后的节点上读回来的点路径 */
  readonly readPath: string;
}

/** 这一档可编辑通道的顺序就是面板上行的顺序 */
export const RESPONSIVE_CHANNELS: readonly ChannelSpec[] = [
  { id: 'visible', label: '显示', group: 'visible', key: null, readPath: 'visible' },
  { id: 'size.width', label: '宽', group: 'size', key: 'width', readPath: 'size.width' },
  { id: 'size.height', label: '高', group: 'size', key: 'height', readPath: 'size.height' },
  { id: 'style.opacity', label: '透明度', group: 'style', key: 'opacity', readPath: 'style.opacity' },
];

/** 垃圾输入（NaN、负宽、非布尔）不当"改成 0"处理：原样回去，一条事务都不产生 */
const REJECT = Symbol('reject');

type Patch = ResponsiveRule['patch'];

function specOf(channel: ResponsiveChannel): ChannelSpec {
  const spec = RESPONSIVE_CHANNELS.find((c) => c.id === channel);
  if (!spec) throw new Error(`未知的断点通道：${channel}`);
  return spec;
}

/** 只认面板发来的那几种值；尺寸取非负整数，透明度夹进 [0,1]（与属性面板其余字段同一口径） */
function sanitize(spec: ChannelSpec, value: unknown): number | string | boolean | typeof REJECT {
  if (spec.group === 'visible') return typeof value === 'boolean' ? value : REJECT;
  if (spec.key === 'opacity')
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : REJECT;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value) : REJECT;
  return value === 'hug' || value === 'fill' ? value : REJECT;
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const orderOf = (breakpoint: BreakpointName): number => BREAKPOINT_ORDER.indexOf(breakpoint);

/** 窄到宽排——和 `applyResponsive` 应用的次序同一份秩序（同一个 `BREAKPOINT_ORDER`） */
function sortRules(rules: ResponsiveRule[]): ResponsiveRule[] {
  return rules.sort((a, b) => orderOf(a.breakpoint) - orderOf(b.breakpoint));
}

function ruleOf(node: DesignNode, breakpoint: BreakpointName): ResponsiveRule | undefined {
  return node.responsive?.find((r) => r.breakpoint === breakpoint);
}

function channelRaw(patch: Patch, spec: ChannelSpec): unknown {
  if (spec.group === 'visible') return patch.visible;
  if (spec.group === 'size') return spec.key === 'width' ? patch.size?.width : patch.size?.height;
  return patch.style?.opacity;
}

function setChannel(patch: Patch, spec: ChannelSpec, value: number | string | boolean): void {
  if (spec.group === 'visible') {
    patch.visible = value as boolean;
    return;
  }
  if (spec.key === 'width') patch.size = { ...patch.size, width: value as SizeValue };
  else if (spec.key === 'height') patch.size = { ...patch.size, height: value as SizeValue };
  else if (spec.key === 'opacity') patch.style = { ...patch.style, opacity: value as number };
}

function dropChannel(patch: Patch, spec: ChannelSpec): void {
  if (spec.group === 'visible') {
    delete patch.visible;
    return;
  }
  if (spec.key === 'width') {
    if (!patch.size) return;
    const next = { ...patch.size };
    delete next.width;
    patch.size = next;
  } else if (spec.key === 'height') {
    if (!patch.size) return;
    const next = { ...patch.size };
    delete next.height;
    patch.size = next;
  } else if (spec.key === 'opacity') {
    if (!patch.style) return;
    const next = { ...patch.style };
    delete next.opacity;
    patch.style = next;
  }
}

/**
 * 这一档**去掉自己那条规则**后，这个通道投影成什么。
 * 这就是"写这个值到底改不改东西"的基准：比设计值准，因为更窄的档已经改过它了。
 */
function projectionWithout(node: DesignNode, breakpoint: BreakpointName, readPath: string): unknown {
  const stripped: DesignNode = {
    ...node,
    responsive: (node.responsive ?? []).filter((r) => r.breakpoint !== breakpoint),
  };
  return getByPath(applyResponsive(stripped, breakpoint), readPath);
}

/** 改一条规则后重建整份数组：空的组删掉、空 patch 的规则删掉、同档只留一条、窄到宽排 */
function rebuild(node: DesignNode, breakpoint: BreakpointName, edit: (patch: Patch) => void): ResponsiveRule[] {
  const others = (node.responsive ?? []).filter((r) => r.breakpoint !== breakpoint);
  // 同一档挤进两条以上的规则是可能的（AI 配方与代码视图各写各的）：写一次就把它们并成一条，
  // 按数组次序逐组 Object.assign——和 applyResponsive 的合并口径一致，不丢别人写过的键。
  const patch: Patch = {};
  for (const rule of node.responsive ?? []) {
    if (rule.breakpoint !== breakpoint) continue;
    if (rule.patch.visible !== undefined) patch.visible = rule.patch.visible;
    for (const group of ['layout', 'size', 'position', 'style', 'typography'] as const) {
      const incoming = rule.patch[group];
      if (incoming) patch[group] = { ...patch[group], ...incoming } as never;
    }
  }
  edit(patch);
  if (patch.size && !Object.keys(patch.size).length) delete patch.size;
  if (patch.style && !Object.keys(patch.style).length) delete patch.style;
  if (patch.visible === undefined) delete patch.visible;
  if (!Object.keys(patch).length) return sortRules(others);
  return sortRules([...others, { breakpoint, patch }]);
}

/**
 * 在 `breakpoint` 这一档把 `channel` 写成 `value`。
 * 值等于"这一档本来的投影"时删掉这个键，而不是存一条不改任何东西的规则。
 * 非法值返回原数组的副本：调用方比对 JSON 就知道这一刀什么都没改。
 */
export function withResponsiveValue(
  node: DesignNode,
  breakpoint: BreakpointName,
  channel: ResponsiveChannel,
  value: unknown,
): ResponsiveRule[] {
  const spec = specOf(channel);
  const cleaned = sanitize(spec, value);
  if (cleaned === REJECT) return structuredClone(node.responsive ?? []);
  const redundant = sameValue(projectionWithout(node, breakpoint, spec.readPath), cleaned);
  return rebuild(node, breakpoint, (patch) =>
    redundant ? dropChannel(patch, spec) : setChannel(patch, spec, cleaned),
  );
}

/** 抹掉这一档某一个通道的覆盖：这条键没了，别的键与别的档都不动 */
export function withoutResponsiveChannel(
  node: DesignNode,
  breakpoint: BreakpointName,
  channel: ResponsiveChannel,
): ResponsiveRule[] {
  const spec = specOf(channel);
  return rebuild(node, breakpoint, (patch) => dropChannel(patch, spec));
}

/** 整条删掉这一档的规则（面板上那颗「清掉这一档」） */
export function withoutResponsiveRule(node: DesignNode, breakpoint: BreakpointName): ResponsiveRule[] {
  return sortRules((node.responsive ?? []).filter((r) => r.breakpoint !== breakpoint));
}

/** 命令标签与面板共用的一份中文说法：撤销栈里那句"平板断点：改宽"就是从这儿拼的 */
export function responsiveChannelLabel(channel: ResponsiveChannel): string {
  return specOf(channel).label;
}

/** 这一档现在的规则覆盖了哪几个通道——面板用它标"有规则/无规则"，数的是模型里的键不是我自己编的 */
export function responsiveChannelsOf(node: DesignNode, breakpoint: BreakpointName): ResponsiveChannel[] {
  const rule = ruleOf(node, breakpoint);
  if (!rule) return [];
  return RESPONSIVE_CHANNELS.filter((spec) => channelRaw(rule.patch, spec) !== undefined).map((c) => c.id);
}

/** 这一档**这个通道**当前的覆盖值；没覆盖就是 undefined（面板据此显示"跟随设计值"） */
export function responsiveOverrideOf(
  node: DesignNode,
  breakpoint: BreakpointName,
  channel: ResponsiveChannel,
): unknown {
  const rule = ruleOf(node, breakpoint);
  return rule ? channelRaw(rule.patch, specOf(channel)) : undefined;
}

/** 这一档**什么规则都没有**时的值（设计值本身）——面板用它显示"设计 1280 → 这一档 375" */
export function designValueOf(node: DesignNode, channel: ResponsiveChannel): unknown {
  return getByPath(node, specOf(channel).readPath);
}

/** 这一档投影出来的值（含更窄档的继承）——面板上"这一档实际是多少"读的就是它 */
export function projectedValueOf(
  node: DesignNode,
  breakpoint: BreakpointName,
  channel: ResponsiveChannel,
): unknown {
  return getByPath(applyResponsive(node, breakpoint), specOf(channel).readPath);
}

/**
 * 这一档**有没有**规则——看的是模型里那一条，不是面板能编辑的那四个通道。
 * AI 配方与代码视图会写 `layout`/`typography`，那些组面板不显示，但"清掉这一档"照样得能按下去。
 */
export function hasResponsiveRule(node: DesignNode, breakpoint: BreakpointName): boolean {
  return (node.responsive ?? []).some((r) => r.breakpoint === breakpoint);
}

/**
 * 这一档有几处**真的在起作用**的投影改动，两条判据并起来数：
 *  - 相对**设计值**变了：访客在这一档看见的和原画不一样（更窄那一档级联上来的也算）；
 *  - 相对**摘掉这一档自己那条规则**变了：这一档的规则正在顶着什么——把更窄档的改动顶回设计值时
 *    第一条判据读成 0，可这条规则一删下去那一档立刻变。
 *
 * 各只用一条会把另一种"确实在起作用"标成 0，而画布与访客那边明明是变的（§159 不许这种谎）：
 * 只用自己那条规则 ⇒ 平板那格读 0，可画布正藏着手机那条的结果；只和设计值比 ⇒
 * 一条顶回设计值的规则读 0，可它不是废的。两条都不变的才是真 0。
 */
export function responsiveImpactOf(node: DesignNode, breakpoint: BreakpointName): number {
  const withoutOwn: DesignNode = { ...node, responsive: withoutResponsiveRule(node, breakpoint) };
  return RESPONSIVE_CHANNELS.filter((spec) => {
    const now = getByPath(applyResponsive(node, breakpoint), spec.readPath);
    return (
      !sameValue(now, getByPath(node, spec.readPath)) ||
      !sameValue(now, getByPath(applyResponsive(withoutOwn, breakpoint), spec.readPath))
    );
  }).length;
}
