'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskRetryButton } from '@/components/TaskRetryButton';
import { SavingsCard } from '@/components/SavingsCard';
import { readTasksLedger, type TasksLedgerPayload, type TaskUsage } from '@/lib/tasksLedger';
import type { SavingsSummary } from '@/lib/savings';
import { cacheText, cacheTotal, costText } from '@/lib/usage-cache-text';
import { REALTIME_TEXT, REALTIME_TEXT_EN, useRealtime } from '@/lib/useRealtime';
import type { Locale } from '@/lib/i18n';

/** 双语：账本的每行文案按 cookie locale 选（不夹杂） */
const TL_STATUS: Record<Locale, Record<string, string>> = {
  zh: {
    queued: '排队中',
    planning: '规划中',
    running: '在跑',
    succeeded: '完成',
    failed: '失败',
    cancelled: '已取消',
    awaiting_approval: '等审批',
  },
  en: {
    queued: 'Queued',
    planning: 'Planning',
    running: 'Running',
    succeeded: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled',
    awaiting_approval: 'Awaiting approval',
  },
};
const TL_TXT = {
  zh: {
    titleSuffix: '的任务',
    summaryHead: '共 ',
    summaryTail: ' 行 · ',
    summaryEmpty: '还没有跑过一次',
    usageSummary: (real: number, demo: number, missing: number) =>
      `用量：真模型 ${real} 行 · DEMO 规则版 ${demo} 行 · 未记录 ${missing} 行`,
    cacheHead: (rows: number) => `缓存读数（只计 ${rows} 行报过数的真模型行）：`,
    cacheHit: (cached: number, prompt: number) => `命中 ${cached} / ${prompt} 输入 token`,
    cacheShare: (share: number) => `（占 ${share}%）`,
    cacheTailUnreported: ' · 「未报」的行不画进这个数',
    cacheNone: '这页真模型行都没报缓存读数——"没报"与"命中 0"是两件事，这里绝不画 0%（ADR-0262）',
    realtime: '实时：',
    back: '回 Studio',
    tableAria: '任务账本表格（可横向滚动）',
    thTime: '时间',
    thIntent: '意图',
    thAttempt: '第几次',
    thCapability: '能力',
    thStatus: '状态',
    thDuration: '用时',
    thUsage: '用量',
    thOutcome: '结果 / 原因',
    thAction: '操作',
    attempt: (n: number) => `第 ${n} 次`,
    unknownCapability: '未知',
    realModel: '真模型',
    demoTemplate: 'DEMO 模板',
    scopeNote:
      '每一行对应一次 AI 请求（§7 命令栏发起的那种）。§112 那种多步 Agent 任务——Goal、子任务、依赖、验收——还没有执行方，所以这张表里不会出现"一个任务带六个步骤"的东西。能力那一列区分 real（真 provider）与 demo（DEMO 模板），两者不混写（§160）。「等审批」那一行是 §74 的审批门挂起来的：被扣下的补丁不在这里交回，决定要在 Studio 的命令栏里做——交回之后仍要走那一条可撤销的编辑事务，而这一页没有画布。重试（§162）开的是新行：失败的那一次留在表里不抹，「第几次」列写出这是第几回，input.retryOf 在库里把两行接起来——历史里看得见"第一次为什么失败"。「用量」列（§75）记的是 provider 真报的数：模型、token、模型侧延迟、费用与工具调用；DEMO 规则版不经过模型，写的就是 0 token，而不是拿 0 冒充一次模型调用；老行没有记账，写「未记录」——0 与没记是两件事。费用 0 写「未计价」：今天的适配器还没有价格表（§159）。状态自己变是实时事件催的重读：事件只负责"该来读一次了"，表里的每个字都来自库里（ADR-0010/0029）。',
    empty: '这个项目还没有跑过任何一次 AI 请求。',
    liveNote: (reason: string) => `账本读不到（${reason}）：以刷新后的数据为准`,
    unrecorded: '未记录',
    demoRule: 'DEMO 规则版不经过模型（0 token）',
    reasoningLabel: (n: number) => ` · 推理 ${n}`,
    secondsLabel: (n: number) => `${n} 秒`,
  },
  en: {
    titleSuffix: ' — Tasks',
    summaryHead: '',
    summaryTail: ' row(s) · ',
    summaryEmpty: 'nothing has run yet',
    usageSummary: (real: number, demo: number, missing: number) =>
      `Usage: ${real} real-model row(s) · ${demo} DEMO-rule row(s) · ${missing} unrecorded`,
    cacheHead: (rows: number) => `Cache readings (only ${rows} real-model rows that reported): `,
    cacheHit: (cached: number, prompt: number) => `${cached} / ${prompt} input tokens reused`,
    cacheShare: (share: number) => ` (${share}%)`,
    cacheTailUnreported: ' · unreported rows are not painted into this number',
    cacheNone: 'No real-model row on this page reported cache usage — "unreported" and "0 hits" are two different things, so nothing is drawn as 0% (ADR-0262)',
    realtime: 'Live: ',
    back: 'Back to Studio',
    tableAria: 'Tasks ledger table (horizontally scrollable)',
    thTime: 'Time',
    thIntent: 'Intent',
    thAttempt: '#',
    thCapability: 'Capability',
    thStatus: 'Status',
    thDuration: 'Duration',
    thUsage: 'Usage',
    thOutcome: 'Result / reason',
    thAction: 'Action',
    attempt: (n: number) => `#${n}`,
    unknownCapability: 'unknown',
    realModel: 'real model',
    demoTemplate: 'DEMO template',
    scopeNote:
      'Every row is one AI request (the kind the §7 command bar starts). Multi-step §112 Agent tasks — Goal, subtasks, dependencies, acceptance — have no executor yet, so this table will never show "one task with six steps". The Capability column separates real (true provider) from demo (DEMO template), they are never mixed (§160). "Awaiting approval" is the §74 approval gate parking the row: the withheld patch is not returned here, the decision happens in the Studio command bar — and returning still goes through that same undoable edit transaction; this page has no canvas. A retry (§162) opens a new row: the failed one stays in the table untouched, and the "#" column says which attempt this is, input.retryOf links the two rows in the library — the history shows why the first attempt failed. The Usage column (§75) holds the numbers the provider actually reported: model, tokens, provider-side latency, cost and tool calls; the DEMO rule set does not touch the model and writes 0 tokens — not fake tokens passed off as a model run; legacy rows carry no ledger — they say "unrecorded", because 0 and "nothing recorded" are two different things. A cost of 0 renders as "not priced": the adapters have no price table today (§159). Status changes are refreshed by realtime events — the event only says "go read once", and every byte in this table comes from the library (ADR-0010/0029).',
    empty: 'No AI request has run in this project yet.',
    liveNote: (reason: string) => `Ledger unavailable (${reason}) — the figures below are from the last refresh`,
    unrecorded: 'unrecorded',
    demoRule: 'DEMO rule set (0 tokens)',
    reasoningLabel: (n: number) => ` · reasoning ${n}`,
    secondsLabel: (n: number) => `${n}s`,
  },
} as const;

