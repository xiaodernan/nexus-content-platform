import { describe, expect, it } from 'vitest';

import { doorName } from './doorName';

/**
 * M7 v508 (ADR 0016 amendment 501) — the rule a door asks a name by.
 *
 * The rule is one line, so the cases are about the EDGES a URL actually produces: a parameter that was
 * never sent, one that is empty, one that is a single space, one that is a real name with space around
 * it, and one that is a real name with space INSIDE it — which is a different name and must survive.
 *
 * v521 (ADR 0016 amendment 507) reads a name read from a JSON BODY through the same rule, which adds the
 * edge a URL cannot produce: a body’s field is `unknown`, so the value in front of the rule may not be
 * text at all.
 */
describe('doorName — the name the caller meant (v508)', () => {
  it('a parameter that was never sent is not a name', () => {
    expect(doorName(null)).toBe('');
  });

  it('an empty parameter is not a name', () => {
    expect(doorName('')).toBe('');
  });

  it('a parameter that is only space is not a name either', () => {
    expect(doorName('   ')).toBe('');
    expect(doorName('\t')).toBe('');
  });

  it('a body’s value that is not text is not a name — and the rule says so without throwing', () => {
    // A query parameter is always text or absent; a JSON body can carry a number, a boolean, an object or
    // `null` in the field the door reads as an account. None of them is an address, and a door that asked
    // the service about one would be inventing a name out of a shape.
    expect(doorName(undefined)).toBe('');
    expect(doorName(42)).toBe('');
    expect(doorName(true)).toBe('');
    expect(doorName({ accountId: 'acct-ada' })).toBe('');
    expect(doorName(['acct-ada'])).toBe('');
  });

  it('a name with space around it is the name — the space is the URL’s, not the caller’s', () => {
    // A door decides on the trimmed bytes and asks about them, so the name it says back is the address the
    // record keeps: the service reads every name through `isBlank()` and `trim()` — which is also why v508’s
    // stated reason (“the service never trims”) was wrong in the bytes it cited; the rule was never about
    // what the service does with padding, it is about asking about the account the caller meant.
    expect(doorName('  acct-ada  ')).toBe('acct-ada');
    expect(doorName('\npub-1\t')).toBe('pub-1');
  });

  it('a name with space INSIDE it is a different name, and it survives', () => {
    // Trimming is about the edges a URL adds, never about what the caller put there on purpose.
    expect(doorName('  acct ada  ')).toBe('acct ada');
  });
});
