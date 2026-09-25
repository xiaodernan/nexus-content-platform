import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GameDocumentSchema } from '@nexus/schemas';
import { compileGame, validateGame, type GameDocument } from '@nexus/game-model';
import { getPublishedPage } from '@/server/domain/publish';
import { GamePlay } from '@/game2d/GamePlay';
import { VisitMeter } from '../VisitMeter';

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
    <Link href={path} className="text-11 text-accent-2 underline" data-play-back>
      回到作品页
    </Link>
  );

  if (page.gameDocument === null || page.gameDocument === undefined) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-play="none">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">这一版没有可玩内容</h1>
        <p className="text-13 text-fg-2">
          发布的时候这个项目还没有 §54 的游戏设计文档，所以这一版没钉住可玩的东西。
          这里不会拿作者现在的工作稿顶上——那是另一份东西，而且它随时在变。
        </p>
        {back}
      </main>
    );
  }

  const parsed = GameDocumentSchema.safeParse(page.gameDocument);
  if (!parsed.success) {
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-6 py-16" data-play="broken">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">这一版钉住的游戏读不出来</h1>
        <ul className="flex flex-col gap-1">
          {parsed.error.issues.slice(0, 5).map((issue) => (
            <li key={`${issue.path.join('.')}-${issue.message}`} className="text-12 text-danger" data-play-issue>
              {issue.path.join('.') || 'document'}：{issue.message}
            </li>
          ))}
        </ul>
        <p className="text-11 text-fg-3">
          明说读不出来，比悄悄给一个空关卡诚实（§159）。这一版钉住的就是这些字节，重新发布才会换。
        </p>
        {back}
      </main>
    );
  }

  const document = parsed.data as GameDocument;
  const issues = validateGame(document);
  const plan = compileGame(document);
  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-4 px-6 py-8" data-play="live">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold" data-play-title>
            {plan.name}
          </h1>
          <p className="text-11 text-fg-3" data-play-pinned>
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
      <GamePlay plan={plan} />
      {/* §168：玩这一页就是一次真访问，心跳与作品页共用同一份口径 */}
      <VisitMeter path={path} />
    </main>
  );
}
