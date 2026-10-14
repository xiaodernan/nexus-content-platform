import { describe, expect, it } from 'vitest';
import {
  WORLD_PLATEAU_RADIUS_MAX,
  WORLD_PLATEAU_RADIUS_MIN,
  WORLD_TERRAIN_HEIGHT_MAX,
  createWorld,
  setWorldTerrain,
} from '@nexus/world-model';
import { clampHeight, clampRadius, newPlateauId, plateauFromDrag } from '../src/studio/terrainDraw';

/**
 * §140 图上画地形的纯算术（WorldGraphView「画地形」模式的落库来源）。
 * 每条断言对应一句界面承诺：预览圆的半径就是存下去的半径、拖出边界的圆被收到边界内、
 * 数字框里敲出的花样值在进 setWorldTerrain 之前就被兜住。
 */

describe('clampRadius：预览圆与落库圆的同一个半径', () => {
  it('拖出 400 的长距离被收到半径上限', () => {
    expect(clampRadius(500.4)).toBe(WORLD_PLATEAU_RADIUS_MAX);
  });

  it('拖得太近收到半径下限（0 半径的台子站不上去）', () => {
    expect(clampRadius(0.4)).toBe(WORLD_PLATEAU_RADIUS_MIN);
    expect(clampRadius(0)).toBe(WORLD_PLATEAU_RADIUS_MIN);
  });

  it('量到的距离取整成世界单位的整数格', () => {
    expect(clampRadius(12.4)).toBe(12);
    expect(clampRadius(12.6)).toBe(13);
  });

  it('非有限值（NaN / Infinity）不把垃圾递给模型', () => {
    expect(clampRadius(Number.NaN)).toBe(WORLD_PLATEAU_RADIUS_MIN);
    expect(clampRadius(Number.POSITIVE_INFINITY)).toBe(WORLD_PLATEAU_RADIUS_MAX);
  });
});

describe('clampHeight：台面高度 0–6', () => {
  it('超界与负数收到边界内', () => {
    expect(clampHeight(9)).toBe(WORLD_TERRAIN_HEIGHT_MAX);
    expect(clampHeight(-1)).toBe(0);
  });

  it('数字框里的空值/花样值兜成 0 而不是 NaN', () => {
    expect(clampHeight('')).toBe(0);
    expect(clampHeight('abc')).toBe(0);
    expect(clampHeight(Number.NaN)).toBe(0);
  });

  it('小数取整（step 敲出来的 2.5 不该进文档）', () => {
    expect(clampHeight(2.4)).toBe(2);
    expect(clampHeight(2.6)).toBe(3);
  });
});

describe('plateauFromDrag：按下那点是心，松手那点定半径', () => {
  it('水平拖 10 格：心取整、半径 10、高度原样（合法值）', () => {
    const plateau = plateauFromDrag({ x: 10.4, y: 20.6 }, { x: 20.4, y: 20.6 }, 3);
    expect(plateau.x).toBe(10);
    expect(plateau.y).toBe(21);
    expect(plateau.radius).toBe(10);
    expect(plateau.height).toBe(3);
    expect(plateau.id.startsWith('wp_')).toBe(true);
  });

  it('斜着拖按直线距离算半径，且与预览同一条夹取', () => {
    const edge = { x: 30, y: 60 };
    const center = { x: 0, y: 20 };
    const plateau = plateauFromDrag(center, edge, 2);
    expect(plateau.radius).toBe(clampRadius(Math.hypot(30, 40))); // 50
    expect(plateau.radius).toBe(50);
  });

  it('拖出半径上限的圆存下去就是上限（不写一个不合法的 500）', () => {
    const plateau = plateauFromDrag({ x: 0, y: 0 }, { x: 500, y: 0 }, 2);
    expect(plateau.radius).toBe(WORLD_PLATEAU_RADIUS_MAX);
  });

  it('id 每次都新：同一毫秒连画两个也不撞', () => {
    const a = plateauFromDrag({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
    const b = plateauFromDrag({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
    expect(a.id).not.toBe(b.id);
    expect(newPlateauId()).not.toBe(newPlateauId());
  });
});

describe('画出来的圆台能过模型的写入口径（setWorldTerrain 照收）', () => {
  it('图上画的那一笔原样落地，reason 为空', () => {
    const world = createWorld('画地形测试');
    const dragged = plateauFromDrag({ x: 40, y: 80 }, { x: 70, y: 80 }, 4);
    const result = setWorldTerrain(world, { kind: 'plateaus', plateaus: [dragged] });
    expect(result.reason).toBeNull();
    expect(result.document.terrain?.plateaus).toEqual([dragged]);
  });

  it('高度越界被夹过之后，模型没有理由拒收', () => {
    const world = createWorld('画地形测试');
    const dragged = plateauFromDrag({ x: 0, y: 0 }, { x: 10, y: 0 }, 99);
    const result = setWorldTerrain(world, { kind: 'plateaus', plateaus: [dragged] });
    expect(result.reason).toBeNull();
    expect(result.document.terrain?.plateaus[0]?.height).toBe(WORLD_TERRAIN_HEIGHT_MAX);
  });
});
