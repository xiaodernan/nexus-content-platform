import { describe, expect, it } from 'vitest';

import { olderWindowWouldHoldSomething } from './pager';

/**
 * M7 v398 — the ONE ending every pager in the Studio shares.
 *
 * The rule under test is the difference between two ways to end a pager:
 *
 * <ul>
 *   <li>the tempting one (v392): "Older" is disabled when the window ALREADY holds every row;
 *   <li>the honest one (v391/v395/v396/v397): "Older" is offered only when the NEXT window would
 *       hold something.
 * </ul>
 *
 * <p>The two agree on every full window. They disagree when the service answered with FEWER rows than
 * the cap while the count says more rows sit past the next window's start — and there the tempting
 * rule offers a page the service has already counted as empty.
 */
describe('pager — the older window would hold something (M7 v398)', () => {
  it('offers the next window when the count says rows sit past it', () => {
    // 37 rows, window of 20, reading the first: rows 20–36 are there to be read.
    expect(olderWindowWouldHoldSomething(0, 20, 37)).toBe(true);
  });

  it('does NOT offer the next window when the count says it would be empty', () => {
    // 40 rows, window of 20, reading the second (rows 20–39): the next window starts at row 40,
    // and the count says there is no row 40. The tempting rule would offer it — the window it is
    // reading is full, so "already holds everything" reads false — and the reader would land on an
    // empty page the service had already counted.
    expect(olderWindowWouldHoldSomething(20, 20, 40)).toBe(false);
  });

  it('a SHORT window that is not the end still has a next window to offer', () => {
    // The case the two rules disagree on: the service answered 3 rows of a 20-row window, and the
    // count says 50 rows exist. Rows 20–49 are there, so the next window holds something — the
    // tempting rule, reading the short window as "the end", would disable it and hide them.
    expect(olderWindowWouldHoldSomething(0, 20, 50)).toBe(true);
  });

  it('a short window AT the end offers nothing — both rules agree here', () => {
    // 5 rows in all, 3 on the screen: the next window starts past the last row.
    expect(olderWindowWouldHoldSomething(0, 20, 3)).toBe(false);
  });

  it('an exact multiple of the window ends exactly at the boundary', () => {
    expect(olderWindowWouldHoldSomething(20, 20, 40)).toBe(false);
    expect(olderWindowWouldHoldSomething(0, 20, 20)).toBe(false);
  });

  it('a count that could not be read offers nothing rather than guessing', () => {
    // "0 followers" and "the followers could not be read" are different facts (v288), and a pager
    // that offered a page on an unread count would be guessing with the reader's time.
    expect(olderWindowWouldHoldSomething(0, 20, null)).toBe(false);
    expect(olderWindowWouldHoldSomething(0, 20, undefined)).toBe(false);
    expect(olderWindowWouldHoldSomething(0, 20, Number.NaN)).toBe(false);
  });

  it('a window with no size, or an offset before the first, offers nothing', () => {
    expect(olderWindowWouldHoldSomething(0, 0, 37)).toBe(false);
    expect(olderWindowWouldHoldSomething(0, -5, 37)).toBe(false);
    expect(olderWindowWouldHoldSomething(-5, 20, 37)).toBe(false);
  });
});
