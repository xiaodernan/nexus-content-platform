import { describe, expect, it } from 'vitest';
import { applyStoryboardPatch, invertStoryboardPatch, storyboardTransaction, type StoryboardOp } from '../src/patch';
import { emptyStoryboard, planStoryboard, type Storyboard, type StoryboardShot } from '../src/index';

/**
 * §150「所有编辑走 Command」在分镜上的门禁。这里钉的都是**会说谎的那几处**：
 * ① 撤销看起来成功了，其实把镜头追加到了末尾（顺序回不来）；
 * ② 逆补丁吃了改动后的文档，于是 `updateShot` 撤回去的是新值——撤销等于没撤；
 * ③ 补丁原地改了入参，撤销栈里的旧值被自己覆盖掉；
 * ④ 找不到镜头时静默跳过，一次"绿"的撤销其实什么也没做。
 * 每条都配了"实现偷懒会怎样"的反面断言。
 */

const SENTENCE = '夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳，它跑起来了';

function doc(): Storyboard {
  return planStoryboard(SENTENCE);
}

function ids(sb: Storyboard): string[] {
  return sb.shots.map((s) => s.id);
}

function newShot(index: number): StoryboardShot {
  return {
    id: `shot-x-${index}`,
    prompt: `插入的第 ${index} 镜`,
    durationMs: 1500,
    camera: 'aerial',
    transition: 'dissolve',
  };
}

/** JSON 走一遍再比：`undefined` 的键与压根没有这个键，在 toEqual 里是相等的，这里不让它们蒙混 */
function wire(sb: Storyboard): string {
  return JSON.stringify(sb);
}

describe('§150 applyStoryboardPatch：纯函数，旧值要留得住', () => {
  it('空补丁 = 同一份内容，但换了对象身份（过一遍补丁不该改字段，也不该还回同一个引用）', () => {
    const before = doc();
    const after = applyStoryboardPatch(before, []);
    expect(after).toEqual(before);
    expect(wire(after)).toBe(wire(before));
    expect(after).not.toBe(before);
    expect(after.shots).not.toBe(before.shots);
    expect(after.shots[0]).not.toBe(before.shots[0]);
  });

  it('打补丁绝不原地改入参：旧文档逐字段不变，撤销栈才有东西可撤', () => {
    const before = doc();
    const snapshot = wire(before);
    applyStoryboardPatch(before, [
      { op: 'updateShot', id: before.shots[0]!.id, before: {}, after: { durationMs: 999, camera: 'aerial' } },
      { op: 'removeShot', id: before.shots[1]!.id },
      { op: 'addShot', index: 0, shot: newShot(1) },
    ]);
    expect(wire(before), '入参被原地改了，撤销栈里的旧值就没了').toBe(snapshot);
  });

  it('插入的是副本：改结果里的镜头不会写回调用方手里那个对象', () => {
    const before = doc();
    const injected = newShot(9);
    const after = applyStoryboardPatch(before, [{ op: 'addShot', index: 2, shot: injected }]);
    const at = after.shots.findIndex((s) => s.id === injected.id);
    expect(at).toBe(2);
    after.shots[at]!.prompt = '改了结果的这一镜';
    expect(injected.prompt, '插进去的是引用，调用方一改就把历史改了').toBe(newShot(9).prompt);
  });

  it('插入位置越界不崩，夹到末尾；删不存在的镜头必须抛错而不是静默跳过', () => {
    const before = doc();
    expect(ids(applyStoryboardPatch(before, [{ op: 'addShot', index: 99, shot: newShot(0) }]))).toEqual([...ids(before), 'shot-x-0']);
    expect(() => applyStoryboardPatch(before, [{ op: 'removeShot', id: 'shot-does-not-exist' }])).toThrow(/shot-does-not-exist/);
    expect(() => applyStoryboardPatch(before, [{ op: 'updateShot', id: 'nope', before: {}, after: { durationMs: 1 } }])).toThrow(/不在这份分镜里/);
  });

  it('空分镜上移动：说清是哪一个位置没有镜头，而不是静默返回一份空文档', () => {
    const empty = emptyStoryboard();
    expect(() => applyStoryboardPatch(empty, [{ op: 'moveShot', from: 0, to: 0 }])).toThrow(/没有第 0 个镜头可以移动/);
  });
});

