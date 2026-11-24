import { describe, expect, it } from 'vitest';
import { WORLD_KINDS, createWorld, addWorldNode, updateWorldNode, type WorldDocument } from '@nexus/world-model';
import { mergeImportedWorld, parseWorldMarkdown, worldFileName, worldToMarkdown } from '../src/lib/worldExport';

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

describe('worldExport · Markdown 回读（严格解析）', () => {
  const w = worldWith('潮候院');
  it('导出再回读：名称/概述/纪元/序号/记忆回声都保住', () => {
    const parsed = parseWorldMarkdown(worldToMarkdown(w, 'zh'))!;
    expect(parsed.name).toBe('潮候院');
    expect(parsed.summary).toBe('盐道尽头的纪事。');
    const geo = parsed.entries.find((e) => e.title === '盐道')!;
    expect(geo.kind).toBe('geography');
    expect(geo.era).toBe('灰灯纪');
    expect(geo.order).toBe(2);
    expect(geo.memory).toBe('咸味贴着鞋底。');
  });
  it('英文导出的回读也认得纪元与回声标签', () => {
    const parsed = parseWorldMarkdown(worldToMarkdown(w, 'en'))!;
    const geo = parsed.entries.find((e) => e.title === '盐道')!;
    expect(geo.kind).toBe('geography');
    expect(geo.era).toBe('灰灯纪');
    expect(geo.memory).toBe('咸味贴着鞋底。');
  });
  it('没有 # 标题或没有任何合法条目时返回 null，不编世界', () => {
    expect(parseWorldMarkdown('随手写的文字')).toBeNull();
    expect(parseWorldMarkdown('# 空世界\n\n## 地理\n\n_（空）_')).toBeNull();
  });
});

describe('worldExport · 导入合并（只追加不覆盖）', () => {
  const w = worldWith('潮候院');
  it('导出→回读→并入空世界：正文/纪元/序号/回声都还原', () => {
    const base = createWorld('空目标', 'p1');
    const imported = parseWorldMarkdown(worldToMarkdown(w, 'zh'))!;
    const { document, added, skipped } = mergeImportedWorld(base, imported);
    expect(skipped).toBe(0);
    expect(added).toBeGreaterThan(0);
    const geo = document.nodes.find((n) => n.title === '盐道')!;
    expect(geo.kind).toBe('geography');
    expect(geo.body).toBe('路面泛白，石缝积盐。');
    expect(geo.lore?.era).toBe('灰灯纪');
    expect(geo.lore?.order).toBe(2);
    expect(geo.lore?.memory).toBe('咸味贴着鞋底。');
  });

  it('既有条目原样保留（不覆盖、不去重）', () => {
    const base = addWorldNode(createWorld('目标', 'p1'), { kind: 'lore', title: '原有', body: '别动我' });
    const imported = parseWorldMarkdown(worldToMarkdown(w, 'zh'))!;
    const { document } = mergeImportedWorld(base, imported);
    expect(document.nodes.find((n) => n.title === '原有')?.body).toBe('别动我');
    expect(document.nodes.length).toBe(base.nodes.length + imported.entries.length);
  });

  it('未知类别被跳过并计数，不静默写入', () => {
    const imported = { name: 'x', summary: '', entries: [{ kind: 'unknown-kind', title: '怪类', body: '正文' }] };
    const { document, added, skipped } = mergeImportedWorld(createWorld('t', 'p1'), imported);
    expect(added).toBe(0);
    expect(skipped).toBe(1);
    expect(document.nodes).toHaveLength(9); // createWorld 自带的 9 个骨架条目没被动过
  });
});
