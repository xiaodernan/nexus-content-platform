import Link from 'next/link';
import type { ReactElement } from 'react';
import { currentUserOrNull } from '@/server/domain/session';
import { activePublicationCount, readCredits, storageUsageBytes, type LedgerEntry } from '@/server/domain/credit-ledger';
import {
  CREDIT_KINDS,
  CREDIT_KIND_LABELS,
  ENFORCED_PLAN_AXES,
  GENERATION_COST,
  PLAN_KEYS,
  PLAN_LABELS,
  PLAN_LIMITS,
  PLAN_MONTHLY_GRANTS,
  UNENFORCED_PLAN_AXES,
  concurrentPublishLimit,
  humanBytes,
  planEnforcementReadout,
  type PlanKey,
} from '@/server/domain/credits';
import type { CreditLedgerKind } from '@/server/db/schema';
import { readAiBurnHistory } from '@/server/domain/credit-burn';
import { projectBurn } from '@/lib/burn-projection';
import { getLocale, type Locale } from '@/lib/i18n';
import { CreditsBurnCard } from '@/components/CreditsBurnCard';

export const dynamic = 'force-dynamic';

/** 双语：每行文案按 cookie locale 选（不夹杂） */
const CREDITS_TXT = {
  zh: {
    anonymousTitle: '额度与消费',
    anonymousLede: '这里显示的是四类额度（AI / Image / Video / Compute）与每一笔消费。得先登录或注册，才谈得上"谁的额度"。',
    backHome: '回到首页登录',
    title: '额度与消费',
    whoWho: (name: string, email: string) => `${name}（${email}）· 当前档位 `,
    whoTail: (period: string, granted: number) =>
      ` · 本月 ${period}` +
      (granted > 0 ? ` · 这一次新发 ${granted} 类额度` : ' · 本月额度此前已发过'),
    visitorNoEmail: '游客，没有邮箱',
    balancesTitle: '四类余额',
    balancesNote: '余额是流水加出来的（库里没有"余额"这一列可改），所以这一页上的数与下面那张表永远对得上。',
    monthlyGrant: (n: number) => `本月发放 ${n}`,
    costNoteHas: (cost: number) => `一次 ${cost} 点`,
    costNoteNone: '今天没有消耗方',
    recentLedgerTitle: '最近消费与发放',
    ledgerEmpty: '一行流水都没有。刚注册完的话，刷新一次这一页就会把本月的额度发下来。',
    thTime: '时间',
    thKind: '类别',
    thDelta: '点数',
    thWhy: '为什么',
    thTrack: '追到哪件事',
    taskLabel: (id: string) => `任务 ${id}`,
    taskNone: '不绑定任务',
    windowNote: '这里只列最近 20 行；余额是按全部流水算的，不是这 20 行的和。',
    storagePlanRowsTitle: '档位与上限（§133）',
    thPlan: '档位',
    thAiMonth: 'AI / 月',
    thImgMonth: 'Image / 月',
    thVidMonth: 'Video / 月',
    thComputeMonth: 'Compute / 月',
    thStorage: '存储',
    thTeam: '团队成员',
    thPublish: '可发布',
    youHere: '（你在这档）',
    storageLine: (used: string, limitMb: number, plan: string) =>
      `你的存储：已用 ${used} / ${limitMb} MB（${plan} 档，按名下所有项目合计；软删的项目仍占空间）。`,
    publishLine: (active: number, limit: number, plan: string) =>
      `你的发布名额：已公开 ${active} / ${limit} 个（${plan} 档；同一个项目换版本不占新名额，收回发布即释放）。`,
    limit1: '· 没有充值入口：这一页不会出现"加点额度"的按钮，因为支付还没有接（§133 的档位今天也只能由服务端代码改）。',
    limit2: '· 失败的生成不扣点：只有跑成功并交回结果的那一次会记一行消费。',
    limit3: (cost: number) => `· Video credits 有了消耗方：一次成片渲染扣 ${cost} 点（§40 渲染链，只有渲成功才扣，本月还可渲几次 Studio 的分镜面板上看得见）。Image / Compute 两类今天仍只有发放、没有消耗方，余额只会涨不会跌。`,
    limit4: '· 发放发生在打开这一页或跑一次生成之前（幂等，一个月一类只发一次）——本机没有常驻定时器，写成"每月 1 日自动发放"就是假的。',
  },
  en: {
    anonymousTitle: 'Credits & spend',
    anonymousLede: 'This page shows the four credit kinds (AI / Image / Video / Compute) and every ledger row. Sign in or register first — whose credits they are only makes sense per person.',
    backHome: 'Back to home to sign in',
    title: 'Credits & spend',
    whoWho: (name: string, email: string) => `${name} (${email}) · plan `,
    whoTail: (period: string, granted: number) =>
      ` · ${period}` +
      (granted > 0 ? ` · granted ${granted} kind(s) this time` : ' · this month’s grants were already paid'),
    visitorNoEmail: 'guest, no email',
    balancesTitle: 'Balances by kind',
    balancesNote: 'Balances are summed from the ledger (there is no mutable "balance" column), so the numbers here always tie to the table below.',
    monthlyGrant: (n: number) => `monthly grant ${n}`,
    costNoteHas: (cost: number) => `${cost} pt per use`,
    costNoteNone: 'no consumer today',
    recentLedgerTitle: 'Recent spend and grants',
    ledgerEmpty: 'Not a single ledger row. If you just registered, reload this page and your monthly credits will be granted.',
    thTime: 'Time',
    thKind: 'Kind',
    thDelta: 'Points',
    thWhy: 'Why',
    thTrack: 'Traced to',
    taskLabel: (id: string) => `Task ${id}`,
    taskNone: 'unassigned',
    windowNote: 'Only the latest 20 rows are listed; the balance is computed over the whole ledger, not this window.',
    storagePlanRowsTitle: 'Plans and limits (§133)',
    thPlan: 'Plan',
    thAiMonth: 'AI / month',
    thImgMonth: 'Image / month',
    thVidMonth: 'Video / month',
    thComputeMonth: 'Compute / month',
    thStorage: 'Storage',
    thTeam: 'Team members',
    thPublish: 'Publications',
    youHere: '(you are here)',
    storageLine: (used: string, limitMb: number, plan: string) =>
      `Your storage: ${used} used of ${limitMb} MB (${plan} plan, summed across all your projects; soft-deleted projects still count).`,
    publishLine: (active: number, limit: number, plan: string) =>
      `Your publication slots: ${active} / ${limit} published (${plan} plan; a new version of the same project does not take a slot, and retracting releases it).`,
    limit1: '· No top-up: this page has no "add credits" button because payments are not wired (§133’s plans today can only be changed by server code).',
    limit2: '· Failed generations are not charged: only a run that succeeds and returns a result is written to the ledger.',
    limit3: (cost: number) => `· Video credits have a consumer: one successful render charges ${cost} pts (§40 render chain; only successful renders charge; how many you can still render this month is visible in the Studio storyboard panel). Image / Compute still have grantors only, no consumers — balances can only grow.`,
    limit4: '· Grants happen the moment you open this page or before a run starts (idempotent — one kind per month only); this machine has no resident timer, so claiming “auto-grant on the 1st” would be fake.',
  },
} as const;

