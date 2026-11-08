import { eq } from 'drizzle-orm';
import { getDb } from '../../src/server/db/client';
import { users } from '../../src/server/db/schema';
import type { PlanKey } from '../../src/server/domain/credits';

/**
 * 把测试用户升到指定档位（#199 引入）。
 *
 * §133 publishing 名额门（`refusalForPublishSlot`）按 owner 档位计数：free 档同时只能
 * 公开发 1 个项目。大量既有集成用例的用法是"同一个 owner 反复发布多个项目"
 * （trending / social / moderation 的排序与联动用例都如此）——那不是把门松动的理由，
 * 是测试数据该待在真实档位上。这些用例在测的不是档位，把用户设到 studio 档
 * （并发 100）跑；名额门本身由 `publish.integration.test.ts` 里一个 free 档新用户钉。
 */
export async function raisePlan(userId: string, plan: PlanKey = 'studio'): Promise<void> {
  await getDb().update(users).set({ plan }).where(eq(users.id, userId));
}
