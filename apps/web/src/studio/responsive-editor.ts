import {
  ALIGNABLE_MODES,
  BREAKPOINT_ORDER,
  applyResponsive,
  getByPath,
  type BreakpointName,
  type DesignNode,
  type Layout,
  type LayoutMode,
  type ResponsiveRule,
} from '@nexus/creative-model';

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

/** `ResponsiveRule.patch` 里按组 Object.assign 的那五组（`visible` 是标量，单独收） */
const PATCH_GROUPS = ['layout', 'size', 'position', 'style', 'typography'] as const;
type PatchGroup = (typeof PATCH_GROUPS)[number];

/** 面板能直接编辑的通道：每个都是 patch 里的**一个键**，不是一整组 */
export type ResponsiveChannel =
  | 'visible'
  | 'size.width'
  | 'size.height'
  | 'style.opacity'
  | 'layout.mode'
  | 'layout.gap'
  | 'layout.columns'
  | 'layout.justify'
  | 'layout.items'
  | 'layout.reverse'
  | 'typography.fontSize';

export interface ResponsiveChoice {
  readonly value: string;
  readonly label: string;
}

export interface ChannelSpec {
  readonly id: ResponsiveChannel;
  readonly label: string;
  /** 写进 patch 的那一组：`applyResponsive` 按组 Object.assign，所以组名就是"抹掉谁"的边界 */
  readonly group: PatchGroup | 'visible';
  /** 那一组里的键名；`visible` 是标量，没有键 */
  readonly key: string | null;
  /** 从投影后的节点上读回来的点路径 */
  readonly readPath: string;
  /** 面板那一行的控件形状：加一格通道就是加一条 spec，面板不再逐行手写 JSX */
  readonly widget: 'toggle' | 'size' | 'number' | 'choice';
  /**
   * 布尔那一格两端的中文说法（模型里存的是 `true` / `false`，界面上说人话）。
   * 只有 `toggle` 那一档用得到；不给就是「隐藏 / 显示」——那是 `visible` 那一格的既有读法。
   */
  readonly toggleLabels?: readonly [off: string, on: string];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly choices?: readonly ResponsiveChoice[];
  /**
   * 这一行对这个节点、这一档有没有意义。面板不摆一个按下去什么都改不了的输入口（§159）：
   * `layout.*` 要节点真有子节点可排，`layout.columns` 要投影出来的排布真是网格，
   * `layout.justify` / `layout.items` 要投影出来的排布真是自动布局（求解器的 grid / wrap 分支
   * 在用到它们之前就 return 了；`ALIGNABLE_MODES` 在 `types.ts`，发射、回写、求解器与这里四处读的是
   * 同一条判据），
   * `typography.fontSize` 要节点真有 typography 对象——`applyResponsive` 对没有 typography 的节点
   * 压根不合并那一组（layout.ts:175），写进去就是一条被冗余判据当场剪掉的键。
   */
  readonly appliesTo: (node: DesignNode, breakpoint: BreakpointName) => boolean;
  /** 面板发来的原始值 → 能写进 patch 的值；认不出的给 REJECT，一条事务都不产生 */
  readonly clean: (value: unknown) => Cleaned;
  /**
   * 这个键在模型里**没写**时投影成什么。`layout.reverse` 没写就是正序（求解器读的是
   * `node.layout.reverse === true`），而 `applyResponsive` 不会凭空补这个键——不做这层归一，
   * 「这一档本来正序」读成 `undefined`，写「正序」就被当成一处改动存下来，画布一动不动而徽标说改过
   * （§159）。没给的通道按 `undefined` 处理，即"没写就是没写"。
   */
  readonly absentAs?: unknown;
}

type Cleaned = number | string | boolean | typeof REJECT;

