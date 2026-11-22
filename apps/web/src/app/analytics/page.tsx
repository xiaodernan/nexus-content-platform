import Link from 'next/link';
import type { Metadata } from 'next';
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
import { AnalyticsAiNarrator } from '@/components/AnalyticsAiNarrator';
import { getLocale, type Locale } from '@/lib/i18n';

/** 曲线能选的三段窗口。默认 30 天：看创作数据最常看的就是这一个月 */
const RANGE_OPTIONS = [7, 30, 90] as const;
const DEFAULT_RANGE = 30;

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '创作数据 — NEXUS',
        description: '你的作品发布后的真实数据：打开、访客、通关、爬虫——每个数字都对自己负责。',
      }
    : {
        title: 'Creator Analytics — NEXUS',
        description: 'Real post-publish metrics for your work: opens, visitors, completions and crawlers — every number answers for itself.',
      };
}

/** 毫秒给人看的写法：不到一分钟给秒，超过给"分+秒" */
function duration(ms: number, locale: Locale): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return locale === 'en' ? `${seconds}s` : `${seconds} 秒`;
  return locale === 'en'
    ? `${Math.floor(seconds / 60)}min ${seconds % 60}s`
    : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export type LocalizedDefs = { label: string; meaning: string }[];

/** 六个数各自数的是什么——写在页面上，不留在代码注释里（v782 双语 COPY） */
const DEFINITIONS: Record<Locale, LocalizedDefs> = {
  zh: [
    { label: '打开次数', meaning: '页面被服务端渲染的次数，含作者自己的刷新与爬虫（§56 就有的累计计数器）' },
    {
      label: '今天 / 访客',
      meaning:
        '按"这台浏览器 × 这一天"聚合的匿名 key，不是账号数；隐私模式下每次打开算一个新访客。疑似爬虫与自动化的访问挑出来另计（见行内标注），不进这两个数',
    },
    { label: '点赞 / 改编', meaning: '挂在项目上，不是这一版：重新发布不会把它们清零' },
    { label: '粉丝', meaning: '作者级：关注的是这个人，不是这份作品' },
    { label: '完成度', meaning: '每个访客"最远滚到页面几成"的平均值，按 人·天 行逐条加权：只数滚过 0% 的真人行，打开即走、一秒心跳都没留下的 0% 不计入（所以那个 over 是「滚过 0% 的人·天行数」，不是去重人数，也不是全部上报行）。内容比视口短时它就是 100%（没有可滚的地方=整页都在眼前）' },
    {
      label: '通关过',
      meaning:
        '在公开可玩页上玩到了结局的人数（一个人在同一版里只记一次，所以这是"多少人通关过"，不是"通关了几次"）。与左边那格「完成度」是两个口径：那个说"这一页滚到哪儿"，这个说"玩通了"。如果那些"人"就是作者自己，页面上会像"只有你自己看过"那样明写出来',
    },
    {
      label: '互动完成',
      meaning:
        '在公开设计稿页上点着跳页、走到了没有出路的终点页的人数（一个人在同一版里只记一次）。只认「点击 → 跳到另一页」这一种交互；直接打开终点页不算。非互动作品这一格写「—」——那不是 0，是这一版没有这条流程',
    },
    { label: '浏览时长', meaning: '只在标签页可见时累计；单次上报最多带走 60 秒，被截断过几次会另行标出' },
    {
      label: '疑似爬虫',
      meaning:
        '按 User-Agent 名单与自动化标记（navigator.webdriver）挑出来的打开：照存、另计，不进访客 / 时长 / 完成度——挑的是疑似不是定罪，被爬过的痕迹留在这一栏里',
    },
    { label: '窗口口径', meaning: '「最近 N 天」那一节只看窗口内的行，与上面那一排累计数不是同一个数、也不能互推' },
    { label: '窗口访客', meaning: '窗口内出现过的人，跨天去重：库里按「人 × 天」存一行，同一个人来三天仍算一个访客' },
    { label: '连续有人来', meaning: '从窗口最后一天往回数，连续每天至少有一条真人心跳的天数；0 = 今天一个人都没来' },
  ],
  en: [
    { label: 'Opens', meaning: 'How many times the page was server-rendered — including the author’s own reloads and crawlers (the cumulative counter §56 already has)' },
    {
      label: 'Today / visitors',
      meaning:
        'Anonymous keys aggregated by "this browser × this day" — not account counts; in private mode every open counts as a new visitor. Suspected crawlers/automation are counted separately (see inline flags) and never enter these two numbers',
    },
    { label: 'Likes / remixes', meaning: 'Attached to the project, not to this version: re-publishing does not zero them out' },
    { label: 'Followers', meaning: 'Author-level: the follow is for this person, not this work' },
    { label: 'Completion', meaning: 'Average of each visitor’s "furthest scroll (%)", weighted per person-day row; only real rows that scrolled past 0% count — instant-bounce 0% rows with no heartbeat are excluded (so "over" means person-day rows scrolled past 0%, not deduped humans nor all raw rows). When content is shorter than the viewport it is 100% (nothing to scroll = the whole page was on screen)' },
    {
      label: 'Completed',
      meaning:
        'People who reached an ending on the public play page (a person counts once per version, so "how many people finished it", not how many times). A different metric from "completion": that one measures scroll depth; this one measures finishing. If those "people" are the author themselves, it says so inline, like "only you have seen it"',
    },
    {
      label: 'Interactive complete',
      meaning:
        'People who clicked through an interactive design page and reached an exit-less terminal page (a person counts once per version). Only "click → move to another page" counts; opening the terminal page directly does not. Non-interactive works show "—" — not 0, it means this version has no such flow',
    },
    { label: 'Visible time', meaning: 'Accumulates only while the tab is visible; one report carries at most 60 seconds — truncations are flagged separately' },
    {
      label: 'Suspected crawlers',
      meaning:
        'Opens selected by an explicit User-Agent list and automation markers (navigator.webdriver): saved but counted separately; never enter visitors / duration / completion — selection means suspected, not convicted; the trace of being scraped stays in this cell',
    },
    { label: 'Window definition', meaning: 'The "last N days" section counts only in-window rows; it is not the same number as the cumulative row above and cannot be derived from it' },
    { label: 'Window visitors', meaning: 'People seen in the window, deduped across days: stored as one row per person×day; the same person on three days still counts as one visitor' },
    { label: 'Streak', meaning: 'Counted backwards from the window’s last day: consecutive days with at least one real heartbeat; 0 = nobody came today' },
  ],
};

