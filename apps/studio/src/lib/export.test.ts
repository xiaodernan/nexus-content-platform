import { describe, expect, it } from 'vitest';

import { slug } from './export';

/**
 * M7 v414 — the SLUG every downloaded file's name is built from, graded directly.
 *
 * Three exports share one namer: the JSON snapshot, the HTML export and the PNG capture all end in
 * `${slug(name)}-...`, so a slug that surprises one download surprises all three. The rule is three
 * rewrites deep — lowercase, every run of non-alphanumerics to one hyphen, no leading or trailing
 * hyphen — and the interesting edges are what the rule does NOT do: it does not rescue a name that
 * reduces to nothing, and it does not transliterate. Both are pinned here rather than smoothed, so a
 * future "helpful" fallback is a decision rather than a drift.
 */
describe('slug — the name a download carries (v414)', () => {
  it('an empty name is not a nameless download — the fallback answers', () => {
    // `s || 'nexus'`: a document nobody named still downloads as nexus-snapshot.json.
    expect(slug('')).toBe('nexus');
  });

  it('any falsy name answers the same fallback — the check is falsiness, not emptiness', () => {
    expect(slug(undefined as unknown as string)).toBe('nexus');
  });

  it('a spaced name LOWERCASES', () => {
    expect(slug('Harbour At Dusk')).toBe('harbour-at-dusk');
  });

  it('a RUN of non-alphanumerics collapses to ONE hyphen, not many', () => {
    expect(slug('a  b')).toBe('a-b');
    expect(slug('a!!b')).toBe('a-b');
    expect(slug('a - b')).toBe('a-b');
  });

  it('leading and trailing separators are stripped', () => {
    expect(slug('--hello--')).toBe('hello');
    expect(slug('!!hi!!')).toBe('hi');
  });

  it('digits are kept — a versioned name stays versioned', () => {
    expect(slug('Harbour v2')).toBe('harbour-v2');
    expect(slug('pub-123')).toBe('pub-123');
  });

  it('an underscore is a separator too, not a kept character', () => {
    expect(slug('my_doc')).toBe('my-doc');
  });

  it('a real document name slugs whole', () => {
    expect(slug('Harbour — at Dusk (v2)')).toBe('harbour-at-dusk-v2');
  });

  it('a name with no ASCII alphanumerics slugs to EMPTY — the fallback fires for a falsy name, not for a name that reduces to nothing', () => {
    // The honest edge: `'你好'` and `'---'` are truthy, so the `||` never fires and the rewrites leave
    // the empty string. The download is then `-snapshot.json` — pinned here so a future rescue is a
    // decision, and so nobody "fixes" it by accident.
    expect(slug('你好')).toBe('');
    expect(slug('---')).toBe('');
    expect(slug(' ')).toBe('');
  });

  it('the fallback itself slugs to itself — nexus survives its own rule', () => {
    expect(slug('nexus')).toBe('nexus');
  });

  it('the rule is idempotent — slugging a slug changes nothing', () => {
    const once = slug('Harbour — at Dusk (v2)');
    expect(slug(once)).toBe(once);
  });
});
