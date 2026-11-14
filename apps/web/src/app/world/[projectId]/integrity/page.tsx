import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadWorld } from '@/server/domain/worlds';
import { listCharacters } from '@/server/domain/characters';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { getLocale } from '@/lib/i18n';
import { buildChronicle, UNLABELED_ERA } from '@/lib/chronicle';
import { buildConstellation } from '@/lib/constellation';
import { WORLD_KINDS, type WorldKind, type WorldNode } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '世界体检 · NEXUS',
  description: '世界文档的全部真值指标——落笔/骨架/薄节点/未标纶元/未解析关系……不编造、不打分，只如实盘点。',
};

/**
 * 「世界体检」——作者打开世界时的体检单：
 * 不编造、不打分、不下结论；全部数字直接从 worlds / characters 真表算出来。
 * 每一项数字都可点过去消除它（Studio / chronicle / constellation / codex）。
 * 双语（v729）：locale 由 cookie NEXUS_LOCALE 决定；「体检」字义不变。
 */

const COPY = {
  zh: {
    kicker: 'CHECKUP',
    title: '世界体检',
    lede: '把这个世界的全部真值指标摊开来看一眼——没 magic、没给你打个分。每一行都是真数，每一项都可以点过去消除。',
    footnote: '仅作者可见 · 数字来自 worlds / characters 真表 · 零 provider · 本页零写库',
    authored: '已落笔',
    skeleton: '仍是模板',
    thin: '薄节点',
    untagged: '未标纶元',
    orderClash: 'order 撞号',
    unresolved: '未解析关系',
    namedEras: '纸面纶元',
    worldAnchors: '世界锚点',
    characters: '星图人物',
    emptyPalette: '缺色板',
    authoredSub: (kinds: number) => `${kinds} 类落过笔`,
    skeletonSub: '还没有一个字',
    thinSub: `< 120 字的落笔条目`,
    untaggedSub: 'story/history 条目未写 era',
    orderClashSub: '同一纶元里 order 相同的 story/history',
    unresolvedSub: '指向不存在的名字',
    namedErasSub: '作者取名的纶元',
    anchorsSub: '关系锚定在 world 条目上',
    charactersSub: (withRel: number) => `${withRel} 位有关系`,
    emptyPaletteSub: 'visualIdentity.palette 为空（星心回退品牌色）',
    goCodex: '去设定集 →',
    goStudio: '去 Studio →',
    goChronicle: '去编年 →',
    goConstellation: '去星图 →',
    openDigest: '世界速览 →',
    openTide: '世界潮汐 →',
    emptyTitle: '体检打不开——世界读不出来',
    emptyCopy: (name: string) => `「${name}」的世界文档现在读不到，所以这里不画任何指标。先去 Studio 检查世界面板，世界确定能读再回来。`,
    emptyLink: '回到 Studio 的世界面板 →',
  },
  en: {
    kicker: 'CHECKUP',
    title: 'World checkup',
    lede: 'Every true metric of this world laid out on one page — no magic, no score, no verdict. Each figure is real and each card links to where to fix it.',
    footnote: 'Author-only · numbers from worlds / characters · zero provider · zero writes',
    authored: 'Authored',
    skeleton: 'Skeleton only',
    thin: 'Thin notes',
    untagged: 'Untagged story/history',
    orderClash: 'Order collisions',
    unresolved: 'Unresolved links',
    namedEras: 'Named eras',
    worldAnchors: 'World anchors',
    characters: 'Cast on the map',
    emptyPalette: 'Empty palette',
    authoredSub: (kinds: number) => `${kinds} kind(s) with writing`,
    skeletonSub: 'still a blank template',
    thinSub: 'authored nodes < 120 chars',
    untaggedSub: 'story/history entries without an era',
    orderClashSub: 'story/history sharing era + order',
    unresolvedSub: 'relationships pointing at no name',
    namedErasSub: 'eras the author named',
    anchorsSub: 'anchored to world entries',
    charactersSub: (withRel: number) => `${withRel} with relationships`,
    emptyPaletteSub: 'visualIdentity.palette empty (brand fallback)',
    goCodex: 'Open codex →',
    goStudio: 'Open Studio →',
    goChronicle: 'Open chronicle →',
    goConstellation: 'Open constellation →',
    openDigest: 'World digest →',
    openTide: 'World Tide →',
    emptyTitle: 'Checkup can’t open — the world won’t load',
    emptyCopy: (name: string) => `「${name}」’s world document can’t be read right now, so no metrics here. Check the Studio world panel, confirm the world loads, then come back.`,
    emptyLink: 'Back to the Studio world panel →',
  },
} as const;

const EROSION_BODY_LIMIT = 120;

