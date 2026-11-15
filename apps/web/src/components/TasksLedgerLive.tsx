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

const STATUS_TEXT: Record<Locale, Record<string, string>> = {
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
    queued: 'queued',
    planning: 'planning',
    running: 'running',
    succeeded: 'succeeded',
    failed: 'failed',
    cancelled: 'cancelled',
    awaiting_approval: 'awaiting approval',
  },
};

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
 *
 * 双语（2026-11-15）：locale 由 `/tasks/<id>/page.tsx` 透传（默认 zh），COPY 中英一辞两字面。
 */

/**
 * §75：用量那一格的三档。`missing` 是"这一行没记账"，不是"用了 0 个 token"——
 * 两者在库里一个 NULL 一个 0，在界面上也不许长得一样。
 */
function usageKind(usage: TaskUsage | null): 'missing' | 'demo' | 'real' {
  return usage === null ? 'missing' : usage.demoMode ? 'demo' : 'real';
}

interface Copy {
  readFailed: (reason: string) => string;
  projectTitle: (name: string) => string;
  summary: (total: number, counts: string) => string;
  emptyRuns: string;
  usageSummary: (real: number, demo: number, missing: number) => string;
  cacheHit: (rows: number, cached: number, prompt: number, share: string) => string;
  cacheUnreported: (total: number) => string;
  noTasks: string;
  scope: string;
  tableScrollAria: string;
  realtimePrefix: string;
  backStudio: string;
  thTime: string;
  thIntent: string;
  thAttempt: string;
  thCapability: string;
  thStatus: string;
  thDuration: string;
  thUsage: string;
  thReason: string;
  thAction: string;
  attemptCount: (n: number) => string;
  capabilityReal: string;
  capabilityDemo: string;
  capabilityUnknown: string;
  durationMs: (ms: number) => string;
}

const COPY_ZH: Copy = {
  readFailed: (reason) => `账本读不到（${reason}）：以刷新后的数据为准`,
  projectTitle: (name) => `${name} 的任务`,
  summary: (total, counts) => `共 ${total} 行 · ${counts || '还没有跑过一次'}`,
  emptyRuns: '还没跑过一次',
  usageSummary: (real, demo, missing) => `用量：真模型 ${real} 行 · DEMO 规则版 ${demo} 行 · 未记录 ${missing} 行`,
  cacheHit: (rows, cached, prompt, share) => `缓存读数（只计 ${rows} 行报过数的真模型行）：命中 ${cached} / ${prompt} 输入 token${share ? `（占 ${share}%）` : ''} · 「未报」的行不画进这个数`,
  cacheUnreported: () => `这页真模型行都没报缓存读数——“没报”与“命中 0”是两件事，这里绝不画 0%（ADR-0262）`,
  noTasks: '这个项目还没有跑过任何一次 AI 请求。',
  scope: '每一行对应一次 AI 请求（§7 命令栏发起的那种）。§112 那种多步 Agent 任务——Goal、子任务、依赖、验收——还没有执行方，所以这张表里不会出现"一个任务带六个步骤"的东西。能力那一列区分 real（真 provider）与 demo（DEMO 模板），两者不混写（§160）。「等审批」那一行是 §74 的审批门挂起来的：被扣下的补丁不在这里交回，决定要在 Studio 的命令栏里做——交回之后仍要走那一条可撤销的编辑事务，而这一页没有画布。重试（§162）开的是新行：失败的那一次留在表里不抹，「第几次」列写出这是第几回，input.retryOf 在库里把两行接起来——历史里看得见"第一次为什么失败"。「用量」列（§75）记的是 provider 真报的数：模型、token、模型侧延迟、费用与工具调用；DEMO 规则版不经过模型，写的就是 0 token，而不是拿 0 冒充一次模型调用；老行没有记账，写「未记录」——0 与没记是两件事。费用 0 写「未计价」：今天的适配器还没有价格表（§159）。状态自己变是实时事件催的重读：事件只负责"该来读一次了"，表里的每个字都来自库里（ADR-0010/0029）。',
  tableScrollAria: '任务账本表格（可横向滚动）',
  realtimePrefix: '实时：',
  backStudio: '回 Studio',
  thTime: '时间',
  thIntent: '意图',
  thAttempt: '第几次',
  thCapability: '能力',
  thStatus: '状态',
  thDuration: '用时',
  thUsage: '用量',
  thReason: '结果 / 原因',
  thAction: '操作',
  attemptCount: (n) => `第 ${n} 次`,
  capabilityReal: '真模型',
  capabilityDemo: 'DEMO 模板',
  capabilityUnknown: '未知',
  durationMs: (ms) => `${Math.round(ms / 100) / 10} 秒`,
};

