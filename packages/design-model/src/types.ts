/**
 * Nexus Design Model — canonical types (ADR 0004).
 *
 * The Design Model, not the DOM, is the single source of truth for visual artifacts.
 * A `DesignDocument` is a *normalized* graph: `nodes` maps every id to one node, and
 * parent→child order lives in each container's `childIds`. This makes id lookup O(1),
 * patching cheap (structural sharing), and the graph directly usable as a Project Graph.
 */

export const SCHEMA_VERSION = 1 as const;

export type NexusId = string;

export type NodeType =
  | 'document'
  | 'page'
  | 'frame'
  | 'group'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'path'
  | 'text'
  | 'component'
  | 'instance'
  | 'image';

/** A color as 0–1 RGBA floats (device-independent; converted at render time). */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A paint can be a solid color, a linear gradient, a token reference, or an image fill. */
export type Paint =
  | { kind: 'solid'; color: RGBA }
  | {
      kind: 'linear';
      stops: { at: number; color: RGBA }[];
      angle: number; // degrees
    }
  | { kind: 'token'; ref: string } // dotted token path, e.g. "color.brand"
  | { kind: 'image'; assetId: NexusId; fit: 'cover' | 'contain' | 'stretch' };

export interface Stroke {
  color: RGBA;
  weight: number;
  align: 'inside' | 'center' | 'outside';
}

export type LayoutMode = 'none' | 'horizontal' | 'vertical' | 'wrap';
export type Align = 'start' | 'center' | 'end' | 'space-between';

/** Flex-like auto-layout. When present, a container positions its children. */
export interface AutoLayout {
  mode: Exclude<LayoutMode, 'none'>;
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  primaryAxis: Align;
  counterAxis: Align;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextStyle {
  fontFamilyToken: string; // token path
  sizeToken: string; // token path (also allows raw number via `size` override)
  weight: number;
  lineHeight: number; // multiplier
  letterSpacing: number; // px
  align: TextAlign;
}

/**
 * Geometry & style envelope. Position is relative to the parent's content box;
 * absolute bounds are derived (see geometry.ts). Leaves have `childIds: []`.
 */
export interface NodeBase {
  id: NexusId;
  type: NodeType;
  name: string;
  parentId: NexusId | null;
  childIds: NexusId[];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  visible: boolean;
  locked: boolean;
  cornerRadius: number;
  fills: Paint[];
  strokes: Stroke[];
}

export interface ContainerNode extends NodeBase {
  type: 'frame' | 'group' | 'page' | 'component';
  layout?: AutoLayout;
  clipContent: boolean;
}

export interface ShapeNode extends NodeBase {
  type: 'rectangle' | 'ellipse' | 'line';
}

export interface PathNode extends NodeBase {
  type: 'path';
  d: string; // SVG path data in local coords
}

export interface TextNode extends NodeBase {
  type: 'text';
  characters: string;
  style: TextStyle;
}

export interface ImageNode extends NodeBase {
  type: 'image';
  assetId: NexusId;
  fit: 'cover' | 'contain' | 'stretch';
}

/**
 * One master child's override patch. Named `ChildOverride` rather than `GeometryOverride` because v132 made
 * `fills` and `cornerRadius` overridable: a name that says geometry while holding a paint is the kind of
 * stale sentence this lane keeps retiring (v118's `duration`, v119's loader that "ignored what it could not
 * read").
 *
 * `text` is ONE MORE patchable field rather than a reserved sibling of the map. The pre-v230 shape
 * (`Record<NexusId, Partial<Pick<NodeBase, …>>> & { text?: Record<NexusId, string> }`) had two defects the
 * widened type gate found (plan item 17): an object literal's `text` key had to satisfy the map's OWN index
 * signature, so no correctly-typed code could write a text override at all (`readOverrides` and its callers
 * carried casts around it); and a master child whose id was literally `text` was UNREACHABLE for geometry
 * patches, because the reader skipped that key. A patch is a patch: with no reserved key both defects are
 * gone by construction rather than by a rule that has to be enforced.
 */
export interface InstanceChildOverride {
  width?: number;
  height?: number;
  visible?: boolean;
  /** Position deltas relative to the master child's authored x/y. */
  x?: number;
  y?: number;
  /** Absolute rotation in degrees, replacing the master child's authored rotation. */
  rotation?: number;
  /** The master child's corner radius, replaced. */
  cornerRadius?: number;
  /** The master child's fills, replaced whole. */
  fills?: Paint[];
  /** The master child's text, replaced (meaningful only when the master child is a text node). */
  text?: string;
}

/** Instance references a component; `overrides` patch specific properties. `x`/`y` are deltas relative to
the master's authored position; `rotation`, `fills` and `cornerRadius` REPLACE the master child's own value, and
`fills` is the whole array — the same rule the Properties panel uses for a fill edit (`fills[0]` written, tail kept). */
export interface InstanceNode extends NodeBase {
  type: 'instance';
  componentId: NexusId;
  /** One patch per master child id, decoded by `readOverrides` in `instances.ts`. */
  overrides: Record<NexusId, InstanceChildOverride>;
}

export interface DocumentNode extends NodeBase {
  type: 'document';
  pageIds: NexusId[];
}

export type DesignNode =
  | DocumentNode
  | ContainerNode
  | ShapeNode
  | PathNode
  | TextNode
  | ImageNode
  | InstanceNode;

/** A media asset stored outside the node tree, referenced by id. */
export interface Asset {
  id: NexusId;
  name: string;
  kind: 'image' | 'video' | 'audio' | 'model' | 'font';
  /** object storage key / URL; undefined until uploaded */
  src?: string;
  width?: number;
  height?: number;
  provenance?: Provenance;
}

/** Who/what produced a result and whether it is live or DEMO (ADR 0010). */
export interface Provenance {
  mode: 'user' | 'demo' | 'live';
  provider?: string;
  model?: string;
  seed?: number;
  createdAt?: number;
}

/**
 * DTCG-style token group (ADR 0008). Values are the subset we render now;
 * `$extensions` carries Nexus metadata.
 */
export interface TokenValue {
  $value: unknown;
  $type?: 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'number' | 'shadow' | 'duration';
  $description?: string;
  $extensions?: Record<string, unknown>;
}
export interface TokenGroup {
  [key: string]: TokenValue | TokenGroup;
}

/** The root canonical artifact. */
export interface DesignDocument {
  schemaVersion: number;
  id: NexusId;
  name: string;
  rootId: NexusId;
  /** normalized node store */
  nodes: Record<NexusId, DesignNode>;
  tokens: TokenGroup;
  assets: Record<NexusId, Asset>;
  activePageId: NexusId;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
