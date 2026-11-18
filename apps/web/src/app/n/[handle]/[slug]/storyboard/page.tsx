import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StoryboardDocumentSchema } from '@nexus/schemas';
import { getPublishedPage } from '@/server/domain/publish';
import { ARROW_LABELS, ARROW_LABELS_EN, CAMERA_LABELS, CAMERA_LABELS_EN, TRANSITION_LABELS, TRANSITION_LABELS_EN } from '@/studio/storyboard-labels';
import { VisitMeter } from '../VisitMeter';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const fmtDuration = (ms: number, locale: Locale): string => {
  const s = ms / 1000;
  const base = Number.isInteger(s) ? `${s}` : s.toFixed(1);
  return locale === 'zh' ? `${base} 秒` : `${base}s`;
};

/**
 * 双语 COPY（2026-11-15 公开试玩面 wave）——en 逐字对应 zh；
 * ARROW/CAMERA/TRANSITION 三套成对标签：v755 的 `*_LABELS_EN` 按同序对齐，组件只选。
 */
const COPY: Record<Locale, {
  backToArtwork: string;
  noStoryboardTitle: string;
  noStoryboardLede: string;
  brokenTitle: string;
  brokenSuffix: string;
  brokenNote: string;
  pinnedLine: (owner: string, version: number) => string;
  shotMeta: (i: number, ms: number, camera: string, transition: string) => string;
  refCharacter: string;
  refImage: string;
  refVideo: string;
  shotsEmpty: string;
  totalLine: (n: number, ms: number) => string;
  notesHead: string;
  notice: string;
}> = {
  zh: {
    backToArtwork: '回到作品页',
    noStoryboardTitle: '这一版没有分镜稿',
    noStoryboardLede:
      '发布的时候这个项目还没有 §40 的分镜文档，所以这一版没钉住镜头表。这里不会拿作者现在的工作稿顶上——那是另一份东西，而且它随时在变。',
    brokenTitle: '这一版钉住的分镜读不出来',
    brokenSuffix: '：',
    brokenNote: '明说读不出来，比悄悄给一张空镜头表诚实（§159）。这一版钉住的就是这些字节，重新发布才会换。',
    pinnedLine: (owner, version) => `${owner} 发布的第 ${version} 版 · 这一页读的是发布那一刻钉住的分镜头表，作者之后的改动不会跑到这个链接上`,
    shotMeta: (i, ms, camera, transition) => `第 ${i} 镜 · ${camera} · ${transition} · ${fmtDuration(ms, 'zh')}`,
    refCharacter: '挂了本项目的一位角色',
    refImage: '挂了本项目的参考图',
    refVideo: '挂了成片（公开页不提供播放）',
    shotsEmpty: '这一版的分镜还没有镜头——钉住的是一份空镜头表。',
    totalLine: (n, ms) => `共 ${n} 镜 · 合计 ${fmtDuration(ms, 'zh')}`,
    notesHead: '这份分镜的说明（投影时留下的解释与限度，原样保留）',
    notice:
      '这是分镜稿（镜头表），不是视频：这一版没有发布可播放的成片。发布时钉住的是这份镜头表本身，重新发布才会换。',
  },
  en: {
    backToArtwork: 'Back to the work',
    noStoryboardTitle: 'This version has no storyboard',
    noStoryboardLede:
      'This project had no §40 storyboard at publish time, so no shot list was pinned for this version. The author’s current working draft is not substituted here — it is a different thing and it is always moving.',
    brokenTitle: 'The pinned storyboard could not be read',
    brokenSuffix: ': ',
    brokenNote:
      'Saying “cannot be read” is more honest than a quiet empty shot list (§159). This version pins exactly these bytes; only a republish will replace them.',
    pinnedLine: (owner, version) => `Version ${version}, published by ${owner} · this page reads the storyboard as pinned at publish time; later author edits never reach this link`,
    shotMeta: (i, ms, camera, transition) => `Shot ${i} · ${camera} · ${transition} · ${fmtDuration(ms, 'en')}`,
    refCharacter: 'a character from this project is attached',
    refImage: 'a reference image from this project is attached',
    refVideo: 'a final render is attached (playback withheld on this page)',
    shotsEmpty: 'This storyboard has no shots — an empty shot list was pinned.',
    totalLine: (n, ms) => `${n} shots · total ${fmtDuration(ms, 'en')}`,
    notesHead: 'This storyboard’s notes (explanations and limits left over from the projection, verbatim)',
    notice:
      'This is a storyboard (a shot list), not a video: no playable cut was published with this version. The pinned object is this shot list itself; only a republish will replace it.',
  },
};

