/**
 * 匿名访客 key：同一个浏览器里稳定，用来把"同一个人的多次记录"并成一份。
 *
 * 为什么单独收成一处（而不是各自写一份）：访客现场（滚了多久）与游戏通关
 * 必须指的是**同一个人**——两处各生成一把 key，于是"看过这一页的人"与
 * "通关的人"成了两拨人，谁也说不清谁是谁（§16：一份真值）。
 *
 * 拿不到 localStorage（隐私模式）就退化成"每次打开一个 key"——
 * 这时访客数会偏高，界面上要按"至少这么多人"来读，所以这一笔由调用方带在注释里，
 * 而不是在这里假装两个分支等价。
 */
export const VISITOR_KEY_STORAGE = 'nexus.visit.key';

/** 32 位十六进制的匿名 key；不合法就当没有 */
export function visitorKey(): string {
  try {
    const stored = window.localStorage.getItem(VISITOR_KEY_STORAGE);
    if (stored && /^[0-9a-f]{32}$/.test(stored)) return stored;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const fresh = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    window.localStorage.setItem(VISITOR_KEY_STORAGE, fresh);
    return fresh;
  } catch {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}
