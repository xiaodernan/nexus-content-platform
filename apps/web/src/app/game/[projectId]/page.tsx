import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compileForKind } from '@nexus/game-model';
import { loadGame } from '@/server/domain/games';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { PlayByKind, describeProjection } from '@/play/PlayByKind';

export const dynamic = 'force-dynamic';

/**
 * §50 的第一块可玩投影：`/game/<项目>`。
 *
 * 这里**不存第二份东西**——跑起来的就是这个项目那份 §54 游戏设计文档的投影（§16）：
 * 位置、生命、伤害、察觉半径、任务条件全部由 `@nexus/game-model` 从同一份文档算出来，
 * 所以改完设计再回这一页，玩到的就变了。没有"试玩专用关卡"这回事。
 *
 * 跑哪条投影由 §51 的 `document.kind` 决定（`compileForKind` 是唯一分派点），
 * 和公开试玩页 `/n/<handle>/<slug>/play` 共用同一处判断：这一页说"没接"的类型，
 * 公开那一页不许硬跑 2D 关卡。
 *
 * 和 `/world/<项目>` 一样只有作者能进；公开可玩走的是发布快照那条链路（§56/§57/M4 第二片）。
 */
export default async function GameRuntimePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const game = await loadGame(projectId);
  if (!game) {
    return (
      <main className="rt-shell" data-game-runtime="none">
        <h1 className="rt-title">这个项目还没有游戏设计</h1>
        <p className="rt-lede">
          可玩投影读的是 §54 的游戏设计文档（11 类实体、数值与引用）。先去 Studio 的「游戏」面板建骨架、填几个数。
        </p>
        <Link href={`/studio/${projectId}`} className="rt-link">
          回到 Studio 的游戏面板
        </Link>
      </main>
    );
  }
  if (!game.ok) {
    return (
      <main className="rt-shell" data-game-runtime="broken">
        <h1 className="rt-title">库里的游戏设计读不出来</h1>
        <p className="rt-error" data-game-error>
          {game.reason}
        </p>
        <p className="rt-note">
          这里不会拿一份演示关卡代替它：那看起来像"你的设计跑不起来"，而实际是读不出来，两件事差很远。
        </p>
      </main>
    );
  }

  const projection = compileForKind(game.document);
  return (
    <main className="rt-shellWide" data-game-page>
      <header className="rt-head">
        <div>
          <h1 className="rt-title" data-game-title>
            {game.document.name}
          </h1>
          <p className="rt-subtitle" data-game-subtitle>
            {describeProjection(game.document, projection)}
          </p>
        </div>
        <Link href={`/studio/${projectId}`} className="rt-linkSub" data-game-back>
          回 Studio 改设计
        </Link>
      </header>
      <PlayByKind document={game.document} projection={projection} />
    </main>
  );
}