/**
 * §40 × §56 公开分镜稿：`/n/<handle>/<slug>/storyboard`。
 *
 * 读的是**发布那一刻钉在 publication 行上的那份分镜**（迁移 0046，与 game_document
 * / ADR-0009 同一口径），不是作者的工作稿——否则昨天分享出去的分镜今天会换镜头。
 *
 * 这一页只呈现镜头表文本：本机没有接真实的视频 provider，也没有发布视频资产，
 * 所以这里**不**出现播放器，也不把镜头表说成"视频"（§159）。
 *
 * 双语（2026-11-15 公开试玩面 wave）：getLocale() 读；ARROW/CAMERA/TRANSITION 走 v755 的 `*_EN` 表。
 */
export default async function PublicStoryboardPage({ params }: { params: Promise<{ handle: string; slug: string }> }) {
  const { handle, slug } = await params;
  const locale = await getLocale();
  const c = COPY[locale];
  const CAMERA = locale === 'en' ? CAMERA_LABELS_EN : CAMERA_LABELS;
  const TRANSITION = locale === 'en' ? TRANSITION_LABELS_EN : TRANSITION_LABELS;
  const ARROW = locale === 'en' ? ARROW_LABELS_EN : ARROW_LABELS;
  const path = `/n/${decodeURIComponent(handle)}/${decodeURIComponent(slug)}`;
  const page = await getPublishedPage(path);
  if (!page) notFound();

  // §FE-8 只动视觉：ss-* 语义类叠加，结构/文案/data-storyboard-* 钩子/三态分支/读路径一字未改
  const back = (
    <Link href={path} className="ss-back ss-backInk" data-storyboard-back>
      {c.backToArtwork}
    </Link>
  );

  if (page.storyboardDocument === null || page.storyboardDocument === undefined) {
    return (
      <main className="ss-root ss-empty ss-narrow" data-storyboard="none">
        <h1 className="ss-emptyTitle ss-h1xi">{c.noStoryboardTitle}</h1>
        <p className="ss-body13" data-storyboard-none-reason>
          {c.noStoryboardLede}
        </p>
        {back}
      </main>
    );
  }

  const parsed = StoryboardDocumentSchema.safeParse(page.storyboardDocument);
  if (!parsed.success) {
    return (
      <main className="ss-root ss-empty ss-broken ss-narrow" data-storyboard="broken">
        <h1 className="ss-emptyTitle ss-h1xi">{c.brokenTitle}</h1>
        <ul className="ss-issues ss-list">
          {parsed.error.issues.slice(0, 5).map((issue) => (
            <li key={`${issue.path.join('.')}-${issue.message}`} className="ss-danger12" data-storyboard-issue>
              {issue.path.join('.') || 'document'}{c.brokenSuffix}{issue.message}
            </li>
          ))}
        </ul>
        <p className="ss-hint11">
          {c.brokenNote}
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
          {ARROW[storyboard.source.arrow]}
          {storyboard.source.prompt.trim() ? ` ·「${storyboard.source.prompt}」` : ''}
        </p>
        <p className="ss-pinned ss-hint11" data-storyboard-pinned>
          {c.pinnedLine(page.ownerName, page.publication.version)}
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
                {c.shotMeta(index + 1, shot.durationMs, CAMERA[shot.camera], TRANSITION[shot.transition])}
              </p>
              <p className="ss-shotPrompt ss-pre13Ink" data-storyboard-shot-prompt>
                {shot.prompt}
              </p>
              {shot.characterId || shot.referenceAssetId || shot.videoAssetId ? (
                <p className="ss-shotRefs ss-hint11" data-storyboard-shot-refs>
                  {[
                    shot.characterId ? c.refCharacter : null,
                    shot.referenceAssetId ? c.refImage : null,
                    // 成片若存在也只被钉在分镜里，公开页不提供它的字节（资产门要求设计快照引用它）
                    shot.videoAssetId ? c.refVideo : null,
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
          {c.shotsEmpty}
        </p>
      )}

      <p className="ss-total ss-mono11" data-storyboard-total>
        {c.totalLine(storyboard.shots.length, totalMs)}
      </p>

      {storyboard.notes.length ? (
        <section className="ss-notes ss-list" data-storyboard-notes>
          <h2 className="ss-notesTitle ss-hint11">{c.notesHead}</h2>
          {storyboard.notes.map((note, index) => (
            <p key={`${index}-${note.slice(0, 24)}`} className="ss-pre12Ink">
              {note}
            </p>
          ))}
        </section>
      ) : null}

      <p className="ss-notice ss-hint11" data-storyboard-notice>
        {c.notice}
      </p>
      <VisitMeter path={path} />
    </main>
  );
}
