import { describe, expect, it } from 'vitest';
import {
  addWorldNode, createWorld, linkWorldNodes, updateWorldNode,
} from '@nexus/world-model';
import { formatSuggestion, suggestWorldLinks } from '../src/lib/worldLinks';

function world() {
  let w = createWorld('串联测试', 'p1');
  w = { ...w, nodes: w.nodes.slice(0, 2) };
  w = updateWorldNode(w, w.nodes[0]!.id, { title: '盐道', body: '盐道沿线的石磨与潮汐记录了潮候院的时刻。' });
  w = updateWorldNode(w, w.nodes[1]!.id, { title: '潮候院', body: '潮候院用石磨记时，盐道是它的命脉。' });
  return w;
}

describe('worldLinks · 串联建议纯函数', () => {
  it('从真实共同词里给出建议，不编内容', () => {
    const s = suggestWorldLinks(world());
    expect(s).toHaveLength(1);
    expect(s[0]!.reason).toBe('shared-word');
    expect(s[0]!.evidence).toContain('盐道'); // 取排序后的前三个共同词之一
    expect(s[0]!.fromTitle).toBe('盐道'); // 文档里的先后顺序
    expect(s[0]!.toTitle).toBe('潮候院');
  });

  it('同纪元优先于共同词，且证据就是纪元名', () => {
    let w = world();
    w = updateWorldNode(w, w.nodes[0]!.id, { lore: { era: '灰灯纪' } });
    w = updateWorldNode(w, w.nodes[1]!.id, { lore: { era: '灰灯纪' } });
    const s = suggestWorldLinks(w);
    expect(s[0]!.reason).toBe('same-era');
    expect(s[0]!.evidence).toBe('灰灯纪');
    expect(s[0]!.score).toBeGreaterThan(10);
  });

  it('已经连过的不再建议', () => {
    const w = world();
    const linked = linkWorldNodes(w, w.nodes[0]!.id, w.nodes[1]!.id, '命脉').document;
    expect(suggestWorldLinks(linked)).toEqual([]);
  });

  it('空正文的骨架条目不参与，limit 生效', () => {
    let w = createWorld('x', 'p1');
    w = addWorldNode(w, { kind: 'lore', title: '有正文', body: '石磨记时潮汐' });
    expect(suggestWorldLinks(w)).toEqual([]);
    expect(suggestWorldLinks(world(), 0)).toEqual([]);
  });

  it('同输入两次一致，i18n 读数各自成句', () => {
    const w = world();
    expect(suggestWorldLinks(w)).toEqual(suggestWorldLinks(w));
    const s = suggestWorldLinks(w)[0]!;
    expect(formatSuggestion(s, 'zh')).toContain('都写到');
    expect(formatSuggestion(s, 'en')).toContain('both mention');
    expect(formatSuggestion(s, 'en')).not.toContain('都写到');
  });
});
