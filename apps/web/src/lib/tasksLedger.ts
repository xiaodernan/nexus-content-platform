import { z } from 'zod';

/**
 * `/api/projects/<id>/tasks` 的报文契约（§162 账本读侧）+ 浏览器那半的读取函数。
 *
 * **2026-10-09 起这一条活了**：路由在 `app/api/projects/[projectId]/tasks/route.ts`
 * （这个空目录等的就是一个客户端消费者，见 ROADMAP §188 那一节的"死契约"记录），
 * 消费者是 `components/TasksLedgerLive.tsx`——任务页从纯服务端组件变成
 * 「服务端给第一屏 + 客户端订阅实时事件再重读」，状态自己变不用刷新。
 * 为什么仍放 web 而不是 `packages/schemas`：那个包是 **web ↔ ai-service** 的跨端契约
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
  /**
   * 这行是不是看的人自己建的。服务端只在带 actor 的读法里给（`listProjectTasks` 一直带），
   * 所以是可选的：缺了它客户端的处理是"不挂按钮"，而不是把整份报文判成不合契约。
   * 重试按钮只挂自己的行——别人行上的按钮点了也只会 404（§162 那条纪律）。
   */
  mine: z.boolean().optional(),
});
export type TasksLedgerTask = z.infer<typeof TasksLedgerTaskSchema>;

export const TasksLedgerSchema = z.object({
  ok: z.literal(true),
  projectName: z.string(),
  tasks: z.array(TasksLedgerTaskSchema),
});
export type TasksLedgerPayload = z.infer<typeof TasksLedgerSchema>;

/** 读回一份账本的结果。失败带一句**给用户看的**原因（§73：读不到就说读不到，不显示 0 行） */
export type TasksLedgerRead =
  | { ok: true; payload: TasksLedgerPayload }
  | { ok: false; reason: string };

/**
 * 浏览器读账本的那一手。`fetcher` 可注入是为了让"每种失败怎么说"能在单测里钉住——
 * 这几句 reason 会原样出现在界面上，措辞就是承诺（与"名册读不到（…）"同一句式）。
 *
 * 出口过 `TasksLedgerSchema`：HTTP 200 但形状不对时**同样是读不到**，
 * 不把一个缺字段的对象画成一张少了几列的表。
 */
export async function readTasksLedger(
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<TasksLedgerRead> {
  try {
    const res = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/tasks`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body: unknown = await res.json().catch(() => null);
    const parsed = TasksLedgerSchema.safeParse(body);
    if (!parsed.success) return { ok: false, reason: '返回的报文不合契约' };
    return { ok: true, payload: parsed.data };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
