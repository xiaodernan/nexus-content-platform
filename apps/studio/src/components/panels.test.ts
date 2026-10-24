/**
 * M7 v500 (ADR 0016 amendment 493) — the PANEL LAYER, graded by static rendering.
 *
 * The gap. Every door the Studio serves has a direct test now (v488–v499) and every lib module beneath
 * the panels has had one for a long time, but the panels themselves — twenty-three component files,
 * roughly six thousand lines, the part of this app a reader actually looks at — have never been asked
 * anything. The one file that tried (instancePanel.test.ts, v132) says why in its own header: this repo
 * has no component-rendering harness, so it pins wiring by READING the source and requiring the seam.
 * That grades the call and not the picture. A panel that renders the wrong rows, disables the wrong
 * button, or shows its empty state at the wrong moment keeps every seam it ever had.
 *
 * The proof. React renders to a string in plain node, and a zustand store is just state — so a panel
 * can be asked what it SHOWS for a document with no selection, one layer, three layers, an instance, a
 * history, and the answer is markup a test can hold still. Nothing here clicks anything: effects do not
 * run and events do not fire, so what is pinned is the render itself — which controls exist, which are
 * disabled, what they are called, what the empty states say. Interactions stay with the browser harness
 * and the source-reading guards stay where they are; this is a third seam, not a replacement.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyDocument, frameNode, rectNode, type DiffSummary } from '@nexus/design-model';
import { useStudio } from '@/lib/store';
import type { ComponentType } from 'react';

/**
 * Why a global. Vitest’s esbuild runs the CLASSIC JSX transform here (the studio tsconfig asks for
 * `preserve`, and classic output is what a node test gets), so a component’s JSX compiles to a call on
 * a free variable named `React` — while the components import their hooks by name and not the
 * namespace, because in the app Next’s automatic runtime supplies it. A statically imported component
 * therefore dies on `React is not defined`. Installing the global BEFORE the panels load — they are
 * imported dynamically in `beforeAll` for exactly this reason — gives the classic output something to
 * find, without editing twenty-three source files or the shared vitest config a parallel lane holds.
 */
(globalThis as unknown as { React: typeof React }).React = React;

/**
 * Why the mirror. React renders on the server from a store’s INITIAL state: zustand hands
 * `getInitialState` to `useSyncExternalStore` as the server snapshot, so a panel asked with
 * `renderToStaticMarkup` answers with the state the module was created with — every store action a
 * test ran beforehand is invisible to it. So the live state is mirrored onto that initial-state object
 * before each render. The panels, their selectors and the actions that build the state are all the
 * real ones; only the snapshot React asks for is the driven one.
 */
function mirrorLiveStateIntoServerSnapshot(): void {
  const initial = useStudio.getInitialState() as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(st() as unknown as Record<string, unknown>)) {
    if (typeof value !== 'function') initial[key] = value;
  }
}

type AnyPanel = ComponentType<Record<string, unknown>>;

let panels: Record<string, AnyPanel>;

beforeAll(async () => {
  panels = {
    AlignBar: (await import('./AlignBar')).default as unknown as AnyPanel,
    ComponentsPanel: (await import('./ComponentsPanel')).default as unknown as AnyPanel,
    DesignSystemPanel: (await import('./DesignSystemPanel')).default as unknown as AnyPanel,
    DiffCard: (await import('./DiffCard')).DiffCard as unknown as AnyPanel,
    HistoryPanel: (await import('./HistoryPanel')).default as unknown as AnyPanel,
    LayersPanel: (await import('./LayersPanel')).default as unknown as AnyPanel,
    Minimap: (await import('./Minimap')).default as unknown as AnyPanel,
    PageTabs: (await import('./PageTabs')).default as unknown as AnyPanel,
    PropertiesPanel: (await import('./PropertiesPanel')).default as unknown as AnyPanel,
    PromptBar: (await import('./PromptBar')).default as unknown as AnyPanel,
  };
});

const st = () => useStudio.getState();
const render = (name: string, props: Record<string, unknown> = {}): string => {
  mirrorLiveStateIntoServerSnapshot();
  return renderToStaticMarkup(React.createElement(panels[name]!, props));
};
const countOf = (html: string, needle: string): number => html.split(needle).length - 1;

beforeEach(() => {
  // view state that no panel action resets, so one test’s driving cannot leak into the next
  useStudio.setState({ aiBusy: false, hoverId: null, mode: 'demo' });
  st().newProject();
});