/**
 * §112 的账本视图（`/tasks/<项目>`）的活的一半（#10：把进度摊到界面上）。
 *
 * 结构是「服务端给第一屏 + 这里订阅实时再重读」：
 * - 第一屏由服务端组件 `app/tasks/[projectId]/page.tsx` 直接读库渲染，`initial` 就是那一份；
 * - 之后每一次任务行状态变化，服务端都会在项目频道上推一条 `generation.progress`
 *   （`startTask` / `finishTask` / `cancelTask` / 挂起 / 裁决 / 过期——**每一个状态写入方各推一条**，
 *   见 `domain/agent-tasks.ts`），这里收到就来这条 GET 重读权威。
 *
 * 三条纪律：
 * - **事件只是加速器，权威永远是库里那一份**（ADR-0010 后果第 4 条）：事件里不带整行数据，
 *   重读失败/断线期间缺的帧都不靠猜补——`onReconnect`（ADR-0029）接到"断过又接回来"
 *   就立刻重读一次，因为那段时间一帧都没收到。
 * - **读不到要说读不到**（§73）：重读失败时挂着一句带原因的话，绝不用上一次的数据冒充现在；
 *   连接断开时状态标签自己写着"以刷新后的数据为准"。
 * - **不造第二份真值**：这张表不参与工作区状态，重试按钮走的还是那条 POST，行只能是库里真有的行。
 */

/**
 * §75：用量那一格的三档。`missing` 是"这一行没记账"，不是"用了 0 个 token"——
 * 两者在库里一个 NULL 一个 0，在界面上也不许长得一样。
 */
function usageKind(usage: TaskUsage | null): 'missing' | 'demo' | 'real' {
  return usage === null ? 'missing' : usage.demoMode ? 'demo' : 'real';
}

/**
 * 一格用量的原文。只说 provider 真报了的数：
 * - DEMO 规则版不经过模型 ⇒ 写 0 token，不写得像一次模型调用；
 * - 费用为 0 时写「未计价」——今天的适配器还没有价格表，0 与「免费」不是一回事（§159）；
 * - 模型侧延迟与「用时」列不是同一个数：那一列是任务从开始到收尾，这一格是 provider 自己报的。
 *
 * 缓存那一格的三种说法（没报 / 未命中 / 命中 N·P%）住在 `lib/usage-cache-text.ts`：
 * 那三句话是承诺，得能被单测逐条钉住，而钉一个 JSX 表达式只能靠正则猜。
 */
