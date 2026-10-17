import { SCHEMA_VERSION, validateDocument, type DesignDocument } from '@nexus/design-model';

export const APP_STORAGE_VERSION = 1;

export interface PersistEnvelope {
  app: 'nexus-studio';
  version: number;
  doc: DesignDocument;
}

/** Serialize the full canonical Design Model (not the op-log) to a JSON string. */
export function serializeApp(doc: DesignDocument): string {
  const envelope: PersistEnvelope = { app: 'nexus-studio', version: APP_STORAGE_VERSION, doc };
  return JSON.stringify(envelope);
}

export type DeserializeResult = { ok: true; doc: DesignDocument } | { ok: false; reason: string };

/**
 * Parse + minimally validate a persisted snapshot. Pure and `window`-free so it runs headless
 * in tests; the storage seam (§ I/O) is separate. Structural checks guard against a half-written
 * or foreign payload rather than trusting shape blindly.
 */
export function deserializeApp(json: string): DeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  const env = parsed as Partial<PersistEnvelope>;
  if (!env || typeof env !== 'object') return { ok: false, reason: 'payload is not an object' };
  if (env.app !== 'nexus-studio') return { ok: false, reason: 'not a NEXUS Studio snapshot' };
  if (env.version !== APP_STORAGE_VERSION) return { ok: false, reason: `unsupported snapshot version ${String(env.version)}` };

  const doc = env.doc as DesignDocument | undefined;
  if (!doc || typeof doc !== 'object' || !doc.nodes || typeof doc.nodes !== 'object') {
    return { ok: false, reason: 'snapshot has no node store' };
  }
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported design-model schema ${String(doc.schemaVersion)}` };
  }
  if (!doc.rootId || !doc.nodes[doc.rootId]) return { ok: false, reason: 'root node is missing' };

  const pageResolvable =
    (doc.activePageId && doc.nodes[doc.activePageId]?.type === 'page') ||
    Object.values(doc.nodes).some((n) => n.type === 'page');
  if (!pageResolvable) return { ok: false, reason: 'no page node to display' };

  // v257 — the checks above prove the snapshot has a root and a page; they say nothing about whether its
  // GRAPH is consistent. A snapshot whose `childIds` name nodes it does not hold, or whose parent disagrees
  // with its child, would otherwise load and draw something subtly wrong — the v243 `validateDocument` answers
  // that. The shallow reasons stay FIRST so a missing root/page is still reported in its friendlier words.
  const verdict = validateDocument(doc);
  if (!verdict.ok) {
    const [first, ...rest] = verdict.problems;
    return { ok: false, reason: `snapshot graph is inconsistent: ${first!.detail}${rest.length ? ` (+${rest.length} more)` : ''}` };
  }

  return { ok: true, doc };
}
