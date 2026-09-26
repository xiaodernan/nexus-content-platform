import { GAME_KIND_LABELS, isGameKind, type GameDocument, type GameProjection } from '@nexus/game-model';
import { GamePlay } from '@/game2d/GamePlay';
import { StoryPlay } from './StoryPlay';

/**
 * §51 的"类型 → 播放器"这一段，两个试玩入口共用一处（§16）：
 * `/game/<项目>`（作者自己的工作稿）与 `/n/<handle>/<slug>/play`（发布那一刻钉住的那一版）。
 * 各写一遍判断，迟早变成"一个页面说这个类型没接、另一个页面硬跑 2D 关卡"。
 *
 * 分派只看 `document.kind`，不看"文档里有什么"——作者标了 3D 却写了一堆对话时，
 * 按内容静默降级就是替他做了决定（`compileForKind` 里写了同一条理由）。
 */
export function PlayByKind({ document, projection }: { document: GameDocument; projection: GameProjection }) {
  if (projection.pipeline === 'topdown') return <GamePlay plan={projection.plan} />;
  if (projection.pipeline === 'story') return <StoryPlay plan={projection.plan} />;
  const label = isGameKind(document.kind) ? GAME_KIND_LABELS[document.kind] : '这一种';
  return (
    <div className="rounded-lg border border-[var(--nexus-color-border)] p-4" data-play="kind-not-wired">
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
    return `${label} · ${plan.enemies.length} 个敌人 · ${plan.items.length} 个物品 · ${plan.quests.length} 条任务 · 场地 ${plan.arena.width}×${plan.arena.height}`;
  }
  if (projection.pipeline === 'story') {
    const plan = projection.plan;
    const start = plan.beats.find((beat) => beat.id === plan.startId);
    return `${label} · 对话投影 · ${plan.beats.length} 段可读 · 起点「${start?.name ?? '没有'}」 · ${plan.notes.length} 条如实说明`;
  }
  return `${label} · 这条类型没有可玩投影`;
}
