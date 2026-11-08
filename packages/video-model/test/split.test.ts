import { describe, expect, it } from 'vitest';
import {
  MIN_SHOT_MS,
  SHOT_MS_STEP,
  splitShotAt,
  storyboardTransaction,
  timelineOf,
  type Storyboard,
  type StoryboardOp,
  type StoryboardShot,
} from '../src/index';

/**
 * §41 片段级裁切：`splitShotAt` 与它接进补丁事务后的账。
 *
 * 这一格最容易骗过测试的两处：
 * ① 两半之和与原来那一镜对不上（两边各自吸附一次，手填的 1ms 粒度就会漏出半格）——
 *    所以"总时长守恒"要按**具体数字**断言，而不是 `head + tail === duration` 的恒等式；
 * ② 撤销只撤了一半：切分是两个 op（updateShot + addShot），逆序撤销如果栈记错了，
 *    会留下"前半恢复了但后半还在"或反过来的半截清单。所以整段走
 *    `storyboardTransaction` 的正做→撤销→重做，逐字段比回来。
 */

function shot(id: string, durationMs: number, extra: Partial<StoryboardShot> = {}): StoryboardShot {
  return {
    id,
    prompt: `第 ${id} 镜要拍什么`,
    durationMs,
    camera: 'wide',
    transition: 'fade',
    characterId: 'char-1',
    referenceAssetId: 'asset-1',
    ...extra,
  };
}

function deck(shots: StoryboardShot[]): Storyboard {
  return { id: 'sb', title: 't', source: { arrow: 'text-to-video', prompt: 'x' }, shots, notes: [] };
}

/** 切分那一次点击的完整事务：前半改短 + 后半插进下一位（界面/store 就是这么发的） */
function splitOps(original: StoryboardShot, index: number, headMs: number, tail: StoryboardShot): StoryboardOp[] {
  return [
    { op: 'updateShot', id: original.id, before: { durationMs: original.durationMs }, after: { durationMs: headMs } },
    { op: 'addShot', index: index + 1, shot: tail },
  ];
}

describe('splitShotAt —— 切点吸附、总长守恒、两半都有下限', () => {
  it('3000 毫秒的中点切：前半留原 id，后半拿新 id、transition 变 cut、其余字段照抄', () => {
    const original = shot('a', 3000);
    const out = splitShotAt(original, 1500, 'a-2');
    if (!out.ok) throw new Error(`切分被拒：${out.reason}`);
    expect(out.headMs).toBe(1500);
    expect(out.tail).toEqual({
      ...original,
      id: 'a-2',
      durationMs: 1500,
      transition: 'cut', // 中间切出来的是硬切；fade 描述的是与前一镜的衔接，跟前半走
    });
    // 两半之和就是原来那一镜——不是恒等式，是这两个具体数
    expect(out.headMs + out.tail.durationMs).toBe(3000);
  });

  it('切点吸到步长，后半拿余数：手填的 2501 毫秒也不会漏出半格', () => {
    const out = splitShotAt(shot('a', 2501), 1240, 'a-2');
    if (!out.ok) throw new Error(`切分被拒：${out.reason}`);
    expect(out.headMs).toBe(1200); // 1240 → 最近的 100 的倍数
    expect(out.tail.durationMs).toBe(1301); // 余数，不再吸一次
    expect(out.headMs + out.tail.durationMs).toBe(2501);
  });

  it('两半各自低于下限都拒，且拒因说往哪边挪', () => {
    const near = splitShotAt(shot('a', 3000), 40, 'a-2');
    expect(near.ok).toBe(false);
    if (!near.ok) expect(near.reason).toMatch(/前半.*往右挪/);
    const far = splitShotAt(shot('a', 3000), 2960, 'a-2');
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.reason).toMatch(/后半只剩 0 毫秒.*往左挪/);
    // 恰好一步是合法的：边界值不许顺手多拒一档
    expect(MIN_SHOT_MS).toBe(SHOT_MS_STEP);
    const edge = splitShotAt(shot('a', 300), 100, 'a-2');
    expect(edge.ok).toBe(true);
  });

  it('坏输入直接拒：id 撞车、空 id、非有限切点', () => {
    expect(splitShotAt(shot('a', 3000), 1500, 'a').ok).toBe(false);
    expect(splitShotAt(shot('a', 3000), 1500, '').ok).toBe(false);
    const bad = splitShotAt(shot('a', 3000), Number.NaN, 'a-2');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/有限的毫秒/);
  });
});

describe('切分接进补丁事务：正做、撤销、重做各是完整的一步', () => {
  const original = shot('a', 3000);
  const before = deck([shot('z', 1000), original]);

  it('正做：a 变短，a-2 插在它后面，总时长一格不多一格不少', () => {
    const split = splitShotAt(original, 1500, 'a-2');
    if (!split.ok) throw new Error(`切分被拒：${split.reason}`);
    const { applied, undo, redo } = storyboardTransaction(before, splitOps(original, 1, split.headMs, split.tail));
    expect(applied.shots.map((s) => [s.id, s.durationMs])).toEqual([
      ['z', 1000],
      ['a', 1500],
      ['a-2', 1500],
    ]);
    // 时间线投影吃的是同一份账：两格排开，总长仍是 4000
    const timeline = timelineOf(applied);
    expect(timeline.totalMs).toBe(4000);
    expect(timeline.tracks[0]!.clips.map((c) => [c.shotId, c.startMs, c.endMs])).toEqual([
      ['z', 0, 1000],
      ['a', 1000, 2500],
      ['a-2', 2500, 4000],
    ]);

    const undone = storyboardTransaction(applied, undo).applied;
    expect(undone).toEqual(before); // 逐字段比回来：撤销不许留下"后半还在"或"前半没恢复"的半截
    const redone = storyboardTransaction(undone, redo).applied;
    expect(redone).toEqual(applied);
  });
});