/** Two shapes on the active page, returned in the order they were added. */
function twoShapes(): [string, string] {
  st().addShape('rectangle', { x: 40, y: 40 });
  const a = st().selection[0]!;
  st().addShape('ellipse', { x: 240, y: 40 });
  const b = st().selection[0]!;
  return [a, b];
}

const pageIds = (): string[] => Object.values(st().doc.nodes).filter((n) => n.type === 'page').map((n) => n.id);

/** A page holding a frame, which holds a leaf — two levels of nesting under the active page. */
function loadNested(): { pageId: string; frameId: string; leafId: string } {
  const doc = createEmptyDocument('Panels');
  const pageId = doc.activePageId;
  const frame = frameNode('Frame', undefined, { x: 0, y: 0, width: 200, height: 200, parentId: pageId });
  const leaf = rectNode('Leaf', { x: 10, y: 10, width: 50, height: 50, parentId: frame.id });
  doc.nodes[frame.id] = frame;
  doc.nodes[frame.id]!.childIds.push(leaf.id);
  doc.nodes[pageId]!.childIds.push(frame.id);
  doc.nodes[leaf.id] = leaf;
  st().loadDocument(doc);
  return { pageId, frameId: frame.id, leafId: leaf.id };
}

describe('AlignBar — the alignment controls answer the selection count (v500)', () => {
  it('an empty selection disables all eight controls and says what to select', () => {
    const html = render('AlignBar');
    expect(countOf(html, '<button')).toBe(8);
    expect(countOf(html, 'disabled=')).toBe(8);
    expect(html).toContain('Select layers to align');
  });

  it('one layer unlocks the six align controls and still refuses distribution', () => {
    const [a] = twoShapes();
    st().select([a]);
    const html = render('AlignBar');
    expect(countOf(html, 'disabled=')).toBe(2);
    expect(html).toContain('1 selected — align only');
  });

  it('three layers unlock distribution as well', () => {
    const [a, b] = twoShapes();
    st().addShape('text', { x: 440, y: 40 });
    const c = st().selection[0]!;
    st().select([a, b, c]);
    const html = render('AlignBar');
    expect(countOf(html, 'disabled=')).toBe(0);
    expect(html).toContain('3 selected — align + distribute');
  });

  it('every control carries the title that names its action', () => {
    const html = render('AlignBar');
    for (const title of [
      'Align left',
      'Align horizontal centers',
      'Align right',
      'Align top',
      'Align vertical centers',
      'Align bottom',
      'Distribute horizontally',
      'Distribute vertically',
    ]) {
      expect(html).toContain('title="' + title + '"');
    }
  });
});

describe('PageTabs — one tab per page, and only pages (v500)', () => {
  it('a fresh project shows its one page and the add button', () => {
    const html = render('PageTabs');
    expect(countOf(html, 'double-click to rename')).toBe(1);
    expect(html).toContain('Page 1');
    expect(html).toContain('title="Add page"');
  });

  it('a second page becomes a second tab, and neither a shape nor the document does', () => {
    twoShapes();
    st().addPage();
    const html = render('PageTabs');
    expect(countOf(html, 'double-click to rename')).toBe(2);
    expect(html).toContain('Page 2');
    expect(html).not.toContain('Rectangle');
    expect(html).not.toContain('Ellipse');
    expect(html).not.toContain('Untitled Project');
  });

  it('the active page wears the brand tab, and a new page is born wearing it', () => {
    // one page: the only tab is active, so no tab is transparent
    const only = render('PageTabs');
    expect(only).toContain('rgba(110,168,254,0.14)');
    expect(only).not.toContain('transparent');
    // a new page arrives ACTIVE: the old tab turns transparent and the brand moves past it
    st().addPage();
    const two = render('PageTabs');
    expect(two.indexOf('transparent')).toBeLessThan(two.indexOf('rgba(110,168,254,0.14)'));
    // and switching back moves the mark the other way
    st().switchPage(pageIds()[0]!);
    const back = render('PageTabs');
    expect(back.indexOf('rgba(110,168,254,0.14)')).toBeLessThan(back.indexOf('transparent'));
  });
});

