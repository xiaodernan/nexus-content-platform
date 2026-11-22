import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { BIBLE_ECHOES } from '@/world-bible/generated';
import { buildEchoThreads } from '@/lib/echoThreads';

export const dynamic = 'force-dynamic';

/**
 * §ECHO-THREAD · 回响线索索引（/bible/threads）。
 *
 * 二百零九篇回响已经"大"了；这一页回答另一个问题——**它们之间是什么关系**。
 * 把同一件东西（潮印、盐账、夜钥匙、不写名的灯……）在多篇回响里的出现串成一条线，
 * 读者从任何一篇都能顺藤摸到另外几篇，而不是读完一篇就被扔回目录。
 *
 * 三条诚实边界（§159）：
 * - 每个数字都由 `buildEchoThreads` 从 generated.ts 现算，页面不存任何快照；
 * - 线索只列**逐字锚句**作证据，读者能自己翻回去核；
 * - 没有命中任何线索的回响如实计数为「未入线索」——不说成"无关"，只说这一轮线索表没覆盖到。
 */

const COPY: Record<Locale, {
  kicker: string;
  title: string;
  lede: (objects: number, places: number, scanned: number) => string;
  motifTitle: string;
  echoesIn: (n: number) => string;
  hits: (n: number) => string;
  anchorsTitle: string;
  anchorsOmitted: (n: number) => string;
  arcTitle: string;
  arcNote: (n: number) => string;
  orphanTitle: string;
  orphanNote: (n: number, scanned: number) => string;
  discipline: string;
  backBible: string;
  backGuide: string;
  echoLabel: (order: number) => string;
}> = {
  zh: {
    kicker: '§ECHO-THREAD · 线索',
    title: '回响线索索引',
    lede: (objects, places, scanned) =>
      `二百零九篇回响不是二百零九个孤岛。这里把「同一件东西被多篇写到」的现象串成 ` +
      `${objects} 条物件线索与 ${places} 条地方线索，扫过 ${scanned} 篇。每条线只列逐字锚句作证据——翻回去核。`,
    motifTitle: '线索',
    echoesIn: (n) => `出现在 ${n} 篇回响`,
    hits: (n) => `共 ${n} 处`,
    anchorsTitle: '带这条线索的锚句',
    anchorsOmitted: (n) => `另有 ${n} 条锚句未列出（正文里一戳就能打开）`,
    arcTitle: '线索簇',
    arcNote: (n) => `同一条线索里序号相差不超过 3 的回响算一簇；共 ${n} 簇。`,
    orphanTitle: '未入线索的回响',
    orphanNote: (n, scanned) => `${scanned} 篇里有 ${n} 篇没有命中任何一条线索。这不是"无关"——是这一轮手写线索表还没覆盖到它们。`,
    discipline: '索引由 generated.ts 现算，零 provider、零快照；同一次请求永远同一个结果。',
    backBible: '回典籍室',
    backGuide: '用户指南',
    echoLabel: (order) => `回响 · 其${order}`,
  },
  en: {
    kicker: '§ECHO-THREAD · threads',
    title: 'Echo threads',
    lede: (objects, places, scanned) =>
      `Two hundred and nine echoes are not two hundred and nine islands. Here "the same named thing, written about in more than one echo" becomes ${objects} object threads and ${places} place threads across ${scanned} echoes. Each thread cites verbatim anchors — go and check.`,
    motifTitle: 'threads',
    echoesIn: (n) => `appears in ${n} echoes`,
    hits: (n) => `${n} mentions`,
    anchorsTitle: 'Anchors carrying this thread',
    anchorsOmitted: (n) => `${n} more anchors not listed (open the echo and read them)`,
    arcTitle: 'Thread arcs',
    arcNote: (n) => `Echoes within 3 of each other count as one arc; ${n} arcs in total.`,
    orphanTitle: 'Echoes on no thread',
    orphanNote: (n, scanned) => `${n} of ${scanned} echoes match no thread. That is not "unrelated" — this hand-written motif table simply does not cover them yet.`,
    discipline: 'Computed live from generated.ts: zero provider, zero snapshot; same request, same answer.',
    backBible: 'Back to the Hall of Canon',
    backGuide: 'User guide',
    echoLabel: (order) => `Echo ${order}`,
  },
};

