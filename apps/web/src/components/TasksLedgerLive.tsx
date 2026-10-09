'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskRetryButton } from '@/components/TaskRetryButton';
import { readTasksLedger, type TasksLedgerPayload } from '@/lib/tasksLedger';
import { REALTIME_TEXT, useRealtime } from '@/lib/useRealtime';

const STATUS_TEXT: Record<string, string> = {
  queued: '排队中',
  planning: '规划中',
  running: '在跑',
  succeeded: '完成',
  failed: '失败',
  cancelled: '已取消',
  /**
   * 枚举里这一档叫 `awaiting_approval`（0000 建库时定的），这里以前写的是 `needs_approval`。
   * 全库没有人把任务置成等待态时，那个错 key 是看不出来的；§74 接上写入方之后，
   * 表格里就会原样露出英文的那一个——所以这一行现在是有作者的，别再改回去。
   */
  awaiting_approval: '等审批',
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
 */

export function TasksLedgerLive({ projectId, initial }: { projectId: string; initial: TasksLedgerPayload }) {
  const [payload, setPayload] = useState<TasksLedgerPayload>(initial);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const result = await readTasksLedger(projectId);
    if (result.ok) {
      setPayload(result.payload);
      setNote(null);
    } else {
      setNote(`账本读不到（${result.reason}）：以刷新后的数据为准`);
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

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-4 px-6 py-10" data-tasks-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold" data-tasks-title>
            {payload.projectName} 的任务
          </h1>
          <p className="text-11 text-fg-3" data-tasks-summary>
            共 {payload.tasks.length} 行 ·{' '}
            {Object.entries(counts)
              .map(([status, n]) => `${STATUS_TEXT[status] ?? status} ${n}`)
              .join(' · ') || '还没有跑过一次'}
          </p>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-11 text-fg-3" data-tasks-realtime={realtime.state}>
            实时：{REALTIME_TEXT[realtime.state]}
          </span>
          <Link href={`/studio/${projectId}`} className="text-11 text-accent-2 underline" data-tasks-back>
            回 Studio
          </Link>
        </div>
      </header>

      {note ? (
        <p className="text-11 text-danger" data-tasks-live-note>
          {note}
        </p>
      ) : null}

      <p className="text-11 text-fg-3" data-tasks-scope>
        每一行对应一次 AI 请求（§7 命令栏发起的那种）。§112 那种多步 Agent 任务——Goal、子任务、依赖、验收——
        还没有执行方，所以这张表里不会出现"一个任务带六个步骤"的东西。
        能力那一列区分 real（真 provider）与 demo（DEMO 模板），两者不混写（§160）。
        「等审批」那一行是 §74 的审批门挂起来的：被扣下的补丁不在这里交回，决定要在 Studio 的命令栏里做——
        交回之后仍要走那一条可撤销的编辑事务，而这一页没有画布。
        重试（§162）开的是<strong>新行</strong>：失败的那一次留在表里不抹，「第几次」列写出这是第几回，
        <code>input.retryOf</code> 在库里把两行接起来——历史里看得见"第一次为什么失败"。
        状态自己变是实时事件催的重读：事件只负责"该来读一次了"，表里的每个字都来自库里（ADR-0010/0029）。
      </p>

      {payload.tasks.length === 0 ? (
        <p className="text-13 text-fg-2" data-tasks-empty>
          这个项目还没有跑过任何一次 AI 请求。
        </p>
      ) : (
        <table className="w-full text-11">
          <thead className="text-left text-fg-3">
            <tr>
              <th>时间</th>
              <th>意图</th>
              <th>第几次</th>
              <th>能力</th>
              <th>状态</th>
              <th>用时</th>
              <th>结果 / 原因</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {payload.tasks.map((task) => (
              <tr key={task.id} data-task-row={task.id}>
                <td
                  data-task-time={new Date(task.createdAt).toLocaleString('zh-CN', { hour12: false })}
                  // 时间戳两套 ICU（Node 渲染 vs 浏览器）逐字节可能差一个字符，
                  // 这一格本来就随重读更新，不值得为它报一次 hydration 警告
                  suppressHydrationWarning
                >
                  {new Date(task.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </td>
                <td>{task.agentKey}</td>
                <td data-task-attempt={task.attempt}>第 {task.attempt} 次</td>
                <td data-task-capability={task.capability ?? 'unknown'}>
                  {task.capability === 'real' ? '真模型' : task.capability === 'demo' ? 'DEMO 模板' : '未知'}
                </td>
                <td data-task-status={task.status}>{STATUS_TEXT[task.status] ?? task.status}</td>
                <td>{task.durationMs === null ? '—' : `${Math.round(task.durationMs / 100) / 10} 秒`}</td>
                <td className="text-fg-2">{task.error ?? '—'}</td>
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
      )}
    </main>
  );
}
