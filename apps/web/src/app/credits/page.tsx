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

export const dynamic = 'force-dynamic';

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
function costNote(kind: CreditLedgerKind): string {
  return KINDS_WITH_A_CONSUMER.has(kind) ? `一次 ${GENERATION_COST[kind]} 点` : '今天没有消耗方';
}

function EntryRow({ entry }: { entry: LedgerEntry }): ReactElement {
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
          <span data-credit-task={entry.taskId}>任务 {entry.taskId.slice(0, 8)}</span>
        ) : (
          <span data-credit-task="none">不绑定任务</span>
        )}
      </td>
    </tr>
  );
}

export default async function CreditsPage(): Promise<ReactElement> {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="cr-pageAnon">
        <h1 className="cr-title">额度与消费</h1>
        <p className="cr-lede" data-credits-anonymous>
          这里显示的是四类额度（AI / Image / Video / Compute）与每一笔消费。得先登录或注册，
          才谈得上"谁的额度"。
        </p>
        <Link href="/" className="cr-backlink">
          回到首页登录
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

  return (
    <main className="cr-page">
      <header className="cr-head">
        <h1 className="cr-title">额度与消费</h1>
        <p className="cr-lede" data-credits-whose>
          {user.displayName}（{user.email ?? '游客，没有邮箱'}）· 当前档位{' '}
          <b data-credits-plan={view.plan}>{PLAN_LABELS[view.plan]}</b> · 本月 {view.period}
          {view.granted > 0 ? ` · 这一次新发 ${view.granted} 类额度` : ' · 本月额度此前已发过'}
        </p>
      </header>

      <section className="cr-section">
        <h2 className="cr-h2">四类余额</h2>
        <p className="cr-note">
          余额是流水加出来的（库里没有"余额"这一列可改），所以这一页上的数与下面那张表永远对得上。
        </p>
        <ul className="cr-balanceGrid">
          {CREDIT_KINDS.map((kind) => (
            <li key={kind} className="cr-balanceCard">
              <p className="cr-balanceLabel">{CREDIT_KIND_LABELS[kind]}</p>
              <p className="cr-balanceValue" data-credit-balance={kind}>
                {view.balances[kind]}
              </p>
              <p className="cr-balanceFoot" data-credit-cost={kind}>
                本月发放 {grants[kind]} · {costNote(kind)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="cr-section">
        <h2 className="cr-h2">最近消费与发放</h2>
        {view.entries.length === 0 ? (
          <p className="cr-empty" data-credit-empty>
            一行流水都没有。刚注册完的话，刷新一次这一页就会把本月的额度发下来。
          </p>
        ) : (
          <table className="cr-table">
            <thead>
              <tr className="cr-theadRow">
                <th className="cr-th">时间</th>
                <th className="cr-th">类别</th>
                <th className="cr-th">点数</th>
                <th className="cr-th">为什么</th>
                <th className="cr-thLast">追到哪件事</th>
              </tr>
            </thead>
            <tbody>
              {view.entries.map((entry, i) => (
                <EntryRow key={`${entry.createdAt}-${i}`} entry={entry} />
              ))}
            </tbody>
          </table>
        )}
        <p className="cr-window" data-credit-window>
          这里只列最近 20 行；余额是按全部流水算的，不是这 20 行的和。
        </p>
      </section>

      <section className="cr-section">
        <h2 className="cr-h2">档位与上限（§133）</h2>
        <table className="cr-table">
          <thead>
            <tr className="cr-theadRow">
              <th className="cr-th">档位</th>
              <th className="cr-th">AI / 月</th>
              <th className="cr-th">Image / 月</th>
              <th className="cr-th">Video / 月</th>
              <th className="cr-th">Compute / 月</th>
              <th className="cr-th">存储</th>
              <th className="cr-th">团队成员</th>
              <th className="cr-thLast">可发布</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_KEYS.map((plan: PlanKey) => (
              <tr key={plan} data-plan-row={plan} className={plan === view.plan ? 'cr-planCurrent' : 'cr-planOther'}>
                <td className="cr-td">
                  {PLAN_LABELS[plan]}
                  {plan === view.plan ? <b className="cr-youBadge">（你在这档）</b> : null}
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
          {planEnforcementReadout()}
        </p>
        <p className="cr-body" data-credits-storage>
          你的存储：已用 {humanBytes(storageBytes)} / {PLAN_LIMITS[view.plan].storageMb} MB
          （{PLAN_LABELS[view.plan]} 档，按名下所有项目合计；软删的项目仍占空间）。
        </p>
        <p className="cr-body" data-credits-publish-slots>
          你的发布名额：已公开 {activePublications} / {publishLimit} 个（{PLAN_LABELS[view.plan]} 档；
          同一个项目换版本不占新名额，收回发布即释放）。
        </p>
        <ul className="cr-limits" data-credits-limits>
          <li>· 没有充值入口：这一页不会出现"加点额度"的按钮，因为支付还没有接（§133 的档位今天也只能由服务端代码改）。</li>
          <li>· 失败的生成不扣点：只有跑成功并交回结果的那一次会记一行消费。</li>
          <li>· Video credits 有了消耗方：一次成片渲染扣 {GENERATION_COST.video} 点（§40 渲染链，只有渲成功才扣，本月还可渲几次 Studio 的分镜面板上看得见）。Image / Compute 两类今天仍只有发放、没有消耗方，余额只会涨不会跌。</li>
          <li>· 发放发生在打开这一页或跑一次生成之前（幂等，一个月一类只发一次）——本机没有常驻定时器，写成"每月 1 日自动发放"就是假的。</li>
        </ul>
      </section>
    </main>
  );
}