const COPY: Record<Locale, {
  deniedTitle: string;
  deniedCopy: string;
  homeLink: string;
  title: string;
  subtitle: (name: string, count: number) => string;
  exportLink: string;
  exportNote: string;
  uncollected: string;
  agentHead: (name: string) => string;
  agentNote: string;
  agentDenied: string;
  agentClean: string;
  findingEvidence: string;
  findingAction: string;
  projectTrendOpens: string;
  projectTrendVisitors: string;
  projectTrendActiveDays: string;
  projectTrendWindowStreak: string;
  projectTrendEmpty: string;
  closeAgent: string;
  trendTitle: (days: number) => string;
  trendNote: (from: string, to: string, count: number) => string;
  windowOpens: string;
  windowVisitors: string;
  windowActiveDays: string;
  windowStreak: string;
  windowPlayTime: string;
  windowCompletion: string;
  windowBotOpens: (count: number) => string;
  chartEmpty: (days: number) => string;
  trendFootnote: string;
  emptyTitle: string;
  tableAria: string;
  colWork: string;
  colVisibility: string;
  colOpens: string;
  colToday: string;
  colVisitors: string;
  colLikes: string;
  colRemixes: string;
  colFollowers: string;
  colCompletion: string;
  colCompleted: string;
  colInteractive: string;
  colPlayTime: string;
  versionLabel: (n: number) => string;
  askWhy: string;
  selfSeen: string;
  selfCompleted: string;
  selfInteractive: string;
  capped: (count: number) => string;
  bots: (count: number) => string;
  botCompletions: (count: number) => string;
  botInteractive: (count: number) => string;
  public_: string;
  unlisted_: string;
  stopped_: string;
  footer: string;
  backLink: string;
  days: string;
}> = {
  zh: {
    deniedTitle: '创作数据',
    deniedCopy: '需要先登录：这里只列你自己发布过的版本。',
    homeLink: '回到首页',
    title: '创作数据',
    subtitle: (name, count) => `${name} · 共 ${count} 个发布过的版本 · 数据只对你自己可见`,
    exportLink: '导出这一份数据（CSV）',
    exportNote: '导出的是上面这张表里的同一份数字；空着的格子是「未采集」，不是 0。',
    uncollected: '未采集',
    agentHead: (name) => `「${name}」为什么没人看？`,
    agentNote: '规则分析：读的是这一页上面那几个数与项目本身的设置，没有调用任何模型',
    agentDenied: '读不到这个项目的发布记录：它可能不是你的项目、没发布过，或者已经被删除。',
    agentClean: '没有可挑的门面问题：标题与简介都在、有封面、公开且过审，数据里也没有"打不开 / 留不住人"的信号。这一句只说明这几项查过，不等于"会有人来"。',
    findingEvidence: '看到的事实：',
    findingAction: '建议：',
    closeAgent: '收起这份分析',
    projectTrendOpens: '打开',
    projectTrendVisitors: '访客',
    projectTrendActiveDays: '有活动的天 ',
    projectTrendWindowStreak: '连续有人来',
    projectTrendEmpty: '（这段窗口里一个人都没来）',
    trendTitle: (days) => `最近 ${days} 天（按 UTC 日）`,
    trendNote: (from, to, count) => `${from} → ${to} · 名下 ${count} 个发布版本合在一起`,
    windowOpens: '窗口内打开',
    windowVisitors: '窗口内访客（跨天去重）',
    windowActiveDays: '有活动的天',
    windowStreak: '连续有人来',
    windowPlayTime: '窗口内时长',
    windowCompletion: '完成度',
    windowBotOpens: (count) => `其中爬虫/自动化打开 ${count} 次（未计入上面的访客与时长）`,
    chartEmpty: (days) => `这 ${days} 天里一条心跳都没有：图上的 0 是"没人来"，不是"没采到"（采集一直开着）。`,
    trendFootnote: '这一节读的是「窗口口径」，下面表格里那一排读的是「累计口径」，两者不是同一个数、也不能互相推：窗口内的访客按整段去重（同一个人连着来三天算一个），缺的那天是 0（那天真的没有心跳），累计那一列则包含窗口之外的全部历史。窗口外的行不进这张图，但仍在下面的表格里。',
    emptyTitle: '你还没有发布过任何版本，所以这里没有数据可读。发布之后再把公开链接发给别人，这一页才会开始有"打开次数"以外的东西。',
    tableAria: '作品数据表（可横向滚动）',
    colWork: '作品',
    colVisibility: '可见性',
    colOpens: '打开',
    colToday: '今天',
    colVisitors: '访客',
    colLikes: '点赞',
    colRemixes: '改编',
    colFollowers: '粉丝',
    colCompletion: '完成度',
    colCompleted: '通关过',
    colInteractive: '互动完成',
    colPlayTime: '时长',
    versionLabel: (n) => `第 ${n} 版`,
    askWhy: '为什么没人看？',
    selfSeen: '只有你自己看过',
    selfCompleted: '只有你自己通关过',
    selfInteractive: '只有你自己走通过',
    capped: (count) => `${count} 次上报被截断`,
    bots: (count) => `${count} 次打开来自爬虫/自动化（未计入）`,
    botCompletions: (count) => `${count} 次通关来自爬虫/自动化（未计入）`,
    botInteractive: (count) => `${count} 次走通来自爬虫/自动化（未计入）`,
    public_: '公开',
    unlisted_: '仅链接',
    stopped_: '已停',
    footer: '还能往下做的两件事：把窗口粒度做到小时（库里就是一天一行，按小时画等于编一个不存在的分辨率）。游戏这一类的 completion 已经接上了——公开可玩页上玩到了结局就记一次，于是「通关过」那一格说的是"多少人玩通了"（一个人在同一版里只记一次）。互动作品的 completion 也接上了——公开设计稿页上点着跳页、走到了没有出路的终点页就记一次，「互动完成」那一格说的是"多少人走通过"；直接打开终点页不算，非互动作品那一格写「—」。爬虫与真人的区分已按"疑似另计"落地（见上面的口径）——UA 名单是保守的，漏掉的爬虫仍会混进真人的数里，这一条限度不假装已经解决。',
    backLink: '回到我的项目',
    days: '天',
  },
  en: {
    deniedTitle: 'Creator analytics',
    deniedCopy: 'You need to sign in first — this page lists only your own published versions.',
    homeLink: 'Back to home',
    title: 'Creator analytics',
    subtitle: (name, count) => `${name} · ${count} published version(s) · only visible to you`,
    exportLink: 'Export this page (CSV)',
    exportNote: 'This exports the same numbers shown in the table; empty cells are “not measured”, not 0.',
    uncollected: 'not measured',
    agentHead: (name) => `Why is “${name}” not getting any viewers?`,
    agentNote: 'Rule-based analysis — reads the numbers on this page and the project settings; no model is called',
    agentDenied: 'Cannot read this project’s publish records: it may not be yours, may never have been published, or may have been deleted.',
    agentClean: 'No surface-level issue to flag: title and description exist, there is a cover, it is public and passes review, and the data shows no “does not open / does not retain” signal. This only covers these checks — it does not mean people will come.',
    findingEvidence: 'Observed fact: ',
    findingAction: 'Suggestion: ',
    projectTrendOpens: 'opens',
    projectTrendVisitors: 'visitors',
    projectTrendActiveDays: 'active days ',
    projectTrendWindowStreak: 'current streak',
    projectTrendEmpty: ' (no one came in this window)',
    closeAgent: 'Collapse this analysis',
    trendTitle: (days) => `Last ${days} days (UTC)`,
    trendNote: (from, to, count) => `${from} → ${to} · across your ${count} published version(s)`,
    windowOpens: 'Opens in window',
    windowVisitors: 'Visitors in window (deduped across days)',
    windowActiveDays: 'Active days',
    windowStreak: 'Streak',
    windowPlayTime: 'Visible time in window',
    windowCompletion: 'Completion',
    windowBotOpens: (count) => `${count} crawler/automation opens (not included in the visitors/duration above)`,
    chartEmpty: (days) => `Not a single heartbeat in these ${days} days — the 0 on the chart means “no one came”, not “not measured” (collection is always on).`,
    trendFootnote: 'This section reads the “window” basis; the row under the table reads the “cumulative” basis — not the same number, cannot be derived from one another: in-window visitors are deduped across the window (the same person on three days counts once), missing days are 0 (no heartbeat that day), the cumulative column covers all history outside the window. Out-of-window rows neither enter this chart nor the column below, though they remain in the table below.',
    emptyTitle: 'You have not published any version yet, so there is no data to read here. Make a public link and share it — this page will start to show more than “opens”.',
    tableAria: 'Work analytics table (horizontally scrollable)',
    colWork: 'Work',
    colVisibility: 'Visibility',
    colOpens: 'Opens',
    colToday: 'Today',
    colVisitors: 'Visitors',
    colLikes: 'Likes',
    colRemixes: 'Remixes',
    colFollowers: 'Followers',
    colCompletion: 'Completion',
    colCompleted: 'Completed',
    colInteractive: 'Interact. complete',
    colPlayTime: 'Duration',
    versionLabel: (n) => `v${n}`,
    askWhy: 'Why is nobody watching?',
    selfSeen: 'Only you have seen it',
    selfCompleted: 'Only you completed it',
    selfInteractive: 'Only you clicked through it',
    capped: (count) => `${count} report(s) truncated`,
    bots: (count) => `${count} open(s) from crawlers/automation (not counted)`,
    botCompletions: (count) => `${count} completion(s) from crawlers/automation (not counted)`,
    botInteractive: (count) => `${count} click-through(s) from crawlers/automation (not counted)`,
    public_: 'Public',
    unlisted_: 'Unlisted',
    stopped_: 'Stopped',
    footer: 'What could be done next: hourly window resolution (the library stores one row per day, an hourly chart would invent a resolution that does not exist). Game completions are wired now — a public play page reaching its ending is counted once, so “Completed” says how many people finished (a person counts once per version). Interactive completions are wired as well — a click-through chain on a public design page reaching an exit-less terminal page counts once, so “Interact. complete” says how many people finished; opening the terminal page directly does not count; non-interactive works show “—”. Crawlers are handled as “suspected, counted separately” (see above) — the UA list is conservative, so undetected crawlers still mix into the human numbers; that limit does not pretend to be solved.',
    backLink: 'Back to my projects',
    days: 'd',
  },
};