/** 认不出的值（NaN、负宽、非布尔、拼错的排布名）不当"改成 0"处理：原样回去，一条事务都不产生 */
const REJECT = Symbol('reject');

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** 尺寸：非负整数 px，或 hug / fill 这两个关键字（token 引用是字符串，不是面板能拼出来的值） */
function cleanSize(value: unknown): Cleaned {
  if (isFiniteNumber(value)) return value >= 0 ? Math.round(value) : REJECT;
  return value === 'hug' || value === 'fill' ? value : REJECT;
}
const cleanOpacity = (value: unknown): Cleaned => (isFiniteNumber(value) ? Math.min(1, Math.max(0, value)) : REJECT);
const cleanGap = (value: unknown): Cleaned => (isFiniteNumber(value) && value >= 0 ? Math.round(value) : REJECT);
const cleanColumns = (value: unknown): Cleaned => (isFiniteNumber(value) && value >= 1 ? Math.floor(value) : REJECT);
const cleanFontSize = (value: unknown): Cleaned => (isFiniteNumber(value) && value > 0 ? Math.round(value) : REJECT);

/**
 * 排布只给这四样：求解器（layout.ts）与导出代码（codegen.ts 的 `layoutClasses`）都认它们。
 * `stack` / `none` 靠子节点自己的绝对坐标摆放，一条断点规则改不了那批坐标，所以这一格不摆那两个
 * 按钮——点了没效果的选项不该出现在面板上（§159）。
 */
const MODE_CHOICES: readonly ResponsiveChoice[] = [
  { value: 'vertical', label: '竖排' },
  { value: 'horizontal', label: '横排' },
  { value: 'grid', label: '网格' },
  { value: 'wrap', label: '换行' },
];
const MODE_VALUES = new Set<string>(MODE_CHOICES.map((c) => c.value));

/**
 * 对齐两键的取值就是模型那两个字段的联合（`Layout["justify"]` / `Layout["items"]`），
 * 中文说法在这里给一份：发射侧（codegen 的 `JUSTIFY_CLASS` / `ITEMS_CLASS`）拿同一个值查类名，
 * 面板不再手写第二份选项清单。`Record<…,…>` 让模型多一个取值而这里没跟上时编译不过。
 */
const JUSTIFY_LABELS: Record<Layout['justify'], string> = {
  start: '起始',
  center: '居中',
  end: '末尾',
  'space-between': '两端',
  'space-around': '环绕',
  'space-evenly': '均分',
};
const ITEMS_LABELS: Record<Layout['items'], string> = {
  start: '起始',
  center: '居中',
  end: '末尾',
  stretch: '撑满',
  baseline: '基线',
};
const JUSTIFY_CHOICES: readonly ResponsiveChoice[] = (
  Object.keys(JUSTIFY_LABELS) as Layout['justify'][]
).map((value) => ({ value, label: JUSTIFY_LABELS[value] }));
const ITEMS_CHOICES: readonly ResponsiveChoice[] = (
  Object.keys(ITEMS_LABELS) as Layout['items'][]
).map((value) => ({ value, label: ITEMS_LABELS[value] }));
const JUSTIFY_VALUES = new Set<string>(JUSTIFY_CHOICES.map((c) => c.value));
const ITEMS_VALUES = new Set<string>(ITEMS_CHOICES.map((c) => c.value));

const cleanAlign =
  (allowed: Set<string>) =>
  (value: unknown): Cleaned =>
    typeof value === 'string' && allowed.has(value) ? value : REJECT;

const hasChildren = (node: DesignNode): boolean => node.children.length > 0;
const projectedModeOf = (node: DesignNode, breakpoint: BreakpointName): LayoutMode =>
  applyResponsive(node, breakpoint).layout.mode;
/** 求解器只在竖排/横排下用 justify/items 摆放（grid 与 wrap 那两个分支提前 return）——
 *  那一档解出来不是自动布局时这一格按下去什么都不改，面板不摆（§159），代码也不发（codegen 同一判据） */
const alignableAt = (node: DesignNode, breakpoint: BreakpointName): boolean =>
  ALIGNABLE_MODES.includes(projectedModeOf(node, breakpoint));