describe('LayersPanel — the active page subtree and its row grammar (v500)', () => {
  it('the page root row carries no hide/lock pair; its children do', () => {
    twoShapes();
    const html = render('LayersPanel');
    expect(countOf(html, 'title="Hide"')).toBe(2);
    expect(countOf(html, 'title="Lock"')).toBe(2);
  });

  it('one step of indent per level of depth', () => {
    loadNested();
    const html = render('LayersPanel');
    expect(html).toContain('padding-left:8px');
    expect(html).toContain('padding-left:20px');
    expect(html).toContain('padding-left:32px');
  });

  it('a container row offers the collapse chevron and a leaf row does not', () => {
    loadNested();
    const html = render('LayersPanel');
    expect(countOf(html, '▾')).toBe(2); // the page and the frame are both containers
    expect(countOf(html, '▸')).toBe(0);
  });

  it('a hidden layer reads muted and offers Show; a locked one offers Unlock', () => {
    const { frameId } = loadNested();
    st().updateNode(frameId, { visible: false, locked: true });
    const html = render('LayersPanel');
    expect(html).toContain('⊘');
    expect(html).toContain('🔒');
    expect(html).toContain('title="Show"');
    expect(html).toContain('title="Unlock"');
  });

  it('the selected row is tinted with the brand colour', () => {
    const { frameId } = loadNested();
    st().select([frameId]);
    expect(render('LayersPanel')).toContain('rgba(110,168,254,0.16)');
  });

  it('only the active page’s subtree is listed', () => {
    loadNested();
    st().addPage();
    st().switchPage(pageIds()[1]!);
    st().addShape('ellipse', { x: 10, y: 10 });
    const html = render('LayersPanel');
    expect(html).toContain('Ellipse');
    expect(html).not.toContain('Frame');
    expect(html).not.toContain('Leaf');
  });
});

describe('ComponentsPanel — the component authoring gates (v500)', () => {
  it('a document with no components says so and disables both actions', () => {
    const html = render('ComponentsPanel');
    expect(html).toContain('No components yet.');
    expect(countOf(html, 'disabled=')).toBe(2);
  });

  it('wrapping a selection lists the master with its usage count', () => {
    const [a, b] = twoShapes();
    st().select([a, b]);
    st().createComponent();
    const comp = Object.values(st().doc.nodes).find((n) => n.type === 'component')!;
    const html = render('ComponentsPanel');
    expect(html).toContain(comp.name);
    expect(html).toContain('1×');
    expect(html).toContain('title="Insert an instance of this component"');
  });

  it('inserting a second instance raises the usage count', () => {
    const [a, b] = twoShapes();
    st().select([a, b]);
    st().createComponent();
    const comp = Object.values(st().doc.nodes).find((n) => n.type === 'component')!;
    st().insertInstance(comp.id);
    expect(render('ComponentsPanel')).toContain('2×');
  });

  it('the fresh instance unlocks Detach; a page in the selection locks Make component', () => {
    const [a, b] = twoShapes();
    st().select([a, b]);
    st().createComponent();
    expect(st().doc.nodes[st().selection[0]!]!.type).toBe('instance');
    expect(countOf(render('ComponentsPanel'), 'disabled=')).toBe(0);
    st().select([pageIds()[0]!]);
    expect(countOf(render('ComponentsPanel'), 'disabled=')).toBe(2);
  });

  it('a locked layer cannot be wrapped', () => {
    const [a] = twoShapes();
    st().updateNode(a, { locked: true });
    st().select([a]);
    expect(render('ComponentsPanel')).toContain('disabled=');
  });
});

