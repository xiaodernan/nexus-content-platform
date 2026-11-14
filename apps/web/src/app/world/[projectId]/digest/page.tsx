import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { listCharacters } from '@/server/domain/characters';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { buildChronicle, UNLABELED_ERA } from '@/lib/chronicle';
import { buildEraTies } from '@/lib/era-ties';
import { buildEphemeris, EPHEMERIS_DAYS } from '@/lib/ephemeris';
import { WORLD_KINDS, type WorldNode } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '世界速览 · NEXUS',
  description: '世界的四象限总览：星图 / 编年 / 设定集 / 切片，全部真实计数，纯投影、零 provider。',
};

/**
 * 「世界速览」(digest)——v710 §A 展望的落地（2026-11-14）。
 *
 * 一个页面看四个世界投影：人物星图 / 世界编年 / 设定集 / 世界切片，
 * 全部数字从 worlds / characters 真表推出，不编造、不补假、不做假总结。
 * 「最近动过的设定」只是按 updatedAt 的排序投影，不是「重要度算法」。
 * 最近两条纶元：只认作者写了 era 的纶元，不把「未标纶元」算作最近发生——
 * 那是作者没取名的合辑，不是新剧情。
 *
 * 只有项目作者能进（与 /world、/chronicle、/codex 同一道门）。
 */
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
        <h1 className="dg-emptyTitle">速览打不开——世界读不出来</h1>
        <p className="dg-emptyCopy">
          「{project.name}」的世界文档现在读不到，所以这里不画任何数字。先去 Studio 里检查世界面板，等世界确定能读，再回来。
        </p>
        <Link href={`/studio/${projectId}`} className="dg-emptyLink" data-digest-empty-studio>
          回到 Studio 的世界面板 →
        </Link>
      </main>
    );
  }

  return (
    <main className="dg-root" data-digest-root>
      <header className="dg-hero">
        <p className="dg-kicker" data-digest-kicker>DIGEST · {project.name}</p>
        <h1 className="dg-title">世界速览</h1>
        <p className="dg-lede" data-digest-lede>
          一个页面看完整个世界：人物星图、世界编年、设定集、世界切片——每一格都是真实计数，写了多少看多少。
        </p>
        <p className="dg-footnote" data-digest-footnote>仅作者可见 · 全部数据来自 worlds / characters 真表 · 零 provider · 本页零写库</p>
      </header>

      <div className="dg-counts" data-digest-counts>
        <span>{totalAuthored} 篇落笔</span>
        <span aria-hidden="true" className="dg-headDot">·</span>
        <span>{kindCount} 类 · {eras.length} 个纶元 · {roster.items.length} 位人物</span>
      </div>

      <section className="dg-grid" aria-label="世界四象限" data-digest-quad>
        <Link className="dg-quad" href={`/world/${projectId}/constellation`} data-digest-quad-constellation>
          <p className="dg-quadKicker">星图</p>
          <h2 className="dg-quadTitle">人物关系星图</h2>
          <p className="dg-quadCount">{roster.items.length} 位人物</p>
          <p className="dg-quadHint">关系线照你写的画，星辰不会多长出邻居</p>
          <span className="dg-quadEnter" aria-hidden="true">进入 →</span>
        </Link>
        <Link className="dg-quad" href={`/world/${projectId}/chronicle`} data-digest-quad-chronicle>
          <p className="dg-quadKicker">编年</p>
          <h2 className="dg-quadTitle">世界编年</h2>
          <p className="dg-quadCount">{eraEntries} 条 · {eras.length} 个纶元</p>
          <p className="dg-quadHint">本卷活跃 {activeFigureVisits} 人次（一跳 · id 精确命中）</p>
          <span className="dg-quadEnter" aria-hidden="true">进入 →</span>
        </Link>
        <Link className="dg-quad" href={`/world/${projectId}/codex`} data-digest-quad-codex>
          <p className="dg-quadKicker">设定集</p>
          <h2 className="dg-quadTitle">设定集</h2>
          <p className="dg-quadCount">{totalAuthored} 篇设定</p>
          <p className="dg-quadHint">设定的纸面投影——写了几章看几章</p>
          <span className="dg-quadEnter" aria-hidden="true">进入 →</span>
        </Link>
        <Link className="dg-quad" href={`/world/${projectId}/ephemeris`} data-digest-quad-ephemeris>
          <p className="dg-quadKicker">切片</p>
          <h2 className="dg-quadTitle">世界切片</h2>
          <p className="dg-quadCount">{ephemerisEntries} 片 · {EPHEMERIS_DAYS} 日</p>
          <p className="dg-quadHint">同一文档 → 360 天，确定性取样，零随机</p>
          <span className="dg-quadEnter" aria-hidden="true">进入 →</span>
        </Link>
      </section>

      <div className="dg-panels">
        <section className="dg-panel" data-digest-eras aria-label="最近的纶元">
          <p className="dg-panelKicker">最近的纶元</p>
          {lastTwoEras.length === 0 ? (
            <p className="dg-panelEmpty" data-digest-eras-empty>
              作者还没给任何纶元取名——去世界面板的「纶元」栏写一个，比如「灰灯纪」。
            </p>
          ) : (
            <div className="dg-eraList">
              {lastTwoEras.map((era, i) => (
                <div key={`${era.era}-${i}`} className="dg-eraRow" data-digest-era={era.era}>
                  <p className="dg-eraName">{era.era}</p>
                  <p className="dg-eraMeta">
                    {era.entries.length} 条编年 · 星图活跃 {tiesByEra.get(era.era) ?? 0} 人
                  </p>
                </div>
              ))}
            </div>
          )}
          <Link className="dg-panelLink" href={`/world/${projectId}/chronicle`} data-digest-open-chronicle>完整编年 →</Link>
        </section>

        <section className="dg-panel" data-digest-lore aria-label="最近动过的设定">
          <p className="dg-panelKicker">最近动过的设定</p>
          {recentLore.length === 0 ? (
            <p className="dg-panelEmpty" data-digest-lore-empty>
              还没人写过 lore——设定集第一章是模板骨架，落下第一笔这里就亮。
            </p>
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
          <Link className="dg-panelLink" href={`/world/${projectId}/codex`} data-digest-open-codex>设定集 →</Link>
        </section>
      </div>

      <footer className="dg-foot" data-digest-foot>
        <Link className="am-linkImplicit" href={`/world/${projectId}`} data-digest-back-graph>← 回到世界图</Link>
        <Link className="dg-panelLink" href={`/world/${projectId}/constellation`} data-digest-open-constellation>人物星图 →</Link>
        <Link className="dg-panelLink" href={`/world/${projectId}/tide`} data-digest-open-tide>世界潮汐 →</Link>
      </footer>
    </main>
  );
}
