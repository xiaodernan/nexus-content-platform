import { notFound } from 'next/navigation';
import { TasksLedgerLive } from '@/components/TasksLedgerLive';
import { listProjectTasks } from '@/server/domain/agent-tasks';
import { requireUser } from '@/server/domain/session';

export const dynamic = 'force-dynamic';

/**
 * §112 的账本视图：`/tasks/<项目>`，一次 AI 请求一行。
 *
 * 这一页存在的理由是 §164 那句"Agent task / Generation complete"要有真事件可指——
 * 而真事件的前提是 `agent_tasks` 有写入方（此前它建库以来一行都没被写过）。
 *
 * 2026-10-09（#10）起这里只做三件事：**鉴权、读第一屏、交出去**。
 * 表格与状态的"活的一半"在 `components/TasksLedgerLive.tsx`：它订阅项目频道，
 * 每一次任务行状态变化（服务端在状态写入方各推一条 `generation.progress`）就重读这份 GET
 * ——所以另一个标签页提交的作业，这一页不用刷新也能看见它从"在跑"走到"完成"。
 * 为什么不是整页都搬进客户端：第一屏仍由服务端直读库渲染（无 JS 也有一张完整的表），
 * `initial` 就是那一份权威；客户端只负责之后的增量。
 *
 * 页面上不假装它比实际更多：今天每一行都对应**一次 AI 请求**，
 * 原文那种跨步骤的 Agent 任务（Goal → 子任务 → 依赖 → 验收）还没有执行方，
 * 所以这里不会出现"一个任务有 6 个子步骤"的东西——这句话就写在页面顶部。
 */
export default async function TasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  const result = await listProjectTasks(projectId, user.id);
  if (!result) notFound();

  return (
    <TasksLedgerLive
      projectId={projectId}
      initial={{ ok: true, projectName: result.projectName, tasks: result.tasks }}
    />
  );
}