describe('§150 逆补丁吃的是改动前的文档', () => {
  it('删掉中间一镜再撤销：回到原来那一位，不是追加到末尾', () => {
    const before = doc();
    const victim = before.shots[1]!;
    const ops: StoryboardOp[] = [{ op: 'removeShot', id: victim.id }];
    const undo = invertStoryboardPatch(before, ops);
    expect(undo).toEqual([{ op: 'restoreShot', index: 1, shot: victim }]);
    const after = applyStoryboardPatch(before, ops);
    expect(after.shots).toHaveLength(3);
    expect(wire(applyStoryboardPatch(after, undo))).toBe(wire(before));
  });

  it('连删两镜：逆按倒序排（后删的先还原），一次撤销全数归位', () => {
    const before = doc();
    const ops: StoryboardOp[] = [
      { op: 'removeShot', id: before.shots[0]!.id },
      { op: 'removeShot', id: before.shots[2]!.id },
    ];
    const undo = invertStoryboardPatch(before, ops);
    // 记录的是"当时在第几位"：第二镜是在删掉首镜之后的状态里数的
    expect(undo.map((o) => (o.op === 'restoreShot' ? o.index : -1))).toEqual([1, 0]);
    expect(undo[0]?.op).toBe('restoreShot');
    const after = applyStoryboardPatch(before, ops);
    expect(wire(applyStoryboardPatch(after, undo))).toBe(wire(before));
  });

  it('改字段只改给到的那几个，逆撤回的是旧值而不是新值', () => {
    const before = doc();
    const target = before.shots[1]!;
    const otherId = before.shots[2]!.id;
    const ops: StoryboardOp[] = [
      { op: 'updateShot', id: target.id, before: { durationMs: target.durationMs, camera: target.camera }, after: { durationMs: 700, camera: 'detail' } },
    ];
    const after = applyStoryboardPatch(before, ops);
    expect(after.shots[1]).toMatchObject({ durationMs: 700, camera: 'detail' });
    // 没有点名的字段一个都不许动（prompt 是这一镜的魂，改时长不能把它顺带洗掉）
    expect(after.shots[1]!.prompt).toBe(target.prompt);
    expect(after.shots.find((s) => s.id === otherId)).toEqual(before.shots[2]);
    expect(wire(applyStoryboardPatch(after, invertStoryboardPatch(before, ops)))).toBe(wire(before));
  });

  it('清空可选字段是删键，不是留一个值为 undefined 的键；逆把它补回来', () => {
    const withRef: Storyboard = {
      ...doc(),
      shots: doc().shots.map((s, i) => (i === 0 ? { ...s, referenceAssetId: 'a-7' } : s)),
    };
    const ops: StoryboardOp[] = [
      { op: 'updateShot', id: withRef.shots[0]!.id, before: { referenceAssetId: 'a-7' }, after: { referenceAssetId: undefined } },
    ];
    const after = applyStoryboardPatch(withRef, ops);
    expect(Object.keys(after.shots[0]!)).not.toContain('referenceAssetId');
    expect('referenceAssetId' in after.shots[0]!, '清空要真的把键删掉，否则清单里就多一格假引用').toBe(false);
    const restored = applyStoryboardPatch(after, invertStoryboardPatch(withRef, ops));
    expect(restored.shots[0]!.referenceAssetId).toBe('a-7');
    expect(wire(restored)).toBe(wire(withRef));
  });

  it('重排只改位置不改 id；撤销回到原顺序且逐位对得上', () => {
    const before = doc();
    const ops: StoryboardOp[] = [{ op: 'moveShot', from: 0, to: 3 }];
    const after = applyStoryboardPatch(before, ops);
    expect(ids(after)).toEqual([ids(before)[1], ids(before)[2], ids(before)[3], ids(before)[0]]);
    // 内容跟着 id 走，不是跟着位置走
    expect(after.shots[3]!.prompt).toBe(before.shots[0]!.prompt);
    expect(wire(applyStoryboardPatch(after, invertStoryboardPatch(before, ops)))).toBe(wire(before));
  });

  it('混合一次改动（删、插、改、移）：正做之后撤销逐字节回原样', () => {
    const before = doc();
    const ops: StoryboardOp[] = [
      { op: 'removeShot', id: before.shots[0]!.id },
      { op: 'addShot', index: 1, shot: newShot(5) },
      { op: 'updateShot', id: before.shots[2]!.id, before: { transition: before.shots[2]!.transition }, after: { transition: 'wipe' } },
      { op: 'moveShot', from: 3, to: 0 },
    ];
    const { applied, undo } = storyboardTransaction(before, ops);
    expect(applied.shots).toHaveLength(4);
    expect(wire(applied)).not.toBe(wire(before));
    expect(wire(applyStoryboardPatch(applied, undo))).toBe(wire(before));
  });

  it('restoreShot 只作为逆出现，自己没有逆 case（重做是重新应用，不是再逆一次）', () => {
    const before = doc();
    const restore: StoryboardOp = { op: 'restoreShot', index: 0, shot: newShot(6) };
    expect(applyStoryboardPatch(before, [restore]).shots).toHaveLength(5);
    expect(invertStoryboardPatch(before, [restore])).toEqual([]);
    // 而 removeShot 的逆就是它：这两条要同时成立，栈里才凑得成一对
    expect(invertStoryboardPatch(before, [{ op: 'removeShot', id: before.shots[0]!.id }])[0]?.op).toBe('restoreShot');
  });
});

describe('§149 storyboardTransaction：一次 AI 操作 = 一个可撤销事务', () => {
  it('给的是 applied / undo / redo 三份，重做拿的是原补丁的副本', () => {
    const before = doc();
    const ops: StoryboardOp[] = [{ op: 'updateShot', id: before.shots[1]!.id, before: { durationMs: before.shots[1]!.durationMs }, after: { durationMs: 4200 } }];
    const tx = storyboardTransaction(before, ops);
    expect(tx.applied.shots[1]!.durationMs).toBe(4200);
    expect(wire(applyStoryboardPatch(tx.applied, tx.undo))).toBe(wire(before));
    // redo 是同一份正做补丁（不是逆的逆）：从原状态再跑一次要得到同一份结果
    expect(tx.redo).toEqual(ops);
    expect(tx.redo[0]).not.toBe(ops[0]);
    expect(wire(applyStoryboardPatch(before, tx.redo))).toBe(wire(tx.applied));
  });

  it('空事务也是合法事务：applied 与原文档逐字节相同，undo 为空', () => {
    const before = doc();
    const tx = storyboardTransaction(before, []);
    expect(wire(tx.applied)).toBe(wire(before));
    expect(tx.undo).toEqual([]);
    expect(tx.redo).toEqual([]);
  });
});