function usageText(usage: TaskUsage | null, T: (typeof TL_TXT)[Locale], locale: Locale): string {
  if (usage === null) return T.unrecorded;
  if (usage.demoMode) return T.demoRule;
  const latency = T.secondsLabel(Math.round(usage.latencyMs / 100) / 10);
  const cacheStr = cacheText(usage, locale);
  const costStr = costText(usage, locale);
  const reasoning = (usage as { reasoningTokens?: number }).reasoningTokens;
  const reasoningStr = typeof reasoning === 'number' && reasoning > 0 ? T.reasoningLabel(reasoning) : '';
  return `${usage.model} (${usage.provider}) · ${usage.tokensIn} in / ${usage.tokensOut} out tokens · ${cacheStr}${reasoningStr} · ${costStr} · ${usage.toolCalls} tool call(s) · model-side ${latency}`;
}

export function TasksLedgerLive({
  projectId,
  initial,
  savings = null,
  locale = 'zh',
}: {
  projectId: string;
  initial: TasksLedgerPayload;
  savings?: SavingsSummary | null;
  locale?: Locale;
}) {
  const T = TL_TXT[locale];
  const S = TL_STATUS[locale];
  const intlLocale = locale === 'en' ? 'en-US' : 'zh-CN';
  const [payload, setPayload] = useState<TasksLedgerPayload>(initial);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const result = await readTasksLedger(projectId);
    if (result.ok) {
      setPayload(result.payload);
      setNote(null);
    } else {
      setNote(T.liveNote(result.reason));
    }
  }, [projectId]);

  // 背靠背的几条事件（提交那一下 start/finish 会连着来）合并成一次重读：
  // 数请求而不是数定时器——轮询也会让数变对，但请求条数会一路涨（e2e 数的就是这个）
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void refresh();
    }, 250);
  }, [refresh]);

  const realtime = useRealtime({
    projectId,
    onEvent: (event) => {
      // 只认 generation.progress：它每一条都对应一次任务行状态写出。
      // 活动/计划事件不改这张表的任何一列，为它们重读是白打一次接口
      if (event.type === 'generation.progress' && event.projectId === projectId) schedule();
    },
    onReconnect: () => {
      void refresh();
    },
  });

  // router.refresh()（重试按钮的那一下）会带来新的一份 server 数据；
  // 事件重读写的是 state，两者读的是同一张表，谁先到都一样
  useEffect(() => {
    setPayload(initial);
  }, [initial]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const counts = payload.tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});
  // §75 的三档汇总：真模型 / DEMO 规则版 / 没记账。按 usage 分而不是按 capability 分——
  // 这一行说的是"用量是不是一次模型调用"，capability 那一列说的是"这次走的是哪条路"。
  const usages = payload.tasks.reduce<Record<'real' | 'demo' | 'missing', number>>(
    (acc, task) => {
      acc[usageKind(task.usage)] += 1;
      return acc;
    },
    { real: 0, demo: 0, missing: 0 },
  );
  /**
   * §CACHE-3：这一页真模型调用的缓存合计。
   *
   * **只统计 `cacheReported` 的行**。把"没报"的行按 0 加进分母，命中率会凭空变小——
   * 那是用数据缺失伪造一个更差的读数，和伪造一个更好的读数一样不诚实。
   * 一行都没报时 `rows === 0`，界面说"没有可用的缓存读数"，绝不画 0%。
   */
  /**
   * §CACHE-3：这一页真模型调用的缓存合计。口径在 `lib/usage-cache-text.ts` 的 `cacheTotal`——
   * **只统计 `cacheReported` 的行**，一行都没报时 `rows === 0`，界面说"没有可用的缓存读数"，
   * 绝不画 0%（把"没报"按 0 加进分母，是在用数据缺失伪造一个更差的读数）。
   */
  const cache = cacheTotal(payload.tasks.map((task) => task.usage).filter((usage): usage is TaskUsage => usage !== null));

  return (
    <main className="tl-page" data-tasks-root>
      <header className="tl-head">
        <div>
          <h1 className="tl-title" data-tasks-title>
            {payload.projectName}{T.titleSuffix}
          </h1>
          <p className="tl-summary" data-tasks-summary>
            {T.summaryHead}{payload.tasks.length}{T.summaryTail}
            {Object.entries(counts)
              .map(([status, n]) => `${S[status] ?? status} ${n}`)
              .join(' · ') || T.summaryEmpty}
          </p>
          {payload.tasks.length > 0 ? (
            <p className="tl-summary" data-tasks-usage-summary>
              {T.usageSummary(usages.real, usages.demo, usages.missing)}
            </p>
          ) : null}
          {payload.tasks.length > 0 ? (
            cache.rows > 0 ? (
              <p className="tl-summary" data-tasks-cache-summary={String(cache.cached)}>
                {T.cacheHead(cache.rows)}{T.cacheHit(cache.cached, cache.prompt)}{cache.share === null ? '' : T.cacheShare(cache.share)}{T.cacheTailUnreported}
              </p>
            ) : (
              <p className="tl-summary" data-tasks-cache-summary="none">
                {T.cacheNone}
              </p>
            )
          ) : null}
        </div>
        <div className="tl-tools">
          <span className="tl-realtime" data-tasks-realtime={realtime.state}>
            {T.realtime}{(locale === 'en' ? REALTIME_TEXT_EN : REALTIME_TEXT)[realtime.state]}
          </span>
          {/* 第四十九片：这一颗是页面上唯一的返回口，原来 61×21——高度比 24 少 3px 也是低于下限。
              文字不换行也不该靠行高凑尺寸，直接给盒高（WCAG 2.5.8）。 */}
          <Link
            href={`/studio/${projectId}`}
            className="tl-back"
            data-tasks-back
          >
            {T.back}
          </Link>
        </div>
      </header>

      {savings ? <SavingsCard savings={savings} locale={locale} /> : null}

      {note ? (
        <p className="tl-note" data-tasks-live-note>
          {note}
        </p>
      ) : null}

      <p className="tl-scope" data-tasks-scope>
        {T.scopeNote}
      </p>

      {payload.tasks.length === 0 ? (
        <p className="tl-empty" data-tasks-empty>
          {T.empty}
        </p>
      ) : (
        // 第四十九片：390 下九列被压成一列一个字（截图里「第 / 几 / 次」竖着排）。
        // 宽度不该靠压缩列来换：给表格一个可读的下限，让它自己横滚，
        // 而不是把每一列挤成只剩一个字符宽（表格不承担"把布局视口撑宽"的后果）。
        <div
          className="tl-tableScroll"
          data-tasks-table-scroll
          // 横滚区自己必须是键盘停得下来的（axe: scrollable-region-focusable）。
          // 没有这一颗 tabindex，键盘用户看得到表格却滚不到右边那几列。
          role="region"
          aria-label={T.tableAria}
          tabIndex={0}
        >
        <table className="tl-table">
          <thead className="tl-thRow">
            <tr>
              <th>{T.thTime}</th>
              <th>{T.thIntent}</th>
              <th>{T.thAttempt}</th>
              <th>{T.thCapability}</th>
              <th>{T.thStatus}</th>
              <th>{T.thDuration}</th>
              <th>{T.thUsage}</th>
              <th>{T.thOutcome}</th>
              <th>{T.thAction}</th>
            </tr>
          </thead>
          <tbody>
            {payload.tasks.map((task) => (
              <tr key={task.id} data-task-row={task.id}>
                <td
                  data-task-time={new Date(task.createdAt).toLocaleString(intlLocale, { hour12: false })}
                  className="tl-tdNowrap"
                  // 时间戳两套 ICU（Node 渲染 vs 浏览器）逐字节可能差一个字符，
                  // 这一格本来就随重读更新，不值得为它报一次 hydration 警告
                  suppressHydrationWarning
                >
                  {new Date(task.createdAt).toLocaleString(intlLocale, { hour12: false })}
                </td>
                <td>{task.agentKey}</td>
                <td data-task-attempt={task.attempt}>{T.attempt(task.attempt)}</td>
                <td data-task-capability={task.capability ?? 'unknown'}>
                  {task.capability === 'real' ? T.realModel : task.capability === 'demo' ? T.demoTemplate : T.unknownCapability}
                </td>
                <td data-task-status={task.status}>{S[task.status] ?? task.status}</td>
                <td>{task.durationMs === null ? '—' : T.secondsLabel(Math.round(task.durationMs / 100) / 10)}</td>
                <td data-task-usage={usageKind(task.usage)} className="tl-tdMuted">
                  {usageText(task.usage, T, locale)}
                </td>
                <td className="tl-tdMuted">{task.error ?? '—'}</td>
                <td>
                  {/* 只有自己的失败/取消行才有按钮：别人行上的按钮点了也只会 404，
                      与其让人点了才知道，不如不挂出来 */}
                  {task.mine && (task.status === 'failed' || task.status === 'cancelled') ? (
                    <TaskRetryButton taskId={task.id} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}