describe('HistoryPanel — the op-log mirror (v500)', () => {
  it('a fresh project offers no rows and disables both arrows', () => {
    const html = render('HistoryPanel');
    expect(html).toContain('No edits yet.');
    expect(countOf(html, 'disabled=')).toBe(2);
  });

  it('each edit is a numbered, chipped, diffed row, and the current one says so', () => {
    st().addShape('rectangle', { x: 40, y: 40 });
    st().moveSelectionBy(20, 0);
    const log = st().historyLog;
    expect(log.length).toBe(2);
    const html = render('HistoryPanel');
    expect(html).toContain('1. ' + log[0]!.summary);
    expect(html).toContain('2. ' + log[1]!.summary);
    expect(countOf(html, '>user<')).toBe(2);
    expect(html).toContain('title="Current state"');
    expect(html).toContain('title="Restore to after: ' + log[0]!.summary + '"');
    expect(html).toContain('+1');
    expect(html).toContain('2 → 3 nodes');
    // a nudge is a MODIFY in the diff vocabulary, not a MOVE: moved is the reordering family, and
    // the row for a drag shows ~1 — which is what pins the vocabulary, so it is asserted here.
    expect(html).toContain('~1');
    expect(html).not.toContain('⇅');
  });

  it('undo opens the redo arrow and dims the tail rows; redo closes it again', () => {
    st().addShape('rectangle', { x: 40, y: 40 });
    st().moveSelectionBy(20, 0);
    st().undo();
    const html = render('HistoryPanel');
    expect(countOf(html, 'disabled=')).toBe(0);
    expect(html).toContain('opacity:0.55');
    st().redo();
    expect(render('HistoryPanel')).not.toContain('opacity:0.55');
  });

  it('a demo edit is chipped DEMO and a live one live', () => {
    st().commitOps([], 'a demo edit', { mode: 'demo' });
    st().commitOps([], 'a live edit', { mode: 'live' });
    const html = render('HistoryPanel');
    expect(html).toContain('>DEMO<');
    expect(html).toContain('>live<');
  });
});

describe('DesignSystemPanel — the token tree (v500)', () => {
  it('the default tokens group by their first path segment, in document order', () => {
    const html = render('DesignSystemPanel');
    const at = (g: string) => html.indexOf('>' + g + '<');
    expect(at('color')).toBeGreaterThanOrEqual(0);
    expect(at('color')).toBeLessThan(at('font'));
    expect(at('font')).toBeLessThan(at('space'));
  });

  it('a color token gets a swatch of its own value; a non-color gets a dot', () => {
    const html = render('DesignSystemPanel');
    expect(countOf(html, 'background:#')).toBe(8);
    expect(html).toContain('background:#0b0e14');
    expect(html).toContain('>color.brand<');
    expect(html).toContain('>#6ea8fe<');
    expect(html).toContain('>font.weight.bold<');
    expect(html).toContain('>700<');
    expect(html).toContain('>·<');
  });
});

describe('PropertiesPanel — the selection decides the editor (v500)', () => {
  it('nothing selected says so, in the panel’s own words', () => {
    const html = render('PropertiesPanel');
    expect(html).toContain('Nothing selected.');
    expect(html).toContain('Click a layer or shape to edit it.');
    expect(html).toContain('generate a design in DEMO MODE.');
  });

  it('one rectangle opens the geometry, appearance and fill editors', () => {
    st().addShape('rectangle', { x: 40, y: 40 });
    const html = render('PropertiesPanel');
    expect(html).toContain('value="Rectangle"');
    expect(html).toContain('type: <b>rectangle</b>');
    for (const label of ['X', 'Y', 'W', 'H', 'Rotation', 'Opacity', 'Corner radius', 'Fill']) {
      expect(html).toContain('>' + label + '<');
    }
    expect(html).toContain('token color.surfaceAlt');
    expect(html).toContain('value="#1e2634"');
    expect(html).toContain('>Hide<');
    expect(html).toContain('>Lock<');
  });

  it('a hidden, locked layer offers Show and Unlock instead', () => {
    st().addShape('rectangle', { x: 40, y: 40 });
    st().updateNode(st().selection[0]!, { visible: false, locked: true });
    const html = render('PropertiesPanel');
    expect(html).toContain('>Show<');
    expect(html).toContain('>Unlock<');
    expect(html).not.toContain('>Hide<');
  });

  it('a text layer opens the text section with its three alignments', () => {
    st().addShape('text', { x: 40, y: 40 });
    const html = render('PropertiesPanel');
    expect(html).toContain('Type something');
    expect(html).toContain('<option value="left" selected="">left</option>');
    expect(html).toContain('<option value="center">center</option>');
    expect(html).toContain('<option value="right">right</option>');
  });

  it('two layers trade the editor for the bulk actions', () => {
    const [a, b] = twoShapes();
    st().select([a, b]);
    const html = render('PropertiesPanel');
    expect(html).toContain('2 layers selected.');
    expect(html).toContain('>Duplicate<');
    expect(html).toContain('>Delete<');
    expect(html).not.toContain('Nothing selected.');
  });

  it('an instance in the selection opens the instance overrides under the editor', () => {
    const [a, b] = twoShapes();
    st().select([a, b]);
    st().createComponent();
    const html = render('PropertiesPanel');
    expect(html).toContain('Instance overrides');
    expect(html).toContain('Edits here are stored on this instance only, not the master.');
  });

  it('the last diff rides along at the bottom of the panel', () => {
    st().addShape('rectangle', { x: 40, y: 40 });
    const html = render('PropertiesPanel');
    expect(html).toContain('AI / Edit Diff');
    expect(html).toContain('+1');
    expect(html).toContain('2 → 3 nodes');
  });
});

