import { describe, expect, it } from 'vitest';
import { WORLD_KINDS, createWorld, addWorldNode, updateWorldNode, type WorldDocument } from '@nexus/world-model';
import { worldFileName, worldToMarkdown } from '../src/lib/worldExport';

function worldWith(seed: string): WorldDocument {
  let w = createWorld(seed, 'p1');
  w = { ...w, summary: '盐道尽头的纪事。' };
  w = addWorldNode(w, { kind: 'geography', title: '盐道', body: '路面泛白，石缝积盐。' });
  const id = w.nodes[w.nodes.length - 1]!.id;
  w = updateWorldNode(w, id, { lore: { era: '灰灯纪', order: 2, memory: '咸味贴着鞋底。' } });
  return w;
}

describe('worldExport · 世界 Markdown 纯投影', () => {
  const w = worldWith('潮候院');

  it('九类固定顺序全在标题里，空类也留标题', () => {
    const md = worldToMarkdown(w, 'zh');
    expect(WORLD_KINDS.length).toBe(9);
    expect(md).toContain('## 地理');
    expect(md).toContain('（还没有正文）');
    expect((md.match(/^## /gm) || []).length).toBe(9);
  });

  it('纪元/序号与记忆回声都进正文', () => {
    const md = worldToMarkdown(w, 'zh');
    expect(md).toContain('潮候院');
    expect(md).toContain('盐道尽头的纪事。');
    expect(md).toContain('纪元：灰灯纪 · 2');
    expect(md).toContain('记忆回声：咸味贴着鞋底。');
  });

  it('英文版用英文标签与英文小节名，不夹中文', () => {
    const md = worldToMarkdown(w, 'en');
    expect(md).toContain('## Geography');
    expect(md).toContain('(era: ');
    expect(md).toContain('Memory echo:');
    expect(md).not.toContain('记忆回声');
  });

  it('文件名由世界名派生且去掉非法字符', () => {
    expect(worldFileName(w)).toBe('潮候院.world.md');
    expect(worldFileName({ ...w, name: 'a/b:c' })).toBe('a-b-c.world.md');
  });

  it('同一输入两次导出逐字相同（纯投影）', () => {
    expect(worldToMarkdown(w)).toBe(worldToMarkdown(w));
  });
});
