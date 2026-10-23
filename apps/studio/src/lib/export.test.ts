import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDocument } from '@nexus/design-model';

import { exportCanvasPng, exportHtml, exportJson, slug } from './export';

/**
 * M7 v414 — the SLUG every downloaded file's name is built from, graded directly.
 *
 * Three exports share one namer: the JSON snapshot, the HTML export and the PNG capture all end in
 * `${slug(name)}-...`, so a slug that surprises one download surprises all three. The rule is three
 * rewrites deep — lowercase, every run of non-alphanumerics to one hyphen, no leading or trailing
 * hyphen — and the interesting edges are what the rule does NOT do: it does not rescue a name that
 * reduces to nothing, and it does not transliterate. Both are pinned here rather than smoothed, so a
 * future "helpful" fallback is a decision rather than a drift.
 *
 * v444 adds the three downloads themselves, which the toolbar used to be the only caller of.
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

type Click = { href: string; download: string };

function installFakeDom() {
  const clicks: Click[] = [];
  const appended: unknown[] = [];
  const removed: unknown[] = [];
  const document = {
    body: {
      appendChild: (el: unknown) => {
        appended.push(el);
        return el;
      },
      removeChild: (el: unknown) => {
        removed.push(el);
        return el;
      },
    },
    createElement: (tag: string) => {
      const anchor = {
        tag,
        href: '',
        download: '',
        click: () => {
          clicks.push({ href: anchor.href, download: anchor.download });
        },
        // The seam detaches the anchor through the element's own remove(), not the body's.
        remove: () => {
          removed.push(anchor);
        },
      };
      return anchor;
    },
  };
  vi.stubGlobal('document', document as unknown as Document);
  return { clicks, appended, removed };
}

function captureObjectUrls() {
  const created: Blob[] = [];
  const spy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    created.push(blob as Blob);
    return 'blob:stub-url';
  });
  return { created, spy };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('export — exportJson (the canonical snapshot download)', () => {
  it('downloads the document as pretty-printed JSON under a slugged snapshot name', async () => {
    const dom = installFakeDom();
    const urls = captureObjectUrls();
    const doc = createEmptyDocument('My Design');

    exportJson(doc);

    expect(urls.spy).toHaveBeenCalledTimes(1);
    expect(urls.created).toHaveLength(1);
    const blob = urls.created[0]!;
    expect(blob.type).toBe('application/json');
    // The bytes are the canonical snapshot itself, two-space indented, and nothing else.
    expect(await blob.text()).toBe(JSON.stringify(doc, null, 2));
    expect(dom.clicks).toEqual([{ href: 'blob:stub-url', download: 'my-design-snapshot.json' }]);
  });

  it('appends the anchor, clicks it, and removes the SAME node it appended', () => {
    const dom = installFakeDom();
    captureObjectUrls();

    exportJson(createEmptyDocument('My Design'));

    expect(dom.appended).toHaveLength(1);
    expect(dom.removed).toHaveLength(1);
    expect(dom.removed[0]).toBe(dom.appended[0]);
    expect(dom.clicks).toHaveLength(1);
  });

  it('a document with no usable name still downloads, under the fallback name', () => {
    const dom = installFakeDom();
    captureObjectUrls();

    exportJson(createEmptyDocument(''));

    expect(dom.clicks[0]?.download).toBe('nexus-snapshot.json');
  });

  it('never revokes the object URL it created — pinned as measured, not as intended', () => {
    // A browser releases a blob URL when the document goes away, so this is a small and bounded
    // leak rather than a bug that shows. Named here rather than left silent in a green suite.
    installFakeDom();
    captureObjectUrls();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');

    exportJson(createEmptyDocument('My Design'));

    expect(revoke).not.toHaveBeenCalled();
  });
});

describe('export — exportHtml and exportCanvasPng', () => {
  it('downloads the html it was handed, unchanged, under a .html name', () => {
    const dom = installFakeDom();
    const urls = captureObjectUrls();
    const html = '<!doctype html><html><body>Hello <b>world</b></body></html>';

    exportHtml(html, 'Remix One');

    expect(urls.created[0]?.type).toBe('text/html');
    expect(dom.clicks).toEqual([{ href: 'blob:stub-url', download: 'remix-one.html' }]);
  });

  it('hands the canvas its own data URL — no blob is built for a PNG', () => {
    const dom = installFakeDom();
    const urls = captureObjectUrls();
    let seenType = '';
    const canvas = {
      toDataURL: (type: string) => {
        seenType = type;
        return 'data:image/png;base64,QUJD';
      },
    } as unknown as HTMLCanvasElement;

    exportCanvasPng(canvas, 'Shot 01');

    expect(seenType).toBe('image/png');
    // A canvas surface is already encoded by the canvas itself, so no Blob is constructed here.
    expect(urls.spy).not.toHaveBeenCalled();
    expect(dom.clicks).toEqual([{ href: 'data:image/png;base64,QUJD', download: 'shot-01.png' }]);
  });

  it('the three exports name their file the same way, from the same name', () => {
    const dom = installFakeDom();
    captureObjectUrls();
    const canvas = { toDataURL: () => 'data:image/png;base64,QUJD' } as unknown as HTMLCanvasElement;

    exportJson(createEmptyDocument('Same Name'));
    exportHtml('<p>x</p>', 'Same Name');
    exportCanvasPng(canvas, 'Same Name');

    expect(dom.clicks.map((c) => c.download)).toEqual([
      'same-name-snapshot.json',
      'same-name.html',
      'same-name.png',
    ]);
  });
});