/** 这一档可编辑通道的顺序就是面板上行的顺序 */
export const RESPONSIVE_CHANNELS: readonly ChannelSpec[] = [
  {
    id: 'visible',
    label: '显示',
    group: 'visible',
    key: null,
    readPath: 'visible',
    widget: 'toggle',
    toggleLabels: ['隐藏', '显示'],
    appliesTo: () => true,
    clean: (value) => (typeof value === 'boolean' ? value : REJECT),
  },
  {
    id: 'size.width',
    label: '宽',
    group: 'size',
    key: 'width',
    readPath: 'size.width',
    widget: 'size',
    min: 0,
    appliesTo: () => true,
    clean: cleanSize,
  },
  {
    id: 'size.height',
    label: '高',
    group: 'size',
    key: 'height',
    readPath: 'size.height',
    widget: 'size',
    min: 0,
    appliesTo: () => true,
    clean: cleanSize,
  },
  {
    id: 'style.opacity',
    label: '透明度',
    group: 'style',
    key: 'opacity',
    readPath: 'style.opacity',
    widget: 'number',
    min: 0,
    max: 1,
    step: 0.05,
    appliesTo: () => true,
    clean: cleanOpacity,
  },
  {
    id: 'layout.mode',
    label: '排布',
    group: 'layout',
    key: 'mode',
    readPath: 'layout.mode',
    widget: 'choice',
    choices: MODE_CHOICES,
    appliesTo: hasChildren,
    clean: (value) => (typeof value === 'string' && MODE_VALUES.has(value) ? value : REJECT),
  },
  {
    id: 'layout.gap',
    label: '间距',
    group: 'layout',
    key: 'gap',
    readPath: 'layout.gap',
    widget: 'number',
    min: 0,
    step: 1,
    appliesTo: hasChildren,
    clean: cleanGap,
  },
  {
    id: 'layout.columns',
    label: '列数',
    group: 'layout',
    key: 'columns',
    readPath: 'layout.columns',
    widget: 'number',
    min: 1,
    step: 1,
    appliesTo: (node, breakpoint) => hasChildren(node) && projectedModeOf(node, breakpoint) === 'grid',
    clean: cleanColumns,
  },
  {
    id: 'layout.justify',
    label: '主轴对齐',
    group: 'layout',
    key: 'justify',
    readPath: 'layout.justify',
    widget: 'choice',
    choices: JUSTIFY_CHOICES,
    appliesTo: (node, breakpoint) => hasChildren(node) && alignableAt(node, breakpoint),
    clean: cleanAlign(JUSTIFY_VALUES),
  },
  {
    id: 'layout.items',
    label: '交叉轴',
    group: 'layout',
    key: 'items',
    readPath: 'layout.items',
    widget: 'choice',
    choices: ITEMS_CHOICES,
    appliesTo: (node, breakpoint) => hasChildren(node) && alignableAt(node, breakpoint),
    clean: cleanAlign(ITEMS_VALUES),
  },
  {
    id: 'layout.reverse',
    label: '顺序',
    group: 'layout',
    key: 'reverse',
    readPath: 'layout.reverse',
    widget: 'toggle',
    toggleLabels: ['正序', '反向'],
    // 与主轴/交叉轴那两格同一判据、同一份 `ALIGNABLE_MODES`：求解器（layout.ts）只在竖排/横排
    // 读这个键，网格与换行档按下去什么都改不了。代码那一侧同一条判据（codegen 只在自动布局发
    // 方向类），所以"面板摆得出"与"发得出来、读得回来"是同一寸。
    appliesTo: (node, breakpoint) => hasChildren(node) && alignableAt(node, breakpoint),
    clean: (value) => (typeof value === 'boolean' ? value : REJECT),
    absentAs: false,
  },
  {
    id: 'typography.fontSize',
    label: '字号',
    group: 'typography',
    key: 'fontSize',
    readPath: 'typography.fontSize',
    widget: 'number',
    min: 1,
    step: 1,
    appliesTo: (node) => node.typography !== undefined,
    clean: cleanFontSize,
  },
];

type Patch = ResponsiveRule['patch'];

