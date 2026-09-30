import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import { recordAudit } from './audit';
import { PLAN_KEYS, PLAN_LIMITS, PLAN_MONTHLY_GRANTS, isPlanKey, type PlanKey } from './credits';

/**
 * "改档位"的入口（§133）。ADR-0014 当时记的是"改档位没有界面：`UPDATE users SET plan` 是服务端代码里的事"，
 * 这一格补的就是那句话。
 *
 * 三条与 `setUserRole` 同源、一条刻意不同：
 * - **只有 admin 能改**，规则在写库之前问，不靠前端把按钮藏起来。每一次尝试都进审计：成功、被拒、
 *   以及"点了但选的还是原来那一档"都记一行。三条读起来是不同的信号——成功是运营动作，被拒是有人越权，
 *   同档位重复提交是有人拿这个端点当探针扫（前端会挡住这条路，所以走到这里的请求要么是脚本要么是页面 bug）。
 *   判序上**先判权限再判报文**：否则越权的那一行会因为随手带了个错档位而被记成 `unknown_plan`。
 * - **档位值必须是五档之一**。库里 `users.plan` 那一列也有 CHECK，两层都要有：
 *   这一层的拒法能带上一句话（"五档是 …"），库里那一层的拒法是最后一道墙。
 * - **允许改自己的档位**，与角色相反。理由不是"拦不住"——admin 本来就有全部权力——而是两件事性质不同：
 *   改角色是**授予权限**（自己提权 = 拿到这个会话的人就能变成审核员），改档位是**发放额度**。
 *   拒绝自己改会让"本机只有一个账号"的开发环境根本用不了这个入口，而它挡不住任何真实的滥用
 *   （能直接改库的人不需要走这个入口）。这条不对称写在 ADR-0021 里（此前这里写的是 ADR-0019，
 *   而那一份讲的是公开 API 的 Bearer 凭据，与档位无关——错引一份存在的文档比不写还难查）。
 * - **没有支付**（§159）：这是运营兜底动作，不是购买流程。界面上不许出现"升级"这类词，
 *   也不许标价——账面上今天没有任何一分钱流进来。
 */

export type PlanResult =
  | { ok: true; targetId: string; previous: PlanKey; plan: PlanKey }
  | { ok: false; status: 403 | 404 | 400; code: string; reason: string };

/** `plan` 在拒的那条分支里仍是 unknown；`String({})` 只会留下 `[object Object]`，故按 JSON 形状记。 */
function auditPlanShape(plan: unknown): string {
  if (typeof plan === 'string') return plan;
  const encoded = JSON.stringify(plan);
  return encoded === undefined ? String(plan) : encoded;
}

export async function setUserPlan(actorId: string, targetId: string, plan: unknown): Promise<PlanResult> {
  const db = getDb();
  const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1);
  if (actor?.role !== 'admin') {
    await recordAudit({
      actorId,
      action: 'user.plan.change',
      targetType: 'user',
      targetId,
      allowed: false,
      detail: { reason: 'not_admin', wanted: plan },
    });
    return { ok: false, status: 403, code: 'forbidden', reason: '只有审核员能改档位' };
  }

  if (!isPlanKey(plan)) {
    await recordAudit({
      actorId,
      action: 'user.plan.change',
      targetType: 'user',
      targetId,
      allowed: false,
      // 这一列是 unknown，审计里要看得出传进来的形状，所以走 JSON 而不是 String
      detail: { reason: 'unknown_plan', wanted: auditPlanShape(plan) },
    });
    return {
      ok: false,
      status: 400,
      code: 'unknown_plan',
      reason: `没有这个档位：${String(plan)}（五档是 ${PLAN_KEYS.join(' / ')}）`,
    };
  }

  const [target] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);
  if (!target) return { ok: false, status: 404, code: 'not_found', reason: '没有这个账号' };
  // 库里那一列被人写成未知值时按 free 报（`planOf` 同一条口径），否则"从哪个档换过来的"会记成 null
  const previous: PlanKey = isPlanKey(target.plan) ? target.plan : 'free';

  await db.update(users).set({ plan, updatedAt: new Date() }).where(eq(users.id, targetId));
  await recordAudit({
    actorId,
    action: 'user.plan.change',
    targetType: 'user',
    targetId,
    allowed: true,
    // 把这一档的额度与存储上限一起记下来：事后读审计的人不用再去翻当时的代码才知道这次改了什么
    detail: {
      from: previous,
      to: plan,
      // 同档位重复提交也落一行：`changed: false` 让它和真的改档分开读
      changed: previous !== plan,
      self: actorId === targetId,
      grants: PLAN_MONTHLY_GRANTS[plan],
      storageMb: PLAN_LIMITS[plan].storageMb,
    },
  });
  return { ok: true, targetId, previous, plan };
}
