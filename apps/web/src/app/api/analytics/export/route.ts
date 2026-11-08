import { analyticsCsv, creatorAnalytics } from '@/server/domain/analytics';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError } from '@/server/http';

/**
 * §168：把创作者侧那一份数字**导出**成 CSV。
 *
 * 三条边界：
 * - **只给本人**：读的是 `creatorAnalytics(自己的 id)` ⇒ 别人的作品一个字节都不在里面；
 * - **没登录是 401**，不是 500（这一格是"作者自己拿数据"，不是"谁都能拿"）；
 * - **数字与页面同一份**：`creatorAnalytics` 是同一个函数 ⇒ 页面写几个、导出就写几个
 *   （§159：两份各写一遍的数迟早漂）。
 *
 * `null`（没采到）在导出里是**空单元格**，不是 0 ⇒ "未采集"与"采到 0"分得开
 * （页面那一侧也是这么写的：这里换了口径，两处就会说不同的话）。
 */
export async function GET(): Promise<Response> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  try {
    const rows = await creatorAnalytics(user.id);
    const csv = analyticsCsv(rows);
    // **带 BOM**（U+FEFF）：Excel 打开无 BOM 的 UTF-8 CSV 会把中文读成乱码（这一格是给人拿去用的）
    return new Response('\uFEFF' + csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="creator-analytics.csv"',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(500, 'export_failed', { message: `导出失败：${message}` });
  }
}
