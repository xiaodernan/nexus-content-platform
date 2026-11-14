import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getLocale } from '@/lib/i18n';
import { buildEphemeris, EPHEMERIS_DAYS } from '@/lib/ephemeris';
import { type WorldKind } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '世界切片 · NEXUS',
  description: '世界切片：按确定性投影读出这个项目的「这一年的每一天」。',
};

/**
 * 「世界切片」——把这个世界按「创世纪」投影成一册 daily folio。
 * 零 provider；零写库；同世界 → 同一年；零填白；只有落笔节点才有"这天"。
 * 只给项目作者（同 /world 门）。UI 双语（v728）；作者正文不翻译。
 */

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

const COPY = {
  zh: {
    title: '世界切片',
    ledeDefault: '同一份世界文档，同一卷 360 日投影。',
    ledeSecond: '这是这个项目的"创世年"——落笔的节点随机携来时间戳，投驻进 360 天，供你翻读。',
    footnote: '仅作者可见 · 零写库 · 全部内容来自 worlds.document 真的投影',
    counts: (days: number, entries: number) => `${days} 天有事 · ${entries} 则条目`,
    ariaEmpty: '空切片',
    ariaCalendar: '创世年',
    dayAria: (day: number, n: number) => `第 ${day} 天 · ${n} 则`,
    dayAriaQuiet: (day: number) => `第 ${day} 天 · 平静`,
    dayTitle: (n: number, titles: string) => `${n} 则：${titles}`,
    dayTitleQuiet: '这一天风和日丽',
    flowAria: '创世年全景',
    dayLabel: (day: number) => `第 ${day} 天`,
    emptyTitle: '这张创世书册还空着',
    emptyCopy: '还没有任何落笔节点——空白就是创世的初态。去 Studio 的世界面板写第一笔，这里就会长出第一天。',
    cta: '去 Studio 的世界面板写第一笔 →',
    footBack: '← 回到世界图',
    openCodex: '设定集 →',
    openChronicle: '编年 →',
  },
  en: {
    title: 'World ephemeris',
    ledeDefault: 'One document, one 360-day projection.',
    ledeSecond: 'This is the “Genesis year” of this project — your authored entries carry timestamps that land on a 360-day page you can flip through.',
    footnote: 'Author-only · zero writes · everything projected from the real world document',
    counts: (days: number, entries: number) => `${days} active day(s) · ${entries} entries`,
    ariaEmpty: 'Empty slice',
    ariaCalendar: 'Genesis year',
    dayAria: (day: number, n: number) => `Day ${day} · ${n} entries`,
    dayAriaQuiet: (day: number) => `Day ${day} · quiet`,
    dayTitle: (n: number, titles: string) => `${n} entries: ${titles}`,
    dayTitleQuiet: 'A quiet day',
    flowAria: 'Genesis atlas',
    dayLabel: (day: number) => `Day ${day}`,
    emptyTitle: 'This Book of Genesis is still empty',
    emptyCopy: 'No authored nodes at all — the blank page is creation’s default. Write the first line in Studio and the first day is born.',
    cta: 'Write the first line in Studio →',
    footBack: '← Back to the world',
    openCodex: 'Codex →',
    openChronicle: 'Chronicle →',
  },
} as const;

export default async function EphemerisPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  const locale = await getLocale();
  const c = COPY[locale];

  const worldOk = world && world.ok ? world.document : null;
  const entries = worldOk ? buildEphemeris(worldOk.nodes) : [];
  const entriesDisplay = locale === 'en'
    ? entries.map((entry) => ({ ...entry, kindLabel: KIND_LABEL_EN[entry.kind as WorldKind] ?? entry.kindLabel }))
    : entries;
  const byDay = new Map<number, typeof entriesDisplay>();
  for (const entry of entriesDisplay) {
    const arr = byDay.get(entry.day) ?? [];
    arr.push(entry);
    byDay.set(entry.day, arr);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  return (
    <main className="eph-root" data-ephemeris-root>
      <header className="eph-hero">
        <p className="eph-kicker" data-ephemeris-kicker>EPHEMERIS · {project.name}</p>
        <h1 className="eph-title">{c.title}</h1>
        <p className="eph-lede" data-ephemeris-lede>
          {worldOk && worldOk.summary?.trim() ? worldOk.summary.trim() : c.ledeDefault}
          {' '}{c.ledeSecond}
        </p>
        <p className="eph-footnote" data-ephemeris-footnote>{c.footnote}</p>
        <p className="eph-counts" data-ephemeris-counts>{c.counts(days.length, entries.length)}</p>
      </header>

      {entries.length === 0 ? (
        <section className="eph-empty" aria-label={c.ariaEmpty} data-ephemeris-empty>
          <p className="eph-emptyTitle">{c.emptyTitle}</p>
          <p className="eph-emptyCopy">{c.emptyCopy}</p>
          <Link className="am-linkImplicit" href={`/studio/${projectId}`} data-ephemeris-cta>{c.cta}</Link>
        </section>
      ) : (
        <>
          <nav className="eph-calendar" aria-label={c.ariaCalendar} data-ephemeris-calendar>
            {Array.from({ length: EPHEMERIS_DAYS }, (_, i) => i + 1).map((day) => {
              const dayEntries = byDay.get(day);
              return (
                <a
                  key={day}
                  href={dayEntries ? `#eph-day-${day}` : undefined}
                  className={dayEntries ? 'eph-day eph-dayLive' : 'eph-day'}
                  data-ephemeris-day={day}
                  aria-label={dayEntries ? c.dayAria(day, dayEntries.length) : c.dayAriaQuiet(day)}
                  title={dayEntries ? c.dayTitle(dayEntries.length, dayEntries.map((e) => e.title).join('、')) : c.dayTitleQuiet}
                >
                  <span className="eph-dayNum">{day}</span>
                  {dayEntries ? <span className="eph-dayCount">{dayEntries.length}</span> : null}
                </a>
              );
            })}
          </nav>

          <ol className="eph-flow" aria-label={c.flowAria} data-ephemeris-flow>
            {days.map((day) => {
              const dayEntries = byDay.get(day)!;
              return (
                <li key={day} id={`eph-day-${day}`} className="eph-daySection" data-ephemeris-day-section={day}>
                  <p className="eph-dayLabel">{c.dayLabel(day)}</p>
                  {dayEntries.map((entry) => (
                    <article key={entry.id} className="eph-entry" data-ephemeris-entry={entry.id}>
                      <div className="eph-entryHead">
                        <span className="eph-kindChip" data-ephemeris-kind>{entry.kindLabel}</span>
                        {entry.era ? <span className="eph-eraChip" data-ephemeris-era>{entry.era}</span> : null}
                      </div>
                      <p className="eph-entryTitle">{entry.title}</p>
                      <p className="eph-entryExcerpt">{entry.excerpt}</p>
                    </article>
                  ))}
                </li>
              );
            })}
          </ol>
        </>
      )}

      <footer className="eph-foot" data-ephemeris-foot>
        <Link className="am-linkImplicit" href={`/world/${projectId}`} data-ephemeris-back-graph>{c.footBack}</Link>
        <Link className="am-linkImplicit" href={`/world/${projectId}/codex`} data-ephemeris-open-codex>{c.openCodex}</Link>
        <Link className="am-linkImplicit" href={`/world/${projectId}/chronicle`} data-ephemeris-open-chronicle>{c.openChronicle}</Link>
      </footer>
    </main>
  );
}