/**
 * 今天真的会扣点的类别。video 从 #191 起有了消耗方（分镜渲染链：一次成片扣 5 点，
 * 只有渲成功才扣）；image / compute 两类仍只有发放方、没有消耗方，页面上要这么说——
 * 把没有消耗方的那类说成"一次 X 点"，等于宣布一条不存在的路（§159）。
 */
const KINDS_WITH_A_CONSUMER: ReadonlySet<CreditLedgerKind> = new Set<CreditLedgerKind>(['ai', 'video']);

function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** 这一类今天花一次是多少点；没有消耗方的那一类不报单价，报了就像已经有了那条路 */
function costNote(kind: CreditLedgerKind, T: (typeof CREDITS_TXT)[Locale]): string {
  return KINDS_WITH_A_CONSUMER.has(kind) ? T.costNoteHas(GENERATION_COST[kind]) : T.costNoteNone;
}

function EntryRow({ entry, T }: { entry: LedgerEntry; T: (typeof CREDITS_TXT)[Locale] }): ReactElement {
  return (
    <tr data-credit-entry={entry.reason} data-credit-kind={entry.kind} data-credit-delta={entry.delta}>
      <td className="cr-tdTs">{stamp(entry.createdAt)}</td>
      <td className="cr-tdKind">{CREDIT_KIND_LABELS[entry.kind]}</td>
      <td className={`cr-tdDelta ${entry.delta < 0 ? 'cr-deltaNeg' : 'cr-deltaPos'}`}>
        {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
      </td>
      <td className="cr-tdReason">{entry.reason}</td>
      <td className="cr-tdTask">
        {entry.taskId ? (
          <span data-credit-task={entry.taskId}>{T.taskLabel(entry.taskId.slice(0, 8))}</span>
        ) : (
          <span data-credit-task="none">{T.taskNone}</span>
        )}
      </td>
    </tr>
  );
}

export default async function CreditsPage(): Promise<ReactElement> {
  const locale = await getLocale();
  const T = CREDITS_TXT[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="cr-pageAnon">
        <h1 className="cr-title">{T.anonymousTitle}</h1>
        <p className="cr-lede" data-credits-anonymous>
          {T.anonymousLede}
        </p>
        <Link href="/" className="cr-backlink">
          {T.backHome}
        </Link>
      </main>
    );
  }

  const storageBytes = await storageUsageBytes(user.id);
  const view = await readCredits(user.id);
  const grants = PLAN_MONTHLY_GRANTS[view.plan];
  // §133 publishing 那一格的真实计数（#199）：名下正处于公开发布状态的项目数。
  // 与发布门读同一个口径（visibility != private、排除软删、换版本不占名额）——
  // 页面显示 1/1 而门放行第二个，那种对不上比不显示更糟（§159）。
  const activePublications = await activePublicationCount(user.id);
  const publishLimit = concurrentPublishLimit(view.plan);
  // v700：近 30 天 AI 燃烧序列（UTC 日，补零）→ 线性外推。失败/样本不够时上层渲染"不猜"，
  // 这行读不成目录也不会把整页拖死（readAiBurnHistory 内含 catch → 平直序列）
  const burnSeries = await readAiBurnHistory(user.id, 30);
  const burnProjection = projectBurn(view.balances.ai, burnSeries);

  return (
    <main className="cr-page">
      <header className="cr-head">
        <h1 className="cr-title">{T.title}</h1>
        <p className="cr-lede" data-credits-whose>
          {T.whoWho(user.displayName ?? '', user.email ?? T.visitorNoEmail)}
          <b data-credits-plan={view.plan}>{PLAN_LABELS[view.plan]}</b>
          {T.whoTail(view.period, view.granted)}
        </p>
      </header>

      <section className="cr-section">
        <h2 className="cr-h2">{T.balancesTitle}</h2>
        <p className="cr-note">
          {T.balancesNote}
        </p>
        <ul className="cr-balanceGrid">
          {CREDIT_KINDS.map((kind) => (
            <li key={kind} className="cr-balanceCard">
              <p className="cr-balanceLabel">{CREDIT_KIND_LABELS[kind]}</p>
              <p className="cr-balanceValue" data-credit-balance={kind}>
                {view.balances[kind]}
              </p>
              <p className="cr-balanceFoot" data-credit-cost={kind}>
                {T.monthlyGrant(grants[kind])} · {costNote(kind, T)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="cr-section">
        <CreditsBurnCard projection={burnProjection} balance={view.balances.ai} locale={locale} />
      </section>

      <section className="cr-section">
        <h2 className="cr-h2">{T.recentLedgerTitle}</h2>
        {view.entries.length === 0 ? (
          <p className="cr-empty" data-credit-empty>
            {T.ledgerEmpty}
          </p>
        ) : (
          <table className="cr-table">
            <thead>
              <tr className="cr-theadRow">
                <th className="cr-th">{T.thTime}</th>
                <th className="cr-th">{T.thKind}</th>
                <th className="cr-th">{T.thDelta}</th>
                <th className="cr-th">{T.thWhy}</th>
                <th className="cr-thLast">{T.thTrack}</th>
              </tr>
            </thead>
            <tbody>
              {view.entries.map((entry, i) => (
                <EntryRow key={`${entry.createdAt}-${i}`} entry={entry} T={T} />
              ))}
            </tbody>
          </table>
        )}
        <p className="cr-window" data-credit-window>
          {T.windowNote}
        </p>
      </section>

      <section className="cr-section">
        <h2 className="cr-h2">{T.storagePlanRowsTitle}</h2>
        <table className="cr-table">
          <thead>
            <tr className="cr-theadRow">
              <th className="cr-th">{T.thPlan}</th>
              <th className="cr-th">{T.thAiMonth}</th>
              <th className="cr-th">{T.thImgMonth}</th>
              <th className="cr-th">{T.thVidMonth}</th>
              <th className="cr-th">{T.thComputeMonth}</th>
              <th className="cr-th">{T.thStorage}</th>
              <th className="cr-th">{T.thTeam}</th>
              <th className="cr-thLast">{T.thPublish}</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_KEYS.map((plan: PlanKey) => (
              <tr key={plan} data-plan-row={plan} className={plan === view.plan ? 'cr-planCurrent' : 'cr-planOther'}>
                <td className="cr-td">
                  {PLAN_LABELS[plan]}
                  {plan === view.plan ? <b className="cr-youBadge">{T.youHere}</b> : null}
                </td>
                <td className="cr-td">{PLAN_MONTHLY_GRANTS[plan].ai}</td>
                <td className="cr-td">{PLAN_MONTHLY_GRANTS[plan].image}</td>
                <td className="cr-td">{PLAN_MONTHLY_GRANTS[plan].video}</td>
                <td className="cr-td">{PLAN_MONTHLY_GRANTS[plan].compute}</td>
                <td className="cr-td">{PLAN_LIMITS[plan].storageMb} MB</td>
                <td className="cr-td">{PLAN_LIMITS[plan].teamMembers}</td>
                <td className="cr-tdLast">{PLAN_LIMITS[plan].concurrentPublishes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cr-enforced" data-credits-enforced>
          {planEnforcementReadout(ENFORCED_PLAN_AXES, UNENFORCED_PLAN_AXES, locale)}
        </p>
        <p className="cr-body" data-credits-storage>
          {T.storageLine(humanBytes(storageBytes), PLAN_LIMITS[view.plan].storageMb, PLAN_LABELS[view.plan])}
        </p>
        <p className="cr-body" data-credits-publish-slots>
          {T.publishLine(activePublications, publishLimit, PLAN_LABELS[view.plan])}
        </p>
        <ul className="cr-limits" data-credits-limits>
          <li>{T.limit1}</li>
          <li>{T.limit2}</li>
          <li>{T.limit3(GENERATION_COST.video)}</li>
          <li>{T.limit4}</li>
        </ul>
      </section>
    </main>
  );
}
