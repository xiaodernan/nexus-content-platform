import { z } from 'zod';

/**
 * `/api/projects/<id>/tasks` 的报文契约（§162 账本读侧）。
 *
 * **状态：契约已定，但那条路由还不存在**（`app/api/projects/[projectId]/tasks/` 是个空目录），
 * 所以本文件目前**没有任何生产者与消费者**——留着是因为形状本身有价值（见下），
 * 不是为了让人以为读侧已经通了。`/tasks/<项目>` 那一页是**服务端组件**，
 * 直接调 `listProjectTasks` 读库，本来也不需要这条 HTTP 路由；
 * 真要用它，得先有一个客户端消费者（今天没有）。这一条同样记在 ROADMAP 的技术债里。
 *
 * 为什么放在 web 而不是 `packages/schemas`：那个包是 **web ↔ ai-service** 的跨端契约
 * （`docs/ARCHITECTURE.md` 边界纪律 6），账本是 web 自己的表。但它照样要过一遍 zod——
 * 浏览器"服务端说什么就画什么"，报文换了形状时那一手只会把错的东西画得很整齐。
 */

export const TasksLedgerTaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  agentKey: z.string(),
  /**
   * 状态刻意是 `string` 而不是枚举：库里那一列将来多一档时，严格枚举会把
   * 「服务端多了一个状态」变成浏览器上的「账本读不到」。界面本来就有兜底
   * （认不出来的状态原样显示），那条兜底比一个会过期的前端枚举诚实。
   */
  status: z.string().min(1),
  /** 能力那一列：real / demo / unavailable / 没记（§160 要求两者不混写） */
  capability: z.enum(['real', 'demo', 'unavailable']).nullable(),
  attempt: z.number().int().min(0),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
  /** §74：这一行是不是被审批门挂起来的（等待中的行没有 finishedAt，靠这一栏说清为什么） */
  requiresApproval: z.boolean(),
  approvedAt: z.string().nullable(),
  /** 跑完用了多久；没跑完是 null，不拿"到现在为止"冒充时长 */
  durationMs: z.number().nullable(),
});
export type TasksLedgerTask = z.infer<typeof TasksLedgerTaskSchema>;

export const TasksLedgerSchema = z.object({
  ok: z.literal(true),
  projectName: z.string(),
  tasks: z.array(TasksLedgerTaskSchema),
});
export type TasksLedgerPayload = z.infer<typeof TasksLedgerSchema>;
