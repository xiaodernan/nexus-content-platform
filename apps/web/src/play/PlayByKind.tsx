import {
  GAME_KIND_LABELS,
  GAME_KIND_STATUS,
  isGameKind,
  type GameDocument,
  type GameProjection,
} from '@nexus/game-model';
import { GamePlay } from '@/game2d/GamePlay';
import { RpgPlay } from '@/game2d/RpgPlay';
import { StoryPlay } from './StoryPlay';

/**
 * §51 的"类型 → 播放器"这一段，两个试玩入口共用一处（§16）：
 * `/game/<项目>`（作者自己的工作稿）与 `/n/<handle>/<slug>/play`（发布那一刻钉住的那一版）。
 * 各写一遍判断，迟早变成"一个页面说这个类型没接、另一个页面硬跑 2D 关卡"。
 *
 * 分派只看 `document.kind`，不看"文档里有什么"——作者标了 3D 却写了一堆对话时，
 * 按内容静默降级就是替他做了决定（`compileForKind` 里写了同一条理由）。
 *
 * 接了的类型也要把状态表那句话亮在页面上：2.5D 的"没有 3D 模型"、3D 的"判定仍在地平面上"、
 * 视觉小说的"没有立绘/背景/音乐"都是**限度**，只写在注释里等于没写（§159）。
 * 这句与 Studio 面板下拉旁边那句是同一份（`GAME_KIND_STATUS`），不是第二处自己判断。
 */
export function PlayByKind({ document, projection }: { document: GameDocument; projection: GameProjection }) {
  const kindNote = isGameKind(document.kind) ? (
    <p className="text-11 text-fg-3" data-game-kind-note={document.kind}>
      {GAME_KIND_STATUS[document.kind].note}
    </p>
  ) : null;

  if (projection.pipeline === 'topdown') {
    return (
      <>
        <GamePlay plan={projection.plan} view={projection.view} />
        {kindNote}
      </>
    );
  }
  if (projection.pipeline === 'story') {
    return (
      <>
        <StoryPlay plan={projection.plan} />
        {kindNote}
      </>
    );
  }
  if (projection.pipeline === 'rpg') {
    return (
      <>
        <RpgPlay plan={projection.plan} />
        {kindNote}
      </>
    );
  }
  // 没接：reason 本身就是状态表那句话，不重复显示第二遍
  const label = isGameKind(document.kind) ? GAME_KIND_LABELS[document.kind] : '这一种';
  return (
    <div className="rounded-lg border border-[var(--nexus-color-border-subtle)] p-4" data-play="kind-not-wired">
      <h2 className="text-13 font-semibold">这一版标的类型是「{label}」，它还没有可玩的投影</h2>
      <p className="mt-2 text-12 text-fg-2" data-play-kind-reason>
        {projection.reason}
      </p>
      <p className="mt-2 text-11 text-fg-3">
        这里不给一个空场子，也不拿别的类型的关卡顶上：那会让"平台还没接这一种"看起来像"你的设计跑出来就是这样"（§159）。
      </p>
    </div>
  );
}

/** 页首那行小字：说清这一页跑的到底是哪条管线、投影出多少可读内容 */
export function describeProjection(document: GameDocument, projection: GameProjection): string {
  const label = isGameKind(document.kind) ? GAME_KIND_LABELS[document.kind] : '这一种';
  if (projection.pipeline === 'topdown') {
    const plan = projection.plan;
    // 画法要写进页首：2.5D / 3D 与 2D 跑的是同一条计划，差别只在这句话和画布上
    // （不写就会被读成"三种游戏"，而它们是同一个 step 算出来的同一份结果）
    const paint =
      projection.view === 'isometric'
        ? '等轴测投影 · '
        : projection.view === '3d'
          ? '3D 视角 · '
          : projection.view === 'exploration'
            ? '探索画法（走近才看得见） · '
            : projection.view === 'puzzle'
              ? '解谜画法（机关连线） · '
              : '';
    return `${label} · ${paint}${plan.enemies.length} 个敌人 · ${plan.items.length} 个物品 · ${plan.quests.length} 条任务 · 场地 ${plan.arena.width}×${plan.arena.height}`;
  }
  if (projection.pipeline === 'story') {
    const plan = projection.plan;
    const start = plan.beats.find((beat) => beat.id === plan.startId);
    return `${label} · 对话投影 · ${plan.beats.length} 段可读 · 起点「${start?.name ?? '没有'}」 · ${plan.notes.length} 条如实说明`;
  }
  if (projection.pipeline === 'rpg') {
    const plan = projection.plan;
    // 战斗与 2D 是同一个 step：这句话要写在页首，不然读起来像"多了一种战斗规则"
    const fallbackXp = plan.enemyXp.filter((enemy) => enemy.from === 'default').length;
    return `${label} · RPG 成长循环（战斗与 2D 同一个 step） · ${plan.base.enemies.length} 个敌人 · ${plan.quests.length} 条任务 · 场地 ${plan.base.arena.width}×${plan.base.arena.height}${
      fallbackXp ? ` · ${fallbackXp} 个敌人的经验是兜底值` : ''
    }`;
  }
  return `${label} · 这条类型没有可玩投影`;
}
