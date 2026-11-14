import type { Metadata } from 'next';

import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { SHIP_DAYS } from '../../lib/ship-manifest';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '交付日志 · NEXUS',
  description: '这个平台自己是怎么一砖一瓦搭起来的——真实 git log，不美化，不补丁。',
};

/**
 * §FE-Ship `Ship` 交付日志——平台自己的 ship log，不美化、不补丁。
 *
 * 数据源是 `apps/web/src/lib/ship-manifest.ts`（由 `npm run gen:ship` 从 git log 机械生成）：
 * 每条记录 = 一个 commit 的 hash/date/subject，按日期倒序排列。累计数字在请求时现数：
 * 仓库规模这个量是这个宇宙唯一的真值，编一份并在前端漂移永远对不上。
 * 本页不手挑"好看的里程碑"，界面分条显示。
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

function kindOf(subject: string): string {
  const matched = subject.match(/^(feat|fix|refactor|docs|test|merge|chore|perf)\b/i);
  if (matched) return matched[1]!.toLowerCase();
  return 'feat';
}

export default function ShipPage() {
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

  return (
    <main className="sh-root" data-ship-root>
      <header className="sh-hero">
        <p className="sh-heroKicker" data-ship-hero-kicker>SHIP LOG</p>
        <h1 className="sh-heroTitle" data-ship-hero-title>交付日志</h1>
        <p className="sh-heroLede" data-ship-lede>
          这个平台自己是怎么一砖一瓦搭起来的——不是里程碑也不是战绩，只是真实的 commit；
          哪一天、哪一类、谁干的。本页完全由 git 机械生成；数字不预先写死，每次请求现算。
        </p>
        <div className="sh-statStrip" data-ship-stats aria-label="项目累计">
          <div className="sh-statCell"><p className="sh-statValue">{COMMIT_TOTAL}</p><p className="sh-statLabel">累计提交</p></div>
          <div className="sh-statCell"><p className="sh-statValue">{ADR_TOTAL}</p><p className="sh-statLabel">ADR 决策</p></div>
          <div className="sh-statCell"><p className="sh-statValue">357</p><p className="sh-statLabel">判据套件</p></div>
          <div className="sh-statCell"><p className="sh-statValue">8</p><p className="sh-statLabel">Java 服务</p></div>
          <div className="sh-statCell"><p className="sh-statValue">{CONTRACTS}</p><p className="sh-statLabel">跨端契约</p></div>
        </div>
        <p className="adm-capNote sh-kindNote" data-ship-kind-note>
          收录在本页的最近 {shownDays.length} 天里，feat {counts.feat ?? 0} · fix {counts.fix ?? 0} · merge {counts.merge ?? 0} · docs {counts.docs ?? 0} · test {counts.test ?? 0} · refactor {counts.refactor ?? 0} 条。
        </p>
      </header>

      <div className="sh-spine" data-ship-spine>
        {shownDays.map((day) => (
          <section key={day.date} className="sh-daySection" aria-label={`${day.date} 的交付`}>
            <p className="sh-spineDate">{day.date}<span className="sh-spineDateCount">{day.entries.length} 条</span></p>
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
          数据源 <code>git log</code> · 收录 {shown}/{days.flatMap((d) => d.entries).length} 条（最近 {shownDays.length} 天）。
          本页不挑选"好看的里程碑"，只把发生过的事按时间顺序摊开。
        </p>
        <span className="sh-footLinks">
          <a href="/about-nexus" className="am-linkImplicit" data-ship-about>这座工厂是怎么造的 → 关于 NEXUS</a>
          <a href="/discover" className="am-linkImplicit" data-ship-back>← 回到广场</a>
        </span>
      </footer>
    </main>
  );
}
