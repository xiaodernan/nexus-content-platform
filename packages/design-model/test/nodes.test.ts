import { describe, expect, it } from 'vitest';
import { defaultTokens, groupNode, imageNode, lineNode, pathNode } from '../src/index.js';

// `nodes.ts` node builders are used all over the codebase but only rectNode/frameNode/pageNode had
// incidental coverage. The remaining builders (group/line/path/image) plus `defaultTokens` had no direct
// test. These pin their type + id/parentId wiring so a refactor can't silently change a node's `type`.

describe('defaultTokens (ADR 0008 DTCG theme)', () => {
  it('returns a populated theme with the expected top-level groups and anchors', () => {
    const t = defaultTokens();
    expect(Object.keys(t)).toEqual(expect.arrayContaining(['color', 'font', 'space', 'radius']));
    expect((t.color as Record<string, { $value: string }>).brand.$value).toBe('#6ea8fe');
    expect((t.font.size as Record<string, { $value: string }>).xl.$value).toBe('28px');
    expect((t.radius as Record<string, { $value: string }>).full.$value).toBe('9999px');
    // each leaf carries a $type
    expect((t.color as Record<string, { $type: string }>).text.$type).toBe('color');
  });
});

describe('node builders', () => {
  it('groupNode builds a group container', () => {
    const n = groupNode('G', { id: 'g1', parentId: 'page1' });
    expect(n.type).toBe('group');
    expect(n.id).toBe('g1');
    expect(n.parentId).toBe('page1');
    expect(n.childIds).toEqual([]);
    expect(n.clipContent).toBe(false);
  });

  it('lineNode builds a line shape', () => {
    const n = lineNode('L', { id: 'l1' });
    expect(n.type).toBe('line');
    expect(n.id).toBe('l1');
  });

  it('pathNode carries its path data', () => {
    const n = pathNode('P', 'M0 0 L10 10', { id: 'p1' });
    expect(n.type).toBe('path');
    expect(n.d).toBe('M0 0 L10 10');
  });

  it('imageNode wires the asset id and defaults fit to cover', () => {
    const n = imageNode('I', 'asset-9', { id: 'i1' });
    expect(n.type).toBe('image');
    expect(n.assetId).toBe('asset-9');
    expect(n.fit).toBe('cover');
  });
});
