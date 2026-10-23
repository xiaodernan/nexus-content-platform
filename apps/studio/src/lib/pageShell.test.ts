import { describe, expect, it } from 'vitest';

import { escapeHtml } from './pageShell';

/**
 * M7 v412 — the ONE HTML escaper the Studio’s server-rendered pages share, graded directly.
 *
 * The module exists because two copies of this rule would be two answers to “is this safe”, and the two
 * would drift — the exact failure this repository keeps retiring. So the escaper is graded on its own
 * terms, and the property that matters most is the ORDER: the ampersand runs first, so the entities the
 * later rules introduce (`&lt;`, `&quot;`, `&#39;`) are never re-escaped into `&amp;lt;`. An escaper that
 * double-escapes is not safer; it is a different answer to the same question.
 */
describe('escapeHtml — the shared escaper (v412)', () => {
  it('escapes the five characters that can end an attribute or a text node', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('the ampersand runs FIRST — the entities the other rules introduce are not re-escaped', () => {
    // If `<` were escaped before `&`, its own `&lt;` would become `&amp;lt;` and a reader would see the
    // literal text `<` where the author meant an escaped angle bracket.
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
    expect(escapeHtml('a "b" c')).toBe('a &quot;b&quot; c');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('a string that already carries an entity is escaped AGAIN — the input is raw text, always', () => {
    // The contract is one escape of raw text. Escaping an already-escaped string doubles it, which is
    // what keeps a double-write from silently decoding back into markup.
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    expect(escapeHtml('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('an attribute-breaking payload cannot break out', () => {
    const payload = '" onmouseover="alert(1)';
    expect(escapeHtml(payload)).toBe('&quot; onmouseover=&quot;alert(1)');
    expect(escapeHtml(payload)).not.toContain('"');
  });

  it('ordinary text — letters, digits, spaces, punctuation that is not one of the five — is untouched', () => {
    expect(escapeHtml('Harbour at dusk (v2) — 2026-10-24')).toBe('Harbour at dusk (v2) — 2026-10-24');
    expect(escapeHtml('pub-123')).toBe('pub-123');
    expect(escapeHtml('')).toBe('');
  });
});
