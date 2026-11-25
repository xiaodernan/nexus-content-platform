import { describe, expect, it } from 'vitest';
import {
  addWorldNode, createWorld, linkWorldNodes, updateWorldNode,
} from '@nexus/world-model';
import { formatSuggestion, suggestWorldLinks, weaveSuggestedLinks } from '../src/lib/worldLinks';

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

describe('weaveSuggestedLinks · 一键织网', () => {
  it('批量写成真实关系，label 就是判定依据（纪元/共同词），不编语义', () => {
    const w = world();
    const r = weaveSuggestedLinks(w);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.document.links).toHaveLength(1);
    // label 必然是 suggestWorldLinks 给出的 evidence，不是自由编造的话术
    expect(r.document.links![0]!.label).toBe(suggestWorldLinks(w)[0]!.evidence);
    expect(r.labels).toEqual(['盐道 ↔ 潮候院']);
  });

  it('织完后再织一次不会重复加边（全部跳过，确定性）', () => {
    const first = weaveSuggestedLinks(world());
    const second = weaveSuggestedLinks(first.document);
    expect(second.added).toBe(0);
    expect(second.document.links).toHaveLength(first.document.links!.length);
  });

  it('limit 生效：0 条时不写任何边', () => {
    const r = weaveSuggestedLinks(world(), 0);
    expect(r.added).toBe(0);
    expect(r.document.links ?? []).toHaveLength(0);
  });

  it('同输入两次：关系数与 label 相同（id/时间戳由 linkWorldNodes 生成，不逐字比）', () => {
    const a = weaveSuggestedLinks(world());
    const b = weaveSuggestedLinks(world());
    expect(a.added).toBe(b.added);
    expect(a.labels).toEqual(b.labels);
    // from/to 是 createWorld 给节点生成的随机 id，两次 world() 本就不同；比可读的 label 与条数
    expect(a.document.links!.length).toBe(b.document.links!.length);
    expect(a.document.links!.map((l) => l.label)).toEqual(b.document.links!.map((l) => l.label));
  });
});