const COPY_EN: Copy = {
  readFailed: (reason) => `Tasks ledger unreadable (${reason}) — counts shown after the next refresh`,
  projectTitle: (name) => `Tasks · ${name}`,
  summary: (total, counts) => `${total} rows · ${counts || 'nothing has run yet'}`,
  emptyRuns: 'nothing has run yet',
  usageSummary: (real, demo, missing) => `Usage: ${real} real-model rows · ${demo} DEMO rows · ${missing} unrecorded`,
  cacheHit: (rows, cached, prompt, share) => `Cache (only ${rows} reported real-model rows): hit ${cached} of ${prompt} prompt tokens${share ? ` (${share}%)` : ''} · unreported rows stay out`,
  cacheUnreported: () => `Every real-model row on this page went unreported on cache — “unreported” and “hit zero” are different claims, and this page won’t draw 0% (ADR-0262)`,
  noTasks: 'This project has not run a single AI request yet.',
  scope: 'Each row is one AI request (initiated from the §7 command bar). §112 multi-step Agent tasks — goal, subtasks, dependencies, acceptance — have no runner yet, so nothing like “one task with six steps” shows up here. The capability column distinguishes real (real provider) from demo (DEMO mock), and the two are never conflated (§160). The “awaiting approval” row is an approval gate mounted by §74: gated patches are not handed back here, the decision belongs in Studio’s command bar — revocation still requires that same undoable edit transaction, and this page has no canvas. Retry (§162) opens a NEW row: the failed run stays in the table, “attempt” names which one this is, and input.retryOf links the two rows in the store — history keeps seeing “why the first one failed”. The usage column (§75) records what the provider actually reported: model, tokens, model-side latency, cost and tool calls; DEMO rows never pass through a model, so they write 0 tokens, not a fake model call; unrecorded rows write “unrecorded” — 0 and unrecorded are different facts. Cost 0 stays “not priced”: today’s adapters carry no price table (§159). Status turning live is realtime events nudging a re-read: events only say “go read now”, every glyph in the table comes from the store (ADR-0010/0029).',
  tableScrollAria: 'Tasks table (horizontally scrollable)',
  realtimePrefix: 'Live: ',
  backStudio: 'Back to Studio',
  thTime: 'Time',
  thIntent: 'Intent',
  thAttempt: '#',
  thCapability: 'Capability',
  thStatus: 'Status',
  thDuration: 'Duration',
  thUsage: 'Tokens',
  thReason: 'Result / cause',
  thAction: 'Action',
  attemptCount: (n) => `#${n}`,
  capabilityReal: 'Real provider',
  capabilityDemo: 'DEMO mock',
  capabilityUnknown: 'Unknown',
  durationMs: (ms) => `${Math.round(ms / 100) / 10}s`,
};

const COPY: Record<Locale, Copy> = { zh: COPY_ZH, en: COPY_EN };

