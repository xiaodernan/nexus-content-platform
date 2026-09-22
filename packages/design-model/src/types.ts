/**
 * Nexus Design Model —— 类型定义（§9 / §10 / §12-14 / §122-125）
 *
 * 边界纪律：本包不得 import React / DOM / Node fs。设计模型是平台的唯一真值，
 * 渲染层、代码生成层、预览层都只是它的投影（§16）。
 */

export type NodeId = string;
export type PageId = string;
export type TokenKey = string;
export type ComponentId = string;

/** §10 节点类型。未来扩展：GameObject / Particle / Character / Camera / Light */
export type NodeType =
  | "frame"
  | "section"
  | "container"
  | "group"
  | "text"
  | "image"
  | "video"
  | "svg"
  | "shape"
  | "button"
  | "input"
  | "card"
  | "list"
  | "grid"
  | "component"
  | "instance"
  | "code"
  | "three"
  | "webgl";

/** 可含子节点的类型集合 */
export const CONTAINER_TYPES: readonly NodeType[] = [
  "frame",
  "section",
  "container",
  "group",
  "list",
  "grid",
  "card",
  "component",
  "instance",
];

export type BreakpointName = "mobile" | "tablet" | "desktop" | "wide";

/** §14 视口宽度基准 */
export const BREAKPOINT_WIDTH: Record<BreakpointName, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
  wide: 1536,
};

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "soft-light"
  | "hard-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** 颜色可以是 hex 字面量，也可以是 token 引用 `{color.primary}` */
export type ColorValue = string | RGBA;

export type Paint =
  | { kind: "solid"; color: ColorValue; opacity?: number; visible?: boolean }
  | {
      kind: "gradient";
      type: "linear" | "radial" | "conic";
      stops: { at: number; color: ColorValue }[];
      angle?: number;
      opacity?: number;
      visible?: boolean;
    }
  | {
      kind: "image";
      assetId: string;
      fit?: "cover" | "contain" | "fill" | "tile";
      opacity?: number;
      visible?: boolean;
    };

export interface Stroke {
  paints: Paint[];
  width: number;
  position: "inside" | "outside" | "center";
  cap?: "butt" | "round" | "square";
  visible?: boolean;
}

export interface Effect {
  kind: "drop-shadow" | "inner-shadow" | "layer-blur" | "background-blur";
  color?: ColorValue;
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  spread?: number;
  visible?: boolean;
}

