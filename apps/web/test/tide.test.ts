import { describe, expect, it } from 'vitest';
import { buildTide, validatePressure, TIDE_PRESSURE_KINDS, EROSION_BODY_LIMIT } from '../src/lib/tide';

const node = (
  id: string,
  kind: string,
  title: string,
  body: string,
  updatedAt = '2026-01-01T00:00:00.000Z',
) => ({ id, kind, title, body, updatedAt });

describe('buildTide（世界潮汐 · 纯投影）', () => {
  it('空输入：声明 0、effects 为空、mostActiveId 为 null', () => {
    const out = buildTide([], []);
    expect(out.declared).toBe(0);
    expect(out.effects).toEqual([]);
    expect(out.active).toBe(0);
    expect(out.mostActiveId).toBeNull();
    expect(out.invalid).toEqual([]);
  });

  it('声明 kind 能拒绝（不认识）：进 invalid，effects 里没有它', () => {
    const out = buildTide(
      [node('n1', 'geography', '北境', '冰天雪地')],
      [{ id: 'p1', kind: 'sunburn', label: '赤阳', severity: 2 }],
    );
    expect(out.declared).toBe(1);
    expect(out.effects).toEqual([]);
    expect(out.invalid[0]!.reason).toContain('kind');
  });

  it('severity 不在 1/2/3：进 invalid；合法声明照常进 effects', () => {
    const out = buildTide(
      [node('n1', 'items', '铜板', '钱')],
      [
        { id: 'p1', kind: 'inflation', label: '通胀', severity: 4 },
        { id: 'p2', kind: 'inflation', label: '通胀', severity: 2 },
      ],
    );
    expect(out.effects.map((e) => e.pressureId)).toEqual(['p2']);
    expect(out.invalid.map((i) => i.pressureId)).toEqual(['p1']);
  });

  it('label 空 / id 空 / id 重复：进 invalid 且 reason 指明', () => {
    const out = buildTide(
      [node('n1', 'items', '铜板', '钱')],
      [
        { id: '', kind: 'inflation', label: 'x', severity: 1 },
        { id: 'p2', kind: 'inflation', label: '   ', severity: 1 },
        { id: 'p3', kind: 'inflation', label: '甲', severity: 1 },
        { id: 'p3', kind: 'inflation', label: '乙', severity: 2 },
      ],
    );
    const reasons = out.invalid.map((i) => i.reason);
    expect(out.invalid.map((i) => i.pressureId)).toEqual(['(未命名)', 'p2', 'p3']);
    expect(reasons[2]).toContain('重复');
    expect(out.effects.map((e) => e.pressureId)).toEqual(['p3']);
  });

  it('drought：title/body 命中水词典（大小写无关）即加压，其余不加压', () => {
    const out = buildTide(
      [
        node('a1', 'geography', '冰湖', '冰封的湖'),
        node('a2', 'story', '风声', 'No water today'), // water 命中
        node('a3', 'faction', '铁匠', '炉火熊熊'),      // 不命中
      ],
      [{ id: 'p1', kind: 'drought', label: '干亢', severity: 3 }],
    );
    expect(out.effects[0]!.affectedNodeIds).toEqual(['a1', 'a2']);
    expect(out.effects[0]!.byKind).toEqual({ geography: 1, story: 1 });
  });

  it('inflation：只按 kind 暴露 items/factions，不认词典（不写死名字）', () => {
    const out = buildTide(
      [
        node('i1', 'items', '盐', '很咸'),          // 命中：items
        node('f1', 'factions', '码头帮', '收银子'),  // 命中：factions
        node('g1', 'geography', '盐池', '很咸的水'), // 不命中：geography
        node('s1', 'story', '盐账', '铜板响'),       // 不命中：story
      ],
      [{ id: 'p1', kind: 'inflation', label: '通胀', severity: 2 }],
    );
    expect(out.effects[0]!.affectedNodeIds).toEqual(['i1', 'f1']);
    expect(out.effects[0]!.hits).toBe(2);
    expect(out.effects[0]!.byKind).toEqual({ items: 1, factions: 1 });
  });

  it('erosion：body trim 长度边界——= 极限不加压，差一个字加压', () => {
    const pad = (len: number) => 'x'.repeat(len);
    const out = buildTide(
      [
        node('e1', 'story', '短', pad(EROSION_BODY_LIMIT - 1)), // 命中
        node('e2', 'story', '边界', pad(EROSION_BODY_LIMIT)),   // 不命中
        node('e3', 'story', '长', pad(EROSION_BODY_LIMIT + 1)), // 不命中
      ],
      [{ id: 'p1', kind: 'erosion', label: '寂蚀', severity: 1 }],
    );
    expect(out.effects[0]!.affectedNodeIds).toEqual(['e1']);
  });

  it('murmur：story/history 且命中传闻词典；faction 不触发', () => {
    const out = buildTide(
      [
        node('m1', 'story', '风声', '港里传出一个消息'),
        node('m2', 'history', '谣言', '谣言像潮水，rumour spreads'),
        node('m3', 'story', '安静', '没有声音'),
        node('m4', 'factions', '传信人', '传言四起'),
      ],
      [{ id: 'p1', kind: 'murmur', label: '潮声', severity: 2 }],
    );
    expect(out.effects[0]!.affectedNodeIds).toEqual(['m1', 'm2']);
  });

  it('progeny：creatures/characters/factions 且命中繁衍词典；story 不触发', () => {
    const out = buildTide(
      [
        node('c1', 'creatures', '潮蜥', '蛋在潮间带孵化'),
        node('c2', 'characters', '洛蘅', '新生之子'),
        node('c3', 'story', '繁衍', '生养众多'),       // story 不触发
        node('c4', 'items', 'baby token', 'spawn'),      // items 不触发
        node('c5', 'characters', '磐', '老成持重的守望'), // 不命中繁衍词典
      ],
      [{ id: 'p1', kind: 'progeny', label: '繁衍息', severity: 2 }],
    );
    expect(out.effects[0]!.affectedNodeIds).toEqual(['c1', 'c2']);
  });

  it('mostActiveId：命中最多者；并列 → id 字典序最小；全零 → null', () => {
    const some = buildTide(
      [node('i1', 'items', '盐', 'x'), node('m1', 'story', '谣言', 'rumor mill')],
      [
        { id: 'pb', kind: 'inflation', label: '通胀b', severity: 1 },
        { id: 'pa', kind: 'inflation', label: '通胀a', severity: 2 },
        { id: 'pm', kind: 'murmur', label: '潮声', severity: 3 },
      ],
    );
    expect(some.active).toBe(3);
    // pa 与 pb 都命中 1 个，murmur 命中 1 个 — 全是 1 → id 字典序最小是 pa
    expect(some.mostActiveId).toBe('pa');

    const none = buildTide(
      [node('i1', 'geography', '荒原', '没有水')],
      [{ id: 'p1', kind: 'inflation', label: '通胀', severity: 2 }],
    );
    expect(none.mostActiveId).toBeNull();
    expect(none.active).toBe(0);
  });

  it('确定性：同输入两次输出深相等', () => {
    const inputs = [node('i1', 'items', '盐', '很咸'), node('m1', 'story', '谣言', 'rumor')];
    const pressures = [
      { id: 'p1', kind: 'inflation', label: '通胀', severity: 2 },
      { id: 'p2', kind: 'murmur', label: '潮声', severity: 1 },
    ];
    const a = buildTide(inputs, pressures);
    const b = buildTide(inputs, pressures);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('severity 不参与计数：同一批声明 severity 1 vs 3，hits 完全相同', () => {
    const inputs = [node('i1', 'items', '盐', '很咸')];
    const a = buildTide(inputs, [{ id: 'p1', kind: 'inflation', label: 'x', severity: 1 }]);
    const b = buildTide(inputs, [{ id: 'p2', kind: 'inflation', label: 'x', severity: 3 }]);
    expect(a.effects[0]!.hits).toBe(b.effects[0]!.hits);
  });

  it('全部扰模种类都在 §TidePressureKinds 里、无残缺', () => {
    expect(TIDE_PRESSURE_KINDS).toEqual(['drought', 'progeny', 'inflation', 'erosion', 'murmur']);
    for (const kind of TIDE_PRESSURE_KINDS) {
      expect(validatePressure({ id: 'p', kind, label: 'x', severity: 2 })).toBeNull();
    }
  });
});
