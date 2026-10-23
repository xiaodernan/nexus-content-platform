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
  concurrentPublishLimit,
  humanBytes,
  UNENFORCED_PLAN_AXES,
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
      <td className="py-1 pr-3 text-11 text-fg-3">{stamp(entry.createdAt)}</td>
      <td className="py-1 pr-3 text-12 text-fg-2">{CREDIT_KIND_LABELS[entry.kind]}</td>
      <td className={`py-1 pr-3 text-12 font-medium ${entry.delta < 0 ? 'text-danger' : 'text-accent-2'}`}>
        {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
      </td>
      <td className="py-1 pr-3 text-12 text-fg-1">{entry.reason}</td>
      <td className="py-1 text-11 text-fg-3">
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
      <main className="mx-auto flex max-w-[880px] flex-col gap-3 px-6 py-10">
        <h1 className="text-2xl font-semibold text-fg-1">额度与消费</h1>
        <p className="text-13 text-fg-2" data-credits-anonymous>
          这里显示的是四类额度（AI / Image / Video / Compute）与每一笔消费。得先登录或注册，
          才谈得上"谁的额度"。
        </p>
        <Link href="/" className="text-13 text-accent-2 underline">
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
    <main className="mx-auto flex max-w-[980px] flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-fg-1">额度与消费</h1>
        <p className="text-13 text-fg-2" data-credits-whose>
          {user.displayName}（{user.email ?? '游客，没有邮箱'}）· 当前档位{' '}
          <b data-credits-plan={view.plan}>{PLAN_LABELS[view.plan]}</b> · 本月 {view.period}
          {view.granted > 0 ? ` · 这一次新发 ${view.granted} 类额度` : ' · 本月额度此前已发过'}
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-14 font-medium text-fg-1">四类余额</h2>
        <p className="text-12 text-fg-3">
          余额是流水加出来的（库里没有"余额"这一列可改），所以这一页上的数与下面那张表永远对得上。
        </p>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CREDIT_KINDS.map((kind) => (
            <li key={kind} className="rounded-[var(--nexus-radius-md)] bg-bg-2 p-3">
              <p className="text-11 text-fg-3">{CREDIT_KIND_LABELS[kind]}</p>
              <p className="text-24 font-semibold text-fg-1" data-credit-balance={kind}>
                {view.balances[kind]}
              </p>
              <p className="text-11 text-fg-3" data-credit-cost={kind}>
                本月发放 {grants[kind]} · {costNote(kind)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-14 font-medium text-fg-1">最近消费与发放</h2>
        {view.entries.length === 0 ? (
          <p className="text-13 text-fg-2" data-credit-empty>
            一行流水都没有。刚注册完的话，刷新一次这一页就会把本月的额度发下来。
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-11 text-fg-3">
                <th className="py-1 pr-3 font-normal">时间</th>
                <th className="py-1 pr-3 font-normal">类别</th>
                <th className="py-1 pr-3 font-normal">点数</th>
                <th className="py-1 pr-3 font-normal">为什么</th>
                <th className="py-1 font-normal">追到哪件事</th>
              </tr>
            </thead>
            <tbody>
              {view.entries.map((entry, i) => (
                <EntryRow key={`${entry.createdAt}-${i}`} entry={entry} />
              ))}
            </tbody>
          </table>
        )}
        <p className="text-11 text-fg-3" data-credit-window>
          这里只列最近 20 行；余额是按全部流水算的，不是这 20 行的和。
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-14 font-medium text-fg-1">档位与上限（§133）</h2>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-11 text-fg-3">
              <th className="py-1 pr-3 font-normal">档位</th>
              <th className="py-1 pr-3 font-normal">AI / 月</th>
              <th className="py-1 pr-3 font-normal">Image / 月</th>
              <th className="py-1 pr-3 font-normal">Video / 月</th>
              <th className="py-1 pr-3 font-normal">Compute / 月</th>
              <th className="py-1 pr-3 font-normal">存储</th>
              <th className="py-1 pr-3 font-normal">团队成员</th>
              <th className="py-1 font-normal">可发布</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_KEYS.map((plan: PlanKey) => (
              <tr key={plan} data-plan-row={plan} className={plan === view.plan ? 'text-fg-1' : 'text-fg-2'}>
                <td className="py-1 pr-3 text-12">
                  {PLAN_LABELS[plan]}
                  {plan === view.plan ? <b className="ml-1 text-11 text-accent-2">（你在这档）</b> : null}
                </td>
                <td className="py-1 pr-3 text-12">{PLAN_MONTHLY_GRANTS[plan].ai}</td>
                <td className="py-1 pr-3 text-12">{PLAN_MONTHLY_GRANTS[plan].image}</td>
                <td className="py-1 pr-3 text-12">{PLAN_MONTHLY_GRANTS[plan].video}</td>
                <td className="py-1 pr-3 text-12">{PLAN_MONTHLY_GRANTS[plan].compute}</td>
                <td className="py-1 pr-3 text-12">{PLAN_LIMITS[plan].storageMb} MB</td>
                <td className="py-1 pr-3 text-12">{PLAN_LIMITS[plan].teamMembers}</td>
                <td className="py-1 text-12">{PLAN_LIMITS[plan].concurrentPublishes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-12 text-warn" data-credits-enforced>
          §133 点名的五件事今天全都有真的拦截方（{ENFORCED_PLAN_AXES.join('、')}）：额度为 0 时生成会被挡下
          （AI 任务与成片渲染各有一道门），存储写满时新的素材会被拒绝（库里已有的不会被自动删掉），
          公开发布数达到档位上限时新的发布会被挡下（换版本不占名额，收回发布即释放），
          协作者数达到档位上限时新的邀请会被挡下（pending 邀请也占名额，撤回/移除即释放）。
          {UNENFORCED_PLAN_AXES.length ? (
            <>
              另外 {UNENFORCED_PLAN_AXES.length} 格（{UNENFORCED_PLAN_AXES.join('、')}）目前只是这张表上的数字，
              还没有代码按它拒绝任何请求——把表上的上限当成已生效的限制，是这一页最容易说谎的方式。
            </>
          ) : (
            <>真加了第六件事，先在这两列里放明，再落拦截方。</>
          )}
        </p>
        <p className="text-12 text-fg-2" data-credits-storage>
          你的存储：已用 {humanBytes(storageBytes)} / {PLAN_LIMITS[view.plan].storageMb} MB
          （{PLAN_LABELS[view.plan]} 档，按名下所有项目合计；软删的项目仍占空间）。
        </p>
        <p className="text-12 text-fg-2" data-credits-publish-slots>
          你的发布名额：已公开 {activePublications} / {publishLimit} 个（{PLAN_LABELS[view.plan]} 档；
          同一个项目换版本不占新名额，收回发布即释放）。
        </p>
        <ul className="text-12 text-fg-2" data-credits-limits>
          <li>· 没有充值入口：这一页不会出现"加点额度"的按钮，因为支付还没有接（§133 的档位今天也只能由服务端代码改）。</li>
          <li>· 失败的生成不扣点：只有跑成功并交回结果的那一次会记一行消费。</li>
          <li>· Video credits 有了消耗方：一次成片渲染扣 {GENERATION_COST.video} 点（§40 渲染链，只有渲成功才扣，本月还可渲几次 Studio 的分镜面板上看得见）。Image / Compute 两类今天仍只有发放、没有消耗方，余额只会涨不会跌。</li>
          <li>· 发放发生在打开这一页或跑一次生成之前（幂等，一个月一类只发一次）——本机没有常驻定时器，写成"每月 1 日自动发放"就是假的。</li>
        </ul>
      </section>
    </main>
  );
}
