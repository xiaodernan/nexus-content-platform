import { NextResponse } from 'next/server';
import { TasksLedgerSchema } from '@/lib/tasksLedger';
import { listProjectTasks } from '@/server/domain/agent-tasks';
import { requireUser } from '@/server/domain/session';
import { apiJson, failure, jsonError } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * 任务账本的读侧（§162 × #10 账本实时）。
 *
 * `/tasks/<项目>` 那一页本来是纯服务端组件、直接读库——这个目录因此空了很久
 * （报文契约在 `lib/tasksLedger.ts`，当时写着"要活起来得先有客户端消费者"）。
 * #10 补上的就是那个消费者：任务页订阅实时事件之后要**按事件重读权威**，
 * 而"重读"不能靠刷新整个页面（那就不如不订阅了），所以这条 GET 有了真正的用武之地。
 *
 * 三条口径与页面同一份：
 * - 归属由 `listProjectTasks` 判（项目不是你的就 null）→ 404，连"有没有任务"都不给；
 * - 出口过 `TasksLedgerSchema.safeParse`：200 一定是契约形状，客户端不用猜；
 * - `cache-control: no-store`（apiJson 默认）：账本每次都是现场读，不给中间层一份旧的。
 *
 * 实时事件在这条路上只是加速器：断线期间的事件不补发，客户端 `onReconnect` 会来这里重读
 * （ADR-0010 后果第 4 条 / ADR-0029）。所以这条 GET 也是那条纪律的落点。
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { projectId } = await ctx.params;
    const user = await requireUser();
    const result = await listProjectTasks(projectId, user.id);
    if (!result) return jsonError(404, 'not_found', { message: '没有这个项目，或者它不属于你' });
    const parsed = TasksLedgerSchema.safeParse({ ok: true, projectName: result.projectName, tasks: result.tasks });
    if (!parsed.success) {
      // 服务端自己的报文对不上契约：这是 bug，不是用户的错——照实 500，不发一份"差不多"的出去
      return failure(new Error('任务账本报文不合 TasksLedgerSchema'), 'GET /api/projects/<id>/tasks');
    }
    return apiJson(parsed.data, req);
  } catch (error) {
    return failure(error, 'GET /api/projects/<id>/tasks');
  }
}