describe('PromptBar — the two tabs and the busy gate (v500)', () => {
  it('opens on Generate with its suggestions and an enabled Compose', () => {
    const html = render('PromptBar');
    expect(countOf(html, 'tool-active')).toBe(1);
    for (const chip of ['a SaaS landing page', 'a login screen', 'an analytics dashboard', 'a portfolio site']) {
      expect(html).toContain('>' + chip + '<');
    }
    expect(html).toContain('>Compose<');
    expect(countOf(html, 'disabled=')).toBe(0);
  });

  it('a busy model disables the field, the button and every chip, and renames the button', () => {
    useStudio.setState({ aiBusy: true });
    const html = render('PromptBar');
    expect(countOf(html, 'disabled=')).toBe(6); // the field, Compose, and the four chips
    expect(html).toContain('Composing…');
  });

  it('demo mode says so and fills the placeholder; live mode does neither', () => {
    const demo = render('PromptBar');
    expect(demo).toContain('deterministic output · no keys');
    expect(demo).toContain('placeholder="e.g. an analytics dashboard  (DEMO MODE)"');
    useStudio.setState({ mode: 'live' });
    const live = render('PromptBar');
    expect(live).not.toContain('deterministic output');
    expect(live).toContain('placeholder="Describe what to build…"');
  });
});

describe('Minimap — the fixed box (v500)', () => {
  it('renders one labelled canvas at the size the fit math assumes', () => {
    const html = render('Minimap');
    expect(html).toContain('<canvas aria-label="Minimap"');
    expect(html).toContain('width:200px');
    expect(html).toContain('height:150px');
  });
});

describe('DiffCard — the semantic before/after card (v500)', () => {
  const summary: DiffSummary = {
    added: ['n1'],
    removed: ['n2'],
    moved: [],
    modified: [{ id: 'n3', keys: ['x'], patch: { x: 4 } }],
    tokensChanged: false,
    nodeCountBefore: 2,
    nodeCountAfter: 3,
  };

  it('no diff renders nothing at all', () => {
    expect(render('DiffCard', { diff: null })).toBe('');
  });

  it('the counts are the card', () => {
    const html = render('DiffCard', { diff: summary });
    expect(html).toContain('AI / Edit Diff');
    expect(html).toContain('+1');
    expect(html).toContain('−1');
    expect(html).toContain('~1');
    expect(html).toContain('2 → 3 nodes');
    expect(html).not.toContain('⇅');
    expect(html).not.toContain('>tokens<');
  });

  it('a move and a token change earn their own chips', () => {
    const html = render('DiffCard', { diff: { ...summary, moved: ['n4'], tokensChanged: true } });
    expect(html).toContain('⇅1');
    expect(html).toContain('>tokens<');
  });

  it('the caller’s title replaces the default one', () => {
    const html = render('DiffCard', { diff: summary, title: 'diff' });
    expect(html).toContain('>diff<');
    expect(html).not.toContain('AI / Edit Diff');
  });

  it('a dismiss button appears only when a closer was given', () => {
    expect(render('DiffCard', { diff: summary })).not.toContain('dismiss');
    expect(render('DiffCard', { diff: summary, onClose: () => {} })).toContain('aria-label="dismiss"');
  });

  it('before and after documents become two labelled thumbnails, and a missing page gets none', () => {
    st().addShape('rectangle', { x: 40, y: 40 });
    const before = st().lastBefore!;
    const after = st().doc;
    const pageId = st().lastPageId!;
    const html = render('DiffCard', { diff: summary, before, after, pageId });
    expect(countOf(html, '<img')).toBe(2);
    expect(html).toContain('alt="before"');
    expect(html).toContain('alt="after"');
    expect(countOf(html, 'data:image/svg+xml')).toBe(2);
    expect(countOf(render('DiffCard', { diff: summary, before, after, pageId: 'nope' }), '<img')).toBe(0);
  });
});
