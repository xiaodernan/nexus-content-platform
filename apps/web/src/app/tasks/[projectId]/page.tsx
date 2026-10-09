import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TaskRetryButton } from '@/components/TaskRetryButton';
import { listProjectTasks } from '@/server/domain/agent-tasks';
import { requireUser } from '@/server/domain/session';

export const dynamic = 'force-dynamic';

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
 * §112 的账本视图：`/tasks/<项目>`，一次 AI 请求一行。
 *
 * 这一页存在的理由是 §164 那句"Agent task / Generation complete"要有真事件可指——
 * 而真事件的前提是 `agent_tasks` 有写入方（此前它建库以来一行都没被写过）。
 * 现在写入方是 `/api/ai/run`：开始一行 running，结束落 completed / failed。
 *
 * 页面上不假装它比实际更多：今天每一行都对应**一次同步请求**，
 * 原文那种跨步骤的 Agent 任务（Goal → 子任务 → 依赖 → 验收）还没有执行方，
 * 所以这里不会出现"一个任务有 6 个子步骤"的东西——这句话就写在页面顶部。
 */
export default async function TasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  const result = await listProjectTasks(projectId, user.id);
  if (!result) notFound();

  const counts = result.tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-4 px-6 py-10" data-tasks-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold" data-tasks-title>
            {result.projectName} 的任务
          </h1>
          <p className="text-11 text-fg-3" data-tasks-summary>
            共 {result.tasks.length} 行 · {Object.entries(counts).map(([status, n]) => `${STATUS_TEXT[status] ?? status} ${n}`).join(' · ') || '还没有跑过一次'}
          </p>
        </div>
        <Link href={`/studio/${projectId}`} className="text-11 text-accent-2 underline" data-tasks-back>
          回 Studio
        </Link>
      </header>

      <p className="text-11 text-fg-3" data-tasks-scope>
        每一行对应一次 AI 请求（§7 命令栏发起的那种）。§112 那种多步 Agent 任务——Goal、子任务、依赖、验收——
        还没有执行方，所以这张表里不会出现"一个任务带六个步骤"的东西。
        能力那一列区分 real（真 provider）与 demo（DEMO 模板），两者不混写（§160）。
        「等审批」那一行是 §74 的审批门挂起来的：被扣下的补丁不在这里交回，决定要在 Studio 的命令栏里做——
        交回之后仍要走那一条可撤销的编辑事务，而这一页没有画布。
        重试（§162）开的是<strong>新行</strong>：失败的那一次留在表里不抹，「第几次」列写出这是第几回，
        <code>input.retryOf</code> 在库里把两行接起来——历史里看得见"第一次为什么失败"。
      </p>

      {result.tasks.length === 0 ? (
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
            {result.tasks.map((task) => (
              <tr key={task.id} data-task-row={task.id}>
                <td data-task-time={new Date(task.createdAt).toLocaleString('zh-CN', { hour12: false })}>
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
