import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WORLD_KIND_LABELS, WORLD_KIND_LABELS_EN, type WorldKind } from '@nexus/world-model';
import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { getLocale } from '@/lib/i18n';
import { buildWorldNetwork } from '@/lib/worldNetwork';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '万象脉络 · NEXUS',
        description: '把世界的节点与关系投影成权力骨架：枢纽、势力团、割边与跨类关系——全部从真实数据算出。',
      }
    : {
        title: 'World Network — NEXUS',
        description: 'The world’s nodes and relations projected as a power skeleton: hubs, factions, bridges and cross-section relations — all computed from real data.',
      };
}

/**
 * §WORLD-NET「万象脉络」——九类条目与有向关系构成的骨架。
 * 四块全是真演算（lib/worldNetwork.ts 的纯函数）：
 *  枢纽榜（入+出度）、强连通分量（互相可达的势力团）、桥（删了就断的关节）、跨类关系聚合。
 * 零 provider、零写库；世界读不出来就如实空白，不画任何数字。
 */
const COPY = {
  zh: {
    kicker: '万象脉络',
    title: '万象脉络',
    lede: '谁是这个世界的中心、哪几条关系是关节、哪些条目互相纠缠成一团——从真实的关系边算出的骨架，不是编的叙事。',
    footnote: '仅作者可见 · 数据来自世界文档的节点与关系 · 零 provider · 本页不写任何东西',
    stats: (nodes: number, links: number, comps: number) => `${nodes} 条目 · ${links} 关系 · ${comps} 块连通`,
    hubsTitle: '枢纽榜',
    hubsHint: '入度 = 被多少关系指向；出度 = 指向多少人。两者之和排序，权力中心浮到上面。',
    hubsEmpty: '还没有关系边——往世界里连几条线，这里就会排出谁处在中心。',
    hubIn: (n: number) => `入 ${n}`,
    hubOut: (n: number) => `出 ${n}`,
    cliquesTitle: '势力团',
    cliquesHint: '强连通分量：这一簇里任意两点都能互相走到。互相纠缠的条目抱成一团。',
    cliquesEmpty: '没有互相可达的条目团：现在的关系都是单向的路，不是闭合的环。',
    cliqueSize: (n: number) => `${n} 个条目互相可达`,
    bridgesTitle: '关节（割边）',
    bridgesHint: '删掉这条关系，世界就多裂成一块。它是叙事上"一断全散"的那根线。',
    bridgesEmpty: '没有割边：每一条关系都处在某个环里，删掉任一条都还连得起来。',
    cutsTitle: '关节（割点）',
    cutsHint: '去掉这个条目本身，它所在的关系网会裂成几块——比"断一条线"更重的位置。',
    cutsEmpty: '没有割点：去掉任何一个条目，剩下的关系仍然连成一片。',
    cutsParts: (n: number) => `裂成 ${n} 块`,
    cutsDegree: (n: number) => `${n} 条关系`,
    crossTitle: '跨类关系',
    crossHint: '按关系标签聚合不同类别之间的连线——人物向势力效忠、势力向人物结怨，都在这里。',
    crossEmpty: '还没有跨类别的关系——同类条目之间的连线不进这张表。',
    crossCount: (n: number) => `${n} 条`,
    isolatedTitle: '孤悬条目',
    isolatedHint: '没有任何关系连到它们——在世界里还只是孤岛。',
    footBack: '← 回到世界图',
    footDigest: '世界速览 →',
    emptyTitle: '脉络打不开——世界读不出来',
    emptyCopy: (name: string) => `「${name}」的世界文档现在读不到，所以这里不画任何数字。先去 Studio 里检查世界面板，等世界确定能读，再回来。`,
    emptyLink: '回到 Studio 的世界面板 →',
  },
  en: {
    kicker: 'NETWORK',
    title: 'World network',
    lede: 'Who sits at the center, which ties are load-bearing, which entries are tangled together — a skeleton computed from real relationship edges, not invented lore.',
    footnote: 'Author-only · data from the world document’s nodes and links · zero provider · this page writes to nothing',
    stats: (nodes: number, links: number, comps: number) => `${nodes} entries · ${links} links · ${comps} connected part(s)`,
    hubsTitle: 'Hubs',
    hubsHint: 'In-degree = how many links point here; out-degree = how many it points to. Sorted by their sum — the centers rise.',
    hubsEmpty: 'No links yet — connect a few entries in your world and the centers will appear here.',
    hubIn: (n: number) => `in ${n}`,
    hubOut: (n: number) => `out ${n}`,
    cliquesTitle: 'Cliques',
    cliquesHint: 'Strongly connected components: every point in a cluster can reach every other. Tangled entries cling together.',
    cliquesEmpty: 'No mutually reachable clusters: every link is still a one-way road, not a closed loop.',
    cliqueSize: (n: number) => `${n} mutually reachable entries`,
    bridgesTitle: 'Bridges (cut edges)',
    bridgesHint: 'Remove this link and the world splits one more way — the thread that holds everything together.',
    bridgesEmpty: 'No bridges: every link sits in a cycle, so removing any one still leaves the graph connected.',
    cutsTitle: 'Joints (cut vertices)',
    cutsHint: 'Remove this entry itself and the network around it splits into pieces — heavier than cutting a single thread.',
    cutsEmpty: 'No cut vertices: removing any one entry still leaves the rest connected.',
    cutsParts: (n: number) => `splits into ${n}`,
    cutsDegree: (n: number) => `${n} links`,
    crossTitle: 'Cross-kind ties',
    crossHint: 'Links between different kinds, grouped by label — a character pledging to a faction, a faction feuding with a character.',
    crossEmpty: 'No cross-kind links — ties between entries of the same kind are not listed here.',
    crossCount: (n: number) => `${n} link(s)`,
    isolatedTitle: 'Isolated entries',
    isolatedHint: 'No link touches them — still islands in the world.',
    footBack: '← Back to the world',
    footDigest: 'World digest →',
    emptyTitle: 'Network can’t open — the world won’t load',
    emptyCopy: (name: string) => `“${name}”’s world document can’t be read right now, so no numbers here. Check the Studio world panel, confirm the world loads, then come back.`,
    emptyLink: 'Back to the Studio world panel →',
  },
} as const;