function specOf(channel: ResponsiveChannel): ChannelSpec {
  const spec = RESPONSIVE_CHANNELS.find((c) => c.id === channel);
  if (!spec) throw new Error(`未知的断点通道：${channel}`);
  return spec;
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * 这个节点在这条路径上**投影**成什么：模型里没写这个键时，按通道自己声明的 `absentAs` 算。
 * 读、写、徽标三处都走这里，所以"这一档本来的值"只有一份口径——`layout.reverse` 没写就是正序，
 * 不是"没值"；否则面板会把一次什么都不改的点击存成一条规则，徽标跟着说谎（§159）。
 */
function effectiveAt(node: DesignNode, readPath: string): unknown {
  const raw = getByPath(node, readPath);
  if (raw !== undefined) return raw;
  const spec = RESPONSIVE_CHANNELS.find((c) => c.readPath === readPath);
  return spec?.absentAs;
}

const orderOf = (breakpoint: BreakpointName): number => BREAKPOINT_ORDER.indexOf(breakpoint);

/** 窄到宽排——和 `applyResponsive` 应用的次序同一份秩序（同一个 `BREAKPOINT_ORDER`） */
function sortRules(rules: ResponsiveRule[]): ResponsiveRule[] {
  return rules.sort((a, b) => orderOf(a.breakpoint) - orderOf(b.breakpoint));
}

function ruleOf(node: DesignNode, breakpoint: BreakpointName): ResponsiveRule | undefined {
  return node.responsive?.find((r) => r.breakpoint === breakpoint);
}

/** patch 里那一组摊平成键值表：读写都按 spec 的 (group, key) 走，不再一格通道一段分支 */
function groupOf(patch: Patch, group: PatchGroup): Record<string, unknown> {
  return (patch[group] ?? {}) as Record<string, unknown>;
}

function channelRaw(patch: Patch, spec: ChannelSpec): unknown {
  if (spec.group === 'visible') return patch.visible;
  return groupOf(patch, spec.group)[spec.key as string];
}

function setChannel(patch: Patch, spec: ChannelSpec, value: number | string | boolean): void {
  if (spec.group === 'visible') {
    patch.visible = value as boolean;
    return;
  }
  const group = spec.group;
  patch[group] = { ...groupOf(patch, group), [spec.key as string]: value } as never;
}

function dropChannel(patch: Patch, spec: ChannelSpec): void {
  if (spec.group === 'visible') {
    delete patch.visible;
    return;
  }
  const group = spec.group;
  if (!patch[group]) return;
  const next = { ...groupOf(patch, group) };
  delete next[spec.key as string];
  patch[group] = next as never;
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
  return effectiveAt(applyResponsive(stripped, breakpoint), readPath);
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
    for (const group of PATCH_GROUPS) {
      const incoming = rule.patch[group];
      if (incoming) patch[group] = { ...patch[group], ...incoming } as never;
    }
  }
  edit(patch);
  // 空的组不留：抹掉 `layout` 里最后一个键，那一组就该跟着走，
  // 否则规则里躺着一个 `{layout:{}}`，读者会以为这一档改了排布
  for (const group of PATCH_GROUPS) {
    const incoming = patch[group];
    if (incoming && !Object.keys(incoming).length) delete patch[group];
  }
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
  const cleaned = spec.clean(value);
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
  return effectiveAt(node, specOf(channel).readPath);
}

/** 这一档投影出来的值（含更窄档的继承）——面板上"这一档实际是多少"读的就是它 */
export function projectedValueOf(
  node: DesignNode,
  breakpoint: BreakpointName,
  channel: ResponsiveChannel,
): unknown {
  return effectiveAt(applyResponsive(node, breakpoint), specOf(channel).readPath);
}

/**
 * 这一档**有没有**规则——看的是模型里那一条，不是面板摆不摆得出输入口。
 * AI 配方与代码视图会写 `layout`/`typography`/`position`，那些组里有些键这一格根本摆不出
 * 输入口（比如没有子节点的元素的 `layout.gap`），但"清掉这一档"照样得能按下去。
 */
export function hasResponsiveRule(node: DesignNode, breakpoint: BreakpointName): boolean {
  return (node.responsive ?? []).some((r) => r.breakpoint === breakpoint);
}

