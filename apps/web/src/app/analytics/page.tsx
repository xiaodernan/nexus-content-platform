import Link from 'next/link';
import type { ReactElement } from 'react';
import {
  creatorAnalytics,
  creatorOverview,
  dayWindow,
  publicationTrend,
  type AnalyticsNumbers,
} from '@/server/domain/analytics';
import { analyzeCreatorFacts, buildCreatorFact } from '@/server/domain/analytics-agent';
import { currentUserOrNull } from '@/server/domain/session';
import { utcDay } from '@/lib/visit-meter';
import { TrendChart } from './TrendChart';

/** 曲线能选的三段窗口。默认 30 天：看创作数据最常看的就是这一个月 */
const RANGE_OPTIONS = [7, 30, 90] as const;
const DEFAULT_RANGE = 30;

export const dynamic = 'force-dynamic';

/** 毫秒给人看的写法：不到一分钟给秒，超过给"分+秒" */
function duration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

/** 六个数各自数的是什么——写在页面上，不留在代码注释里 */
const DEFINITIONS: { label: string; meaning: string }[] = [
  { label: '打开次数', meaning: '页面被服务端渲染的次数，含作者自己的刷新与爬虫（§56 就有的累计计数器）' },
  {
    label: '今天 / 访客',
    meaning:
      '按"这台浏览器 × 这一天"聚合的匿名 key，不是账号数；隐私模式下每次打开算一个新访客。疑似爬虫与自动化的访问挑出来另计（见行内标注），不进这两个数',
  },
  { label: '点赞 / 改编', meaning: '挂在项目上，不是这一版：重新发布不会把它们清零' },
  { label: '粉丝', meaning: '作者级：关注的是这个人，不是这份作品' },
  { label: '完成度', meaning: '每个访客"最远滚到页面几成"的平均值。内容比视口短时它就是 100%（没有可滚的地方=整页都在眼前）' },
  {
    label: '通关过',
    meaning:
      '在公开可玩页上玩到了结局的**人数**（一个人在同一版里只记一次，所以这是"多少人通关过"，不是"通关了几次"）。与左边那格「完成度」是两个口径：那个说"这一页滚到哪儿"，这个说"玩通了"',
  },
  { label: '浏览时长', meaning: '只在标签页可见时累计；单次上报最多带走 60 秒，被截断过几次会另行标出' },
  {
    label: '疑似爬虫',
    meaning:
      '按 User-Agent 名单与自动化标记（navigator.webdriver）挑出来的打开：照存、另计，不进访客 / 时长 / 完成度——挑的是疑似不是定罪，被爬过的痕迹留在这一栏里',
  },
  {
    label: '窗口口径',
    meaning: '「最近 N 天」那一节只看窗口内的行，与上面那一排累计数不是同一个数、也不能互推',
  },
  {
    label: '窗口访客',
    meaning: '窗口内出现过的人，跨天去重：库里按「人 × 天」存一行，同一个人来三天仍算一个访客',
  },
  {
    label: '连续有人来',
    meaning: '从窗口最后一天往回数，连续每天至少有一条真人心跳的天数；0 = 今天一个人都没来',
  },
];

function Cell({ value, col }: { value: number | null; col: string }): ReactElement {
  return (
    <td className="px-2 py-1 text-right font-mono text-12 text-fg-1" data-analytics-value={col}>
      {value === null ? <span className="text-fg-3">未采集</span> : value.toLocaleString('zh-CN')}
    </td>
  );
}

function CompletionCell({ analytics }: { analytics: AnalyticsNumbers }): ReactElement {
  if (!analytics.completion) {
    return (
      <td className="px-2 py-1 text-right font-mono text-12 text-fg-3" data-analytics-value="completion">
        未采集
      </td>
    );
  }
  return (
    <td className="px-2 py-1 text-right font-mono text-12 text-fg-1" data-analytics-value="completion">
      {analytics.completion.avgPct}%
      <span className="ml-1 text-11 text-fg-3">/ {analytics.completion.over} 人</span>
    </td>
  );
}

/**
 * §168 创作数据。这一页的成败不在"有没有图"，在于**每个数字说的是不是真话**：
 * - 采不到的（还没有心跳的完成度与时长）写"未采集"，不拿别的数换算一个顶上；
 * - 只有作者自己看过的，整行标出来——否则"1 个访客 / 40 秒"会被读成"有人在看了"；
 * - 被上限截断过的上报计数在行里，数据被动过要留得下痕迹。
 */
