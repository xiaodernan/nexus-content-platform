import { describe, expect, it } from 'vitest';
import { ProjectDesignPatchRequestSchema } from '../src/index';

/**
 * §124 补丁词汇表的删除语义。
 *
 * `set` 的 value 在内存里可以是 undefined（表示"删掉这个字段"），但 undefined 过不了 JSON：
 * 序列化时整个 value 键消失，服务端收到的是一条缺 `value` 的 set。之前它会撞上 schema 的
 * "expected nonoptional" 400，客户端只能整份 PUT 兜底——编辑没丢，但每撤销一次就往控制台
 * 扔一条红。所以删除有专属 op（unset），而"忘了写 value 的 set"仍然必须是错的：
 * 这两件事一旦混成一件，一个笔误就会静默删字段。
 */
describe('§124 补丁 op：删除字段', () => {
  it('unset 是合法 op', () => {
    const parsed = ProjectDesignPatchRequestSchema.safeParse({
      patches: [
        { pageId: 'p1', ops: [{ op: 'unset', nodeId: 'n1', path: 'states.hover' }] },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('缺 value 的 set 仍然被拒：删除不能伪装成"忘了填值"', () => {
    const parsed = ProjectDesignPatchRequestSchema.safeParse({
      patches: [
        { pageId: 'p1', ops: [{ op: 'set', nodeId: 'n1', path: 'states.hover' }] },
      ],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((i) => i.path.join('.'))).toContain('patches.0.ops.0.value');
    }
  });
});
