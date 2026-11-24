import { afterEach, describe, expect, it, vi } from 'vitest';
import { History, createEmptyDocument, ops, rectNode, type DesignDocument, type OpBatch } from '../../../packages/design-model/src/index.js';
import { GUIDE_COPY } from '../src/lib/guideCopy';
import { searchGuideSections } from '../src/lib/guideSearch';

function batch(id: string, op: OpBatch['ops'][number]): OpBatch {
  return {
    id,
    ops: [op],
    provenance: { mode: 'user', label: 'no-model simulation' },
    timestamp: 0,
  };
}

function searchTrace() {
  const sections = GUIDE_COPY.en.sections;
  const unknown = searchGuideSections(sections, 'qwerty-no-such-guide-entry');
  const shorter = searchGuideSections(sections, 'save');
  const cleared = searchGuideSections(sections, '');
  return {
    unknown: unknown.length,
    shorter: shorter.map((section) => section.heading),
    cleared: cleared.length,
  };
}

function editTrace(base: DesignDocument) {
  const history = new History(base);
  const pageId = base.activePageId;
  if (!pageId) throw new Error('simulation needs an active page');
  const banner = rectNode('Banner', { id: 'sim-banner', x: 24, width: 120 });
  history.dispatch(batch('add-banner', ops.addSubtree(pageId, 0, [banner])));
  const addedX = history.current.nodes[banner.id]?.x;
  history.dispatch(batch('mistaken-move', ops.updateNode(banner.id, { x: 999 })));
  const mistakenX = history.current.nodes[banner.id]?.x;
  const undone = history.undo();
  const undoneX = undone?.nodes[banner.id]?.x;
  const canRedoAfterUndo = history.canRedo;
  const redone = history.redo();
  return {
    addedX,
    mistakenX,
    undoneX,
    redoneX: redone?.nodes[banner.id]?.x,
    canRedoAfterUndo,
    depth: history.depth,
    pageHasBanner: history.current.nodes[pageId]?.childIds.includes(banner.id),
    baseUntouched: !base.nodes[banner.id],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('无模型用户轨迹', () => {
  it('困惑用户：未知词 → 空结果 → 短词 → 清空恢复目录', () => {
    const trace = searchTrace();
    expect(trace.unknown).toBe(0);
    expect(trace.shorter.length).toBeGreaterThan(0);
    expect(trace.cleared).toBe(GUIDE_COPY.en.sections.length);
    expect(searchTrace()).toEqual(trace);
  });

  it('误操作用户：真实 Command 添加、移动、撤销与重做可重复', () => {
    const base = createEmptyDocument('Simulation');
    const trace = editTrace(base);
    expect(trace).toEqual({
      addedX: 24,
      mistakenX: 999,
      undoneX: 24,
      redoneX: 999,
      canRedoAfterUndo: true,
      depth: 2,
      pageHasBanner: true,
      baseUntouched: true,
    });
    expect(editTrace(base)).toEqual(trace);
  });

  it('两条轨迹不触发 fetch、WebSocket、信标或分析对象', () => {
    const fetch = vi.fn(() => { throw new Error('network forbidden'); });
    const WebSocket = vi.fn(() => { throw new Error('socket forbidden'); });
    const XMLHttpRequest = vi.fn(() => { throw new Error('XHR forbidden'); });
    const sendBeacon = vi.fn(() => { throw new Error('beacon forbidden'); });
    const analytics = vi.fn(() => { throw new Error('analytics forbidden'); });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', WebSocket);
    vi.stubGlobal('XMLHttpRequest', XMLHttpRequest);
    vi.stubGlobal('analytics', analytics);
    vi.stubGlobal('navigator', { sendBeacon });

    const base = createEmptyDocument('Offline');
    expect(searchTrace().cleared).toBe(GUIDE_COPY.en.sections.length);
    expect(editTrace(base).redoneX).toBe(999);
    for (const forbidden of [fetch, WebSocket, XMLHttpRequest, sendBeacon, analytics]) {
      expect(forbidden).not.toHaveBeenCalled();
    }
  });
});