function kindLabel(kind: string, locale: 'zh' | 'en'): string {
  const table = locale === 'zh' ? WORLD_KIND_LABELS : WORLD_KIND_LABELS_EN;
  return table[kind as WorldKind] ?? kind;
}

export default async function NetworkPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();
  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();
  const locale = await getLocale();
  const c = COPY[locale];
  const doc = world && world.ok ? world.document : null;

  if (!doc) {
    return (
      <main className="nw-page" data-network-empty>
        <p className="nw-kicker">{c.kicker}</p>
        <h1 className="nw-title">{c.emptyTitle}</h1>
        <p className="nw-lede">{c.emptyCopy(project.name ?? projectId)}</p>
        <Link className="nw-link" href={`/studio/${projectId}`}>{c.emptyLink}</Link>
      </main>
    );
  }

  const net = buildWorldNetwork(doc);
  const titleOf = new Map(doc.nodes.map((n) => [n.id, n.title]));

  return (
    <main className="nw-page" data-network-root>
      <p className="nw-kicker">{c.kicker}</p>
      <h1 className="nw-title">{c.title}</h1>
      <p className="nw-lede">{c.lede}</p>
      <p className="nw-footnote">{c.footnote}</p>
      <p className="nw-stats" data-network-stats>{c.stats(net.nodeCount, net.linkCount, net.weakComponents)}</p>

      <div className="nw-grid">
        <section className="nw-panel" data-network-hubs aria-label={c.hubsTitle}>
          <h2 className="nw-panelTitle">{c.hubsTitle}</h2>
          <p className="nw-hint">{c.hubsHint}</p>
          {net.hubs.length === 0 ? (
            <p className="nw-empty" data-network-hubs-empty>{c.hubsEmpty}</p>
          ) : (
            <ol className="nw-hubList">
              {net.hubs.map((h, i) => (
                <li key={h.id} className="nw-hub" data-network-hub={h.id}>
                  <span className="nw-rank">{i + 1}</span>
                  <span className="nw-hubMain">
                    <span className="nw-hubTitle">{h.title}</span>
                    <span className="nw-hubKind">{kindLabel(h.kind, locale)}</span>
                  </span>
                  <span className="nw-degrees">
                    <span className="nw-in">{c.hubIn(h.in)}</span>
                    <span className="nw-out">{c.hubOut(h.out)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="nw-panel" data-network-cliques aria-label={c.cliquesTitle}>
          <h2 className="nw-panelTitle">{c.cliquesTitle}</h2>
          <p className="nw-hint">{c.cliquesHint}</p>
          {net.cliques.filter((x) => x.strong).length === 0 ? (
            <p className="nw-empty" data-network-cliques-empty>{c.cliquesEmpty}</p>
          ) : (
            <ul className="nw-cliqueList">
              {net.cliques.filter((x) => x.strong).map((x) => (
                <li key={x.members.join(',')} className="nw-clique" data-network-clique={x.members.length}>
                  <p className="nw-cliqueCount">{c.cliqueSize(x.members.length)}</p>
                  <p className="nw-cliqueMembers">{x.members.map((id) => titleOf.get(id) ?? id).join(' · ')}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="nw-panel" data-network-bridges aria-label={c.bridgesTitle}>
          <h2 className="nw-panelTitle">{c.bridgesTitle}</h2>
          <p className="nw-hint">{c.bridgesHint}</p>
          {net.bridges.length === 0 ? (
            <p className="nw-empty" data-network-bridges-empty>{c.bridgesEmpty}</p>
          ) : (
            <ul className="nw-bridgeList">
              {net.bridges.map((b) => (
                <li key={`${b.from}-${b.to}-${b.label}`} className="nw-bridge" data-network-bridge={`${b.from}-${b.to}`}>
                  <span className="nw-bridgeEnds">{titleOf.get(b.from) ?? b.from} → {titleOf.get(b.to) ?? b.to}</span>
                  <span className="nw-bridgeLabel">{b.label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="nw-panel" data-network-cross aria-label={c.crossTitle}>
          <h2 className="nw-panelTitle">{c.crossTitle}</h2>
          <p className="nw-hint">{c.crossHint}</p>
          {net.crossKind.length === 0 ? (
            <p className="nw-empty" data-network-cross-empty>{c.crossEmpty}</p>
          ) : (
            <ul className="nw-crossList">
              {net.crossKind.map((e) => (
                <li key={e.label} className="nw-cross" data-network-cross={e.label}>
                  <span className="nw-crossLabel">{e.label}</span>
                  <span className="nw-crossCount">{c.crossCount(e.count)}</span>
                  <span className="nw-crossPairs">{e.pairs.map((p) => `${kindLabel(p.fromKind, locale)}→${kindLabel(p.toKind, locale)} ${p.count}`).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="nw-panel nw-cutPanel" data-network-cuts aria-label={c.cutsTitle}>
          <h2 className="nw-panelTitle">{c.cutsTitle}</h2>
          <p className="nw-hint">{c.cutsHint}</p>
          {net.cutVertices.length === 0 ? (
            <p className="nw-empty" data-network-cuts-empty>{c.cutsEmpty}</p>
          ) : (
            <ul className="nw-bridgeList nw-cutList">
              {net.cutVertices.map((v) => (
                <li key={v.id} className="nw-bridge" data-network-cut={v.id}>
                  <span className="nw-bridgeEnds">{titleOf.get(v.id) ?? v.id}</span>
                  <span className="nw-bridgeLabel">{c.cutsParts(v.parts)} · {c.cutsDegree(v.degree)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {net.isolated.length ? (
        <section className="nw-panel nw-isolated" data-network-isolated aria-label={c.isolatedTitle}>
          <h2 className="nw-panelTitle">{c.isolatedTitle}</h2>
          <p className="nw-hint">{c.isolatedHint}</p>
          <p className="nw-isoNames">{net.isolated.map((id) => titleOf.get(id) ?? id).join(' · ')}</p>
        </section>
      ) : null}

      <footer className="nw-foot" data-network-foot>
        <Link className="nw-link" href={`/world/${projectId}`}>{c.footBack}</Link>
        <Link className="nw-link" href={`/world/${projectId}/digest`}>{c.footDigest}</Link>
      </footer>
    </main>
  );
}