export default async function AnalyticsPage(props: {
  searchParams: Promise<{ project?: string | string[]; days?: string | string[] }>;
}) {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[900px] px-6 py-16" data-analytics-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">创作数据</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录：这里只列你自己发布过的版本。</p>
        <Link href="/" className="mt-4 inline-block text-12 text-accent-2 underline">
          回到首页
        </Link>
      </main>
    );
  }

  const rows = await creatorAnalytics(user.id);
  // §169：按 `?project=` 逐件分析，不给整张列表按行读库（那份列表的查询纪律是"一次分组查询服务整页"）。
  // 读不到 = 不是你的项目 / 没发布过 / 已删除，三种给同一个答案，也不单列出来。
  const query = await props.searchParams;
  const wanted = query.project;
  const projectId = typeof wanted === 'string' ? wanted : null;
  // 窗口天数只认那三档：`?days=100000` 不该把库拉成十年，也不该在图上画出一根看不见的柱子
  const requested = Number(typeof query.days === 'string' ? query.days : '');
  const windowDays = (RANGE_OPTIONS as readonly number[]).includes(requested) ? requested : DEFAULT_RANGE;
  // "今天是哪一天"由服务端说一次，窗口与曲线两端用同一个值——两边各读一次时钟会跨午夜错开一天
  const window = dayWindow(utcDay(new Date()), windowDays);
  const overview = rows.length ? await creatorOverview(user.id, window) : null;
  const fact = projectId ? await buildCreatorFact(projectId, user.id) : null;
  const findings = fact ? analyzeCreatorFacts(fact) : [];
  const trend = projectId ? await publicationTrend(user.id, projectId, window) : null;

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10" data-analytics-page>
      <h1 className="text-[var(--nexus-font-size-21)] font-semibold text-fg-1">创作数据</h1>
      <p className="mt-1 text-12 text-fg-3">
        {user.displayName} · 共 {rows.length} 个发布过的版本 · 数据只对你自己可见
      </p>
      <p className="mt-1 text-12 text-fg-3">
        <a
          href="/api/analytics/export"
          download="creator-analytics.csv"
          data-analytics-export
          className="underline decoration-dotted underline-offset-2"
        >
          导出这一份数据（CSV）
        </a>
        <span className="ml-2 text-fg-3">
          导出的是上面这张表里的同一份数字；空着的格子是「未采集」，不是 0。
        </span>
      </p>

      <ul className="mt-4 grid gap-1 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-3 text-11 text-fg-3 sm:grid-cols-2">
        {DEFINITIONS.map((item) => (
          <li key={item.label}>
            <span className="text-fg-2">{item.label}</span>
            <span className="ml-1">{item.meaning}</span>
          </li>
        ))}
      </ul>

      {projectId ? (
        <section
          className="mt-4 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-3"
          data-analytics-agent
        >
          <h2 className="text-13 font-semibold text-fg-1">
            「{fact?.projectName ?? '这个项目'}」为什么没人看？
            <span className="ml-2 text-11 font-normal text-fg-3">
              规则分析：读的是这一页上面那几个数与项目本身的设置，没有调用任何模型
            </span>
          </h2>
          {!fact ? (
            <p className="mt-2 text-12 text-fg-2" data-analytics-agent-denied>
              读不到这个项目的发布记录：它可能不是你的项目、没发布过，或者已经被删除。
            </p>
          ) : findings.length === 0 ? (
            <p className="mt-2 text-12 text-fg-2" data-analytics-agent-clean>
              没有可挑的门面问题：标题与简介都在、有封面、公开且过审，数据里也没有"打不开 / 留不住人"的信号。
              这一句只说明这几项查过，不等于"会有人来"。
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {findings.map((finding) => (
                <li key={`${finding.area}:${finding.evidence}`} className="text-12" data-analytics-finding={finding.area}>
                  <p className="text-fg-3">
                    <span className="text-fg-2">看到的事实：</span>
                    {finding.evidence}
                  </p>
                  <p className="text-fg-1">{finding.conclusion}</p>
                  <p className="text-fg-3">
                    <span className="text-fg-2">建议：</span>
                    {finding.action}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {trend ? (
            <p className="mt-3 border-t border-[var(--nexus-color-border-subtle)] pt-2 text-12 text-fg-2" data-analytics-project-trend>
              这一版最近 {windowDays} 天：打开{' '}
              <span className="font-mono text-fg-1" data-analytics-project-window="opens">
                {trend.totals.opens}
              </span>{' '}
              次 · 访客{' '}
              <span className="font-mono text-fg-1" data-analytics-project-window="visitors">
                {trend.totals.visitors}
              </span>{' '}
              人 · 有活动的天{' '}
              <span className="font-mono text-fg-1" data-analytics-project-window="active_days">
                {trend.totals.activeDays}
              </span>{' '}
              / {windowDays} · 连续有人来{' '}
              <span className="font-mono text-fg-1" data-analytics-project-window="streak">
                {trend.streakDays}
              </span>{' '}
              天
              {trend.totals.visitors === 0 ? (
                <span className="ml-1 text-fg-3">（这段窗口里一个人都没来）</span>
              ) : null}
            </p>
          ) : null}
          <Link
            href={`/analytics${windowDays === DEFAULT_RANGE ? '' : `?days=${windowDays}`}`}
            className="mt-2 inline-block text-11 text-accent-2 underline"
          >
            收起这份分析
          </Link>
        </section>
      ) : null}

      {overview ? (
        <section
          className="mt-4 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-3"
          data-analytics-trend
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-13 font-semibold text-fg-1">
              最近 {windowDays} 天（按 UTC 日）
              <span className="ml-2 text-11 font-normal text-fg-3">
                {overview.window.from} → {overview.window.to} · 名下 {overview.publications} 个发布版本合在一起
              </span>
            </h2>
            <nav className="flex gap-3 text-11" data-analytics-range>
              {RANGE_OPTIONS.map((option) => (
                <Link
                  key={option}
                  href={`/analytics?days=${option}${projectId ? `&project=${projectId}` : ''}`}
                  className={option === windowDays ? 'text-fg-1 underline' : 'text-accent-2 underline'}
                  data-analytics-range-option={option}
                >
                  {option} 天
                </Link>
              ))}
            </nav>
          </div>

          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-11 text-fg-3" data-analytics-window-totals>
            <li>
              窗口内打开{' '}
              <span className="font-mono text-fg-1" data-analytics-window="opens">
                {overview.totals.opens.toLocaleString('zh-CN')}
              </span>
            </li>
            <li>
              窗口内访客（跨天去重）{' '}
              <span className="font-mono text-fg-1" data-analytics-window="visitors">
                {overview.totals.visitors.toLocaleString('zh-CN')}
              </span>
            </li>
            <li>
              有活动的天{' '}
              <span className="font-mono text-fg-1" data-analytics-window="active_days">
                {overview.totals.activeDays}
              </span>{' '}
              / {overview.days.length}
            </li>
            <li>
              连续有人来{' '}
              <span className="font-mono text-fg-1" data-analytics-window="streak">
                {overview.streakDays}
              </span>{' '}
              天
            </li>
            <li>
              窗口内时长{' '}
              {overview.totals.playTimeMs === null ? (
                <span className="text-fg-3">未采集</span>
              ) : (
                <span className="font-mono text-fg-1" data-analytics-window="play_time">
                  {duration(overview.totals.playTimeMs)}
                </span>
              )}
            </li>
            <li>
              完成度{' '}
              {overview.totals.completionPct === null ? (
                <span className="text-fg-3">未采集</span>
              ) : (
                <span className="font-mono text-fg-1" data-analytics-window="completion">
                  {overview.totals.completionPct}%（{overview.totals.completionOver} 条上报）
                </span>
              )}
            </li>
            {overview.totals.botOpens > 0 ? (
              <li data-analytics-window="bot_opens">
                其中爬虫/自动化打开{' '}
                <span className="font-mono text-fg-1">{overview.totals.botOpens.toLocaleString('zh-CN')}</span>{' '}
                次（未计入上面的访客与时长）
              </li>
            ) : null}
          </ul>

          <TrendChart
            days={overview.days}
            emptyNote={`这 ${overview.days.length} 天里一条心跳都没有：图上的 0 是"没人来"，不是"没采到"（采集一直开着）。`}
          />
          <p className="mt-2 text-11 text-fg-3">
            这一节读的是<b>窗口口径</b>，下面表格里那一排读的是<b>累计口径</b>，两者不是同一个数、也不能互相推：
            窗口内的访客按整段去重（同一个人连着来三天算一个），缺的那天是 0（那天真的没有心跳），
            累计那一列则包含窗口之外的全部历史。窗口外的行不进这张图，但仍在下面的表格里。
          </p>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-6 text-13 text-fg-2" data-analytics-empty>
          你还没有发布过任何版本，所以这里没有数据可读。发布之后再把公开链接发给别人，
          这一页才会开始有"打开次数"以外的东西。
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-12">
            <thead>
              <tr className="border-b border-[var(--nexus-color-border-subtle)] text-left text-11 text-fg-3">
                <th className="px-2 py-1 font-normal">作品</th>
                <th className="px-2 py-1 font-normal">可见性</th>
                <th className="px-2 py-1 text-right font-normal">打开</th>
                <th className="px-2 py-1 text-right font-normal">今天</th>
                <th className="px-2 py-1 text-right font-normal">访客</th>
                <th className="px-2 py-1 text-right font-normal">点赞</th>
                <th className="px-2 py-1 text-right font-normal">改编</th>
                <th className="px-2 py-1 text-right font-normal">粉丝</th>
                <th className="px-2 py-1 text-right font-normal">完成度</th>
                <th className="px-2 py-1 text-right font-normal">通关过</th>
                <th className="px-2 py-1 text-right font-normal">时长</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.publicationId}
                  className="border-b border-[var(--nexus-color-border-subtle)]"
                  data-analytics-row={row.path}
                >
                  <td className="px-2 py-1">
                    <a href={row.path} className="text-fg-1 underline" target="_blank" rel="noreferrer">
                      {row.projectName}
                    </a>
                    <span className="ml-1 text-11 text-fg-3">第 {row.version} 版</span>
                    <Link
                      href={`/analytics?project=${row.projectId}`}
                      className="ml-1 text-11 text-accent-2 underline"
                      data-analytics-ask
                    >
                      为什么没人看？
                    </Link>
                    {row.analytics.selfOnly ? (
                      <span className="ml-1 text-11 text-amber-300" data-analytics-selfonly>
                        只有你自己看过
                      </span>
                    ) : null}
                    {row.analytics.cappedReports > 0 ? (
                      <span className="ml-1 text-11 text-fg-3" data-analytics-capped>
                        {row.analytics.cappedReports} 次上报被截断
                      </span>
                    ) : null}
                    {row.analytics.botOpens > 0 ? (
                      <span className="ml-1 text-11 text-fg-3" data-analytics-bots>
                        {row.analytics.botOpens} 次打开来自爬虫/自动化（未计入）
                      </span>
                    ) : null}
                    {row.analytics.botCompletions > 0 ? (
                      <span className="ml-1 text-11 text-fg-3" data-analytics-bot-completions>
                        {row.analytics.botCompletions} 次通关来自爬虫/自动化（未计入）
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1 text-11 text-fg-3">
                    {row.visibility === 'public' ? '公开' : row.visibility === 'unlisted' ? '仅链接' : '已停'}
                  </td>
                  <Cell value={row.analytics.views} col="views" />
                  <Cell value={row.analytics.opensToday} col="opens_today" />
                  <Cell value={row.analytics.visitors} col="visitors" />
                  <Cell value={row.analytics.likes} col="likes" />
                  <Cell value={row.analytics.remixes} col="remixes" />
                  <Cell value={row.analytics.followers} col="followers" />
                  <CompletionCell analytics={row.analytics} />
                  {/* §168：游戏侧的通关——"多少人玩到了结局"（一个人只记一次） */}
                  <Cell value={row.analytics.completedVisitors} col="completed" />
                  <td
                    className="px-2 py-1 text-right font-mono text-12 text-fg-1"
                    data-analytics-value="play_time"
                  >
                    {row.analytics.playTimeMs === null ? (
                      <span className="text-fg-3">未采集</span>
                    ) : (
                      duration(row.analytics.playTimeMs)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-11 text-fg-3">
        还能往下做的两件事：把窗口粒度做到小时
        （库里就是一天一行，按小时画等于编一个不存在的分辨率）、以及**互动作品**的 completion
        （它们还没有运行时事件，今天只能靠人点一下来算）。
        游戏这一类的 completion 已经接上了——公开可玩页上玩到了结局就记一次，
        于是「通关过」那一格说的是"多少人玩通了"（一个人在同一版里只记一次）。
        爬虫与真人的区分已按"疑似另计"落地（见上面的口径）——UA 名单是保守的，漏掉的爬虫仍会混进真人的数里，
        这一条限度不假装已经解决。
      </p>
      <Link href="/" className="mt-3 inline-block text-12 text-accent-2 underline">
        回到我的项目
      </Link>
    </main>
  );
}
