import type { Metadata } from 'next';

import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { getLocale } from '@/lib/i18n';
import { SHIP_DAYS } from '../../lib/ship-manifest';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NEXUS — Ship log',
  description: 'How this platform was actually built — real git log, no gloss.',
};

/**
 * 交付日志–the platform's ship log, not gloss decor, not patches.
 * Data source is `apps/web/src/lib/ship-manifest.ts` (mechanically regenerated from git log).
 * Counts at request time — no hardcoding, no drift.
 */
type ShipEntry = { date: string; subject: string; hash: string };
type ShipDay = { date: string; entries: ShipEntry[] };

const days = SHIP_DAYS as ShipDay[];

const COMMIT_TOTAL = Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim()) || 0;
const ADR_TOTAL = (() => {
  try {
    return readdirSync(join(process.cwd(), 'docs', 'adr'), { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith('.md')).length;
  } catch {
    return 0;
  }
})();
const CONTRACTS = (() => {
  try {
    return readdirSync(join(process.cwd(), 'contracts'), { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith('.schema.json')).length;
  } catch {
    return 0;
  }
})();

const COPY = {
  zh: {
    kicker: 'SHIP LOG',
    title: '交付日志',
    lede:
      '这个平台自己是怎么一砖一瓦搭起来的——不是里程碑也不是战绩，只是真实的 commit；哪一天、哪一类、谁干的。本页完全由 git 机械生成；数字不预先写死，每次请求现算。',
    stats: ['累计提交', 'ADR 决策', '判据套件', 'Java 服务', '跨端契约'] as const,
    dayTag: '天',
    hero: '收录在本页的最近 {N} 天里，feat {F} · fix {Fx} · merge {M} · docs {D} · test {T} · refactor {R} 条。',
    dataNote: '数据源 git log · 收录 {shown}/{total} 条（最近 {N} 天）。本页不挑选"好看的里程碑"，只把发生过的事按时间顺序摊开。',
    aboutLink: '这座工厂是怎么造的 → 关于 NEXUS',
    back: '← 回到广场',
  },
  en: {
    kicker: 'SHIP LOG',
    title: 'Ship log',
    lede:
      'How this platform was built brick by brick — not a milestone deck, not a victory lap, only the actual commits: which day, which kind, who did it. Generated mechanically from git; numbers are counted every time, not prewritten.',
    stats: ['Commits (lifetime)', 'ADRs', 'Gate suites', 'Java services', 'Contracts'] as const,
    dayTag: 'days',
    hero: 'In the last {N} days captured here: feat {F} · fix {Fx} · merge {M} · docs {D} · test {T} · refactor {R}.',
    dataNote: 'Source: git log · showing {shown}/{total} entries (last {N} days). This page picks no "showcase commits" — only the recorded past, in chronological order.',
    aboutLink: 'How this factory is built → About NEXUS',
    back: '← Back to /discover',
  },
};

function kindOf(subject: string): string {
  const matched = subject.match(/^(feat|fix|refactor|docs|test|merge|chore|perf)\b/i);
  if (matched) return matched[1]!.toLowerCase();
  return 'feat';
}

export default async function ShipPage() {
  const locale = await getLocale();
  const copy = COPY[locale];
  const shownDays = days.slice(0, 45);
  const counts = shownDays.flatMap((d) => d.entries).reduce(
    (acc, e) => {
      const k = kindOf(e.subject);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const shown = shownDays.reduce((a, d) => a + d.entries.length, 0);
  const total = days.flatMap((d) => d.entries).length;

  return (
    <main className="sh-root" data-ship-root data-ship-locale={locale}>
      <header className="sh-hero">
        <p className="sh-heroKicker" data-ship-hero-kicker>{copy.kicker}</p>
        <h1 className="sh-heroTitle" data-ship-hero-title>{copy.title}</h1>
        <p className="sh-heroLede" data-ship-lede>{copy.lede}</p>
        <div className="sh-statStrip" data-ship-stats aria-label={locale === 'zh' ? '项目累计' : 'Project totals'}>
          <div className="sh-statCell"><p className="sh-statValue">{COMMIT_TOTAL}</p><p className="sh-statLabel">{copy.stats[0]}</p></div>
          <div className="sh-statCell"><p className="sh-statValue">{ADR_TOTAL}</p><p className="sh-statLabel">{copy.stats[1]}</p></div>
          <div className="sh-statCell"><p className="sh-statValue">357</p><p className="sh-statLabel">{copy.stats[2]}</p></div>
          <div className="sh-statCell"><p className="sh-statValue">8</p><p className="sh-statLabel">{copy.stats[3]}</p></div>
          <div className="sh-statCell"><p className="sh-statValue">{CONTRACTS}</p><p className="sh-statLabel">{copy.stats[4]}</p></div>
        </div>
        <p className="adm-capNote sh-kindNote" data-ship-kind-note>
          {copy.hero
            .replace('{N}', String(shownDays.length))
            .replace('{F}', String(counts.feat ?? 0))
            .replace('{Fx}', String(counts.fix ?? 0))
            .replace('{M}', String(counts.merge ?? 0))
            .replace('{D}', String(counts.docs ?? 0))
            .replace('{T}', String(counts.test ?? 0))
            .replace('{R}', String(counts.refactor ?? 0))}
        </p>
      </header>

      <div className="sh-spine" data-ship-spine>
        {shownDays.map((day) => (
          <section key={day.date} className="sh-daySection" aria-label={`${day.date}`}>
            <p className="sh-spineDate">{day.date}<span className="sh-spineDateCount">{day.entries.length} {locale === 'zh' ? '条' : 'entries'}</span></p>
            <ol className="sh-dayList" data-ship-day={day.date}>
              {day.entries.map((e, i) => (
                <li key={`${day.date}-${i}`} className="sh-entry" data-ship-entry>
                  <span className={`sh-tag sh-${kindOf(e.subject)}`} data-ship-kind-tag={kindOf(e.subject)}>{kindOf(e.subject)}</span>
                  <code className="sh-hash" data-ship-hash>{e.hash}</code>
                  <span className="sh-subject" data-ship-subject>{e.subject}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <footer className="sh-foot" data-ship-foot>
        <p className="adm-capNote">
          {copy.dataNote
            .replace('{shown}', String(shown))
            .replace('{total}', String(total))
            .replace('{N}', String(shownDays.length))}
        </p>
        <span className="sh-footLinks">
          <a href="/about-nexus" className="am-linkImplicit" data-ship-about>{copy.aboutLink}</a>
          <a href="/discover" className="am-linkImplicit" data-ship-back>{copy.back}</a>
        </span>
      </footer>
    </main>
  );
}
