import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { listCharacters } from '@/server/domain/characters';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { getLocale } from '@/lib/i18n';
import { buildChronicle, UNLABELED_ERA } from '@/lib/chronicle';
import { buildEraTies } from '@/lib/era-ties';
import { buildEphemeris, EPHEMERIS_DAYS } from '@/lib/ephemeris';
import { type WorldNode } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '世界速览 · NEXUS',
  description: '世界的四象限总览：星图 / 编年 / 设定集 / 切片，全部真实计数，纯投影、零 provider。',
};

/**
 * 「世界速览」(digest)——v710 §A 展望的落地（2026-11-14）。中英双语（v723）。
 *
 * 一个页面看四个世界投影：人物星图 / 世界编年 / 设定集 / 世界切片；每一个数字都是真值。
 * 「最近动过的设定」只是按 updatedAt 的排序投影，不是「重要度算法」。
 * 最近两条纶元：只认作者写了 era 的纶元，不把「未标纶元」算作最近发生——
 * 那是作者没取名的合辑，不是新剧情。
 *
 * 只有项目作者能进（与 /world、/chronicle、/codex 同一道门）。
 */

const COPY = {
  zh: {
    kicker: 'DIGEST',
    title: '世界速览',
    lede: '一个页面看完整个世界：人物星图、世界编年、设定集、世界切片——每一格都是真实计数，写了多少看多少。',
    footnote: '仅作者可见 · 全部数据来自 worlds / characters 真表 · 零 provider · 本页零写库',
    ariaQuad: '世界四象限',
    totalAuthored: (n: number) => `${n} 篇落笔`,
    authorCounts: (kinds: number, eras: number, chars: number) => `${kinds} 类 · ${eras} 个纶元 · ${chars} 位人物`,
    quad: {
      constellation: { kicker: '星图', title: '人物关系星图', count: (n: number) => `${n} 位人物`, hint: '关系线照你写的画，星辰不会多长出邻居', enter: '进入 →' },
      chronicle: { kicker: '编年', title: '世界编年', count: (entries: number, eras: number) => `${entries} 条 · ${eras} 个纶元`, hint: (n: number) => `本卷活跃 ${n} 人次（一跳 · id 精确命中）`, enter: '进入 →' },
      codex: { kicker: '设定集', title: '设定集', count: (n: number) => `${n} 篇设定`, hint: '设定的纸面投影——写了几章看几章', enter: '进入 →' },
      ephemeris: { kicker: '切片', title: '世界切片', count: (entries: number, days: number) => `${entries} 片 · ${days} 日`, hint: '同一文档 → 360 天，确定性取样，零随机', enter: '进入 →' },
    },
    erasPanelKicker: '最近的纶元',
    erasEmpty: '作者还没给任何纶元取名——去世界面板的「纶元」栏写一个，比如「灰灯纪」。',
    eraMeta: (entries: number, active: number) => `${entries} 条编年 · 星图活跃 ${active} 人`,
    lorePanelKicker: '最近动过的设定',
    loreEmpty: '还没人写过 lore——设定集第一章是模板骨架，落下第一笔这里就亮。',
    openChronicle: '完整编年 →',
    openCodex: '设定集 →',
    openConstellation: '人物星图 →',
    openTide: '世界潮汐 →',
    footBack: '← 回到世界图',
    emptyTitle: '速览打不开——世界读不出来',
    emptyCopy: (name: string) => `「${name}」的世界文档现在读不到，所以这里不画任何数字。先去 Studio 里检查世界面板，等世界确定能读，再回来。`,
    emptyLink: '回到 Studio 的世界面板 →',
    ariaEras: '最近的纶元',
    ariaLore: '最近动过的设定',
  },
  en: {
    kicker: 'DIGEST',
    title: 'World digest',
    lede: 'The whole world on one page: constellation, chronicle, codex, ephemeris — every cell is a real count, nothing estimated.',
    footnote: 'Author-only · all data from worlds / characters tables · zero provider · this page writes to nothing',
    ariaQuad: 'The four world views',
    totalAuthored: (n: number) => `${n} authored entries`,
    authorCounts: (kinds: number, eras: number, chars: number) => `${kinds} kinds · ${eras} eras · ${chars} characters`,
    quad: {
      constellation: { kicker: 'Constellation', title: 'Character star map', count: (n: number) => `${n} characters`, hint: 'Relationship lines drawn exactly as written — no invented neighbors', enter: 'Enter →' },
      chronicle: { kicker: 'Chronicle', title: 'World chronicle', count: (entries: number, eras: number) => `${entries} entries · ${eras} eras`, hint: (n: number) => `${n} figure-touches this era (one hop · exact id)`, enter: 'Enter →' },
      codex: { kicker: 'Codex', title: 'The codex', count: (n: number) => `${n} entries`, hint: 'The paper projection of your notes — however many chapters you wrote', enter: 'Enter →' },
      ephemeris: { kicker: 'Ephemeris', title: '360-day ephemeris', count: (entries: number, days: number) => `${entries} slices · ${days} days`, hint: 'One document → 360 days, deterministic sampling, zero randomness', enter: 'Enter →' },
    },
    erasPanelKicker: 'Recent eras',
    erasEmpty: 'No era has been named yet — open the Studio world panel, name one, e.g. “Ash Lantern Age”.',
    eraMeta: (entries: number, active: number) => `${entries} entries · ${active} present figure(s) touched`,
    lorePanelKicker: 'Recently touched notes',
    loreEmpty: 'No lore written yet — the codex opens with a skeleton; write the first line and this lights up.',
    openChronicle: 'Full chronicle →',
    openCodex: 'Codex →',
    openConstellation: 'Constellation →',
    openTide: 'World Tide →',
    footBack: '← Back to the world',
    emptyTitle: 'Digest can’t open — the world won’t load',
    emptyCopy: (name: string) => `「${name}」’s world document can’t be read right now, so no numbers here. Check the Studio world panel, confirm the world loads, then come back.`,
    emptyLink: 'Back to the Studio world panel →',
    ariaEras: 'Recent eras',
    ariaLore: 'Recently touched notes',
  },
} as const;