function usageText(usage: TaskUsage | null, locale: Locale): string {
  if (usage === null) return locale === 'en' ? 'unrecorded' : '未记录';
  if (usage.demoMode) return locale === 'en' ? 'DEMO mock (0 tokens)' : 'DEMO 规则版不经过模型（0 token）';
  // 缓存/计价措辞**不再本地拼写**：一律走 lib/usage-cache-text.ts（§CACHE-3 / §COST-1 承诺层），
  // 英文模式经同一函数的 locale 分支落住，不允许任何第二份对照表。
  const cacheStr = cacheText(usage, locale);
  const costStr = costText(usage, locale);
  if (locale === 'en') {
    const latency = `${Math.round(usage.latencyMs / 100) / 10}s`;
    const reasoning = (usage as { reasoningTokens?: number }).reasoningTokens;
    const reasoningStr = typeof reasoning === 'number' && reasoning > 0 ? ` · reasoning ${reasoning}` : '';
    return `${usage.model} (${usage.provider}) · ${usage.tokensIn} in / ${usage.tokensOut} out tokens · ${cacheStr}${reasoningStr} · ${costStr} · ${usage.toolCalls} tool call(s) · model-side ${latency}`;
  }
  const latency = `${Math.round(usage.latencyMs / 100) / 10} 秒`;
  const reasoning = (usage as { reasoningTokens?: number }).reasoningTokens;
  const reasoningStr = typeof reasoning === 'number' && reasoning > 0 ? ` · 推理 ${reasoning}` : '';
  return `${usage.model}（${usage.provider}）· ${usage.tokensIn} 进 / ${usage.tokensOut} 出 token · ${cacheStr}${reasoningStr} · ${costStr} · ${usage.toolCalls} 次工具调用 · 模型侧 ${latency}`;
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
  const c = COPY[locale];
  const statusText = STATUS_TEXT[locale];
  const usageTextL = (usage: TaskUsage | null) => usageText(usage, locale);
  const realtimeText = locale === 'zh' ? REALTIME_TEXT : REALTIME_TEXT_EN;
  const [payload, setPayload] = useState<TasksLedgerPayload>(initial);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const result = await readTasksLedger(projectId);
    if (result.ok) {
      setPayload(result.payload);
      setNote(null);
    } else {
      setNote(c.readFailed(result.reason));
    }
  }, [projectId, c]);

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
  const usages = payload.tasks.reduce<Record<'real' | 'demo' | 'missing', number>>(
    (acc, task) => {
      acc[usageKind(task.usage)] += 1;
      return acc;
    },
    { real: 0, demo: 0, missing: 0 },
  );
  const cache = cacheTotal(payload.tasks.map((task) => task.usage).filter((usage): usage is TaskUsage => usage !== null));

  return (
    <main className="tl-page" data-tasks-root>
      <header className="tl-head">
        <div>
          <h1 className="tl-title" data-tasks-title>
            {c.projectTitle(payload.projectName)}
          </h1>
          <p className="tl-summary" data-tasks-summary>
            {c.summary(
              payload.tasks.length,
              Object.entries(counts)
                .map(([status, n]) => `${statusText[status] ?? status} ${n}`)
                .join(' · ') || c.emptyRuns,
            )}
          </p>
          {payload.tasks.length > 0 ? (
            <p className="tl-summary" data-tasks-usage-summary>
              {c.usageSummary(usages.real, usages.demo, usages.missing)}
            </p>
          ) : null}
          {payload.tasks.length > 0 ? (
            cache.rows > 0 ? (
              <p className="tl-summary" data-tasks-cache-summary={String(cache.cached)}>
                {c.cacheHit(cache.rows, cache.cached, cache.prompt, cache.share === null ? '' : String(cache.share))}
              </p>
            ) : (
              <p className="tl-summary" data-tasks-cache-summary="none">
                {c.cacheUnreported(0)}
              </p>
            )
          ) : null}
        </div>
        <div className="tl-tools">
          <span className="tl-realtime" data-tasks-realtime={realtime.state}>
            {c.realtimePrefix}{realtimeText[realtime.state]}
          </span>
          <Link
            href={`/studio/${projectId}`}
            className="tl-back"
            data-tasks-back
          >
            {c.backStudio}
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
        {c.scope}
      </p>

      {payload.tasks.length === 0 ? (
        <p className="tl-empty" data-tasks-empty>
          {c.noTasks}
        </p>
      ) : (
        <div
          className="tl-tableScroll"
          data-tasks-table-scroll
          role="region"
          aria-label={c.tableScrollAria}
          tabIndex={0}
        >
        <table className="tl-table">
          <thead className="tl-thRow">
            <tr>
              <th>{c.thTime}</th>
              <th>{c.thIntent}</th>
              <th>{c.thAttempt}</th>
              <th>{c.thCapability}</th>
              <th>{c.thStatus}</th>
              <th>{c.thDuration}</th>
              <th>{c.thUsage}</th>
              <th>{c.thReason}</th>
              <th>{c.thAction}</th>
            </tr>
          </thead>
          <tbody>
            {payload.tasks.map((task) => (
              <tr key={task.id} data-task-row={task.id}>
                <td
                  data-task-time={new Date(task.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })}
                  className="tl-tdNowrap"
                  // 时间戳两套 ICU（Node 渲染 vs 浏览器）逐字节可能差一个字符，
                  // 这一格本来就随重读更新，不值得为它报一次 hydration 警告
                  suppressHydrationWarning
                >
                  {new Date(task.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })}
                </td>
                <td>{task.agentKey}</td>
                <td data-task-attempt={task.attempt}>{c.attemptCount(task.attempt)}</td>
                <td data-task-capability={task.capability ?? 'unknown'}>
                  {task.capability === 'real' ? c.capabilityReal : task.capability === 'demo' ? c.capabilityDemo : c.capabilityUnknown}
                </td>
                <td data-task-status={task.status}>{statusText[task.status] ?? task.status}</td>
                <td>{task.durationMs === null ? '—' : c.durationMs(task.durationMs)}</td>
                <td data-task-usage={usageKind(task.usage)} className="tl-tdMuted">
                  {usageTextL(task.usage)}
                </td>
                <td className="tl-tdMuted">{task.error ?? '—'}</td>
                <td>
                  {/* 只有自己的失败/取消行才有按钮：别人行上的按钮点了也只会 404，
                      与其让人点了才知道，不如不挂出来 */}
                  {task.mine && (task.status === 'failed' || task.status === 'cancelled') ? (
                    <TaskRetryButton taskId={task.id} locale={locale} />
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