export interface CornerRadius {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface Typography {
  fontFamily: string | TokenKey;
  fontSize: number | TokenKey;
  fontWeight: number;
  lineHeight: number | "auto";
  letterSpacing: number;
  align: "left" | "center" | "right" | "justify";
  verticalAlign: "top" | "middle" | "bottom";
  decoration?: "none" | "underline" | "line-through";
  textCase?: "original" | "upper" | "lower" | "title";
  /** 字色。text 节点沿用 fills[0]；button / input 的 fills 是背景，字色只能走这里 */
  color?: ColorValue;
  /** 富文本局部样式；按字符偏移切分，未覆盖部分沿用整段样式 */
  runs?: TextRun[];
}

export interface TextRun {
  start: number;
  end: number;
  style: Partial<
    Pick<
      Typography,
      "fontWeight" | "decoration" | "letterSpacing" | "fontSize" | "fontFamily"
    >
  > & { color?: ColorValue };
}

/** §122 动效系统 */
export type AnimationPreset =
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "scale"
  | "spring"
  | "parallax"
  | "scroll-reveal"
  | "page-transition"
  | "micro-interaction";

export interface Animation {
  preset: AnimationPreset;
  trigger: "mount" | "hover" | "scroll" | "interaction" | "loop";
  duration: number | TokenKey;
  delay?: number;
  easing:
    | "linear"
    | "ease"
    | "ease-in"
    | "ease-out"
    | "ease-in-out"
    | "spring"
    | TokenKey;
  distance?: number;
  scaleFrom?: number;
  opacityFrom?: number;
  scrollRange?: [number, number];
  enabled?: boolean;
}

/** §124 状态系统 */
export type NodeState =
  "hover" | "active" | "focus" | "disabled" | "loading" | "error" | "success";

/** §123 交互构建器 */
export interface Interaction {
  id: string;
  trigger:
    | "click"
    | "hover-in"
    | "hover-out"
    | "press"
    | "scroll-into-view"
    | "key"
    | "submit"
    | "change";
  action:
    | "navigate"
    | "open-modal"
    | "close-modal"
    | "toggle-state"
    | "set-state"
    | "scroll-to"
    | "play-animation"
    | "set-variable"
    | "submit";
  target?: NodeId | PageId | string;
  key?: string;
  variable?: string;
  duration?: number;
}

/** §125 数据绑定 */
export interface Binding {
  property: "text" | "src" | "items" | "href" | "visible" | "value" | "color";
  source: "static" | "variable" | "api" | "database" | "agent";
  expression: string;
  fallback?: unknown;
}

export type LayoutMode =
  "none" | "vertical" | "horizontal" | "grid" | "stack" | "wrap";

export interface Layout {
  mode: LayoutMode;
  gap: number;
  rowGap?: number;
  crossGap?: number;
  padding: { top: number; right: number; bottom: number; left: number };
  justify:
    | "start"
    | "center"
    | "end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  items: "start" | "center" | "end" | "stretch" | "baseline";
  /** grid / wrap 时使用 */
  columns?: number;
  /** 子节点是否按设计顺序反向排列 */
  reverse?: boolean;
  /** 超出时是否允许滚动 */
  scroll?: "none" | "vertical" | "horizontal" | "both";
  /** 绝对定位（mode=none 时子节点按 position 摆放） */
  clipContent?: boolean;
}

export type SizeValue = number | "hug" | "fill" | TokenKey;

export interface Size {
  width: SizeValue;
  height: SizeValue;
}

export interface Position {
  x: number;
  y: number;
}

export interface ResponsiveRule {
  breakpoint: BreakpointName;
  /** 仅允许覆盖这些字段，避免整节点替换导致历史不可读 */
  patch: {
    layout?: Partial<Layout>;
    size?: Partial<Size>;
    position?: Partial<Position>;
    style?: Partial<Style>;
    typography?: Partial<Typography>;
    visible?: boolean;
  };
}

export interface Style {
  fills: Paint[];
  strokes: Stroke[];
  cornerRadius: CornerRadius;
  effects: Effect[];
  opacity: number;
  blendMode: BlendMode;
  rotation: number;
  cursor: "default" | "pointer" | "text" | "not-allowed" | "grab" | "grabbing";
  /** 文本节点是否可换行 */
  textWrap?: "wrap" | "nowrap" | "truncate" | "truncate-2" | "truncate-3";
  /** 组件级 CSS 泄漏出口：只能是 token 化白名单，不接受任意 CSS 字符串 */
  overflowX?: "visible" | "hidden" | "auto";
  overflowY?: "visible" | "hidden" | "auto";
  minHeight?: number;
  maxHeight?: number;
  minWidth?: number;
  maxWidth?: number;
  aspectRatio?: number;
}

/** §30 / §174 从参考图提取的视觉语言，作为 AI 生成的硬约束 */
export interface VisualDna {
  palette: { role: string; color: ColorValue }[];
  typography: {
    role: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
  }[];
  spacingScale: number[];
  radius: number;
  shadow: string;
  motion: {
    character: "slow-cinematic" | "snappy" | "playful" | "minimal";
    notes: string[];
  };
  hierarchy: string[];
  descriptors: string[];
}

export interface DesignNode {
  id: NodeId;
  type: NodeType;
  name: string;
  parentId: NodeId | null;
  children: NodeId[];

  position: Position;
  size: Size;
  layout: Layout;
  style: Style;

  /** 约束：节点在父容器 resize 时如何跟随 */
  constraints: {
    horizontal: "start" | "center" | "end" | "stretch" | "scale";
    vertical: "start" | "center" | "end" | "stretch" | "scale";
  };

  typography?: Typography;
  text?: string;

  /** image / video / svg */
  assetId?: string;
  src?: string;
  alt?: string;

  /** shape */
  shapeKind?: "rectangle" | "ellipse" | "line" | "polygon" | "star";

  /** button / input 语义 */
  componentId?: ComponentId;
  variantProps?: Record<string, string>;
  overrides?: Record<string, unknown>;

  /** list / grid 数据驱动重复 */
  repeatOf?: NodeId;
  repeatCount?: number;
  items?: unknown[];

  /** code 节点：无法映射回设计模型时保留为 code-only region（§19） */
  code?: {
    language: "tsx" | "ts" | "html" | "css";
    content: string;
    readOnly: boolean;
  };
  /** three / webgl */
  scene?: { kind: "three-scene"; camera?: string; assets?: string[] };

