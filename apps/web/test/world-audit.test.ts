import { describe, expect, it } from 'vitest';
import {
  createWorld, linkWorldNodes, updateWorldNode,
} from '@nexus/world-model';
import { auditWorld, auditSuggestion, formatWorldAudit } from '../src/lib/worldAudit';

function base() {
  let w = createWorld('审计测试', 'p1');
  w = updateWorldNode(w, w.nodes[0]!.id, { title: '盐道', body: '路面泛白。' });
  w = updateWorldNode(w, w.nodes[1]!.id, { title: '盐道', body: '另一段盐道。' });
  return w;
}

describe('worldAudit · 薄正文维度（与 /integrity、tide 同口径 120 字）', () => {
  it('正文非空但不足 120 字算薄，满 120 字不算', () => {
    let w = createWorld('薄正文', 'p1');
    w = { ...w, nodes: w.nodes.slice(0, 2) };
    w = updateWorldNode(w, w.nodes[0]!.id, { body: '短' });
    w = updateWorldNode(w, w.nodes[1]!.id, { body: '长'.repeat(120) });
    const a = auditWorld(w);
    expect(a.thinBodies).toBe(1);
    expect(a.emptyBodies).toBe(0);
  });

  it('薄正文不改变 healthy，但健康读数里会提示可补充', () => {
    let w = createWorld('薄但健康', 'p1');
    w = { ...w, nodes: w.nodes.slice(0, 1) };
    w = updateWorldNode(w, w.nodes[0]!.id, { body: '短' });
    const a = auditWorld(w);
    expect(a.healthy).toBe(true);
    const zh = auditSuggestion(a, 'zh');
    expect(zh).toContain('不足');
    expect(formatWorldAudit(a, 'zh')).toContain('薄正文');
  });
});

describe('worldAudit · 世界体检纯函数', () => {
  it('健康世界：无空正文/重名/孤儿/断链', () => {
    let w = base();
    w = linkWorldNodes(w, w.nodes[0]!.id, w.nodes[1]!.id, '相连').document;
    // 其余骨架条目仍空正文，先全部填掉以便只验证重名与链接
    w = { ...w, nodes: w.nodes.slice(0, 2) };
    const a = auditWorld(w);
    expect(a.nodes).toBe(2);
    expect(a.emptyBodies).toBe(0);
    expect(a.duplicateTitles).toEqual([{ title: '盐道', count: 2 }]);
    expect(a.orphans).toBe(0);
    expect(a.brokenLinks).toBe(0);
    expect(a.healthy).toBe(false); // 重名未解决
  });

  it('断链与孤儿按真实端点统计', () => {
    let w = base();
    const keep = w.nodes[0]!.id;
    const gone = w.nodes[1]!.id;
    const linked = linkWorldNodes(w, keep, gone, 'erstwhile').document;
    // removeWorldNode 会顺带清掉边；这里模拟的是半途写坏/导入残留的文档：边还在，端点没了
    w = { ...linked, nodes: linked.nodes.filter((n) => n.id !== gone) };
    const a = auditWorld(w);
    expect(a.linkCount).toBe(1);
    expect(a.brokenLinks).toBe(1);
    expect(a.orphans).toBe(w.nodes.length); // 有链接但没有任何有效连接
  });

  it('没有任何关系时不把全部条目算成孤儿（避免噪声）', () => {
    const a = auditWorld(base());
    expect(a.linkCount).toBe(0);
    expect(a.orphans).toBe(0);
  });

  it('建议与读数中英各自成句，给可执行的下一步', () => {
    const w = base();
    const a = auditWorld(w);
    expect(auditSuggestion(a, 'zh')).toContain('空正文');
    expect(auditSuggestion(a, 'en')).toContain('empty bodies');
    expect(auditSuggestion(a, 'en')).not.toContain('空正文');
    expect(formatWorldAudit(a, 'zh')).toContain('断链');
    expect(formatWorldAudit(a, 'en')).toContain('broken links');
  });

  it('健康时明确说通过，不凑话术', () => {
    let w = createWorld('干净', 'p1');
    w = { ...w, nodes: w.nodes.slice(0, 1) };
    w = updateWorldNode(w, w.nodes[0]!.id, { title: '独苗', body: '有正文' });
    const a = auditWorld(w);
    expect(a.healthy).toBe(true);
    expect(auditSuggestion(a, 'zh')).toContain('体检通过');
    expect(auditSuggestion(a, 'en')).toContain('Check passed');
  });
});
