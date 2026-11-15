import Link from 'next/link';
import type { ReactElement } from 'react';
import { currentUserOrNull } from '@/server/domain/session';
import { activePublicationCount, readCredits, storageUsageBytes, type LedgerEntry } from '@/server/domain/credit-ledger';
import {
  CREDIT_KINDS,
  CREDIT_KIND_LABELS,
  GENERATION_COST,
  PLAN_KEYS,
  PLAN_LABELS,
  PLAN_LIMITS,
  PLAN_MONTHLY_GRANTS,
  concurrentPublishLimit,
  humanBytes,
  planEnforcementReadout,
  type PlanKey,
} from '@/server/domain/credits';
import type { CreditLedgerKind } from '@/server/db/schema';
import { readAiBurnHistory } from '@/server/domain/credit-burn';
import { projectBurn } from '@/lib/burn-projection';
import { CreditsBurnCard } from '@/components/CreditsBurnCard';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KINDS_WITH_A_CONSUMER: ReadonlySet<CreditLedgerKind> = new Set<CreditLedgerKind>(['ai', 'video']);

function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** 这一类今天花一次是多少点；没有消耗方的那一类不报单价，报了就像已经有了那条路 */
function costNote(kind: CreditLedgerKind): string {
  return KINDS_WITH_A_CONSUMER.has(kind) ? `一次 ${GENERATION_COST[kind]} 点` : '今天没有消耗方';
}

/** EN twin of costNote — same rule, other language (keeps the zh byte-for-byte the FE-16 gate pins) */
function costNoteEn(kind: CreditLedgerKind): string {
  return KINDS_WITH_A_CONSUMER.has(kind) ? `${GENERATION_COST[kind]} credit(s) each` : 'no consumer yet';
}

function EntryRow({ entry, locale }: { entry: LedgerEntry; locale: Locale }): ReactElement {
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
          <span data-credit-task={entry.taskId}>
            {locale === 'zh' ? '任务 ' : 'Task '}
            {entry.taskId.slice(0, 8)}
          </span>
        ) : (
          <span data-credit-task="none">{locale === 'zh' ? '不绑定任务' : 'No task'}</span>
        )}
      </td>
    </tr>
  );
}

