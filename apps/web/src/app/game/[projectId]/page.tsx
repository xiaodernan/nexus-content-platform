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
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-game-runtime="none">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-[var(--nexus-color-border-subtle)] bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-8">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--nexus-color-brand)]/40 bg-gradient-to-br from-[var(--nexus-color-brand)]/20 via-bg-2 to-[var(--nexus-color-accent-2)]/20 text-[var(--nexus-color-accent-2-ink)]">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9Z" />
              <path d="M10 12h4m-2-2v4" />
            </svg>
          </span>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
              GAME
            </span>
            <h1 className="text-[var(--nexus-font-size-21)] font-semibold">这个项目还没有游戏设计</h1>
          </div>
          <p className="max-w-md text-13 leading-6 text-fg-2">
            可玩投影读的是 §54 的游戏设计文档（11 类实体、数值与引用）。先去 Studio 的「游戏」面板建骨架、填几个数。
          </p>
          <Link
            href={`/studio/${projectId}`}
            className="mt-1 inline-flex min-h-10 items-center rounded-lg bg-[var(--nexus-color-brand)] px-4 py-2 text-13 font-semibold text-[var(--nexus-color-accent-fg)] transition-shadow hover:shadow-[0_0_24px_rgb(91_108_255/0.45)]"
          >
            回到 Studio 的游戏面板 →
          </Link>
        </div>
      </main>
    );
  }
  if (!game.ok) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-game-runtime="broken">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-[color:var(--nexus-color-brand)]/35 bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-8 shadow-[0_0_32px_rgb(91_108_255/0.12)]">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--nexus-color-brand)]/40 bg-gradient-to-br from-[var(--nexus-color-brand)]/20 via-bg-2 to-[var(--nexus-color-accent-2)]/20 text-[var(--nexus-color-accent-2-ink)]">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M10.29 3.86 2.82 17a2 2 0 0 0 1.71 3h14.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </span>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
              UNREADABLE
            </span>
            <h1 className="text-[var(--nexus-font-size-21)] font-semibold">库里的游戏设计读不出来</h1>
          </div>
          <p className="max-w-md text-13 leading-6 text-danger-ink" data-game-error>
            {game.reason}
          </p>
          <p className="max-w-md text-11 leading-5 text-fg-3">
            这里不会拿一份演示关卡代替它：那看起来像"你的设计跑不起来"，而实际是读不出来，两件事差很远。
          </p>
        </div>
      </main>
    );
  }

  const projection = compileForKind(game.document);
  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-4 px-6 py-8" data-game-page>
      <header className="relative flex flex-wrap items-baseline justify-between gap-4">
        <div className="relative flex flex-col gap-1">
          <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
            GAME
          </span>
          <h1
            className="relative inline-block bg-gradient-to-br from-[#eef1f6] via-[#8b9cf8] to-[var(--nexus-color-accent-1)] bg-clip-text pb-2 text-[var(--nexus-font-size-28)] font-bold tracking-tight text-transparent"
            data-game-title
          >
            {game.document.name}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
            />
          </h1>
          <p className="max-w-lg text-11 leading-5 text-fg-3" data-game-subtitle>
            {describeProjection(game.document, projection)}
          </p>
        </div>
        <Link
          href={`/studio/${projectId}`}
          className="inline-flex min-h-10 items-center rounded-lg border border-[var(--nexus-color-brand)]/50 bg-[var(--nexus-color-brand)]/10 px-4 py-2 text-13 font-semibold text-[var(--nexus-color-accent-2-ink)] transition-colors hover:border-[var(--nexus-color-brand)] hover:bg-[var(--nexus-color-brand)]/20"
          data-game-back
        >
          回 Studio 改设计 →
        </Link>
      </header>
      <PlayByKind document={game.document} projection={projection} />
    </main>
  );
}