export default async function IntegrityPage({ params }: { params: Promise<{ projectId: string }> }) {
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

  if (!world || !world.ok) {
    return (
      <main className="ic-empty" data-integrity-empty>
        <h1 className="ic-emptyTitle">{c.emptyTitle}</h1>
        <p className="ic-emptyCopy">{c.emptyCopy(project.name)}</p>
        <Link href={`/studio/${projectId}`} className="ic-emptyLink" data-integrity-empty-studio>
          {c.emptyLink}
        </Link>
      </main>
    );
  }

  const nodes: WorldNode[] = world.document.nodes;
  const authored = nodes.filter((node) => node.body.trim().length > 0);
  const thin = authored.filter((node) => node.body.trim().length < EROSION_BODY_LIMIT);
  const eras = buildChronicle(nodes);
  const namedEras = eras.filter((era) => era.era !== UNLABELED_ERA).length;
  // 纶元顺序撞号：story/history 且 order 相同（非空 era 才算）
  const orderBucket = new Map<string, number>();
  for (const node of nodes) {
    if (node.kind !== 'story' && node.kind !== 'history') continue;
    const order = node.lore?.order;
    if (order === undefined || order === null) continue;
    const key = `${node.lore?.era ?? ''}|${order}`;
    orderBucket.set(key, (orderBucket.get(key) ?? 0) + 1);
  }
  let orderClash = 0;
  for (const count of orderBucket.values()) orderClash += Math.max(0, count - 1);

  const worldNodeLinks = nodes.map((node) => ({ id: node.id, title: node.title }));
  const graph = buildConstellation(roster.items, worldNodeLinks);
  const withRel = graph.nodes.filter((node) => node.degree > 0).length;
  const emptyPalette = roster.items.filter((char) => (char.profile.visualIdentity.palette ?? []).length === 0).length;

  const cards = [
    { key: 'authored', value: authored.length, title: c.authored, sub: c.authoredSub(new Set(authored.map((n) => n.kind)).size), href: `/world/${projectId}/codex`, linkText: c.goCodex, hook: 'authored' },
    { key: 'skeleton', value: nodes.length - authored.length, title: c.skeleton, sub: c.skeletonSub, href: `/studio/${projectId}`, linkText: c.goStudio, hook: 'skeleton' },
    { key: 'thin', value: thin.length, title: c.thin, sub: c.thinSub, href: `/world/${projectId}/codex`, linkText: c.goCodex, hook: 'thin' },
    { key: 'untagged', value: eras.find((era) => era.era === UNLABELED_ERA)?.entries.length ?? 0, title: c.untagged, sub: c.untaggedSub, href: `/world/${projectId}/chronicle`, linkText: c.goChronicle, hook: 'untagged' },
    { key: 'order-clash', value: orderClash, title: c.orderClash, sub: c.orderClashSub, href: `/world/${projectId}/chronicle`, linkText: c.goChronicle, hook: 'order-clash' },
    { key: 'unresolved', value: graph.unresolved.length, title: c.unresolved, sub: c.unresolvedSub, href: `/world/${projectId}/constellation`, linkText: c.goConstellation, hook: 'unresolved' },
    { key: 'named-eras', value: namedEras, title: c.namedEras, sub: c.namedErasSub, href: `/world/${projectId}/chronicle`, linkText: c.goChronicle, hook: 'named-eras' },
    { key: 'world-anchors', value: graph.worldAnchors.length, title: c.worldAnchors, sub: c.anchorsSub, href: `/world/${projectId}/constellation`, linkText: c.goConstellation, hook: 'world-anchors' },
    { key: 'characters', value: roster.items.length, title: c.characters, sub: c.charactersSub(withRel), href: `/world/${projectId}/constellation`, linkText: c.goConstellation, hook: 'characters' },
    { key: 'empty-palette', value: emptyPalette, title: c.emptyPalette, sub: c.emptyPaletteSub, href: `/studio/${projectId}`, linkText: c.goStudio, hook: 'empty-palette' },
  ];

  return (
    <main className="ic-root" data-integrity-root>
      <header className="ic-hero">
        <p className="ic-kicker" data-integrity-kicker>{c.kicker} · {project.name}</p>
        <h1 className="ic-title">{c.title}</h1>
        <p className="ic-lede" data-integrity-lede>{c.lede}</p>
        <p className="ic-footnote" data-integrity-footnote>{c.footnote}</p>
      </header>

      <div className="ic-grid">
        {cards.map((card) => (
          <section key={card.key} className="ic-card" data-integrity-card={card.hook} aria-label={card.title}>
            <p className="ic-cardValue">{card.value}</p>
            <p className="ic-cardTitle">{card.title}</p>
            <p className="ic-cardSub">{card.sub}</p>
            <Link className="ic-cardLink" href={card.href} data-integrity-go={card.hook}>{card.linkText}</Link>
          </section>
        ))}
      </div>

      <footer className="ic-foot" data-integrity-foot>
        <Link className="am-linkImplicit" href={`/world/${projectId}`} data-integrity-back-graph>← 回到世界图</Link>
        <Link className="ic-link" href={`/world/${projectId}/digest`} data-integrity-open-digest>{c.openDigest}</Link>
        <Link className="ic-link" href={`/world/${projectId}/tide`} data-integrity-open-tide>{c.openTide}</Link>
      </footer>
    </main>
  );
}
