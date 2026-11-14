import Link from 'next/link';
import { loadWorld } from '@/server/domain/worlds';
import { listCharacters } from '@/server/domain/characters';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { notFound } from 'next/navigation';
import { getLocale } from '@/lib/i18n';
import { buildChronicle } from '@/lib/chronicle';
import { WORLD_KINDS, WORLD_KIND_LABELS, type WorldKind, type WorldNode } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '设定集 · NEXUS',
  description: '世界设定集：九类设定的落墨版本、世界编年、人物关系谱对账。',
};

/**
 * 「设定集」：世界文档的**纸面**投影——只给作者自己看的世界文档精装版。
 *
 * 编簿边界（§159 镜像）：本页只读投影，全部数据来自 worlds.document（§14）
 * 与 characters（§46）；不写库、不跑 provider、不补充一个假字。空闲条目写"还没人动笔"，
 * 不编造任何设定。只有项目作者可见（同 /world 的门）。
 * 双语（v726）：locale 由 cookie 的 NEXUS_LOCALE 决定；作者正文不翻译。
 */

const ZH_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const EN_NUM = ['01', '02', '03', '04', '05', '06', '07', '08', '09'];

const COPY = {
  zh: {
    kickerSuffix: 'CODEX',
    title: '设定集',
    ledeDefault: '九类设定装订成纸面册——模板骨架不是设定，动笔的才是世界。',
    footnote: '仅作者可见 · 全书来自 worlds / characters 真表 · 本页零写库',
    tocTitle: '目录',
    tocAria: '目录',
    kindCount: (n: number) => `${n} 篇`,
    chronicleCount: (n: number) => `${n} 则`,
    castCount: (n: number) => `${n} 位`,
    tocChapterPrefix: (i: number) => `第${ZH_NUM[i]}章`,
    tocChapterTag: '纪',
    tocChronicleName: '世界编年',
    tocCastTag: '星',
    tocCastName: '人物关系谱',
    chapterNo: (i: number) => `第${ZH_NUM[i]}章`,
    chapterCount: (n: number) => `${n} 篇`,
    chapterEmpty: '还没人动笔——这一章还是模板骨架，写完后就会长出来。',
    chronicleTitle: '世界编年',
    chronicleNo: '纪',
    chronicleChapterNo: (i: number) => `第${ZH_NUM[i]}章`,
    chronicleAria: '世界编年',
    chronicleEmpty: '编年还是空白——去世界面板的「纶元」栏写一行，这里就会长出第一块纶元。',
    castAria: '人物关系谱',
    castTitle: '人物关系谱',
    castNo: '星',
    castEmpty: '还没有角色档案——星图读 §46 角色档案之间的关系，先去 Studio 的人物面板建几个人。',
    castFootnotePrefix: '星图按角色关系读取，本页仅列名册——',
    openConstellation: '打开星图 →',
    footBack: '← 回到世界图',
    footChronicle: '完整编年 →',
    footTide: '世界潮汐 →',
    unnamed: '（没有名字）',
    summary: (total: number, eras: number, chars: number) => `已落笔 ${total} 篇 · ${eras} 个纪元 · ${chars} 位角色`,
  },
  en: {
    kickerSuffix: 'CODEX',
    title: 'The Codex',
    ledeDefault: 'Nine strands bound as a paper tome — skeletons are not lore; what gets written is the world.',
    footnote: 'Author-only · everything from worlds / characters · zero writes',
    tocTitle: 'Contents',
    tocAria: 'Contents',
    kindCount: (n: number) => `${n} entries`,
    chronicleCount: (n: number) => `${n} entry(ies)`,
    castCount: (n: number) => `${n}`,
    tocChapterPrefix: (i: number) => `Ch.${EN_NUM[i]}`,
    tocChapterTag: 'Ann',
    tocChronicleName: 'World chronicle',
    tocCastTag: 'Cast',
    tocCastName: 'Character roster',
    chapterNo: (i: number) => `Ch.${EN_NUM[i]}`,
    chapterCount: (n: number) => `${n}`,
    chapterEmpty: 'Nobody has written yet — this chapter is still the template skeleton. Fill it and it grows.',
    chronicleTitle: 'World chronicle',
    chronicleNo: 'Ann',
    chronicleChapterNo: (i: number) => `Ch.${EN_NUM[i]}`,
    chronicleAria: 'World chronicle',
    chronicleEmpty: 'The chronicle is blank — write one line in the Studio world panel and the first era grows.',
    castAria: 'Character roster',
    castTitle: 'Character roster',
    castNo: 'Cast',
    castEmpty: 'No character profiles yet — the map reads §46 character-profile relationships; build some in Studio first.',
    castFootnotePrefix: 'The constellation reads character relationships; this page only lists names — ',
    openConstellation: 'Open the constellation →',
    footBack: '← Back to the world',
    footChronicle: 'Full chronicle →',
    footTide: 'World Tide →',
    unnamed: '(unnamed)',
    summary: (total: number, eras: number, chars: number) => `${total} written · ${eras} era(s) · ${chars} character(s)`,
  },
} as const;

