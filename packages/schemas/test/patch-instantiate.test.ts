import { describe, expect, it } from 'vitest';
import { ProjectDesignPatchRequestSchema } from '../src/index';

/**
 * §13 实例化 op 的报文形状。
 *
 * 自动保存发的是 ops（不是整份文档），所以 `instantiate` 过不了这道 schema，
 * 面板上放出去的实例就只活在本地内存里：刷新一次就没了，而界面当时说的是"已保存"。
 *
 * `instanceId` 必填不是洁癖：撤销那条 op 是在 apply **之前**算的，那时新节点还不存在，
 * op 里没带 id 就写不出"把这一颗连同子树收走"的那一条。
 */
const envelope = (ops: unknown[]) => ({ patches: [{ pageId: 'p1', ops }] });

describe('§13 补丁 op：instantiate', () => {
  it('点名了实例 id 的 instantiate 是合法 op', () => {
    const parsed = ProjectDesignPatchRequestSchema.safeParse(
      envelope([{ op: 'instantiate', componentId: 'cmp-1', instanceId: 'ins_1' }]),
    );
    expect(parsed.success).toBe(true);
  });

  it('parentId / index 可省略，给了就必须是非负整数', () => {
    expect(
      ProjectDesignPatchRequestSchema.safeParse(
        envelope([
          { op: 'instantiate', componentId: 'cmp-1', instanceId: 'ins_1', parentId: 'n_root', index: 0 },
        ]),
      ).success,
    ).toBe(true);
    const negative = ProjectDesignPatchRequestSchema.safeParse(
      envelope([{ op: 'instantiate', componentId: 'cmp-1', instanceId: 'ins_1', index: -1 }]),
    );
    expect(negative.success).toBe(false);
  });

  it('缺 instanceId 的 instantiate 被拒：撤不掉的操作不许进报文', () => {
    const parsed = ProjectDesignPatchRequestSchema.safeParse(
      envelope([{ op: 'instantiate', componentId: 'cmp-1' }]),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((i) => i.path.join('.'))).toContain(
        'patches.0.ops.0.instanceId',
      );
    }
  });
});
