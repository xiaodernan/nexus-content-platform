import { generateGameCode, type GameCodeOutput, type GameDocument } from '@nexus/game-model';
import { projectBelongsTo } from './projects';
import { loadGame } from './games';
import type { CurrentUser } from './session';

/**
 * §52 最后一格（Code）的**共用闸口**：把库里那份游戏设计投影成产物，并把三道拒绝挡在字节之前。
 *
 * 为什么两个出口（`.../game/code` 的 JSON 与 `.../game/code/zip` 的下载）要共用这一格：
 * 这个端点里唯一会漂移的东西是**判定顺序**——项目归属必须在生成产物之前判掉。
 * 两处各写一遍的话，后来的人很容易在其中一个出口把 `loadGame` 提到归属检查前面，
 * 于是"别人的项目"回的是 413 或者 500 而不是 404，那正是归属泄露最像正常错误的一次。
 * 现在两个出口读的是同一条闸口，状态码与 `error` 字面量只在这一处产生。
 *
 * 上限**故意留在这里**而不是共用闸口里：JSON 那一路是接口内联响应（1MB），zip 那一路是下载（4MB），
 * 两个数字的判据不同，各自的 413 也要给用户不同的下一步。放进来只会变成"一份上限配两个谎言"。
 */

/** 单次 JSON 响应的产物上限（字节）：判据是"端点响应不该无界" */
export const MAX_CODE_JSON_BYTES = 1_000_000;

/**
 * 下载出口的上限（字节）。为什么比 JSON 那一档大 4 倍但仍要有：
 * zip 是给"这份设计就是很大"的人用的出口，可它同样不该回一份无界字节流。
 * 4MB 是**能被一份合法设计撞到**的数字——schema 允许 5000 个实体（`packages/schemas`），
 * 每实体在产物里约 1.2KB，所以合法范围内就够撑过 4MB；上限要是取到 8MB 以上，
 * 这一条就永远不会红，成了一个装饰性的拒绝（集成测试钉的是真撞线的那一条）。
 */
export const MAX_CODE_ZIP_BYTES = 4_000_000;

export type GameCodeRefusal =
  | { status: 404; error: 'game_missing'; message: string }
  | { status: 404; error: 'not_found' }
  | { status: 500; error: 'game_unreadable'; message: string };

export type GameCodeGate = { ok: true; document: GameDocument; output: GameCodeOutput } | { ok: false; refusal: GameCodeRefusal };

/**
 * 归属 → 设计 → 投影，就这个顺序，不多不少。
 *
 * `notFound`（项目不存在或不是这个人的）与 `game_missing`（项目有但没设计）都回 404，
 * 但**只有前者**必须共用同一个答案：归属错了不能说"没有设计"，那等于把"这项目存在但不是你的"
 * 换了一种拼写说出来。所以 `game_missing` 一定是在归属判掉之后才可能产生的。
 */
export async function projectGameCode(user: CurrentUser, projectId: string): Promise<GameCodeGate> {
  if (!(await projectBelongsTo(projectId, user.id))) return { ok: false, refusal: { status: 404, error: 'not_found' } };

  const result = await loadGame(projectId);
  if (!result) {
    return {
      ok: false,
      refusal: {
        status: 404,
        error: 'game_missing',
        message: '这份项目还没有游戏设计：先在游戏面板里「创建游戏骨架」，再回来生成产物。',
      },
    };
  }
  if (!result.ok) return { ok: false, refusal: { status: 500, error: 'game_unreadable', message: result.reason } };

  return { ok: true, document: result.document, output: generateGameCode(result.document) };
}
