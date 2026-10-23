import { describe, expect, it } from 'vitest';

import { commentIdFromSearch, uncommentIdFromSearch } from './commentIntent';
import { likeIdFromSearch, unlikeIdFromSearch } from './likeIntent';
import { followIdFromSearch, unfollowIdFromSearch } from './followIntent';
import { subscribeIdFromSearch } from './planIntent';
import { reportIdFromSearch } from './reportIntent';
import { tipIdFromSearch } from './tipIntent';

/**
 * M7 v408 — the INTENT readers, graded directly.
 *
 * Every social verb on a public page reaches the Studio the same way: the page is STATIC rendered and
 * holds no session (ADR 0018), so it links here as `/?<verb>=<id>` and the part of the product that can
 * act — and that knows who the device is — reads the intent out of the URL. Nine readers, one rule each,
 * and the rule is small enough to state exactly: the id is read from ONE named key, an absent or blank
 * value is NO intent rather than an empty id, and every reader answers only for its own verb.
 *
 * The edge worth naming: the blank check TRIMS, but the answer does not. A value that is only
 * whitespace is no intent; a value that merely HAS whitespace is returned as it stands, because the
 * reader’s job is to say what the URL named, not to repair it.
 */
const readers = [
  { name: 'commentIdFromSearch', fn: commentIdFromSearch, key: 'comment' },
  { name: 'uncommentIdFromSearch', fn: uncommentIdFromSearch, key: 'uncomment' },
  { name: 'likeIdFromSearch', fn: likeIdFromSearch, key: 'like' },
  { name: 'unlikeIdFromSearch', fn: unlikeIdFromSearch, key: 'unlike' },
  { name: 'followIdFromSearch', fn: followIdFromSearch, key: 'follow' },
  { name: 'unfollowIdFromSearch', fn: unfollowIdFromSearch, key: 'unfollow' },
  { name: 'subscribeIdFromSearch', fn: subscribeIdFromSearch, key: 'subscribe' },
  { name: 'reportIdFromSearch', fn: reportIdFromSearch, key: 'report' },
  { name: 'tipIdFromSearch', fn: tipIdFromSearch, key: 'tip' },
] as const;

for (const reader of readers) {
  describe(`${reader.name} — the ${reader.key} intent, read out of a URL (v408)`, () => {
    it('reads the id, with or without the leading question mark', () => {
      expect(reader.fn(`?${reader.key}=pub-1`)).toBe('pub-1');
      expect(reader.fn(`${reader.key}=pub-1`)).toBe('pub-1');
    });

    it('an absent, empty or whitespace-only value is NO intent, not an empty id', () => {
      expect(reader.fn('')).toBeNull();
      expect(reader.fn('?')).toBeNull();
      expect(reader.fn(`?${reader.key}=`)).toBeNull();
      expect(reader.fn(`?${reader.key}=%20`)).toBeNull();
      expect(reader.fn(`?${reader.key}=%20%20%09`)).toBeNull();
    });

    it('the blank check trims but the answer does not — a padded id is returned as it stands', () => {
      // The reader says what the URL named; it does not repair it. Pinned so a future trim is a decision.
      expect(reader.fn(`?${reader.key}=%20pub-1%20`)).toBe(' pub-1 ');
    });

    it('an encoded id is decoded, and the first value wins when the key repeats', () => {
      expect(reader.fn(`?${reader.key}=pub%2D1`)).toBe('pub-1');
      expect(reader.fn(`?${reader.key}=a&${reader.key}=b`)).toBe('a');
    });

    it('the id is read from among other parameters', () => {
      expect(reader.fn(`?remix=other&${reader.key}=pub-1&x=1`)).toBe('pub-1');
    });

    it('another verb’s parameter is not this verb’s intent', () => {
      for (const other of readers) {
        if (other.key === reader.key) continue;
        expect(reader.fn(`?${other.key}=pub-1`)).toBeNull();
      }
    });
  });
}