function Cell({ value, col, locale }: { value: number | null; col: string; locale: Locale }): ReactElement {
  return (
    <td className="an-cell" data-analytics-value={col}>
      {value === null ? (
        <span className="an-cellMuted">{COPY[locale].uncollected}</span>
      ) : (
        value.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')
      )}
    </td>
  );
}

function CompletionCell({ analytics, locale }: { analytics: AnalyticsNumbers; locale: Locale }): ReactElement {
  if (!analytics.completion) {
    return (
      <td className="an-cell an-cellMuted" data-analytics-value="completion">
        {COPY[locale].uncollected}
      </td>
    );
  }
  return (
    <td className="an-cell" data-analytics-value="completion">
      {analytics.completion.avgPct}%
      <span className="an-cellNote">/ {analytics.completion.over} {locale === 'zh' ? '人·天' : 'person-days'}</span>
    </td>
  );
}

/**
 * §168 创作数据。这一页的成败不在"有没有图"，在于**每个数字说的是不是真话**（不变）：
 * - 采不到的（还没有心跳的完成度与时长）写"未采集"，不拿别的数换算一个顶上；
 * - 只有作者自己看过的，整行标出来——否则"1 个访客 / 40 秒"会被读成"有人在看了"；
 * - 被上限截断过的上报计数在行里，数据被动过要留得下痕迹。
 *
 * v782：双语化（zh→en；分析 agent 产物（evidence/conclusion/action）是 §46 边界，原文透传不翻译）。
 */
