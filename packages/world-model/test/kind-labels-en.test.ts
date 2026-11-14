import { describe, expect, it } from 'vitest';
import { WORLD_KIND_LABELS, WORLD_KIND_LABELS_EN, WORLD_KINDS } from '@nexus/world-model';

/**
 * v747：WORLD_KIND_LABELS_EN 与 WORLD_KIND_LABELS 的一一对应契约。
 * 世界页（codex/ephemeris 等）与 CharacterPanel 都从这一处读；各复制一份必然漂移，漂移要在这里炸。
 */
describe('WORLD_KIND_LABELS_EN 与中文版一一对应', () => {
  it('键集相同且顺序相同（逐次一致）', () => {
    expect(Object.keys(WORLD_KIND_LABELS_EN)).toEqual(Object.keys(WORLD_KIND_LABELS));
  });

  it('全部九个英文名非空且互不相同', () => {
    const en = WORLD_KIND_LABELS_EN;
    for (const kind of WORLD_KINDS) {
      expect(en[kind], `${kind} 英文名为空`).toBeTruthy();
    }
    expect(new Set(WORLD_KINDS.map((k) => en[k])).size).toBe(WORLD_KINDS.length);
  });
});