/**
 * 这一档、这个节点，面板真的摆得出输入口的那些通道。
 * 行的可见性由它决定，徽标那句"这几处面板没有输入口"也由它派生——两处用同一份判据，
 * 免得面板上一格而徽标说没有，或者反过来（§159：界面说的话要和画布对得上）。
 * 多选取**交集**：STUDIO.md 定的"多选时显示交集属性"，不能对着一个不认这格的元素写这一格。
 */
export function responsiveChannelsFor(node: DesignNode, breakpoint: BreakpointName): ChannelSpec[] {
  return RESPONSIVE_CHANNELS.filter((spec) => spec.appliesTo(node, breakpoint));
}

export interface ResponsiveImpact {
  /** 这一档真的在起作用的投影处数——含面板没有输入口的那些键 */
  readonly total: number;
  /** 其中面板这一格摆得出输入口、显示得出也写得回去的 */
  readonly panelChannels: number;
  /** 面板没有输入口的那些键（`layout.padding`、`position.x`、没有子节点的元素上的 `layout.gap`），
   *  按模型里的组次序排 */
  readonly outsidePanel: readonly string[];
}

/**
 * 这一档**可能**变了的投影路径：本档与更窄那几档的规则里出现过的每一个键。
 * `applyResponsive` 只 Object.assign 规则里写过的键，没被任何规则碰过的路径不可能变——
 * 所以这个候选集是完备的，不必把 DesignNode 的全字段扫一遍。
 * 一组里的嵌套对象（`layout.padding`）算一处：它在 patch 里就是一个键，被整体换掉。
 */
function candidatePaths(node: DesignNode, breakpoint: BreakpointName): string[] {
  const paths = new Set<string>();
  for (const rule of node.responsive ?? []) {
    if (orderOf(rule.breakpoint) > orderOf(breakpoint)) continue;
    for (const group of PATCH_GROUPS) {
      const patch = rule.patch[group] as Record<string, unknown> | undefined;
      if (patch) for (const key of Object.keys(patch)) paths.add(`${group}.${key}`);
    }
    if (rule.patch.visible !== undefined) paths.add('visible');
  }
  return [...paths];
}

/** 徽标读数的全部真相：总数、面板摆得出输入口的那些占几处、剩下是哪些键 */
export function responsiveImpactDetailOf(node: DesignNode, breakpoint: BreakpointName): ResponsiveImpact {
  const now = applyResponsive(node, breakpoint);
  const withoutOwn = applyResponsive(
    { ...node, responsive: withoutResponsiveRule(node, breakpoint) },
    breakpoint,
  );
  const live = candidatePaths(node, breakpoint).filter((path) => {
    const value = effectiveAt(now, path);
    return !sameValue(value, effectiveAt(node, path)) || !sameValue(value, effectiveAt(withoutOwn, path));
  });
  const editable = new Set(responsiveChannelsFor(node, breakpoint).map((spec) => spec.readPath));
  const outsidePanel = live
    .filter((path) => !editable.has(path))
    .sort((a, b) => groupRank(a) - groupRank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return { total: live.length, panelChannels: live.length - outsidePanel.length, outsidePanel };
}

/** 没进 `PATCH_GROUPS` 的路径（`visible`）排在所有组后面——只是显示次序，不影响计数 */
function groupRank(path: string): number {
  const index = PATCH_GROUPS.indexOf(path.split('.')[0] as (typeof PATCH_GROUPS)[number]);
  return index < 0 ? PATCH_GROUPS.length : index;
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
 *
 * 数的是**模型里所有的组**（`responsiveImpactDetailOf`），不只面板摆得出输入口的那些格：AI 配方与
 * 代码视图会写 `layout.padding`/`position.x`，那些改动画布和访客一样看得见，徽标不能因为它们没有
 * 输入口就读 0。
 */
export function responsiveImpactOf(node: DesignNode, breakpoint: BreakpointName): number {
  return responsiveImpactDetailOf(node, breakpoint).total;
}