export default async function AnalyticsPage(props: {
  searchParams: Promise<{ project?: string | string[]; days?: string | string[] }>;
}) {
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="an-denied" data-analytics-denied="anonymous">
        <h1 className="an-title">{c.deniedTitle}</h1>
        <p className="an-deniedCopy">{c.deniedCopy}</p>
        <Link href="/" className="an-homeLink">
          {c.homeLink}
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
    <main className="an-page" data-analytics-page>
      <h1 className="an-title">{c.title}</h1>
      <p className="an-subtitle">
        {c.subtitle(user.displayName, rows.length)}
      </p>
      <p className="an-subtitle">
        <a
          href="/api/analytics/export"
          download="creator-analytics.csv"
          data-analytics-export
          className="an-export"
        >
          {c.exportLink}
        </a>
        <span className="an-exportNote">
          {c.exportNote}
        </span>
      </p>

      <ul className="an-defs">
        {DEFINITIONS[locale].map((item) => (
          <li key={item.label}>
            <span className="an-defLabel">{item.label}</span>
            <span className="an-defMeaning">{item.meaning}</span>
          </li>
        ))}
      </ul>

      {projectId ? (
        <section
          className="an-panel"
          data-analytics-agent
        >
          <h2 className="an-panelTitle">
            {c.agentHead(fact?.projectName ?? '这个项目')}
            <span className="an-panelNote">
              {c.agentNote}
            </span>
          </h2>
          {!fact ? (
            <p className="an-agentNote" data-analytics-agent-denied>
              {c.agentDenied}
            </p>
          ) : findings.length === 0 ? (
            <p className="an-agentNote" data-analytics-agent-clean>
              {c.agentClean}
            </p>
          ) : (
            <ul className="an-findings">
              {findings.map((finding) => (
                <li key={`${finding.area}:${finding.evidence}`} className="an-finding" data-analytics-finding={finding.area}>
                  <p className="an-findingFact">
                    <span className="an-findingLabel">{c.findingEvidence}</span>
                    {finding.evidence}
                  </p>
                  <p className="an-findingConclusion">{finding.conclusion}</p>
                  <p className="an-findingFact">
                    <span className="an-findingLabel">{c.findingAction}</span>
                    {finding.action}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {fact && projectId ? (
            <AnalyticsAiNarrator projectId={projectId} locale={locale} />
          ) : null}
          {trend ? (
            <p className="an-projectTrend" data-analytics-project-trend>
              {locale === 'en' ? `This version, last ${windowDays} days:` : `这一版最近 ${windowDays} 天：`}{' '}
              {c.projectTrendOpens}{' '}
              <span className="an-mono" data-analytics-project-window="opens">
                {trend.totals.opens}
              </span>{' '}
              {locale === 'en' ? '· ' : '次 · '}
              {c.projectTrendVisitors}{' '}
              <span className="an-mono" data-analytics-project-window="visitors">
                {trend.totals.visitors}
              </span>{' '}
              {locale === 'en' ? ' ' : '人 · '}
              {c.projectTrendActiveDays}
              <span className="an-mono" data-analytics-project-window="active_days">
                {trend.totals.activeDays}
              </span>{' '}
              / {windowDays} · {c.projectTrendWindowStreak}
              <span className="an-mono" data-analytics-project-window="streak">
                {trend.streakDays}
              </span>
              {locale === 'en' ? '' : ' 天'}
              {trend.totals.visitors === 0 ? (
                <span className="an-muted">{locale === 'en' ? ' (no one came in this window)' : c.projectTrendEmpty}</span>
              ) : null}
            </p>
          ) : null}
          <Link
            href={`/analytics${windowDays === DEFAULT_RANGE ? '' : `?days=${windowDays}`}`}
            className="an-close"
          >
            {c.closeAgent}
          </Link>
        </section>
      ) : null}

      {overview ? (
        <section
          className="an-panel"
          data-analytics-trend
        >
          <div className="an-trendHead">
            <h2 className="an-panelTitle">
              {c.trendTitle(windowDays)}
              <span className="an-panelNote">
                {c.trendNote(overview.window.from, overview.window.to, overview.publications)}
              </span>
            </h2>
            <nav className="an-rangeNav" data-analytics-range>
              {RANGE_OPTIONS.map((option) => (
                <Link
                  key={option}
                  href={`/analytics?days=${option}${projectId ? `&project=${projectId}` : ''}`}
                  className={option === windowDays ? 'an-rangeOn' : 'an-rangeOff'}
                  data-analytics-range-option={option}
                >
                  {option} {c.days}
                </Link>
              ))}
            </nav>
          </div>

          <ul className="an-windowTotals" data-analytics-window-totals>
            <li>
              {c.windowOpens}{' '}
              <span className="an-mono" data-analytics-window="opens">
                {overview.totals.opens.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')}
              </span>
            </li>
            <li>
              {c.windowVisitors}{' '}
              <span className="an-mono" data-analytics-window="visitors">
                {overview.totals.visitors.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')}
              </span>
            </li>
            <li>
              {c.windowActiveDays}{' '}
              <span className="an-mono" data-analytics-window="active_days">
                {overview.totals.activeDays}
              </span>{' '}
              / {overview.days.length}
            </li>
            <li>
              {c.windowStreak}{' '}
              <span className="an-mono" data-analytics-window="streak">
                {overview.streakDays}
              </span>{' '}
              {locale === 'en' ? '' : '天'}
            </li>
            <li>
              {c.windowPlayTime}{' '}
              {overview.totals.playTimeMs === null ? (
                <span className="an-cellMuted">{c.uncollected}</span>
              ) : (
                <span className="an-mono" data-analytics-window="play_time">
                  {duration(overview.totals.playTimeMs, locale)}
                </span>
              )}
            </li>
            <li>
              {c.windowCompletion}{' '}
              {overview.totals.completionPct === null ? (
                <span className="an-cellMuted">{c.uncollected}</span>
              ) : (
                <span className="an-mono" data-analytics-window="completion">
                  {overview.totals.completionPct}
                  <span className="an-cellNote">{overview.totals.completionOver } {locale === 'zh' ? '滚过 0% 的人·天，打开即走的 0% 不计入' : 'person-days past 0% (0% bounce rows excluded)'}</span>
                </span>
              )}
            </li>
            {overview.totals.botOpens > 0 ? (
              <li data-analytics-window="bot_opens">
                {c.windowBotOpens(overview.totals.botOpens)}
              </li>
            ) : null}
          </ul>

          <TrendChart
            days={overview.days}
            locale={locale}
            emptyNote={c.chartEmpty(overview.days.length)}
          />
          <p className="an-trendNote">
            {c.trendFootnote}
          </p>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <p className="an-empty" data-analytics-empty>
          {c.emptyTitle}
        </p>
      ) : (
        // 第五十片：十二列在 390 会被压成一列一个字。表格保一个可读下限、自己横滚；
        // 横滚区必须键盘停得下来（axe: scrollable-region-focusable）。
        <div
          className="an-tableScroll"
          data-analytics-table-scroll
          role="region"
          aria-label={c.tableAria}
          tabIndex={0}
        >
          <table className="an-table">
            <thead>
              <tr className="an-thead">
                <th className="an-th">{c.colWork}</th>
                <th className="an-th">{c.colVisibility}</th>
                <th className="an-thRight">{c.colOpens}</th>
                <th className="an-thRight">{c.colToday}</th>
                <th className="an-thRight">{c.colVisitors}</th>
                <th className="an-thRight">{c.colLikes}</th>
                <th className="an-thRight">{c.colRemixes}</th>
                <th className="an-thRight">{c.colFollowers}</th>
                <th className="an-thRight">{c.colCompletion}</th>
                <th className="an-thRight">{c.colCompleted}</th>
                <th className="an-thRight">{c.colInteractive}</th>
                <th className="an-thRight">{c.colPlayTime}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.publicationId}
                  className="an-row"
                  data-analytics-row={row.path}
                >
                  <td className="an-td">
                    <a href={row.path} className="an-workLink" target="_blank" rel="noreferrer">
                      {row.projectName}
                    </a>
                    <span className="an-version">{c.versionLabel(row.version)}</span>
                    <Link
                      href={`/analytics?project=${row.projectId}`}
                      className="an-ask"
                      data-analytics-ask
                    >
                      {c.askWhy}
                    </Link>
                    {row.analytics.selfOnly ? (
                      <span className="an-flagWarn" data-analytics-selfonly>
                        {c.selfSeen}
                      </span>
                    ) : null}
                    {row.analytics.selfCompleted ? (
                      <span className="an-flagWarn" data-analytics-self-completed>
                        {c.selfCompleted}
                      </span>
                    ) : null}
                    {row.analytics.cappedReports > 0 ? (
                      <span className="an-flagMuted" data-analytics-capped>
                        {c.capped(row.analytics.cappedReports)}
                      </span>
                    ) : null}
                    {row.analytics.botOpens > 0 ? (
                      <span className="an-flagMuted" data-analytics-bots>
                        {c.bots(row.analytics.botOpens)}
                      </span>
                    ) : null}
                    {row.analytics.botCompletions > 0 ? (
                      <span className="an-flagMuted" data-analytics-bot-completions>
                        {c.botCompletions(row.analytics.botCompletions)}
                      </span>
                    ) : null}
                    {row.analytics.selfInteractiveCompleted ? (
                      <span className="an-flagWarn" data-analytics-self-interactive-completed>
                        {c.selfInteractive}
                      </span>
                    ) : null}
                    {row.analytics.botInteractiveCompletions > 0 ? (
                      <span className="an-flagMuted" data-analytics-bot-interactive-completions>
                        {c.botInteractive(row.analytics.botInteractiveCompletions)}
                      </span>
                    ) : null}
                  </td>
                  <td className="an-visibility">
                    {row.visibility === 'public' ? c.public_ : row.visibility === 'unlisted' ? c.unlisted_ : c.stopped_}
                  </td>
                  <Cell value={row.analytics.views} col="views" locale={locale} />
                  <Cell value={row.analytics.opensToday} col="opens_today" locale={locale} />
                  <Cell value={row.analytics.visitors} col="visitors" locale={locale} />
                  <Cell value={row.analytics.likes} col="likes" locale={locale} />
                  <Cell value={row.analytics.remixes} col="remixes" locale={locale} />
                  <Cell value={row.analytics.followers} col="followers" locale={locale} />
                  <CompletionCell analytics={row.analytics} locale={locale} />
                  {/* §168：游戏侧的通关——"多少人玩到了结局"（一个人只记一次） */}
                  <Cell value={row.analytics.completedVisitors} col="completed" locale={locale} />
                  {/* §167：互动作品侧的走通——非互动作品写「—」（不是 0，是这一版没有这条流程） */}
                  <td
                    className="an-cell"
                    data-analytics-value="interactive_completed"
                    data-analytics-interactive={row.interactive ? 'yes' : 'no'}
                  >
                    {row.interactive ? (
                      row.analytics.interactiveCompleted.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')
                    ) : (
                      <span className="an-cellMuted">—</span>
                    )}
                  </td>
                  <td
                    className="an-cell"
                    data-analytics-value="play_time"
                  >
                    {row.analytics.playTimeMs === null ? (
                      <span className="an-cellMuted">{c.uncollected}</span>
                    ) : (
                      duration(row.analytics.playTimeMs, locale)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="an-footer">
        {c.footer}
      </p>
      <Link href="/" className="an-back">
        {c.backLink}
      </Link>
    </main>
  );
}
