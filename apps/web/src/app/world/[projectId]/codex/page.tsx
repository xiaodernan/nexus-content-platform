import Link from 'next/link';
import { loadWorld } from '@/server/domain/worlds';
import { listCharacters } from '@/server/domain/characters';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { notFound } from 'next/navigation';
import { buildChronicle } from '@/lib/chronicle';
import { WORLD_KINDS, WORLD_KIND_LABELS, type WorldKind, type WorldNode } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '设定集 · NEXUS',
  description: '世界设定集：九类设定的落墨版本、世界编年、人物关系谱对账。',
};

/**
 * ⌘Codex — 「设定集」：世界文档的**纸面**投影——只给作者自己看的世界文档精装版。
 *
 * 编纂边界（§159 照实说）：本页只读投影，全部数据来自 worlds.document（§44）
 * 与 characters（§46）；不写库、不跑 provider、不补充一个假字。空闲条目写"还没人动笔"，
 * 不编造任何设定。只有项目作者可见（同 /world 的门）。
 */

const ZH_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

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

  const worldOk = world && world.ok ? world.document : null;
  const eras = worldOk ? buildChronicle(worldOk.nodes) : [];
  const chronicleEntries = eras.reduce((a, e) => a + e.entries.length, 0);

  const nodesByKind = new Map<WorldKind, WorldNode[]>();
  if (worldOk) {
    for (const node of worldOk.nodes) {
      const arr = nodesByKind.get(node.kind) ?? [];
      arr.push(node);
      nodesByKind.set(node.kind, arr);
    }
  }
  const counts = WORLD_KINDS.map((kind) => ({ kind, filled: nodesByKind.get(kind)?.filter(authored).length ?? 0, total: nodesByKind.get(kind)?.length ?? 0 }));
  const totalAuthored = counts.reduce((a, c) => a + c.filled, 0);

  return (
    <main className="cdx-root" data-codex-root>
      <header className="cdx-hero">
        <p className="cdx-kicker" data-codex-kicker>CODEX · {project.name}</p>
        <h1 className="cdx-title">设定集</h1>
        <p className="cdx-lede" data-codex-lede>
          {worldOk && worldOk.summary && worldOk.summary.trim().length > 0
            ? worldOk.summary.trim()
            : '九类设定装订成纸面册——模板骨架不是设定，动笔的才是世界。'}
        </p>
        <p className="cdx-footnote" data-codex-footnote>仅作者可见 · 全书来自 worlds / characters 真表 · 本页零写库</p>
        <p className="cdx-tocSummary" data-codex-summary>
          已落笔 {totalAuthored} 篇 · {eras.length} 个纪元 · {roster.items.length} 位角色
        </p>
      </header>

      <nav className="cdx-toc" aria-label="目录" data-codex-toc>
        <p className="cdx-tocTitle">目录</p>
        <ol className="cdx-tocList">
          {counts.map(({ kind, filled }, i) => (
            <li key={kind} className="cdx-tocItem">
              <a className="cdx-tocLink" href={`#cdx-chapter-${kind}`} data-codex-toc-item={kind}>
                <span className="cdx-tocChapter">第{ZH_NUM[i]}章</span>
                <span className="cdx-tocName">{WORLD_KIND_LABELS[kind]}</span>
                <span className="cdx-tocCount">{filled} 篇</span>
              </a>
            </li>
          ))}
          <li className="cdx-tocItem">
            <a className="cdx-tocLink" href="#cdx-chronicle" data-codex-toc-chronicle><span className="cdx-tocChapter">编</span><span className="cdx-tocName">世界编年</span><span className="cdx-tocCount">{chronicleEntries} 则</span></a>
          </li>
          <li className="cdx-tocItem">
            <a className="cdx-tocLink" href="#cdx-cast" data-codex-toc-cast><span className="cdx-tocChapter">星</span><span className="cdx-tocName">人物关系谱</span><span className="cdx-tocCount">{roster.items.length} 位</span></a>
          </li>
        </ol>
      </nav>

      {WORLD_KINDS.map((kind, i) => {
        const nodes = (nodesByKind.get(kind) ?? []).filter(authored);
        return (
          <section key={kind} id={`cdx-chapter-${kind}`} className="cdx-chapter" aria-label={`第${ZH_NUM[i]}章 ${WORLD_KIND_LABELS[kind]}`} data-codex-chapter={kind}>
            <div className="cdx-chapterHead">
              <span className="cdx-chapterNo">{String(i + 1).padStart(2, '0')}</span>
              <h2 className="cdx-chapterTitle">{WORLD_KIND_LABELS[kind]}</h2>
              <span className="cdx-chapterCount">{nodes.length} 篇</span>
            </div>
            {nodes.length === 0 ? (
              <p className="cdx-empty" data-codex-empty={kind}>还没人动笔——这一章还是模板骨架，写完后就会长出来。</p>
            ) : (
              nodes.map((node) => (
                <article key={node.id} className="cdx-entry" data-codex-entry={node.id}>
                  <h3 className="cdx-entryTitle">{node.title}</h3>
                  {paragraphs(node.body).map((p, j) => (
                    <p key={j} className={`cdx-para${j === 0 ? ' cdx-paraFirst' : ''}`}>{p}</p>
                  ))}
                </article>
              ))
            )}
          </section>
        );
      })}

      <section id="cdx-chronicle" className="cdx-chapter" aria-label="世界编年" data-codex-chronicle>
        <div className="cdx-chapterHead">
          <span className="cdx-chapterNo">编</span>
          <h2 className="cdx-chapterTitle">世界编年</h2>
          <span className="cdx-chapterCount">{chronicleEntries} 则</span>
        </div>
        {chronicleEntries === 0 ? (
          <p className="cdx-empty" data-codex-empty-chronicle>编年还是空白——去世界面板的「纪元」栏写一行，这里就会长出第一坛缝元。</p>
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

      <section id="cdx-cast" className="cdx-chapter" aria-label="人物关系谱" data-codex-cast>
        <div className="cdx-chapterHead">
          <span className="cdx-chapterNo">星</span>
          <h2 className="cdx-chapterTitle">人物关系谱</h2>
          <span className="cdx-chapterCount">{roster.items.length} 位</span>
        </div>
        {roster.items.length === 0 ? (
          <p className="cdx-empty" data-codex-empty-cast>还没有角色档案——星图读 §46 角色档案之间的关系，先去 Studio 的人物面板建几个人。</p>
        ) : (
          <>
            <ul className="cdx-castList" data-codex-cast-list>
              {roster.items.map((character) => (
                <li key={character.id} className="cdx-castItem" data-codex-cast-entry={character.id}>
                  <span className="cdx-castName">{character.profile.name || '（没有名字）'}</span>
                  {character.profile.identity ? <span className="cdx-castIdentity">{character.profile.identity}</span> : null}
                </li>
              ))}
            </ul>
            <p className="cdx-footnote">星图按角色关系读取，本页仅列名册——<Link href={`/world/${projectId}/constellation`} className="cdx-link" data-codex-open-constellation>打开星图 →</Link></p>
          </>
        )}
      </section>

      <footer className="cdx-foot" data-codex-foot>
        <Link className="am-linkImplicit" href={`/world/${projectId}`} data-codex-back-graph>← 回到世界图</Link>
        <Link className="cdx-link" href={`/world/${projectId}/chronicle`} data-codex-open-chronicle>完整编年 →</Link>
      </footer>
    </main>
  );
}
