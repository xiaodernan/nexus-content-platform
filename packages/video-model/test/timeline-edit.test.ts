import { describe, expect, it } from 'vitest';
import {
  applyStoryboardPatch,
  clampShotDuration,
  dropIndexFor,
  MAX_SHOT_MS,
  MIN_SHOT_MS,
  SHOT_MS_STEP,
  type Storyboard,
  type StoryboardShot,
} from '../src/index';

/**
 * §41 的时间线编辑：拖右边缘 trim/extend、拖整块 reorder。
 *
 * 界面上那两种拖拽各有一处会用假绿骗过测试，所以决定不放在组件里，放在这两个纯函数上：
 * ① 长度不吸附、不夹下限——拖一下就能得到 2817 毫秒，或者把一镜拖成 0 毫秒
 *    （时间线上留下一块看不见的方块，而它又确实"在"）；
 * ② reorder 的下标口径与 `moveShot` 的 `to` 差一位——这是最容易写错的一处：
 *    `dropIndexFor` 返回的必须是**最终下标**，不是"插到第几格之前"。
 *    所以最后两条不测函数本身，测它接进 `moveShot` 之后镜头到底排成什么样。
 */

function shot(id: string, durationMs: number): StoryboardShot {
  return { id, prompt: `第 ${id} 镜要拍什么`, durationMs, camera: 'medium', transition: 'cut' };
}

/** 1000 / 2000 / 3000 毫秒，总长 6000：中点分别在 500 / 2000 / 3500 */
const THREE: StoryboardShot[] = [shot('a', 1000), shot('b', 2000), shot('c', 3000)];

function reordered(from: number, to: number): string[] {
  const sb: Storyboard = { id: 'sb', title: 't', source: { arrow: 'text-to-video', prompt: 'x' }, shots: THREE, notes: [] };
  return applyStoryboardPatch(sb, [{ op: 'moveShot', from, to }]).shots.map((s) => s.id);
}

describe('clampShotDuration —— 拖出来的长度吸附到刻度，并夹进上下限', () => {
  it('吸附到 100ms 刻度：像素误差不该出现在模型里', () => {
    expect(clampShotDuration(2817)).toBe(2800);
    expect(clampShotDuration(2850)).toBe(2900);
    expect(clampShotDuration(49)).toBe(MIN_SHOT_MS);
  });

  it('下限是一步：拖到 0 或负数都落回 100 毫秒，而不是消失', () => {
    expect(clampShotDuration(0)).toBe(MIN_SHOT_MS);
    expect(clampShotDuration(-5000)).toBe(MIN_SHOT_MS);
    expect(MIN_SHOT_MS).toBe(SHOT_MS_STEP);
  });

  it('上限与列表里那个数字输入框同一个数（600000）', () => {
    expect(clampShotDuration(999_999)).toBe(MAX_SHOT_MS);
    expect(MAX_SHOT_MS).toBe(600_000);
  });

  it('坏数（NaN / Infinity）按一步算：一次坏拖拽不该把这一镜变成 NaN', () => {
    expect(clampShotDuration(Number.NaN)).toBe(MIN_SHOT_MS);
    expect(clampShotDuration(Number.POSITIVE_INFINITY)).toBe(MIN_SHOT_MS);
  });
});

describe('dropIndexFor —— 拖到哪个位置落下（返回的是最终下标）', () => {
  it('拖回原位：原样拿回它当前的下标，界面据此不记一次空事务', () => {
    expect(dropIndexFor(THREE, 'a', 0)).toBe(0);
    expect(dropIndexFor(THREE, 'b', 0)).toBe(1);
    expect(dropIndexFor(THREE, 'c', 0)).toBe(2);
  });

  it('中心跨过下一格的中心就往后退一位', () => {
    // a 的中心 500 往右 1000 → 1500，越过 b 的中心 1000
    expect(dropIndexFor(THREE, 'a', 1000)).toBe(1);
  });

  it('中心跨过上一格的中心就往前挪一位', () => {
    // c 的中心 4500 往左 2600 → 1900，越过 b 的中心 2000 但没到 a 的中心 500
    expect(dropIndexFor(THREE, 'c', -2600)).toBe(1);
  });

  it('拖出两端：夹在第一位与最后一位，不会给出越界的下标', () => {
    expect(dropIndexFor(THREE, 'b', -99_999)).toBe(0);
    expect(dropIndexFor(THREE, 'b', 99_999)).toBe(2);
  });

  it('不在这份分镜里的 id 要抛错，不静默返回一个位置', () => {
    expect(() => dropIndexFor(THREE, 'nope', 0)).toThrow(/不在这份分镜里/);
  });

  it('接进 moveShot：下标口径一致，第一位拖到最后一位真的落在那儿', () => {
    const to = dropIndexFor(THREE, 'a', 3100);
    expect(to).toBe(2);
    expect(reordered(0, to)).toEqual(['b', 'c', 'a']);
  });

  it('接进 moveShot：最后一位拖到第一位同理（差一位的写法会在这里红）', () => {
    const to = dropIndexFor(THREE, 'c', -4500);
    expect(to).toBe(0);
    expect(reordered(2, to)).toEqual(['c', 'a', 'b']);
  });
});
