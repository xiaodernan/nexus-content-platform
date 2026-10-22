/**
 * Direct coverage for `locate` + `findLabel` (agents/runtime/src/domkit.ts).
 *
 * Both are pure index lookups (no DOM — the host injects a UiDriver), reached only indirectly
 * through registerUiTools, so their exact-match-first / substring / absent contract was never
 * asserted directly. Per house discipline an untested pure branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { findLabel, locate, type UiElement } from '../src/domkit.js';

const els: UiElement[] = [
  { kind: 'button', label: 'Submit' },
  { kind: 'input', label: 'Email address' },
  { kind: 'button', label: 'Cancel' },
];

describe('locate', () => {
  it('returns the exact-match index when a label is identical', () => {
    expect(locate(els, 'Submit')).toBe(0);
    expect(locate(els, 'Cancel')).toBe(2);
  });

  it('falls back to a substring match when no exact match exists', () => {
    expect(locate(els, 'Email')).toBe(1); // 'Email address'.includes('Email')
    expect(locate(els, 'address')).toBe(1);
  });

  it('prefers the exact match over an earlier substring match', () => {
    const mixed: UiElement[] = [
      { kind: 'button', label: 'Foo bar' }, // substring match for 'bar', but not exact
      { kind: 'button', label: 'bar' }, // exact match
    ];
    expect(locate(mixed, 'bar')).toBe(1); // exact wins over index 0
  });

  it('returns -1 when the label appears nowhere', () => {
    expect(locate(els, 'xyzzy')).toBe(-1);
    expect(locate([], 'anything')).toBe(-1);
  });
});

describe('findLabel', () => {
  it('returns the index of the first exactly-equal label', () => {
    expect(findLabel(els, 'Submit')).toBe(0);
    expect(findLabel(els, 'Email address')).toBe(1);
  });

  it('is exact and case-sensitive — a close-but-different label yields -1', () => {
    expect(findLabel(els, 'email')).toBe(-1);
    expect(findLabel(els, 'submit')).toBe(-1);
    expect(findLabel(els, 'Email')).toBe(-1); // substring is not a match here
  });
});