export default async function DigestPage({ params }: { params: Promise<{ projectId: string }> }) {
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
  const nodes: WorldNode[] = worldOk ? worldOk.nodes : [];
  const authoredNodes = nodes.filter((node) => node.body.trim().length > 0);
  const totalAuthored = authoredNodes.length;

  const eras = worldOk ? buildChronicle(nodes) : [];
  const ties = buildEraTies(
    eras.map((era) => ({ era: era.era, entries: era.entries.map((entry) => ({ id: entry.id })) })),
    roster.items,
  );
  const tiesByEra = new Map(ties.map((tie) => [tie.era, tie.linkedCharacters.length] as const));
  const eraEntries = eras.reduce((acc, era) => acc + era.entries.length, 0);
  const activeFigureVisits = ties.reduce((acc, tie) => acc + tie.linkedCharacters.length, 0);

  // 「最近两条纶元」——只认作者取了名字的纶元；合著的未标纶元不算新编年
  const namedEras = eras.filter((era) => era.era !== UNLABELED_ERA);
  const lastTwoEras = namedEras.slice(-2).reverse();

  // 「最近动过的设定」——updatedAt 倒序（缺失值排最后），平局按 title 字典序再按 id 兜底：确定性
  const recentLore = authoredNodes
    .filter((node) => node.kind === 'lore')
    .slice()
    .sort((a, b) => {
      const da = Date.parse(a.updatedAt ?? '') || 0;
      const db = Date.parse(b.updatedAt ?? '') || 0;
      if (db !== da) return db - da;
      const t = a.title.localeCompare(b.title);
      return t !== 0 ? t : a.id.localeCompare(b.id);
    })
    .slice(0, 3);

  const ephemerisEntries = worldOk ? buildEphemeris(nodes).length : 0;
  const kindCount = new Set(authoredNodes.map((node) => node.kind)).size;

  if (!worldOk) {
    // 世界读不出来：如实空白，不给假象
    return (
      <main className="dg-empty" data-digest-empty>
        <h1 className="dg-emptyTitle">{c.emptyTitle}</h1>
        <p className="dg-emptyCopy">{c.emptyCopy(project.name)}</p>
        <Link href={`/studio/${projectId}`} className="dg-emptyLink" data-digest-empty-studio>
          {c.emptyLink}
        </Link>
      </main>
    );
  }

  return (
    <main className="dg-root" data-digest-root>
      <header className="dg-hero">
        <p className="dg-kicker" data-digest-kicker>{c.kicker} · {project.name}</p>
        <h1 className="dg-title">{c.title}</h1>
        <p className="dg-lede" data-digest-lede>{c.lede}</p>
        <p className="dg-footnote" data-digest-footnote>{c.footnote}</p>
      </header>

      <div className="dg-counts" data-digest-counts>
        <span>{c.totalAuthored(totalAuthored)}</span>
        <span aria-hidden="true" className="dg-headDot">·</span>
        <span>{c.authorCounts(kindCount, eras.length, roster.items.length)}</span>
      </div>

      <section className="dg-grid" aria-label={c.ariaQuad} data-digest-quad>
        <Link className="dg-quad" href={`/world/${projectId}/constellation`} data-digest-quad-constellation>
          <p className="dg-quadKicker">{c.quad.constellation.kicker}</p>
          <h2 className="dg-quadTitle">{c.quad.constellation.title}</h2>
          <p className="dg-quadCount">{c.quad.constellation.count(roster.items.length)}</p>
          <p className="dg-quadHint">{c.quad.constellation.hint}</p>
          <span className="dg-quadEnter" aria-hidden="true">{c.quad.constellation.enter}</span>
        </Link>
        <Link className="dg-quad" href={`/world/${projectId}/chronicle`} data-digest-quad-chronicle>
          <p className="dg-quadKicker">{c.quad.chronicle.kicker}</p>
          <h2 className="dg-quadTitle">{c.quad.chronicle.title}</h2>
          <p className="dg-quadCount">{c.quad.chronicle.count(eraEntries, eras.length)}</p>
          <p className="dg-quadHint">{c.quad.chronicle.hint(activeFigureVisits)}</p>
          <span className="dg-quadEnter" aria-hidden="true">{c.quad.chronicle.enter}</span>
        </Link>
        <Link className="dg-quad" href={`/world/${projectId}/codex`} data-digest-quad-codex>
          <p className="dg-quadKicker">{c.quad.codex.kicker}</p>
          <h2 className="dg-quadTitle">{c.quad.codex.title}</h2>
          <p className="dg-quadCount">{c.quad.codex.count(totalAuthored)}</p>
          <p className="dg-quadHint">{c.quad.codex.hint}</p>
          <span className="dg-quadEnter" aria-hidden="true">{c.quad.codex.enter}</span>
        </Link>
        <Link className="dg-quad" href={`/world/${projectId}/ephemeris`} data-digest-quad-ephemeris>
          <p className="dg-quadKicker">{c.quad.ephemeris.kicker}</p>
          <h2 className="dg-quadTitle">{c.quad.ephemeris.title}</h2>
          <p className="dg-quadCount">{c.quad.ephemeris.count(ephemerisEntries, EPHEMERIS_DAYS)}</p>
          <p className="dg-quadHint">{c.quad.ephemeris.hint}</p>
          <span className="dg-quadEnter" aria-hidden="true">{c.quad.ephemeris.enter}</span>
        </Link>
      </section>

      <div className="dg-panels">
        <section className="dg-panel" data-digest-eras aria-label={c.ariaEras}>
          <p className="dg-panelKicker">{c.erasPanelKicker}</p>
          {lastTwoEras.length === 0 ? (
            <p className="dg-panelEmpty" data-digest-eras-empty>{c.erasEmpty}</p>
          ) : (
            <div className="dg-eraList">
              {lastTwoEras.map((era, i) => (
                <div key={`${era.era}-${i}`} className="dg-eraRow" data-digest-era={era.era}>
                  <p className="dg-eraName">{era.era}</p>
                  <p className="dg-eraMeta">{c.eraMeta(era.entries.length, tiesByEra.get(era.era) ?? 0)}</p>
                </div>
              ))}
            </div>
          )}
          <Link className="dg-panelLink" href={`/world/${projectId}/chronicle`} data-digest-open-chronicle>{c.openChronicle}</Link>
        </section>

        <section className="dg-panel" data-digest-lore aria-label={c.ariaLore}>
          <p className="dg-panelKicker">{c.lorePanelKicker}</p>
          {recentLore.length === 0 ? (
            <p className="dg-panelEmpty" data-digest-lore-empty>{c.loreEmpty}</p>
          ) : (
            <div className="dg-loreList">
              {recentLore.map((node) => (
                <div key={node.id} className="dg-loreRow" data-digest-lore-item={node.id}>
                  <p className="dg-loreTitle">{node.title}</p>
                  <time className="dg-loreTime" dateTime={node.updatedAt}>{(node.updatedAt ?? '').slice(0, 10)}</time>
                </div>
              ))}
            </div>
          )}
          <Link className="dg-panelLink" href={`/world/${projectId}/codex`} data-digest-open-codex>{c.openCodex}</Link>
        </section>
      </div>

      <footer className="dg-foot" data-digest-foot>
        <Link className="am-linkImplicit" href={`/world/${projectId}`} data-digest-back-graph>{c.footBack}</Link>
        <Link className="dg-panelLink" href={`/world/${projectId}/constellation`} data-digest-open-constellation>{c.openConstellation}</Link>
        <Link className="dg-panelLink" href={`/world/${projectId}/tide`} data-digest-open-tide>{c.openTide}</Link>
      </footer>
    </main>
  );
}