  responsive?: ResponsiveRule[];
  animation?: Animation[];
  interactions?: Interaction[];
  states?: Partial<
    Record<
      NodeState,
      Partial<Pick<Style, "fills" | "opacity" | "strokes" | "effects">>
    >
  >;
  bindings?: Binding[];

  /** 变量 / token 绑定表：属性路径 → token key（§12） */
  bindingsMap?: Record<string, TokenKey>;

  visible: boolean;
  locked: boolean;
  meta?: Record<string, unknown>;
}

export interface Page {
  id: PageId;
  name: string;
  /** 页面根节点（type=frame） */
  rootId: NodeId;
  nodes: Record<NodeId, DesignNode>;
  backgroundColor?: ColorValue;
  width: number;
  height: number;
  meta?: { description?: string; route?: string };
}

export type TokenType =
  | "color"
  | "dimension"
  | "fontFamily"
  | "number"
  | "string"
  | "shadow"
  | "motion"
  | "duration"
  | "easing";

export interface Token {
  key: TokenKey;
  type: TokenType;
  /** 默认值（无 mode 时使用） */
  value: unknown;
  /** 多主题：mode 名 → 值 */
  modes?: Record<string, unknown>;
  description?: string;
  group?: string;
}

export interface ComponentVariant {
  id: string;
  /** 变体属性组合，如 { size: 'lg', state: 'hover' } */
  props: Record<string, string>;
  /** 变体对应的子树覆盖 */
  overrides: Record<string, unknown>;
}

export interface ComponentPropDef {
  name: string;
  type: "text" | "boolean" | "select" | "instanceSwap" | "color" | "number";
  options?: string[];
  default: unknown;
}

export interface ComponentSlotDef {
  name: string;
  nodeId: NodeId;
  accepts?: NodeType[];
}

export interface ComponentDefinition {
  id: ComponentId;
  name: string;
  /** 主节点 id（位于 components 页面或文档级组件区） */
  rootId: NodeId;
  pageId?: PageId;
  props: ComponentPropDef[];
  variants: ComponentVariant[];
  slots: ComponentSlotDef[];
  description?: string;
}

export interface BrandKit {
  name: string;
  logoAssetId?: string;
  tokenKeys: {
    color: TokenKey[];
    typography: TokenKey[];
    radius?: TokenKey;
    shadow?: TokenKey;
  };
  toneOfVoice?: string[];
  referenceAssetIds?: string[];
}

export interface AssetRef {
  id: string;
  name: string;
  /**
   * `other` 与存储层的 asset_kind 枚举对齐：库里能存的东西，模型必须能表达，
   * 否则载入时只能靠猜（或悄悄丢掉这一条）。
   */
  kind: "image" | "video" | "audio" | "model" | "font" | "svg" | "document" | "other";
  /** 存储键（S3 兼容存储） */
  storageKey: string;
  width?: number;
  height?: number;
  mimeType: string;
  sizeBytes?: number;
  /** 生成来源，用于成本与再生成 */
  generatedBy?: {
    provider: string;
    model: string;
    prompt: string;
    taskId?: string;
    demoMode?: boolean;
  };
  createdAt: string;
}

export interface DesignVariable {
  id: string;
  name: string;
  scope: "document" | "page" | "node";
  refId?: string;
  value: unknown;
  type: "string" | "number" | "boolean" | "json" | "data-source";
}

export interface DesignDocument {
  id: string;
  /** 设计模型格式版本，迁移用 */
  schemaVersion: 1;
  name: string;
  pages: Page[];
  activePageId: PageId;
  components: ComponentDefinition[];
  tokens: Token[];
  /** token 主题 mode 名，null 表示用默认值 */
  activeMode?: string | null;
  assets: AssetRef[];
  variables: DesignVariable[];
  brandKit?: BrandKit;
  visualDna?: VisualDna;
  metadata: {
    createdAt: string;
    updatedAt: string;
    author?: string;
    projectType?: ProjectType;
    /** 当前 token 主题列表 */
    modes: string[];
    fps?: number;
  };
}

export type ProjectType =
  | "website"
  | "webapp"
  | "mobile-ui"
  | "game"
  | "interactive-story"
  | "3d-experience"
  | "dashboard"
  | "design-system"
  | "prototype";
