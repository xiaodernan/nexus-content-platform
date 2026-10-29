/**
 * M8 v547 — the LOCAL-FIRST DESIGN store: a listing names a `documentId`, and until now nothing in this
 * browser kept the document that id names.
 *
 * <p>The catalog stores a listing's METADATA and an opaque `documentId` (the remix lane's subject), and
 * `publishTemplate` builds that id from the Design Document it validated — then handed the document back
 * to whoever called it and never wrote it down. So every listing on the shelf pointed at a design nobody
 * could open, and the remix handoff had no source to fork (§60). This module is that missing store: the
 * same minimal `getItem`/`setItem` seam, the same local-first discipline, one versioned key.
 *
 * <p>Three rules keep it honest (§60):
 * <ul>
 *   <li><b>Absence and corruption are DIFFERENT facts.</b> A key that is not there is an EMPTY store — a
 *       new install has no designs, which is not an error. A key that is there but unreadable is REFUSED
 *       with the reason; silently emptying it would delete a person's work.</li>
 *   <li><b>Every document is re-validated by the MODEL.</b> `validateDocument` is the model's own
 *       graph-and-geometry verdict, and it is the gate on the way IN and on the way OUT: the store cannot
 *       persist something the model refuses, and it will not hand a caller bytes a text editor made
 *       inconsistent. Two documents under one id are refused by name.</li>
 *   <li><b>What is saved can be loaded.</b> `saveDesigns` rebuilds the list and checks ids BEFORE it
 *       writes, so the store cannot persist a document its own loader would reject.</li>
 * </ul>
 *
 * <p>What this is NOT: it is not a project library, a version history or a service. It keeps the CURRENT
 * document bytes under an id and nothing else — no snapshots, no ownership, no clock. A design saved here
 * is exactly as trustworthy as the storage that holds it, and a host that needs history has `persist.ts`
 * for its editor lane.
 */

import { validateDocument, type DesignDocument } from '@nexus/design-model';

/** The format this build writes, and the only one it reads — there is nothing older to migrate yet. */
export const DESIGN_FORMAT_VERSION = 1;

/** The one key this build writes, namespaced away from the ledger's and the shelf's. */
export const DESIGN_STORAGE_KEY = 'nexus.designs.v1';

export interface DesignEnvelope {
  version: number;
  documents: DesignDocument[];
}

/** The storage seam: the shape `localStorage` and a Map-backed double both satisfy. */
export interface DesignKv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Deterministic: the same documents write the same bytes. The documents are not mutated. */
export function serializeDesigns(documents: readonly DesignDocument[]): string {
  const envelope: DesignEnvelope = { version: DESIGN_FORMAT_VERSION, documents: [...documents] };
  return JSON.stringify(envelope);
}

export type DesignParse = { ok: true; documents: DesignDocument[] } | { ok: false; reason: string };

/** Parse and validate wire text into documents, or refuse it BY NAME. */
export function deserializeDesigns(text: string): DesignParse {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: 'the design text is empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: `the design text is not JSON: ${(err as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'the design envelope is not an object' };

  const envelope = parsed as { version?: unknown; documents?: unknown };
  if (envelope.version !== DESIGN_FORMAT_VERSION) {
    return { ok: false, reason: `unsupported design format version ${String(envelope.version)} — this build reads ${DESIGN_FORMAT_VERSION}` };
  }
  if (!Array.isArray(envelope.documents)) return { ok: false, reason: 'the design envelope carries no documents array' };

  const documents: DesignDocument[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of envelope.documents.entries()) {
    // The MODEL's verdict, not a shape check this module invented: a stored document is a document.
    const verdict = validateDocument(raw);
    if (!verdict.ok) {
      const [first] = verdict.problems;
      return { ok: false, reason: `document ${index} is not a valid Design Document: ${first!.detail}` };
    }
    const document = raw as DesignDocument;
    if (seen.has(document.id)) return { ok: false, reason: `document id "${document.id}" is stored twice` };
    seen.add(document.id);
    documents.push(document);
  }
  return { ok: true, documents };
}

export type DesignStoreLoad =
  | { ok: true; documents: DesignDocument[]; source: 'stored' | 'empty' }
  | { ok: false; reason: string };

/** Load every stored design. An ABSENT key is an empty store; a PRESENT but unreadable key is refused. */
export function loadDesigns(kv: DesignKv, key: string = DESIGN_STORAGE_KEY): DesignStoreLoad {
  const raw = kv.getItem(key);
  if (raw === null) return { ok: true, documents: [], source: 'empty' };
  const parsed = deserializeDesigns(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, documents: parsed.documents, source: 'stored' };
}

export type DesignRead = { ok: true; document: DesignDocument } | { ok: false; reason: string };

/** Read ONE design by id, or refuse it by name — including the id the store simply does not hold. */
export function loadDesign(kv: DesignKv, id: string, key: string = DESIGN_STORAGE_KEY): DesignRead {
  const loaded = loadDesigns(kv, key);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  const found = loaded.documents.find((document) => document.id === id);
  if (!found) return { ok: false, reason: `no design with id "${id}" is stored in this browser` };
  return { ok: true, document: found };
}

export type DesignSave = { ok: true; bytes: number } | { ok: false; reason: string };

/**
 * Write the whole set. Validates every document and every id FIRST, so what is saved can be loaded, and
 * reports a storage failure by name.
 */
export function saveDesigns(kv: DesignKv, documents: readonly DesignDocument[], key: string = DESIGN_STORAGE_KEY): DesignSave {
  const rebuilt: DesignDocument[] = [];
  const seen = new Set<string>();
  for (const document of documents) {
    const verdict = validateDocument(document);
    if (!verdict.ok) {
      const [first] = verdict.problems;
      return { ok: false, reason: `refusing to save an invalid design: ${first!.detail}` };
    }
    if (seen.has(document.id)) return { ok: false, reason: `refusing to save an invalid design store: "${document.id}" is stored twice` };
    seen.add(document.id);
    rebuilt.push(document);
  }
  const text = serializeDesigns(rebuilt);
  try {
    kv.setItem(key, text);
  } catch (err) {
    return { ok: false, reason: `the storage refused the write: ${(err as Error).message}` };
  }
  return { ok: true, bytes: text.length };
}

/**
 * Save ONE document: it REPLACES a document under the same id in place and APPENDS a new one, so the
 * store reads in the order designs arrived. An unreadable store is refused rather than overwritten — the
 * same rule the shelf's writer holds.
 */
export function saveDesign(kv: DesignKv, document: DesignDocument, key: string = DESIGN_STORAGE_KEY): DesignSave {
  const loaded = loadDesigns(kv, key);
  if (!loaded.ok) return { ok: false, reason: `refusing to overwrite an unreadable design store: ${loaded.reason}` };
  const documents = loaded.documents.map((stored) => (stored.id === document.id ? document : stored));
  if (!loaded.documents.some((stored) => stored.id === document.id)) documents.push(document);
  return saveDesigns(kv, documents, key);
}
