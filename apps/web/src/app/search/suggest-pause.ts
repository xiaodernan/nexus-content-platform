/**
 * §165 搜索建议的 429：服务端说"打字太快"时，界面要**看得见**地停一下，
 * 而不是把建议默默藏起来——藏起来与"这个词没有命中"在用户眼里是同一件事。
 *
 * 两个纯函数：怎么读 `retryAfterMs`、还剩几秒。夹在 120s 以内是防守：
 * 服务端把窗口配成 10 分钟时，建议不该在整段时间里彻底消失（结果页照常能用，
 * 提示里也要说清这一点）。
 */

export const SUGGEST_PAUSE_FALLBACK_MS = 30_000;
export const SUGGEST_PAUSE_MAX_MS = 120_000;

/** 429 时返回要暂停多久（ms）；不是 429 返回 null（交给原来的错误路径） */
export function pauseMsFromResponse(status: number, body: unknown): number | null {
  if (status !== 429) return null;
  const raw = (body as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return SUGGEST_PAUSE_FALLBACK_MS;
  return Math.min(Math.trunc(raw), SUGGEST_PAUSE_MAX_MS);
}

/** 提示里显示的还剩几秒（向上取整；过期后是 0） */
export function remainingSeconds(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}
