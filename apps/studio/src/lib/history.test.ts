import { describe, expect, it } from 'vitest';

import { historyRowsOf, injectHistory, renderHistoryHtml } from './history';

/**
 * M9 v280 — the AUDIT TRAIL, read at the thing it records.
 *
 * The two rules the suite grades: the filter is EXACT (only the entries naming this publication), and the
 * page says when it has none rather than implying nothing happened.
 *
 * v384 — the wire grew a THIRD fact per row (the kind of thing the target id names), so a row that cannot
 * say what sort of thing it happened to is dropped here too, exactly as the toolbar's trail drops it.
 */
const entry = (over: Record<string, unknown> = {}) => ({
  id: '7',
  action: 'publish',
  actorId: 'acct-ada',
  targetId: 'pub-1',
  targetType: 'publication',
  createdAt: 1_776_000_000_000,
  assurance: 'unsigned-local',
  ...over,
});

describe('history — the entries for ONE publication (M9 v280)', () => {
  it('keeps only the entries that name this publication', () => {
    const rows = historyRowsOf(
      [entry({ id: '1', targetId: 'pub-1' }), entry({ id: '2', targetId: 'pub-2' }), entry({ id: '3', targetId: 'pub-1' })],
      'pub-1',
    );
    expect(rows.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('preserves the service’s NEWEST-FIRST order — the order is part of what the trail asserts', () => {
    const rows = historyRowsOf(
      [entry({ id: '3', createdAt: 300 }), entry({ id: '2', createdAt: 200 }), entry({ id: '1', createdAt: 100 })],
      'pub-1',
    );
    expect(rows.map((r) => r.id)).toEqual(['3', '2', '1']);
  });

  it('a publication with no entries answers with none — and the PAGE says so', () => {
    const rows = historyRowsOf([entry({ targetId: 'pub-2' })], 'pub-1');
    expect(rows).toEqual([]);
    const html = renderHistoryHtml(rows, 1);
    expect(html).toContain('data-history="empty"');
    expect(html).toContain('not the same as');
  });

  it('a blank target matches nothing — an entry belongs to a publication or to none', () => {
    expect(historyRowsOf([entry()], '')).toEqual([]);
  });

  it('a row it cannot display honestly is dropped, not faked', () => {
    const rows = historyRowsOf([entry({ id: '1' }), entry({ id: '2', targetId: null }), entry({ id: '3' })], 'pub-1');
    expect(rows.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('a row that cannot say what KIND of thing it happened to is dropped too (v384)', () => {
    const rows = historyRowsOf([entry({ id: '1' }), entry({ id: '2', targetType: null }), entry({ id: '3' })], 'pub-1');
    expect(rows.map((r) => r.id)).toEqual(['1', '3']);
  });
});

describe('history — the page section (M9 v280)', () => {
  it('names the action, the actor and the instant of each entry', () => {
    const rows = historyRowsOf([entry({ action: 'unpublish' })], 'pub-1');
    const html = renderHistoryHtml(rows, 1);
    expect(html).toContain('data-history="rows"');
    expect(html).toContain('took down');
    expect(html).toContain('acct-ada · unsigned-local');
    expect(html).toContain('2026-04-12T13:20:00Z');
  });

  it('an anonymous entry says NOBODY — the service refuses to fake an actor, and so does the page', () => {
    const rows = historyRowsOf([entry({ actorId: null, assurance: null })], 'pub-1');
    const html = renderHistoryHtml(rows, 1);
    expect(html).toContain('nobody (anonymous)');
  });

  it('states the count of the WHOLE answer beside the rows, so a cap that cut it short is visible', () => {
    const rows = historyRowsOf([entry()], 'pub-1');
    const html = renderHistoryHtml(rows, 40);
    expect(html).toContain('1 entr(y/ies) for this publication');
    expect(html).toContain('the answer carried 40 in all');
    expect(html).toContain('the trail is capped');
  });

  it('when the whole answer was about this publication, it says so without the cap warning', () => {
    const rows = historyRowsOf([entry()], 'pub-1');
    const html = renderHistoryHtml(rows, 1);
    expect(html).toContain('the answer carried 1 in all');
    expect(html).not.toContain('the trail is capped');
  });

  it('escapes caller-controlled text', () => {
    const rows = historyRowsOf([entry({ action: '<script>x</script>' })], 'pub-1');
    const html = renderHistoryHtml(rows, 1);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});

describe('history — the section is injected into the artifact page (M9 v280)', () => {
  it('inserts the section before the closing body tag', () => {
    const page = '<html><body><div>artifact</div></body></html>';
    const out = injectHistory(page, '<section data-history="rows"></section>');
    expect(out).toContain('<div>artifact</div><section data-history="rows"></section></body>');
  });

  it('an EMPTY history inserts NOTHING — a failed read must not put a heading on the page', () => {
    const page = '<html><body><div>artifact</div></body></html>';
    expect(injectHistory(page, '')).toBe(page);
  });

  it('a preview with no closing body tag is returned unchanged rather than corrupted', () => {
    const page = '<html><div>artifact</div></html>';
    expect(injectHistory(page, '<section></section>')).toBe(page);
  });
});
