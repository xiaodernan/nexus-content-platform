import { describe, expect, it } from 'vitest';

import { doorName } from './doorName';

/**
 * M7 v508 (ADR 0016 amendment 501) — the rule a door asks a name by.
 *
 * The rule is one line, so the cases are about the EDGES a URL actually produces: a parameter that was
 * never sent, one that is empty, one that is a single space, one that is a real name with space around
 * it, and one that is a real name with space INSIDE it — which is a different name and must survive.
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

  it('a name with space around it is the name — the space is the URL’s, not the caller’s', () => {
    // The service never trims (zero `.trim()` in all of services/), so a door that forwarded the padding
    // would ask about an account that does not exist and answer with an empty list — which reads as
    // “this account has nothing” when the truth is that nobody asked about the account.
    expect(doorName('  acct-ada  ')).toBe('acct-ada');
    expect(doorName('\npub-1\t')).toBe('pub-1');
  });

  it('a name with space INSIDE it is a different name, and it survives', () => {
    // Trimming is about the edges a URL adds, never about what the caller put there on purpose.
    expect(doorName('  acct ada  ')).toBe('acct ada');
  });
});
