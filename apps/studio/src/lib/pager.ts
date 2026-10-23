/**
 * M7 v398 — the ONE rule every pager in the Studio ends on.
 *
 * <p>A pager has two controls and one honest question per control. "Newer" is disabled on the first
 * window, because there is no page before it. "Older" is the interesting one: the tempting rule is to
 * disable it when the window ALREADY holds every row the service counted, and that rule is wrong in
 * exactly the case that matters — a window that came back SHORT.
 *
 * <p>v392 shipped the tempting rule, and v391/v395/v396/v397 each shipped the better one on the side
 * they were touching: offer "Older" only when the NEXT window would hold something. The whole-table
 * count rides on every answer, so the service has already counted the page a short window would offer
 * next — and a pager that offers it anyway is offering a page it has been told is empty. The two rules
 * agree whenever the window is full; they disagree exactly when the service answered with fewer rows
 * than the cap while more rows remain past the next window's start, and there the tempting rule sends
 * the reader to a page that holds nothing.
 *
 * <p>The rule never hides a reachable row: rows exist at offsets 0..count-1, so "the next window would
 * hold something" and "there is a row at offset + windowSize" are the same sentence.
 */

/** Whether the window AFTER this one would hold anything, by the whole-table count. */
export function olderWindowWouldHoldSomething(
  offset: number,
  windowSize: number,
  count: number | null | undefined,
): boolean {
  // A count that could not be read is not a count of nothing: with no number there is nothing to say
  // about the next window, and the honest ending is to offer nothing rather than to guess.
  if (typeof count !== 'number' || !Number.isFinite(count)) return false;
  // A window with no size cannot name the page it would offer.
  if (typeof windowSize !== 'number' || !Number.isFinite(windowSize) || windowSize <= 0) return false;
  if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0) return false;
  return offset + windowSize < count;
}
