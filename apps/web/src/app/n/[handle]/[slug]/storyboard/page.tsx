import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StoryboardDocumentSchema } from '@nexus/schemas';
import { getPublishedPage } from '@/server/domain/publish';
import { ARROW_LABELS, CAMERA_LABELS, TRANSITION_LABELS } from '@/studio/storyboard-labels';
import { VisitMeter } from '../VisitMeter';

export const dynamic = 'force-dynamic';

/**
 * §40 × §56 公开分镜稿：`/n/<handle>/<slug>/storyboard`。
 *
 * 读的是**发布那一刻钉在 publication 行上的那份分镜**（迁移 0046，与 game_document
 * / ADR-0009 同一口径），不是作者的工作稿——否则昨天分享出去的分镜今天会换镜头。
 *
 * 这一页只呈现镜头表文本：本机没有接真实的视频 provider，也没有发布视频资产，
 * 所以这里**不**出现播放器，也不把镜头表说成"视频"（§159）。
 */

/** 毫秒读成秒：整秒不拖 ".0"，其余保留一位（3000 → "3 秒"，4500 → "4.5 秒"） */
function durationText(ms: number): string {
  const seconds = ms / 1000;
  return Number.isInteger(seconds) ? `${seconds} 秒` : `${seconds.toFixed(1)} 秒`;
}

export default async function PublicStoryboardPage({ params }: { params: Promise<{ handle: string; slug: string }> }) {
  const { handle, slug } = await params;
  const path = `/n/${decodeURIComponent(handle)}/${decodeURIComponent(slug)}`;
  const page = await getPublishedPage(path);
  if (!page) notFound();

  // §FE-8 只动视觉：ss-* 语义类叠加，结构/文案/data-storyboard-* 钩子/三态分支/读路径一字未改
  const back = (
    <Link href={path} className="ss-back ss-backInk" data-storyboard-back>
      回到作品页
    </Link>
  );

  if (page.storyboardDocument === null || page.storyboardDocument === undefined) {
    return (
      <main className="ss-root ss-empty ss-narrow" data-storyboard="none">
        <h1 className="ss-emptyTitle ss-h1xi">这一版没有分镜稿</h1>
        <p className="ss-body13" data-storyboard-none-reason>
          发布的时候这个项目还没有 §40 的分镜文档，所以这一版没钉住镜头表。
          这里不会拿作者现在的工作稿顶上——那是另一份东西，而且它随时在变。
        </p>
        {back}
      </main>
    );
  }

  const parsed = StoryboardDocumentSchema.safeParse(page.storyboardDocument);
  if (!parsed.success) {
    return (
      <main className="ss-root ss-empty ss-broken ss-narrow" data-storyboard="broken">
        <h1 className="ss-emptyTitle ss-h1xi">这一版钉住的分镜读不出来</h1>
        <ul className="ss-issues ss-list">
          {parsed.error.issues.slice(0, 5).map((issue) => (
            <li key={`${issue.path.join('.')}-${issue.message}`} className="ss-danger12" data-storyboard-issue>
              {issue.path.join('.') || 'document'}：{issue.message}
            </li>
          ))}
        </ul>
        <p className="ss-hint11">
          明说读不出来，比悄悄给一张空镜头表诚实（§159）。这一版钉住的就是这些字节，重新发布才会换。
        </p>
        {back}
      </main>
    );
  }

  const storyboard = parsed.data;
  const totalMs = storyboard.shots.reduce((sum, shot) => sum + shot.durationMs, 0);
  return (
    <main className="ss-root ss-live ss-wide880" data-storyboard="live">
      <header className="ss-header ss-headerCol">
        <div className="ss-titleRow">
          <h1 className="ss-title ss-h1xi" data-storyboard-title>
            {storyboard.title}
          </h1>
          {back}
        </div>
        <p className="ss-source ss-hint11" data-storyboard-source>
          {ARROW_LABELS[storyboard.source.arrow]}
          {storyboard.source.prompt.trim() ? ` ·「${storyboard.source.prompt}」` : ''}
        </p>
        <p className="ss-pinned ss-hint11" data-storyboard-pinned>
          {page.ownerName} 发布的第 {page.publication.version} 版 · 这一页读的是发布那一刻钉住的分镜头表，
          作者之后的改动不会跑到这个链接上
        </p>
      </header>

      {storyboard.shots.length ? (
        <ol className="ss-shots ss-shotsList">
          {storyboard.shots.map((shot, index) => (
            <li
              key={shot.id}
              className="ss-shot ss-shotPad"
              data-storyboard-shot
            >
              <p className="ss-shotMeta ss-mono11" data-storyboard-shot-meta>
                第 {index + 1} 镜 · {CAMERA_LABELS[shot.camera]} · {TRANSITION_LABELS[shot.transition]} ·{' '}
                {durationText(shot.durationMs)}
              </p>
              <p className="ss-shotPrompt ss-pre13Ink" data-storyboard-shot-prompt>
                {shot.prompt}
              </p>
              {shot.characterId || shot.referenceAssetId || shot.videoAssetId ? (
                <p className="ss-shotRefs ss-hint11" data-storyboard-shot-refs>
                  {[
                    shot.characterId ? '挂了本项目的一位角色' : null,
                    shot.referenceAssetId ? '挂了本项目的参考图' : null,
                    // 成片若存在也只被钉在分镜里，公开页不提供它的字节（资产门要求设计快照引用它）
                    shot.videoAssetId ? '挂了成片（公开页不提供播放）' : null,
                  ]
                    .filter((part): part is string => Boolean(part))
                    .join(' · ')}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="ss-shotsEmpty ss-body13" data-storyboard-empty>
          这一版的分镜还没有镜头——钉住的是一份空镜头表。
        </p>
      )}

      <p className="ss-total ss-mono11" data-storyboard-total>
        共 {storyboard.shots.length} 镜 · 合计 {durationText(totalMs)}
      </p>

      {storyboard.notes.length ? (
        <section className="ss-notes ss-list" data-storyboard-notes>
          <h2 className="ss-notesTitle ss-hint11">这份分镜的说明（投影时留下的解释与限度，原样保留）</h2>
          {storyboard.notes.map((note, index) => (
            <p key={`${index}-${note.slice(0, 24)}`} className="ss-pre12Ink">
              {note}
            </p>
          ))}
        </section>
      ) : null}

      <p className="ss-notice ss-hint11" data-storyboard-notice>
        这是分镜稿（镜头表），不是视频：这一版没有发布可播放的成片。发布时钉住的是这份镜头表本身，
        重新发布才会换。
      </p>
      <VisitMeter path={path} />
    </main>
  );
}
