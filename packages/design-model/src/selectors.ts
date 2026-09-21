import type { ContainerNode, DesignDocument, DesignNode, DocumentNode, NexusId } from './types.js';

export function isContainer(n: DesignNode): n is ContainerNode {
  return n.type === 'frame' || n.type === 'group' || n.type === 'page' || n.type === 'component';
}

export function childIdList(n: DesignNode): NexusId[] {
  return n.type === 'document' ? (n as DocumentNode).pageIds : (n as ContainerNode).childIds ?? [];
}

export function childrenOf(doc: DesignDocument, id: NexusId): DesignNode[] {
  const n = doc.nodes[id];
  if (!n) return [];
  return childIdList(n).map((cid) => doc.nodes[cid]).filter((c): c is DesignNode => Boolean(c));
}

export function isDescendant(doc: DesignDocument, id: NexusId, maybeAncestor: NexusId): boolean {
  let cur = doc.nodes[id]?.parentId;
  while (cur) {
    if (cur === maybeAncestor) return true;
    cur = doc.nodes[cur]?.parentId;
  }
  return false;
}

export interface TreeNode {
  node: DesignNode;
  children: TreeNode[];
}

export function buildTree(doc: DesignDocument, rootId: NexusId = doc.rootId): TreeNode | null {
  const node = doc.nodes[rootId];
  if (!node) return null;
  return { node, children: childIdList(node).map((c) => buildTree(doc, c)).filter((t): t is TreeNode => Boolean(t)) };
}

export function nodePathNames(doc: DesignDocument, id: NexusId): string[] {
  const names: string[] = [];
  let cur: DesignNode | undefined = doc.nodes[id];
  while (cur && cur.type !== 'document') {
    names.unshift(cur.name);
    cur = cur.parentId ? doc.nodes[cur.parentId] : undefined;
  }
  return names;
}
