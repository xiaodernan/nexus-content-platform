import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GameDocumentSchema } from '@nexus/schemas';
import { compileForKind, validateGame, type GameDocument } from '@nexus/game-model';
import { getPublishedPage } from '@/server/domain/publish';
import { describeProjection } from '@/play/PlayByKind';
import { PublicPlay } from '@/play/PublicPlay';
import { VisitMeter } from '../VisitMeter';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** 双语 COPY（2026-11-15 公开试玩面）——全屏三态文案。 */
const COPY: Record<Locale, {
  backToArtwork: string;
  noGameTitle: string;
  noGameLede: string;
  brokenTitle: string;
  brokenSuffix: string;
  brokenNote: string;
  pinnedLine: (owner: string, version: number) => string;
  issuesLine: (n: number, codes: string) => string;
}> = {
  zh: {
    backToArtwork: '回到作品',
    noGameTitle: '这一版没有可玩内容',
    noGameLede:
      '发布的时候这个项目还没有 §54 的游戏设计文档，所以这一版没钉住可玩的东西。这里不会拿作者现在的工作稿顶上——那是另一份东西，而且它随时在变。',
    brokenTitle: '这一版钉住的游戏读不出来',
    brokenSuffix: '：',
    brokenNote:
      '明说读不出来，比悄悄给一个空关卡诚实（§159）。这一版钉住的就是这些字节，重新发布才会换。',
    pinnedLine: (owner, version) => `${owner} 发布的第 ${version} 版 · 这一页玩的是发布那一刻钉住的游戏设计，作者之后的改动不会跑到这个链接上`,
    issuesLine: (n, codes) => `这份钉住的文档有 ${n} 条校验问题（${codes}）；能投影的部分照常可玩，不假装它是干净的。`,
  },
  en: {
    backToArtwork: 'Back to the work',
    noGameTitle: 'This version has no playable content',
    noGameLede:
      'This project had no §54 game design document at publish time, so nothing playable was pinned for this version. The author’s current working draft is not substituted here — it is a different thing and it is always moving.',
    brokenTitle: 'The pinned game could not be read',
    brokenSuffix: ': ',
    brokenNote:
      'Saying “cannot be read” is more honest than a quiet empty level (§159). This version pins exactly these bytes; only a republish will replace them.',
    pinnedLine: (owner, version) => `Version ${version}, published by ${owner} · this page plays the game design as pinned at publish time; later author edits never reach this link`,
    issuesLine: (n, codes) => `This pinned document has ${n} validation issue(s) (${codes}); whatever can still project remains playable, and it is not dressed up as clean.`,
  },
};

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
  const locale = await getLocale();
  const c = COPY[locale];
  const path = `/n/${decodeURIComponent(handle)}/${decodeURIComponent(slug)}`;
  const page = await getPublishedPage(path);
  if (!page) notFound();

  // §FE-7 只动视觉：pp-* 语义类叠加，结构/文案/data-play-* 钩子/三态分支/读路径一字未改
  const back = (
    <Link href={path} className="pp-back pp-backInk" data-play-back>
      {c.backToArtwork}
    </Link>
  );

  if (page.gameDocument === null || page.gameDocument === undefined) {
    return (
      <main className="pp-root pp-empty pp-narrow" data-play="none">
        <h1 className="pp-emptyTitle pp-h1xi">{c.noGameTitle}</h1>
        <p className="pp-body13">
          {c.noGameLede}
        </p>
        {back}
      </main>
    );
  }

  const parsed = GameDocumentSchema.safeParse(page.gameDocument);
  if (!parsed.success) {
    return (
      <main className="pp-root pp-empty pp-broken pp-narrow" data-play="broken">
        <h1 className="pp-emptyTitle pp-h1xi">{c.brokenTitle}</h1>
        <ul className="pp-list">
          {parsed.error.issues.slice(0, 5).map((issue) => (
            <li key={`${issue.path.join('.')}-${issue.message}`} className="pp-danger12" data-play-issue>
              {issue.path.join('.') || 'document'}{c.brokenSuffix}{issue.message}
            </li>
          ))}
        </ul>
        <p className="pp-hint11">
          {c.brokenNote}
        </p>
        {back}
      </main>
    );
  }

  const document = parsed.data as GameDocument;
  const issues = validateGame(document);
  const projection = compileForKind(document);
  return (
    <main className="pp-root pp-live pp-wide" data-play="live">
      <header className="pp-header pp-headerRow">
        <div className="pp-heading">
          <h1 className="pp-title pp-h1xi" data-play-title>
            {document.name}
          </h1>
          <p className="pp-subtitle pp-hint11" data-play-subtitle>
            {describeProjection(document, projection, locale)}
          </p>
          <p className="pp-pinned pp-hint11" data-play-pinned>
            {c.pinnedLine(page.ownerName, page.publication.version)}
          </p>
        </div>
        {back}
      </header>
      {issues.length ? (
        <p className="pp-issues pp-hint11" data-play-issues>
          {c.issuesLine(issues.length, issues.slice(0, 3).map((issue) => issue.code).join(' / '))}
        </p>
      ) : null}
      {/* §168：通关的那一声（"玩到了结局"）——只有公开可玩页报，作者自己的工作稿不报 */}
      <PublicPlay document={document} projection={projection} path={path} locale={locale} />
      {/* §168：玩这一页就是一次真访问，心跳与作品页共用同一份口径 */}
      <VisitMeter path={path} />
    </main>
  );
}
