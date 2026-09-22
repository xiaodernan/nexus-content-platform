import { describe, expect, it } from 'vitest';
import {
  WorldDocumentSchema,
  WorldKindSchema,
  WorldSaveRequestSchema,
} from '../src/index';
import { WORLD_KINDS, addWorldNode, createWorld, removeWorldNode } from '@nexus/world-model';

/**
 * 世界文档的 zod 契约与 @nexus/world-model 不许漂移。
 * 九类清单在两处各写一份（z.enum 要字面量），所以这里逐字对齐；
 * 漂移的后果本来是"模型认得但库里存不下"的静默不一致，这里把它变成一次失败测试。
 */

describe('世界文档契约（§44）', () => {
  it('九类的清单与模型完全一致，顺序也算', () => {
    expect(WorldKindSchema.options).toEqual([...WORLD_KINDS]);
  });

  it("模型造的文档过得了契约；契约认得的 kind 模型也认", () => {
    const world = createWorld('黑暗奇幻', 'proj-1');
    const parsed = WorldDocumentSchema.safeParse(world);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.nodes.length : 0).toBe(WORLD_KINDS.length);
    // 模板不是内容：正文一律留空
    expect(world.nodes.every((node) => node.body === '')).toBe(true);
  });

  it('改过的文档仍然自洽：加一条、删一条，契约与模型给出同样的结论', () => {
    let world = createWorld('编辑测试');
    world = addWorldNode(world, { kind: 'characters', title: '守夜人', body: '她记得每一次日落。' });
    const first = world.nodes[0]!;
    world = removeWorldNode(world, first.id);
    expect(WorldDocumentSchema.safeParse(world).success).toBe(true);
    expect(world.nodes.some((n) => n.id === first.id)).toBe(false);
    expect(world.nodes).toHaveLength(WORLD_KINDS.length);
  });

  it('脏数据进不了库：未知类型、空标题、超长正文都被拒', () => {
    const world = createWorld('脏数据');
    expect(WorldSaveRequestSchema.safeParse({
      document: { ...world, nodes: [{ ...world.nodes[0]!, kind: 'vibes' }] },
    }).success).toBe(false);
    expect(WorldSaveRequestSchema.safeParse({
      document: { ...world, nodes: [{ ...world.nodes[0]!, title: '  ' }] },
    }).success).toBe(false);
    expect(WorldSaveRequestSchema.safeParse({
      document: { ...world, nodes: [{ ...world.nodes[0]!, body: 'x'.repeat(20_001) }] },
    }).success).toBe(false);
    expect(WorldSaveRequestSchema.safeParse({ document: { ...world, name: '' } }).success).toBe(false);
  });
});
