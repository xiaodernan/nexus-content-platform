import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compileGame } from '@nexus/game-model';
import { loadGame } from '@/server/domain/games';
import { projectBelongsTo } from '@/server/domain/projects';
import { requireUser } from '@/server/domain/session';
import { GamePlay } from '@/game2d/GamePlay';

export const dynamic = 'force-dynamic';

/**
 * §50 的第一块可玩投影：`/game/<项目>`。
 *
 * 这里**不存第二份东西**——跑起来的就是这个项目那份 §54 游戏设计文档的投影（§16）：
 * 位置、生命、伤害、察觉半径、任务条件全部由 `compileGame` 从同一份文档算出来，
 * 所以改完设计再回这一页，玩到的就变了。没有"试玩专用关卡"这回事。
 *
 * 和 `/world/<项目>` 一样只有作者能进：游戏还没有发布链路（§56/§57 发布的是设计文档那一版），
 * 公开可玩要先把游戏接进发布快照，那是下一片的事，这里不假装。
 */
export default async function GameRuntimePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectBelongsTo(projectId, user.id))) notFound();

  const game = await loadGame(projectId);
  if (!game) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-game-runtime="none">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">这个项目还没有游戏设计</h1>
        <p className="text-13 text-fg-2">
          可玩投影读的是 §54 的游戏设计文档（11 类实体、数值与引用）。先去 Studio 的「游戏」面板建骨架、填几个数。
        </p>
        <Link href={`/studio/${projectId}`} className="text-13 text-accent-2 underline">
          回到 Studio 的游戏面板
        </Link>
      </main>
    );
  }
  if (!game.ok) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-game-runtime="broken">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">库里的游戏设计读不出来</h1>
        <p className="text-13 text-danger" data-game-error>
          {game.reason}
        </p>
        <p className="text-11 text-fg-3">
          这里不会拿一份演示关卡代替它：那看起来像"你的设计跑不起来"，而实际是读不出来，两件事差很远。
        </p>
      </main>
    );
  }

  const plan = compileGame(game.document);
  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-4 px-6 py-8" data-game-page>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold" data-game-title>
            {plan.name}
          </h1>
          <p className="text-11 text-fg-3" data-game-subtitle>
            §54 设计文档的可玩投影 · {plan.enemies.length} 个敌人 · {plan.items.length} 个物品 ·{' '}
            {plan.quests.length} 条任务 · 场地 {plan.arena.width}×{plan.arena.height}
          </p>
        </div>
        <Link href={`/studio/${projectId}`} className="text-11 text-accent-2 underline" data-game-back>
          回 Studio 改设计
        </Link>
      </header>
      <GamePlay plan={plan} />
    </main>
  );
}
