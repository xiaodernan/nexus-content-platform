import Link from 'next/link';
import type { ReactElement } from 'react';
import { creatorAnalytics, type AnalyticsNumbers } from '@/server/domain/analytics';
import { analyzeCreatorFacts, buildCreatorFact } from '@/server/domain/analytics-agent';
import { currentUserOrNull } from '@/server/domain/session';

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
  { label: '今天 / 访客', meaning: '按"这台浏览器 × 这一天"聚合的匿名 key，不是账号数；隐私模式下每次打开算一个新访客' },
  { label: '点赞 / 改编', meaning: '挂在项目上，不是这一版：重新发布不会把它们清零' },
  { label: '粉丝', meaning: '作者级：关注的是这个人，不是这份作品' },
  { label: '完成度', meaning: '每个访客"最远滚到页面几成"的平均值。内容比视口短时它就是 100%（没有可滚的地方=整页都在眼前）' },
  { label: '浏览时长', meaning: '只在标签页可见时累计；单次上报最多带走 60 秒，被截断过几次会另行标出' },
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
export default async function AnalyticsPage(props: { searchParams: Promise<{ project?: string | string[] }> }) {
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
  const wanted = (await props.searchParams).project;
  const projectId = typeof wanted === 'string' ? wanted : null;
  const fact = projectId ? await buildCreatorFact(projectId, user.id) : null;
  const findings = fact ? analyzeCreatorFacts(fact) : [];

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10" data-analytics-page>
      <h1 className="text-[var(--nexus-font-size-21)] font-semibold text-fg-1">创作数据</h1>
      <p className="mt-1 text-12 text-fg-3">
        {user.displayName} · 共 {rows.length} 个发布过的版本 · 数据只对你自己可见
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
          <Link href="/analytics" className="mt-2 inline-block text-11 text-accent-2 underline">
            收起这份分析
          </Link>
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
        还没做的两件事：按天画曲线（数据已经在按天存，缺图），以及区分爬虫与真人（现在只有一句"含爬虫"）。
        游戏与互动作品的 completion 需要"玩到哪儿"的事件，那要等 §50-§53 的运行时，现在这一列对它们是未采集。
      </p>
      <Link href="/" className="mt-3 inline-block text-12 text-accent-2 underline">
        回到我的项目
      </Link>
    </main>
  );
}
