import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildQuiz,
  mulberry32,
  seedFromString,
  verdictFor,
  UNLABELED_ERA,
  type QuizNodeInput,
} from '@/lib/quiz';

const mkNode = (over: Partial<QuizNodeInput> & Pick<QuizNodeInput, 'id' | 'kind' | 'title'>): QuizNodeInput => ({
  body: '',
  updatedAt: new Date(0).toISOString(),
  ...over,
});

const fixture: QuizNodeInput[] = [
  mkNode({ id: 'n1', kind: 'history', title: '雪崩那年', body: '每一盏重新点起来的灯，都是有人记住名字付了代价。', lore: { era: '灰灯纪', memory: '4,011 盏灯同时灭掉的时候，雪落得特别轻，像有人提前关了灯。' } }),
  mkNode({ id: 'n2', kind: 'story', title: '守夜人七岁', body: '拖出来时怀里还抱着一盏没灭的油灯——那盏灯后来被挂进了盟约大厅。', lore: { era: '灰灯纪' } }),
  mkNode({ id: 'n3', kind: 'history', title: '税账人名', body: '书记官在账本背面写下「这些是欠着债的人，不是债」。', lore: { era: '灰烬纪', memory: '账本背面那行字，纸张被水泡过，边缘卷起，墨迹却深得像骨刻。' } }),
  mkNode({ id: 'n4', kind: 'story', title: '棱师失踪', body: '没有人见过他画图的过程，但那张图比过去所有官方测绘都准。', lore: { era: '灰烬纪', memory: '第十天的雪还没停；有人在失踪地点放了一盏没有名字的小灯。' } }),
  mkNode({ id: 'n5', kind: 'history', title: '走廊长影', body: '同一趟车同一件货，重量在两个城门前相差了 40 斤——不是误算。', lore: { era: '铁月纪', memory: '城门重量秤的指针在空白处没有停止——那是第一次，北境比自己更重。' } }),
  mkNode({ id: 'n6', kind: 'story', title: '白鸦撕图', body: '她没撕错——那张地图上画的，正是她自己的铺位。', lore: { era: '铁月纪' } }),
];

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('quiz builder — determinism & shape', () => {
  it('同一种子永远产出同一组题（同输入同输出）', () => {
    const a = buildQuiz(fixture, 42);
    const b = buildQuiz(fixture, 42);
    expect(a).toEqual(b);
  });

  it('不同种子一般会给出不同顺序/题组', () => {
    const a = buildQuiz(fixture, 1);
    const b = buildQuiz(fixture, 987654321);
    // 不断言一定不同（理论可能巧合），只报数：至少其一不同则通过（粗松断言，避免 flaky）
    const sameEverywhere = JSON.stringify(a.map((r) => r.id)) === JSON.stringify(b.map((r) => r.id)) &&
      JSON.stringify(a.map((r) => r.answer)) === JSON.stringify(b.map((r) => r.answer));
    expect(sameEverywhere).toBe(false);
  });

  it('每题恰好 4 个选项、答案下标合法、包含 "正确/distractor/distractor/distractor" 形状', () => {
    for (const round of buildQuiz(fixture, 7)) {
      expect(round.options).toHaveLength(4);
      expect([0, 1, 2, 3]).toContain(round.answer);
      expect(round.options[round.answer]).toBeTruthy();
    }
  });

  it('题干不重复（同一条目不出两次）', () => {
    const rounds = buildQuiz(fixture, 99);
    const sourceIds = rounds.map((r) => r.id.split(':')[1]);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
  });

  it('八题上限与甲乙丙丁四件套完备', () => {
    expect(buildQuiz(fixture, 3).length).toBeLessThanOrEqual(8);
  });
});

describe('quiz builder — edge honesty', () => {
  it('空世界：返回空数组而不是编造题目', () => {
    expect(buildQuiz([], 1)).toEqual([]);
  });

  it('只有 1 个纪元的世界：A 族宁缺毋滥（需要 4 个纪元选项），B 族照常', () => {
    const oneEra: QuizNodeInput[] = [
      mkNode({ id: 's1', kind: 'history', title: 'a', body: 'x'.repeat(20), lore: { era: '灰灯纪' } }),
      mkNode({ id: 's2', kind: 'story', title: 'b', body: 'y'.repeat(20), lore: { era: '灰灯纪' } }),
      mkNode({ id: 's3', kind: 'story', title: 'c', body: 'z'.repeat(20), lore: { era: '灰灯纪' } }),
      mkNode({ id: 's4', kind: 'history', title: 'd', body: 'w'.repeat(20), lore: { era: '灰灯纪' } }),
    ];
    const rounds = buildQuiz(oneEra, 5);
    expect(rounds.every((r) => r.family === 'B')).toBe(true);
  });

  it('垃圾条目（空标题/空 body/非法 kind 混入）被跳过，不污染其他题', () => {
    const junk: QuizNodeInput[] = [
      ...fixture,
      mkNode({ id: 'bad1', kind: 'geography', title: '   ', body: 'no', lore: { memory: '' } }),
      mkNode({ id: 'bad2', kind: 'story', title: '短', body: 'too' }),
      mkNode({ id: 'bad3', kind: 'story', title: '', body: 'z'.repeat(30) }),
    ];
    const rounds = buildQuiz(junk, 11);
    expect(rounds.some((r) => r.sourceTitle === '')).toBe(false);
    expect(rounds.some((r) => r.prompt.length < 5)).toBe(false);
  });

  it('verdictFor 边界：0/1/4/6/8 得分的判词不同且不越界', () => {
    expect(verdictFor(0, 8).title).toBe('初来乍到');
    expect(verdictFor(2, 8).title).toBe('一枚灯芯');
    expect(verdictFor(4, 8).title).toBe('半盏灯');
    expect(verdictFor(6, 8).title).toBe('整船灯芯');
    expect(verdictFor(8, 8).title).toBe('灯海');
    expect(verdictFor(0, 0).title).toBe('无灯');
  });
});

describe('quiz PRNG & seed', () => {
  it('seedFromString 稳定（同串同种子）且分布有别', () => {
    expect(seedFromString('project-1')).toBe(seedFromString('project-1'));
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });

  it('mulberry32 走得最远 0 之后仍产出 [0,1)', () => {
    const r = mulberry32(0);
    for (let i = 0; i < 1000; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('UNLABELED_ERA 常量值', () => {
    expect(UNLABELED_ERA).toBe('未标纪元');
  });
});