export const metadata: Metadata = {
  title: '回响线索索引 · Echo threads — NEXUS',
  description:
    '把二百零九篇回响按同一件东西串成线：潮印、盐账、夜钥匙、不写名的灯……每条线只列逐字锚句作证据。',
};


export default async function EchoThreadsPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const index = buildEchoThreads(BIBLE_ECHOES);
  const titleByOrder = new Map(BIBLE_ECHOES.map((e) => [e.order, e] as const));

  return (
    <main className="et-root" data-echo-threads data-echo-threads-locale={locale}>
      <header className="et-head">
        <p className="et-kicker">{c.kicker}</p>
        <h1 className="et-title">{c.title}</h1>
        <p className="et-lede">{c.lede(index.objects, index.places, index.scanned)}</p>
      </header>

      <ol className="et-list" data-echo-thread-list>
        {index.motifs.map((m) => (
          <li key={m.id} className="et-card" data-echo-thread={m.id}>
            <div className="et-cardHead">
              <h2 className="et-cardTitle">{locale === 'en' ? m.labelEn : m.labelZh}</h2>
              <p className="et-cardMeta">
                <span data-echo-thread-echoes>{c.echoesIn(m.echoes.length)}</span>
                <span className="et-dot" aria-hidden="true">·</span>
                <span data-echo-thread-hits>{c.hits(m.hits)}</span>
              </p>
            </div>
            <ul className="et-echoes" data-echo-thread-refs>
              {m.echoes.map((order) => {
                const echo = titleByOrder.get(order);
                if (!echo) return null;
                return (
                  <li key={order} className="et-echoChip">
                    <Link href={`/bible/${echo.slug}`} className="et-echoLink" data-echo-thread-open={order}>
                      <span className="et-echoNum">{c.echoLabel(order)}</span>
                      <span className="et-echoName">{locale === 'en' ? echo.titleEn : echo.titleZh}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {m.anchors.length ? (
              <div className="et-anchors">
                <p className="et-anchorsTitle">{c.anchorsTitle}</p>
                <ul className="et-anchorList" data-echo-thread-anchors>
                  {m.anchors.map((a, i) => (
                    <li key={`${a.echo}-${i}`} className="et-anchor" data-echo-thread-anchor={a.echo}>
                      <span className="et-anchorEcho">{c.echoLabel(a.echo)}</span>
                      <q className="et-anchorQuote">{locale === 'en' ? a.en : a.zh}</q>
                    </li>
                  ))}
                </ul>
                {m.anchorsOmitted > 0 ? (
                  <p className="et-anchorsMore" data-echo-thread-omitted>{c.anchorsOmitted(m.anchorsOmitted)}</p>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <section className="et-section" data-echo-thread-arcs>
        <h2 className="et-sectionTitle">{c.arcTitle}</h2>
        <p className="et-note">{c.arcNote(index.motifs.reduce((n, m) => n + m.arcs.length, 0))}</p>
        <ul className="et-arcList">
          {index.motifs.flatMap((m) =>
            m.arcs.map((arc) => (
              <li key={`${m.id}-${arc.from}`} className="et-arc" data-echo-arc={`${m.id}-${arc.from}-${arc.to}`}>
                <span className="et-arcLabel">{locale === 'en' ? m.labelEn : m.labelZh}</span>
                <span className="et-arcRange">
                  {arc.from === arc.to ? c.echoLabel(arc.from) : `${c.echoLabel(arc.from)} – ${c.echoLabel(arc.to)}`}
                </span>
                <span className="et-arcSize">{arc.size}</span>
              </li>
            )),
          )}
        </ul>
      </section>

      <section className="et-section" data-echo-thread-orphans>
        <h2 className="et-sectionTitle">{c.orphanTitle}</h2>
        <p className="et-note">{c.orphanNote(index.orphans.length, index.scanned)}</p>
      </section>

      <footer className="et-foot">
        <p className="et-discipline">{c.discipline}</p>
        <div className="et-footLinks">
          <Link href="/bible" className="et-footLink" data-echo-threads-back-bible>{c.backBible}</Link>
          <Link href="/guide" className="et-footLink" data-echo-threads-back-guide>{c.backGuide}</Link>
        </div>
      </footer>
    </main>
  );
}
