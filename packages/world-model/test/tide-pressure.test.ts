import { describe, expect, it } from 'vitest';
import {
  createWorld,
  setWorldTidePressures,
  validateWorld,
  WORLD_TIDE_PRESSURE_KINDS,
  WORLD_TIDE_PRESSURE_LIMIT,
  type WorldDocument,
  type WorldTidePressure,
} from '../src/index';

const pressure = (overrides: Partial<WorldTidePressure>): WorldTidePressure => ({
  id: 'tp-1',
  kind: 'drought',
  label: '干亢岁',
  severity: 2,
  ...overrides,
});

const withPressures = (pressures: WorldTidePressure[] | undefined): WorldDocument => ({
  ...createWorld('潮汐测试', 'proj-tide'),
  ...(pressures === undefined ? {} : { pressures }),
});

describe('§潮汐扰模声明（validateWorld · ADR-0267）', () => {
  it('没有 pressures 字段：照样自洽（老世界为零）', () => {
    expect(validateWorld(withPressures(undefined))).toEqual([]);
  });

  it('合法 pressures：零问题', () => {
    const world = withPressures([
      pressure({ id: 'tp-1', kind: 'drought', label: '干亢岁', severity: 3 }),
      pressure({ id: 'tp-2', kind: 'murmur', label: '风声年', severity: 1 }),
    ]);
    expect(validateWorld(world)).toEqual([]);
  });

  it('kind 清单五个且顺序锁死（与契约同名同序）', () => {
    expect(WORLD_TIDE_PRESSURE_KINDS).toEqual(['drought', 'progeny', 'inflation', 'erosion', 'murmur']);
  });

  it('kind 不认识：bad-pressure，且不静默', () => {
    const world = withPressures([pressure({ kind: 'sunburn' as WorldTidePressure['kind'] })]);
    const issues = validateWorld(world);
    expect(issues.map((i) => i.code)).toContain('bad-pressure');
    expect(issues.find((i) => i.code === 'bad-pressure')!.message).toContain('sunburn');
  });

  it('id 空白 / id 重复 / id 超长：bad-pressure', () => {
    const blank = validateWorld(withPressures([pressure({ id: '   ' })]));
    expect(blank.map((i) => i.code)).toContain('bad-pressure');

    const dup = validateWorld(withPressures([pressure({ id: 'tp-1' }), pressure({ id: 'tp-1', label: '另一件事' })]));
    expect(dup.filter((i) => i.code === 'bad-pressure').length).toBeGreaterThanOrEqual(1);
    expect(dup.some((i) => i.message.includes('重复'))).toBe(true);

    const long = validateWorld(withPressures([pressure({ id: 'x'.repeat(81) })]));
    expect(long.map((i) => i.code)).toContain('bad-pressure');
  });

  it('label 空白或超过 40 字：bad-pressure', () => {
    expect(validateWorld(withPressures([pressure({ label: '   ' })])).map((i) => i.code)).toContain('bad-pressure');
    expect(validateWorld(withPressures([pressure({ label: 'x'.repeat(41) })])).map((i) => i.code)).toContain('bad-pressure');
    expect(validateWorld(withPressures([pressure({ label: 'x'.repeat(40) })]))).toEqual([]);
  });

  it('severity 只允许 1/2/3：bad-pressure', () => {
    for (const bad of [0, 4, 1.5, Number.NaN, '2' as unknown as 2]) {
      const world = withPressures([pressure({ severity: bad as unknown as 2 })]);
      expect(validateWorld(world).map((i) => i.code)).toContain('bad-pressure');
    }
    for (const good of [1, 2, 3] as const) {
      expect(validateWorld(withPressures([pressure({ severity: good })]))).toEqual([]);
    }
  });

  it('pressures 不是数组（被手写进坏文档里的对象）：bad-pressure 一条', () => {
    const world = withPressures(undefined) as unknown as { pressures: unknown } & WorldDocument;
    world.pressures = { id: 'tp-1' } as unknown as WorldTidePressure[];
    expect(validateWorld(world as WorldDocument).map((i) => i.code)).toContain('bad-pressure');
  });
});
describe('setWorldTidePressures（作者声明扰模 · setWorldTerrain 同一流派）', () => {
  it('null：收掉全部声明，回到字节形状上的“没有 pressures”', () => {
    const world = withPressures([pressure({})]);
    const cleared = setWorldTidePressures(world, null);
    expect(cleared.reason).toBeNull();
    expect('pressures' in cleared.document).toBe(false);
    expect(validateWorld(cleared.document)).toEqual([]);
  });

  it('合法声明过门后自洽：validateWorld 零问题、字段保留', () => {
    const world = withPressures(undefined);
    const declared = setWorldTidePressures(world, [
      pressure({ id: 'tp-1', kind: 'drought', label: '干亢岁', severity: 3 }),
      pressure({ id: 'tp-2', kind: 'progeny', label: '孕育季', severity: 2 }),
    ]);
    expect(declared.reason).toBeNull();
    expect(declared.document.pressures).toHaveLength(2);
    expect(declared.document.pressures![0]!.label).toBe('干亢岁');
    expect(validateWorld(declared.document)).toEqual([]);
  });

  it('条数超限：整批拒绝（哪怕每一条单独都合法）', () => {
    const world = withPressures(undefined);
    const over = Array.from({ length: WORLD_TIDE_PRESSURE_LIMIT + 1 }, (_, i) => pressure({ id: `tp-${i}`, label: `第${i}条` }));
    const rejected = setWorldTidePressures(world, over);
    expect(rejected.reason).toContain(String(WORLD_TIDE_PRESSURE_LIMIT));
    expect(rejected.document).toBe(world); // 原对象一个字没动
  });

  it('kind 不认识 / severity 越界 / label 空白 / id 重复：整批拒绝，reason 逐字给出', () => {
    const world = withPressures(undefined);
    expect(setWorldTidePressures(world, [pressure({ kind: 'sunburn' as WorldTidePressure['kind'] })]).reason).toContain('kind');
    expect(setWorldTidePressures(world, [pressure({ severity: 4 as unknown as 2 })]).reason).toContain('severity');
    expect(setWorldTidePressures(world, [pressure({ label: '   ' })]).reason).toContain('名字');
    const dup = setWorldTidePressures(world, [pressure({ id: 'tp-1' }), pressure({ id: 'tp-1', label: '另一件事' })]);
    expect(dup.reason).toContain('重复');
  });

  it('拒绝时 document 引用未变（调用方不会误以为世界被改了）', () => {
    const world = withPressures([pressure({})]);
    const rejected = setWorldTidePressures(world, [pressure({ kind: 'sunburn' as WorldTidePressure['kind'] })]);
    expect(rejected.document).toBe(world);
    expect(rejected.document.pressures).toHaveLength(1);
  });
});