const COPY: Record<Locale, {
  anonymousTitle: string;
  anonymousLede: string;
  anonymousBack: string;
  title: string;
  whoseGuest: string;
  balancesHead: string;
  balancesNote: string;

  recentHead: string;
  emptyLedger: string;
  thTime: string;
  thKind: string;
  thDelta: string;
  thWhy: string;
  thTask: string;
  recentWindow: string;
  plansHead: string;
  planYouBadge: string;
  enforcedEn: string;
  storageLine: (used: string, limitMb: number, planLabel: string) => string;
  publishSlots: (active: number, limit: number, planLabel: string) => string;
  limits: readonly string[];
}> = {
  zh: {
    anonymousTitle: '额度与消费',
    anonymousLede: '这里显示的是四类额度（AI / Image / Video / Compute）与每一笔消费。得先登录或注册，才谈得上"谁的额度"。',
    anonymousBack: '回到首页登录',
    title: '额度与消费',
    whoseGuest: '游客，没有邮箱',
    balancesHead: '四类余额',
    balancesNote: '余额是流水加出来的（库里没有"余额"这一列可改），所以这一页上的数与下面那张表永远对得上。',
    recentHead: '最近消费与发放',
    emptyLedger: '一行流水都没有。刚注册完的话，刷新一次这一页就会把本月的额度发下来。',
    thTime: '时间',
    thKind: '类别',
    thDelta: '点数',
    thWhy: '为什么',
    thTask: '追到哪件事',
    recentWindow: '这里只列最近 20 行；余额是按全部流水算的，不是这 20 行的和。',
    plansHead: '档位与上限（§133）',
    planYouBadge: '（你在这档）',
    enforcedEn: '',
    storageLine: (used, limitMb, planLabel) =>
      `你的存储：已用 ${used} / ${limitMb} MB（${planLabel} 档，按名下所有项目合计；软删的项目仍占空间）。`,
    publishSlots: (active, limit, planLabel) =>
      `你的发布名额：已公开 ${active} / ${limit} 个（${planLabel} 档；同一个项目换版本不占新名额，收回发布即释放）。`,
    limits: [
      '· 没有充值入口：这一页不会出现"加点额度"的按钮，因为支付还没有接（§133 的档位今天也只能由服务端代码改）。',
      '· 失败的生成不扣点：只有跑成功并交回结果的那一次会记一行消费。',
      '· Video credits 有了消耗方：一次成片渲染扣 5 点（§40 渲染链，只有渲成功才扣，本月还可渲几次 Studio 的分镜面板上看得见）。Image / Compute 两类今天仍只有发放、没有消耗方，余额只会涨不会跌。',
      '· 发放发生在打开这一页或跑一次生成之前（幂等，一个月一类只发一次）——本机没有常驻定时器，写成"每月 1 日自动发放"就是假的。',
    ],
  },
  en: {
    anonymousTitle: 'Credits & spending',
    anonymousLede: 'This page shows the four credit classes (AI / Image / Video / Compute) and every charge. Sign in first — until then, there is no "whose credits" to show.',
    anonymousBack: 'Back to the home page to sign in',
    title: 'Credits & spending',
    whoseGuest: 'guest — no email on file',
    balancesHead: 'Four balances',
    balancesNote: 'Balances are derived from the ledger (there is no "balance" column to edit), so the numbers above always match the table below.',
    recentHead: 'Recent charges & grants',
    emptyLedger: 'Not one line yet. Just registered? Refresh this page once and this month’s grants arrive.',
    thTime: 'Time',
    thKind: 'Class',
    thDelta: 'Credits',
    thWhy: 'Why',
    thTask: 'Trace',
    recentWindow: 'Only the 20 newest rows are listed; balances derive from the whole ledger, not from these 20 rows.',
    plansHead: 'Plans & limits (§133)',
    planYouBadge: ' (your tier)',
    enforcedEn:
      '§133 names five things; today all five have real guard rails behind them. Every tier’s AI ceiling actually refuses an under-credited request (not just zero). Storage questions you before bytes land (the asset intake door, ADR-0018). Generation gating runs before the render task (Video credits, #191). Publishing respects its concurrent-slot ceiling (#199). Team collaboration respects its collaborator ceiling (#201, expired invites never hold a slot — #213). The five are enforced in code, not just printed here.',
    storageLine: (used, limitMb, planLabel) =>
      `Your storage: ${used} used of ${limitMb} MB on the ${planLabel} tier — counted across all projects you own (soft-deleted projects still occupy space).`,
    publishSlots: (active, limit, planLabel) =>
      `Your publish slots: ${active} of ${limit} live (${planLabel} tier; a republish of the same project doesn’t take a new slot — unpublishing releases it).`,
    limits: [
      '· No top-up button: there is none on this page, because payments are not wired (the §133 tiers today can only change in server code).',
      '· Failed generations don’t consume credits: only the one that runs and hands back a result lands as a line of consumption.',
      '· Video credits have a consumer: one finished render costs 5 credits (§40 render chain; only a successful render consumes; Studio’s storyboard panel shows how many renders remain this month). Image / Compute still have no consumer — balances only grow.',
      '· Grants happen when this page opens or before a generation runs (idempotent — one per class per month); there is no permanent scheduler here, so "granted automatically on the 1st" would be a lie.',
    ],
  },
};

