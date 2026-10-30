import type { Storyboard, StoryboardShot } from './index';

/**
 * §150：一次编辑 = 一个可撤销事务。分镜也要守这条，所以补丁与它的逆在这里，
 * 形状照 `packages/design-model/src/patch.ts`（那一份是仓库的口径，不另起一套）。
 *
 * 三条与 design-model 同规矩的约定：
 * 1. `applyStoryboardPatch` 是**纯函数**：返回新对象，绝不原地改入参（撤销栈要靠旧值）。
 * 2. `invertStoryboardPatch(改动前的文档, 补丁)` 算逆——逆必须吃**旧状态**，
 *    否则 `removeShot` 之后就没有那份镜头内容可还原了。
 * 3. 逆操作里有些是"只作为逆出现"的（`restoreShot`）：它自己没有逆 case，
 *    因为重做走的是重新应用 `applied`，不是再逆一次。
 *
 * 找不到镜头时**抛错**而不是静默跳过：静默跳过会让一次"看起来成功了"的撤销
 * 其实什么都没做，那比报错难查得多（§159）。
 */

/** 只改这些字段：`durationMs` 一类的数值、`prompt` 一类的文本、以及可选引用（`undefined` = 抹掉这一格） */
export type ShotFields = Partial<Pick<StoryboardShot, 'prompt' | 'durationMs' | 'camera' | 'transition' | 'characterId' | 'referenceAssetId' | 'videoAssetId'>>;

/**
 * 来源那几格：箭头一定在（`text-to-video` 是唯一不需要额外东西的那条），两个引用按箭头可缺。
 * `prompt` 不在里面：那是作者写的原句，投影可以切它，但**没有一个编辑动作该改它**。
 */
export type SourceFields = Pick<Storyboard['source'], 'arrow' | 'referenceAssetId' | 'characterId'>;

export type StoryboardOp =
  | { op: 'addShot'; index: number; shot: StoryboardShot }
  | { op: 'removeShot'; id: string }
  /** 只作为 `removeShot` 的逆出现 */
  | { op: 'restoreShot'; index: number; shot: StoryboardShot }
  | { op: 'moveShot'; from: number; to: number }
  | { op: 'updateShot'; id: string; before: ShotFields; after: ShotFields }
  /**
   * §40 建完之后改来源：换一条箭头 / 换一张参考图 / 换一位角色。镜头表一个都不动——
   * 来源说的是"这条片子从什么出发"，不是"重切一版"。
   */
  | { op: 'updateSource'; before: SourceFields; after: SourceFields };

function clone(sb: Storyboard): Storyboard {
  return { ...sb, source: { ...sb.source }, shots: sb.shots.map((s) => ({ ...s })) };
}

function indexOfShot(sb: Storyboard, id: string): number {
  const at = sb.shots.findIndex((s) => s.id === id);
  if (at < 0) throw new Error(`镜头 ${id} 不在这份分镜里`);
  return at;
}

function clampInsert(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

export function applyStoryboardPatch(sb: Storyboard, ops: StoryboardOp[]): Storyboard {
  let next = clone(sb);
  for (const op of ops) {
    if (op.op === 'addShot' || op.op === 'restoreShot') {
      const shots = [...next.shots];
      shots.splice(clampInsert(op.index, shots.length), 0, { ...op.shot });
      next = { ...next, shots };
      continue;
    }
    if (op.op === 'removeShot') {
      const at = indexOfShot(next, op.id);
      const shots = next.shots.filter((_, i) => i !== at);
      next = { ...next, shots };
      continue;
    }
    if (op.op === 'moveShot') {
      const shots = [...next.shots];
      const from = clampInsert(op.from, shots.length - 1);
      const [moved] = shots.splice(from, 1);
      if (!moved) throw new Error(`没有第 ${op.from} 个镜头可以移动`);
      shots.splice(clampInsert(op.to, shots.length), 0, moved);
      next = { ...next, shots };
      continue;
    }
    if (op.op === 'updateSource') {
      const source: Storyboard['source'] = { ...next.source, arrow: op.after.arrow };
      for (const [key, value] of Object.entries(op.after) as [keyof SourceFields, unknown][]) {
        if (key === 'arrow') continue;
        if (value === undefined) delete (source as Record<string, unknown>)[key];
        else (source as Record<string, unknown>)[key] = value;
      }
      next = { ...next, source };
      continue;
    }
    const at = indexOfShot(next, op.id);
    const shot = { ...next.shots[at]! };
    for (const [key, value] of Object.entries(op.after) as [keyof ShotFields, unknown][]) {
      if (value === undefined) delete (shot as Record<string, unknown>)[key];
      else (shot as Record<string, unknown>)[key] = value;
    }
    const shots = [...next.shots];
    shots[at] = shot;
    next = { ...next, shots };
  }
  return next;
}

/** 逆补丁：按**倒序**给出，与 design-model 同一口径（后做的先撤） */
export function invertStoryboardPatch(before: Storyboard, ops: StoryboardOp[]): StoryboardOp[] {
  const inverses: StoryboardOp[] = [];
  let state = before;
  for (const op of ops) {
    if (op.op === 'addShot') {
      inverses.push({ op: 'removeShot', id: op.shot.id });
    } else if (op.op === 'removeShot') {
      const at = indexOfShot(state, op.id);
      // 记下"原来在第几位"，否则撤销会把镜头追加到末尾——顺序就回不来了
      inverses.push({ op: 'restoreShot', index: at, shot: { ...state.shots[at]! } });
    } else if (op.op === 'moveShot') {
      inverses.push({ op: 'moveShot', from: op.to, to: op.from });
    } else if (op.op === 'updateShot') {
      inverses.push({ op: 'updateShot', id: op.id, before: op.after, after: op.before });
    } else if (op.op === 'updateSource') {
      // 逆的 `after` 把两个引用**显式写出来**（没有就写 undefined）：不写的话
      // "以前没有这张图、这次加上去了"撤销回来会留下一张图——键不存在与键值为 undefined
      // 在补丁语义里是两件事（前者"别动"，后者"抹掉"）。
      const applied = applyStoryboardPatch(state, [op]).source;
      inverses.push({
        op: 'updateSource',
        before: { arrow: applied.arrow, referenceAssetId: applied.referenceAssetId, characterId: applied.characterId },
        after: {
          arrow: op.before.arrow,
          referenceAssetId: op.before.referenceAssetId,
          characterId: op.before.characterId,
        },
      });
    }
    // restoreShot 只作为逆出现，自己没有逆 case：重做是重新应用 applied
    state = applyStoryboardPatch(state, [op]);
  }
  return inverses.reverse();
}

/** 一次改动的完整事务：正做与撤销各拿一份（界面/服务端只认这一对，§149） */
export function storyboardTransaction(before: Storyboard, ops: StoryboardOp[]): {
  applied: Storyboard;
  undo: StoryboardOp[];
  redo: StoryboardOp[];
} {
  const applied = applyStoryboardPatch(before, ops);
  return { applied, undo: invertStoryboardPatch(before, ops), redo: ops.map((op) => ({ ...op })) };
}