const KIND_LABEL_EN: Record<WorldKind, string> = {
  lore: 'Lore',
  history: 'History',
  geography: 'Geography',
  factions: 'Factions',
  characters: 'Characters',
  creatures: 'Creatures',
  items: 'Items',
  quests: 'Quests',
  story: 'Story',
};

function authored(node: WorldNode): boolean {
  return node.body.trim().length > 0;
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default async function CodexPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [roster, world, project] = await Promise.all([
    listCharacters(projectId),
    loadWorld(projectId),
    loadDocument(projectId),
  ]);
  if (!project) notFound();

  const locale = await getLocale();
  const c = COPY[locale];


  const worldOk = world && world.ok ? world.document : null;
  const erasRaw = worldOk ? buildChronicle(worldOk.nodes) : [];
  const chronicleEntries = erasRaw.reduce((a, e) => a + e.entries.length, 0);
  const kindLabel = (kind: WorldKind): string => (locale === 'en' ? KIND_LABEL_EN[kind] : WORLD_KIND_LABELS[kind]);
  const eras = locale === 'en'
    ? erasRaw.map((era) => ({ ...era, entries: era.entries.map((entry) => ({ ...entry, kindLabel: KIND_LABEL_EN[entry.kind] ?? entry.kindLabel })) }))
    : erasRaw;

  const nodesByKind = new Map<WorldKind, WorldNode[]>();
  if (worldOk) {
    for (const node of worldOk.nodes) {
      const arr = nodesByKind.get(node.kind) ?? [];
      arr.push(node);
      nodesByKind.set(node.kind, arr);
    }
  }
  const counts = WORLD_KINDS.map((kind) => ({ kind, filled: nodesByKind.get(kind)?.filter(authored).length ?? 0, total: nodesByKind.get(kind)?.length ?? 0 }));
  const totalAuthored = counts.reduce((a, cc) => a + cc.filled, 0);

  return (
    <main className="cdx-root" data-codex-root>
      <header className="cdx-hero">
        <p className="cdx-kicker" data-codex-kicker>{c.kickerSuffix} · {project.name}</p>
        <h1 className="cdx-title">{c.title}</h1>
        <p className="cdx-lede" data-codex-lede>
          {worldOk && worldOk.summary && worldOk.summary.trim().length > 0
            ? worldOk.summary.trim()
            : c.ledeDefault}
        </p>
        <p className="cdx-footnote" data-codex-footnote>{c.footnote}</p>
        <p className="cdx-tocSummary" data-codex-summary>{c.summary(totalAuthored, eras.length, roster.items.length)}</p>
      </header>

      <nav className="cdx-toc" aria-label={c.tocAria} data-codex-toc>
        <p className="cdx-tocTitle">{c.tocTitle}</p>
        <ol className="cdx-tocList">
          {counts.map(({ kind, filled }, i) => (
            <li key={kind} className="cdx-tocItem">
              <a className="cdx-tocLink" href={`#cdx-chapter-${kind}`} data-codex-toc-item={kind}>
                <span className="cdx-tocChapter">{c.tocChapterPrefix(i)}</span>
                <span className="cdx-tocName">{kindLabel(kind)}</span>
                <span className="cdx-tocCount">{c.kindCount(filled)}</span>
              </a>
            </li>
          ))}
          <li className="cdx-tocItem">
            <a className="cdx-tocLink" href="#cdx-chronicle" data-codex-toc-chronicle>
              <span className="cdx-tocChapter">{c.tocChapterTag}</span>
              <span className="cdx-tocName">{c.tocChronicleName}</span>
              <span className="cdx-tocCount">{c.chronicleCount(chronicleEntries)}</span>
            </a>
          </li>
          <li className="cdx-tocItem">
            <a className="cdx-tocLink" href="#cdx-cast" data-codex-toc-cast>
              <span className="cdx-tocChapter">{c.tocCastTag}</span>
              <span className="cdx-tocName">{c.tocCastName}</span>
              <span className="cdx-tocCount">{c.castCount(roster.items.length)}</span>
            </a>
          </li>
        </ol>
      </nav>

      {WORLD_KINDS.map((kind, i) => {
        const nodes = (nodesByKind.get(kind) ?? []).filter(authored);
        return (
          <section key={kind} id={`cdx-chapter-${kind}`} className="cdx-chapter" aria-label={`${c.chapterNo(i)} ${kindLabel(kind)}`} data-codex-chapter={kind}>
            <div className="cdx-chapterHead">
              <span className="cdx-chapterNo">{String(i + 1).padStart(2, '0')}</span>
              <h2 className="cdx-chapterTitle">{kindLabel(kind)}</h2>
              <span className="cdx-chapterCount">{c.chapterCount(nodes.length)}</span>
            </div>
            {nodes.length === 0 ? (
              <p className="cdx-empty" data-codex-empty={kind}>{c.chapterEmpty}</p>
            ) : (
              nodes.map((node) => (
                <Link key={node.id} href={`/world/${projectId}/codex/${node.id}`} className="cdx-entryLink" data-codex-entry-link={node.id}>
                  <article className="cdx-entry" data-codex-entry={node.id}>
                    <h3 className="cdx-entryTitle">{node.title}</h3>
                    {paragraphs(node.body).map((p, j) => (
                      <p key={j} className={`cdx-para${j === 0 ? ' cdx-paraFirst' : ''}`}>{p}</p>
                    ))}
                    <span className="cdx-entryPeek" aria-hidden="true">Open →</span>
                  </article>
                </Link>
              ))
            )}
          </section>
        );
      })}

      <section id="cdx-chronicle" className="cdx-chapter" aria-label={c.chronicleAria} data-codex-chronicle>
        <div className="cdx-chapterHead">
          <span className="cdx-chapterNo">{c.chronicleNo}</span>
          <h2 className="cdx-chapterTitle">{c.chronicleTitle}</h2>
          <span className="cdx-chapterCount">{c.chronicleCount(chronicleEntries)}</span>
        </div>
        {chronicleEntries === 0 ? (
          <p className="cdx-empty" data-codex-empty-chronicle>{c.chronicleEmpty}</p>
        ) : (
          <ol className="cdx-eraList" data-codex-era-list>
            {eras.map((era, eraIdx) => (
              <li key={`${era.era}-${eraIdx}`} className="cdx-eraItem" data-codex-era={era.era}>
                <p className="cdx-eraName">{era.era}</p>
                <ol className="cdx-eraEntries">
                  {era.entries.map((entry) => (
                    <li key={entry.id} className="cdx-eraEntry" data-codex-era-entry={entry.id}>
                      <span className="cdx-eraEntryKind">{entry.kindLabel}</span>
                      <span className="cdx-eraEntryTitle">{entry.title}</span>
                      <time className="cdx-eraEntryTime" dateTime={entry.updatedAt}>{entry.updatedAt.slice(0, 10)}</time>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section id="cdx-cast" className="cdx-chapter" aria-label={c.castAria} data-codex-cast>
        <div className="cdx-chapterHead">
          <span className="cdx-chapterNo">{c.castNo}</span>
          <h2 className="cdx-chapterTitle">{c.castTitle}</h2>
          <span className="cdx-chapterCount">{c.castCount(roster.items.length)}</span>
        </div>
        {roster.items.length === 0 ? (
          <p className="cdx-empty" data-codex-empty-cast>{c.castEmpty}</p>
        ) : (
          <>
            <ul className="cdx-castList" data-codex-cast-list>
              {roster.items.map((character) => (
                <li key={character.id} className="cdx-castItem" data-codex-cast-entry={character.id}>
                  <span className="cdx-castName">{character.profile.name || c.unnamed}</span>
                  {character.profile.identity ? <span className="cdx-castIdentity">{character.profile.identity}</span> : null}
                </li>
              ))}
            </ul>
            <p className="cdx-footnote">{c.castFootnotePrefix}<Link href={`/world/${projectId}/constellation`} className="cdx-link" data-codex-open-constellation>{c.openConstellation}</Link></p>
          </>
        )}
      </section>

      <footer className="cdx-foot" data-codex-foot>
        <Link className="am-linkImplicit" href={`/world/${projectId}`} data-codex-back-graph>{c.footBack}</Link>
        <Link className="cdx-link" href={`/world/${projectId}/chronicle`} data-codex-open-chronicle>{c.footChronicle}</Link>
        <Link className="cdx-link" href={`/world/${projectId}/tide`} data-codex-open-tide>{c.footTide}</Link>
      </footer>
    </main>
  );
}
