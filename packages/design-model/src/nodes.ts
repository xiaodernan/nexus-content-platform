import { newId, rgba } from './ids.js';
import type {
  AutoLayout,
  ContainerNode,
  DesignDocument,
  DesignNode,
  DocumentNode,
  ImageNode,
  InstanceNode,
  NexusId,
  NodeBase,
  Paint,
  PathNode,
  RGBA,
  ShapeNode,
  TextNode,
  TextStyle,
  TokenGroup,
} from './types.js';
import { SCHEMA_VERSION } from './types.js';

type NodeOverrides = Partial<NodeBase>;

/** The canvas a page is born at. The empty document and the Studio's Add Page both read it, so a new
 *  document's page cannot be a different size from the one the "+" button makes. */
export const DEFAULT_PAGE_SIZE = { width: 1440, height: 900 } as const;

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
  const page = pageNode('Page 1', { id: newId('pg'), parentId: docNode.id, ...DEFAULT_PAGE_SIZE });
  docNode.pageIds = [page.id];

  return {
    schemaVersion: SCHEMA_VERSION,
    id: docNode.id,
    name,
    rootId: docNode.id,
    nodes: { [docNode.id]: docNode, [page.id]: page },
    tokens: defaultTokens(),
    assets: {},
    activePageId: page.id,
  };
}

/**
 * M7 v233 (ADR 0016 amendment 233) — fork a document into a NEW project: a fresh DOCUMENT id, the same node
 * graph, and a name that says where it came from.
 *
 * The distinction that makes this a remix and not a copy is WHERE the new id goes. `doc.id` IS the publish
 * service's projectId (the Studio publishes `doc.id`), so a fork that kept the source's id would re-publish
 * OVER the source's record — a remix would silently become an edit of someone else's publication. Only the
 * DOCUMENT's own identity moves: `id`, `rootId`, and the `nodes` key that holds the root node. Node ids stay
 * as they are — they are document-scoped, so reusing them across documents collides with nothing, and
 * rewriting every node id would rewrite every `parentId`/`childIds` reference for no gain.
 *
 * Pure and total: it never mutates its input, and it THROWS (rather than inventing a root) when the document
 * names a `rootId` its own `nodes` do not hold — a document that cannot be forked is a fact, not a blank.
 */
export function forkDocument(doc: DesignDocument, name?: string): DesignDocument {
  const root = doc.nodes[doc.rootId];
  if (!root) throw new Error(`forkDocument: the document names rootId ${doc.rootId}, which is not in its nodes`);
  const rootId = newId('doc');
  const nodes: Record<NexusId, DesignNode> = { ...doc.nodes };
  delete nodes[doc.rootId];
  nodes[rootId] = { ...root, id: rootId };
  return { ...doc, id: rootId, rootId, nodes, name: name ?? `${doc.name} (remix)` };
}
