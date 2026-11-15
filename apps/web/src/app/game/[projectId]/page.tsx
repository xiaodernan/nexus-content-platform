import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compileForKind } from '@nexus/game-model';
import { loadGame } from '@/server/domain/games';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { PlayByKind, describeProjection } from '@/play/PlayByKind';
import { getLocale, type Locale } from '@/lib/i18n';

/** 双语 COPY（2026-11-15 公开试玩面）——全屏三态文案。 */
const COPY: Record<Locale, {
  noneGameTitle: string;
  noneGameLede: string;
  backToStudioGame: string;
  brokenGameTitle: string;
  gameErrorNote: string;
  backToStudioEdit: string;
}> = {
  zh: {
    noneGameTitle: '这个项目还没有游戏设计',
    noneGameLede:
      '可玩投影读的是 §54 的游戏设计文档（11 类实体、数值与引用）。先去 Studio 的「游戏」面板建骨架、填几个数。',
    backToStudioGame: '回到 Studio 的游戏面板',
    brokenGameTitle: '库里的游戏设计读不出来',
    gameErrorNote:
      '这里不会拿一份演示关卡代替它：那看起来像"你的设计跑不起来"，而实际是读不出来，两件事差很远。',
    backToStudioEdit: '← Studio 改设计',
  },
  en: {
    noneGameTitle: 'This project has no game design yet',
    noneGameLede:
      'The playable projection reads the §54 game design document (11 entity kinds, stats and references). Go create a skeleton in Studio’s “Game” panel and fill in a few numbers first.',
    backToStudioGame: 'Back to the Game panel in Studio',
    brokenGameTitle: 'The game design could not be read',
    gameErrorNote:
      'No demo level is substituted here: that would look like “your design does not run”, when in fact it simply could not be read — those are different things.',
    backToStudioEdit: '← Studio: edit the design',
  },
};

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
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  const c = COPY[locale];
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const game = await loadGame(projectId);
  if (!game) {
    return (
      <main className="rt-shell" data-game-runtime="none">
        <h1 className="rt-title">{c.noneGameTitle}</h1>
        <p className="rt-lede">
          {c.noneGameLede}
        </p>
        <Link href={`/studio/${projectId}`} className="rt-link">
          {c.backToStudioGame}
        </Link>
      </main>
    );
  }
  if (!game.ok) {
    return (
      <main className="rt-shell" data-game-runtime="broken">
        <h1 className="rt-title">{c.brokenGameTitle}</h1>
        <p className="rt-error" data-game-error>
          {game.reason}
        </p>
        <p className="rt-note">
          {c.gameErrorNote}
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
            {describeProjection(game.document, projection, locale)}
          </p>
        </div>
        <Link href={`/studio/${projectId}`} className="rt-linkSub" data-game-back>
          {c.backToStudioEdit}
        </Link>
      </header>
      <PlayByKind document={game.document} projection={projection} locale={locale} />
    </main>
  );
}
