import { newId, rgba } from './ids.js';
import type {
  AutoLayout,
  ContainerNode,
  DesignDocument,
  DesignNode,
  DocumentNode,
  ImageNode,
  InstanceNode,
  NodeBase,
  Paint,
  PathNode,
  RGBA,
  ShapeNode,
  TextNode,
  TextStyle,
  TokenGroup,
} from './types.js';

type NodeOverrides = Partial<NodeBase>;

function base(type: DesignNode['type'], name: string, o: NodeOverrides = {}): NodeBase {
  return {
    id: o.id ?? newId(type.slice(0, 2)),
    type,
    name,
    parentId: null,
    childIds: [],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    cornerRadius: 0,
    fills: [],
    strokes: [],
    ...o,
  } as NodeBase;
}

export function solid(color: RGBA): Paint {
  return { kind: 'solid', color };
}

export function frameNode(name: string, layout?: AutoLayout, o: NodeOverrides = {}): ContainerNode {
  return {
    ...base('frame', name, o),
    childIds: o.childIds ?? [],
    clipContent: true,
    ...(layout ? { layout } : {}),
  } as ContainerNode;
}

export function groupNode(name: string, o: NodeOverrides = {}): ContainerNode {
  return { ...base('group', name, o), childIds: o.childIds ?? [], clipContent: false } as ContainerNode;
}

export function pageNode(name: string, o: NodeOverrides = {}): ContainerNode {
  return { ...base('page', name, o), childIds: o.childIds ?? [], clipContent: false } as ContainerNode;
}

export function rectNode(name: string, o: NodeOverrides = {}): ShapeNode {
  return base('rectangle', name, o) as ShapeNode;
}

export function ellipseNode(name: string, o: NodeOverrides = {}): ShapeNode {
  return base('ellipse', name, o) as ShapeNode;
}

export function lineNode(name: string, o: NodeOverrides = {}): ShapeNode {
  return base('line', name, o) as ShapeNode;
}

export function pathNode(name: string, d: string, o: NodeOverrides = {}): PathNode {
  return { ...base('path', name, o), d } as PathNode;
}

export function textNode(name: string, characters: string, style: TextStyle, o: NodeOverrides = {}): TextNode {
  return { ...base('text', name, o), characters, style } as TextNode;
}

export function imageNode(name: string, assetId: string, o: NodeOverrides = {}): ImageNode {
  return { ...base('image', name, o), assetId, fit: 'cover' } as ImageNode;
}

export function instanceNode(name: string, componentId: string, o: NodeOverrides = {}): InstanceNode {
  return { ...base('instance', name, o), componentId, overrides: {} } as InstanceNode;
}

export function componentNode(name: string, o: NodeOverrides = {}): ContainerNode {
  return { ...base('component', name, o), childIds: o.childIds ?? [], clipContent: true } as ContainerNode;
}

/** A tiny default DTCG theme (ADR 0008). */
export function defaultTokens(): TokenGroup {
  return {
    color: {
      bg: { $type: 'color', $value: '#0b0e14' },
      surface: { $type: 'color', $value: '#151a24' },
      surfaceAlt: { $type: 'color', $value: '#1e2634' },
      border: { $type: 'color', $value: '#2a3444' },
      text: { $type: 'color', $value: '#e6ecf5' },
      textMuted: { $type: 'color', $value: '#9aa7bd' },
      brand: { $type: 'color', $value: '#6ea8fe' },
      accent: { $type: 'color', $value: '#b48cff' },
    },
    font: {
      family: { body: { $type: 'fontFamily', $value: 'Inter, system-ui, sans-serif' } },
      weight: {
        regular: { $type: 'fontWeight', $value: 400 },
        medium: { $type: 'fontWeight', $value: 500 },
        bold: { $type: 'fontWeight', $value: 700 },
      },
      size: {
        xs: { $type: 'dimension', $value: '12px' },
        sm: { $type: 'dimension', $value: '14px' },
        base: { $type: 'dimension', $value: '16px' },
        lg: { $type: 'dimension', $value: '20px' },
        xl: { $type: 'dimension', $value: '28px' },
        '2xl': { $type: 'dimension', $value: '40px' },
      },
    },
    space: {
      xxs: { $type: 'dimension', $value: '4px' },
      xs: { $type: 'dimension', $value: '8px' },
      sm: { $type: 'dimension', $value: '12px' },
      md: { $type: 'dimension', $value: '16px' },
      lg: { $type: 'dimension', $value: '24px' },
      xl: { $type: 'dimension', $value: '32px' },
    },
    radius: {
      none: { $type: 'dimension', $value: '0px' },
      sm: { $type: 'dimension', $value: '6px' },
      md: { $type: 'dimension', $value: '10px' },
      lg: { $type: 'dimension', $value: '16px' },
      full: { $type: 'dimension', $value: '9999px' },
    },
  };
}

/** A blank, valid document with one page. */
export function createEmptyDocument(name = 'Untitled Project'): DesignDocument {
  const docNode: DocumentNode = {
    id: newId('doc'),
    type: 'document',
    name,
    parentId: null,
    childIds: [],
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: true,
    cornerRadius: 0,
    fills: [],
    strokes: [],
    pageIds: [],
  };
  const page = pageNode('Page 1', { id: newId('pg'), parentId: docNode.id });
  docNode.pageIds = [page.id];

  return {
    schemaVersion: 1,
    id: docNode.id,
    name,
    rootId: docNode.id,
    nodes: { [docNode.id]: docNode, [page.id]: page },
    tokens: defaultTokens(),
    assets: {},
    activePageId: page.id,
  };
}
