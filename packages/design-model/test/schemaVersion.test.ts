/**
 * The document's `schemaVersion` must be the EXPORTED constant, not a drifting literal.
 *
 * Before this change `createEmptyDocument` wrote `schemaVersion: 1` while `SCHEMA_VERSION`
 * was exported and referenced NOWHERE — two spellings of one fact, free to diverge the day
 * someone bumps the version. This pins the single source of truth: the value a new document
 * carries IS the exported constant (and the constant is a deliberate, positive integer).
 */
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, SCHEMA_VERSION } from '../src/index.js';

describe('SCHEMA_VERSION — one source of truth for the document version', () => {
  it('a new document carries the exported constant, not a literal', () => {
    expect(createEmptyDocument().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('is a positive integer — a deliberate, versioned contract', () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