export default async function CreditsPage(): Promise<ReactElement> {
  const [user, locale] = await Promise.all([currentUserOrNull(), getLocale()]);
  const c = COPY[locale];
  if (!user) {
    return (
      <main className="cr-pageAnon">
        <h1 className="cr-title">{c.anonymousTitle}</h1>
        <p className="cr-lede" data-credits-anonymous>
          {c.anonymousLede}
        </p>
        <Link href="/" className="cr-backlink">
          {c.anonymousBack}
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

  const costNoteFor = (kind: CreditLedgerKind): string => (locale === 'zh' ? costNote(kind) : costNoteEn(kind));

  return (
    <main className="cr-page">
      <header className="cr-head">
        <h1 className="cr-title">{c.title}</h1>
        <p className="cr-lede" data-credits-whose>
          {user.displayName}
          {locale === 'zh' ? '（' : ' ('}
          {user.email ?? c.whoseGuest}
          {locale === 'zh' ? '）' : ')'} · {locale === 'zh' ? '当前档位' : 'plan'}{' '}
          <b data-credits-plan={view.plan}>{PLAN_LABELS[view.plan]}</b>{' · '}{view.period}
          {view.granted > 0 ? ` · ${locale === 'zh' ? `这一次新发 ${view.granted} 类额度` : `${view.granted} class grants issued this time`}` : locale === 'zh' ? ' · 本月额度此前已发过' : ' · already granted this month'}
        </p>
      </header>

      <section className="cr-section">
        <h2 className="cr-h2">{c.balancesHead}</h2>
        <p className="cr-note">{c.balancesNote}</p>
        <ul className="cr-balanceGrid">
          {CREDIT_KINDS.map((kind) => (
            <li key={kind} className="cr-balanceCard">
              <p className="cr-balanceLabel">{CREDIT_KIND_LABELS[kind]}</p>
              <p className="cr-balanceValue" data-credit-balance={kind}>
                {view.balances[kind]}
              </p>
              <p className="cr-balanceFoot" data-credit-cost={kind}>
                {locale === 'zh' ? `本月发放 ${grants[kind]} · ${costNoteFor(kind)}` : `${grants[kind]} granted this month · ${costNoteFor(kind)}`}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="cr-section">
        <CreditsBurnCard projection={burnProjection} balance={view.balances.ai} locale={locale} />
      </section>

      <section className="cr-section">
        <h2 className="cr-h2">{c.recentHead}</h2>
        {view.entries.length === 0 ? (
          <p className="cr-empty" data-credit-empty>
            {c.emptyLedger}
          </p>
        ) : (
          <table className="cr-table">
            <thead>
              <tr className="cr-theadRow">
                <th className="cr-th">{c.thTime}</th>
                <th className="cr-th">{c.thKind}</th>
                <th className="cr-th">{c.thDelta}</th>
                <th className="cr-th">{c.thWhy}</th>
                <th className="cr-thLast">{c.thTask}</th>
              </tr>
            </thead>
            <tbody>
              {view.entries.map((entry, i) => (
                <EntryRow key={`${entry.createdAt}-${i}`} entry={entry} locale={locale} />
              ))}
            </tbody>
          </table>
        )}
        <p className="cr-window" data-credit-window>
          {c.recentWindow}
        </p>
      </section>

      <section className="cr-section">
        <h2 className="cr-h2">{c.plansHead}</h2>
        <table className="cr-table">
          <thead>
            <tr className="cr-theadRow">
              <th className="cr-th">{locale === 'zh' ? '档位' : 'Plan'}</th>
              <th className="cr-th">AI / {locale === 'zh' ? '月' : 'mo'}</th>
              <th className="cr-th">Image / {locale === 'zh' ? '月' : 'mo'}</th>
              <th className="cr-th">Video / {locale === 'zh' ? '月' : 'mo'}</th>
              <th className="cr-th">Compute / {locale === 'zh' ? '月' : 'mo'}</th>
              <th className="cr-th">{locale === 'zh' ? '存储' : 'Storage'}</th>
              <th className="cr-th">{locale === 'zh' ? '团队成员' : 'Team'}</th>
              <th className="cr-thLast">{locale === 'zh' ? '可发布' : 'Publishable'}</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_KEYS.map((plan: PlanKey) => (
              <tr key={plan} data-plan-row={plan} className={plan === view.plan ? 'cr-planCurrent' : 'cr-planOther'}>
                <td className="cr-td">
                  {PLAN_LABELS[plan]}
                  {plan === view.plan ? <b className="cr-youBadge">{c.planYouBadge}</b> : null}
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
          {locale === 'zh' ? planEnforcementReadout() : c.enforcedEn}
        </p>
        <p className="cr-body" data-credits-storage>
          {c.storageLine(humanBytes(storageBytes), PLAN_LIMITS[view.plan].storageMb, PLAN_LABELS[view.plan])}
        </p>
        <p className="cr-body" data-credits-publish-slots>
          {c.publishSlots(activePublications, publishLimit, PLAN_LABELS[view.plan])}
        </p>
        <ul className="cr-limits" data-credits-limits>
          {c.limits.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </section>
    </main>
  );
}
