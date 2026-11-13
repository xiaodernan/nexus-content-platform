import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GameDocumentSchema } from '@nexus/schemas';
import { compileForKind, validateGame, type GameDocument } from '@nexus/game-model';
import { getPublishedPage } from '@/server/domain/publish';
import { describeProjection } from '@/play/PlayByKind';
import { PublicPlay } from '@/play/PublicPlay';
import { VisitMeter } from '../VisitMeter';
import { BrandTitle } from '@/components/BrandTitle';

export const dynamic = 'force-dynamic';

/**
 * §50 公开可玩：`/n/<handle>/<slug>/play`。
 *
 * 读的是**发布那一刻钉在 publication 行上的那份游戏设计**（ADR-0009），不是作者的工作稿——
 * 否则昨天分享出去的链接今天就会换玩法。作者改完要重新发布，公网这一份才跟着换。
 *
 * 可见性判定整个复用 `getPublishedPage`：private 一律不可达、被人工拒绝的不可达、
 * 项目已软删的不可达。这里不抄第二份谓词，抄一份就会和真口径漂移。
 */
export default async function PublicPlayPage({ params }: { params: Promise<{ handle: string; slug: string }> }) {
  const { handle, slug } = await params;
  const path = `/n/${decodeURIComponent(handle)}/${decodeURIComponent(slug)}`;
  const page = await getPublishedPage(path);
  if (!page) notFound();

  const back = (
    <Link href={path} className="text-11 text-accent-2-ink underline" data-play-back>
      回到作品页
    </Link>
  );

  if (page.gameDocument === null || page.gameDocument === undefined) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-play="none">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-[var(--nexus-color-border-subtle)] bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-8">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--nexus-color-brand)]/40 bg-gradient-to-br from-[var(--nexus-color-brand)]/20 via-bg-2 to-[var(--nexus-color-accent-2)]/20 text-[var(--nexus-color-accent-2-ink)]">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 12h4m-2-2v4m7-3v4m1-4h2.5A1.5 1.5 0 0 1 22 12v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a8 8 0 0 1 16 0Z" />
            </svg>
          </span>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
              PLAY
            </span>
            <h1 className="text-[var(--nexus-font-size-21)] font-semibold">这一版没有可玩内容</h1>
          </div>
          <p className="max-w-md text-13 leading-6 text-fg-2">
            发布的时候这个项目还没有 §54 的游戏设计文档，所以这一版没钉住可玩的东西。
            这里不会拿作者现在的工作稿顶上——那是另一份东西，而且它随时在变。
          </p>
        </div>
        {back}
      </main>
    );
  }

  const parsed = GameDocumentSchema.safeParse(page.gameDocument);
  if (!parsed.success) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-play="broken">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-[color:var(--nexus-color-brand)]/35 bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-8 shadow-[0_0_32px_rgb(91_108_255/0.12)]">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--nexus-color-brand)]/40 bg-gradient-to-br from-[var(--nexus-color-brand)]/20 via-bg-2 to-[var(--nexus-color-accent-2)]/20 text-[var(--nexus-color-accent-2-ink)]">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M10.29 3.86 2.82 17a2 2 0 0 0 1.71 3h14.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </span>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
              UNREADABLE
            </span>
            <h1 className="text-[var(--nexus-font-size-21)] font-semibold">这一版钉住的游戏读不出来</h1>
          </div>
        <ul className="flex flex-col gap-1">
          {parsed.error.issues.slice(0, 5).map((issue) => (
            <li key={`${issue.path.join('.')}-${issue.message}`} className="text-12 text-danger-ink" data-play-issue>
              {issue.path.join('.') || 'document'}：{issue.message}
            </li>
          ))}
        </ul>
        <p className="max-w-md text-11 leading-5 text-fg-3">
          明说读不出来，比悄悄给一个空关卡诚实（§159）。这一版钉住的就是这些字节，重新发布才会换。
        </p>
        </div>
        {back}
      </main>
    );
  }

  const document = parsed.data as GameDocument;
  const issues = validateGame(document);
  const projection = compileForKind(document);
  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-4 px-6 py-8" data-play="live">
      <header className="relative flex flex-wrap items-baseline justify-between gap-4">
        <div className="relative flex flex-col gap-1">
          <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
            PLAYING
          </span>
          <BrandTitle            className="relative inline-block text-gradient-brand pb-2 text-28 font-bold tracking-tight"
            data-play-title
          >
            {document.name}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
            />
          </BrandTitle>
          <p className="text-11 text-fg-3" data-play-subtitle>
            {describeProjection(document, projection)}
          </p>
          <p className="max-w-lg text-11 leading-5 text-fg-3" data-play-pinned>
            {page.ownerName} 发布的第 {page.publication.version} 版 · 这一页玩的是发布那一刻钉住的游戏设计，
            作者之后的改动不会跑到这个链接上
          </p>
        </div>
        {back}
      </header>
      {issues.length ? (
        <p className="text-11 text-fg-3" data-play-issues>
          这份钉住的文档有 {issues.length} 条校验问题（{issues.slice(0, 3).map((issue) => issue.code).join(' / ')}）；
          能投影的部分照常可玩，不假装它是干净的。
        </p>
      ) : null}
      {/* §168：通关的那一声（"玩到了结局"）——只有公开可玩页报，作者自己的工作稿不报 */}
      <PublicPlay document={document} projection={projection} path={path} />
      {/* §168：玩这一页就是一次真访问，心跳与作品页共用同一份口径 */}
      <VisitMeter path={path} />
    </main>
  );
}
