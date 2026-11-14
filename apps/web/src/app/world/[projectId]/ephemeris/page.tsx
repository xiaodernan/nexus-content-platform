import { loadWorld } from '@/server/domain/worlds';
import { loadDocument } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { requireUser } from '@/server/domain/session';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buildEphemeris, EPHEMERIS_DAYS } from '@/lib/ephemeris';
import { WORLD_KIND_LABELS } from '@nexus/world-model';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '世界切片 · NEXUS',
  description: '世界切片：按确定性投影读出这个项目的「这一年的每一天」。',
};

/**
 * 世界切片——把这个世界按"创世年"投影为一卷 daily 演算 folio。
 * 零 provider；零写库；同世界 → 同一年；零填白；只有落笔节点才有"这天"。
 * 只给项目作者（同 /world 门）。
 */
export default async function EphemerisPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  if (!(await projectVisibleTo(projectId, user.id))) notFound();

  const [world, project] = await Promise.all([loadWorld(projectId), loadDocument(projectId)]);
  if (!project) notFound();

  const worldOk = world && world.ok ? world.document : null;
  const entries = worldOk ? buildEphemeris(worldOk.nodes) : [];
  const byDay = new Map<number, typeof entries>();
  for (const entry of entries) {
    const arr = byDay.get(entry.day) ?? [];
    arr.push(entry);
    byDay.set(entry.day, arr);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  return (
    <main className="eph-root" data-ephemeris-root>
      <header className="eph-hero">
        <p className="eph-kicker" data-ephemeris-kicker>EPHEMERIS · {project.name}</p>
        <h1 className="eph-title">世界切片</h1>
        <p className="eph-lede" data-ephemeris-lede>
          {worldOk && worldOk.summary?.trim() ? worldOk.summary.trim() : '同一份世界文档，同一卷 360 日投影。'}
          这是这个项目的"创世年"——落笔的节点随机携来时间戳，投驻进 360 天，供你翻读。
        </p>
        <p className="eph-footnote" data-ephemeris-footnote>仅作者可见 · 零写库 · 全部内容来自 worlds.document 真的投影</p>
        <p className="eph-counts" data-ephemeris-counts>
          {days.length} 天有事 · {entries.length} 则条目
        </p>
      </header>

      {entries.length === 0 ? (
        <section className="eph-empty" aria-label="空切片" data-ephemeris-empty>
          <p className="eph-emptyTitle">这张创世历还空着</p>
          <p className="eph-emptyCopy">还没有任何落笔节点——空白页就是地球仪。地图上的每一处开始，都是从一颗没人记的星开始的。</p>
          <Link className="am-linkImplicit" href={`/studio/${projectId}`} data-ephemeris-cta>去 Studio 的世界面板写第一点 →</Link>
        </section>
      ) : (
        <>
          <nav className="eph-calendar" aria-label="创世年" data-ephemeris-calendar>
            {Array.from({ length: EPHEMERIS_DAYS }, (_, i) => i + 1).map((day) => {
              const dayEntries = byDay.get(day);
              return (
                <a
                  key={day}
                  href={dayEntries ? `#eph-day-${day}` : undefined}
                  className={dayEntries ? 'eph-day eph-dayLive' : 'eph-day'}
                  data-ephemeris-day={day}
                  aria-label={dayEntries ? `第 ${day} 天 · ${dayEntries.length} 则` : `第 ${day} 天 · 平静`}
                  title={dayEntries ? `${dayEntries.length} 则：${dayEntries.map((e) => e.title).join('、')}` : '这一天风和日丽'}
                >
                  <span className="eph-dayNum">{day}</span>
                  {dayEntries ? <span className="eph-dayCount">{dayEntries.length}</span> : null}
                </a>
              );
            })}
          </nav>

          <ol className="eph-flow" aria-label="创世年全景" data-ephemeris-flow>
            {days.map((day) => {
              const dayEntries = byDay.get(day)!;
              return (
                <li key={day} id={`eph-day-${day}`} className="eph-daySection" data-ephemeris-day-section={day}>
                  <p className="eph-dayLabel">第 {day} 天</p>
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
        <Link className="am-linkImplicit" href={`/world/${projectId}`} data-ephemeris-back-graph>← 回到世界图</Link>
        <Link className="am-linkImplicit" href={`/world/${projectId}/codex`} data-ephemeris-open-codex>设定集 →</Link>
        <Link className="am-linkImplicit" href={`/world/${projectId}/chronicle`} data-ephemeris-open-chronicle>编年 →</Link>
      </footer>
    </main>
  );
}
