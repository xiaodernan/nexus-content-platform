import { NextResponse } from 'next/server';
import {
  MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR,
  auditMarketplaceAction,
  getMarketplaceItem,
  hasPurchased,
  incrementDownloadCount,
} from '@/server/domain/marketplace';
import { currentUserOrNull } from '@/server/domain/session';
import { buildProjectExport } from '@/server/domain/export';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { jsonError } from '@/server/http';

/**
 * §127-128 Marketplace 内容交付：下载物品的 ZIP 包。
 *
 * 这一道门是 `downloadCount` 那个数字**唯一的写入方**（界面上「下载（N）」印的就是它，
 * 列表与详情都读它）。曾经有第二个写它的入口 `POST /[id]/download`——那条只记数不交付，
 * 界面上 #120 换成这里之后再也没有调用方，于是「记一次下载」与「交付一份内容」变成两件事：
 * 一个脚本可以只打那条门把数字灌成任意大的数，而一次真交付都没发生。
 * 现在这个数只有一个含义：**成功交付了几次**。
 *
 * 四条规则：
 * - **免费物品**：任何人（包括未登录）都能下；
 * - **付费/公开物品**：必须是购买者或创作者本人才能下；
 * - **计数跟着交付走**：ZIP 没建成（没有源项目、项目已删除、导出抛错）就一行都不写——
 *   以前是先 +1 再去建包，那三条失败路径照样让数字变大，界面上那个数就成了假话；
 * - **限流按 IP + 条目**（与 §168 的 `/api/published/visit` 同一档处理，匿名可写就要挡暴力）。
 *
 * 限度（界面上 `data-marketplace-limits` 念的是同一套）：
 * 匿名下载免费物品**不留审计行**——`marketplace_audit.actor_id` 是非空列，没有身份可记，
 * 所以风控看到的 download 审计只覆盖有身份的那些次；交付的包是 design + code + assets 三档，
 * **含资产字节**（以创作者身份读取源项目的私有素材，§80 的鉴权路由保证只有创作者能读）。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // 门放在读库之前：与那条被删掉的计数门同一口径（先挡人，再费劲查东西）
  const rl = getRateLimiter().hit(
    rateKey('marketplace/content', clientIp(req), id),
    MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR,
    60 * 60 * 1000,
  );
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '下载太频繁', retryAfterMs: rl.retryAfterMs });
  }

  const item = await getMarketplaceItem(id);
  // 不存在、已下架、以及**形状根本不对的 id** 给同一个答案（404）：403 会泄露"这个 id 存在但你看不到"。
  // 形状那道门在 `getMarketplaceItem` 里（domain/ids.ts）——这里曾经临时挡过一道，收进域层后
  // 详情、预览图、交付三条读路共用同一处，不必每条路由各抄一遍
  if (!item) return jsonError(404, 'not_found', { message: '没有这个条目，或它已经下架' });
  const user = await currentUserOrNull();
  const isCreator = !!user && item.creatorId === user.id;

  // 免费之外的那两档（在售 / 私密）都要身份：私密已不能再被新买（见 purchase 那道门），
  // 这里对匿名一律 401，对登录但未购买的人 403
  if (item.visibility !== 'free' && !isCreator) {
    if (!user) return jsonError(401, 'unauthorized', { message: '需要登录后才能下载此物品' });
    if (!(await hasPurchased(id, user.id))) {
      return jsonError(403, 'not_purchased', { message: '尚未购买此物品，请先完成购买' });
    }
  }

  // 先建包，建成了才记数——失败那三条路径一行都不写
  if (!item.sourceProjectId) {
    return jsonError(404, 'no_source', { message: '该物品没有可导出的源项目' });
  }
  // 建包这一步自己会抛（库坏了、字节读不出来），抛了就是没交付：500 照旧给可判别的码，计数一行都不写
  let zipped: Awaited<ReturnType<typeof buildProjectExport>>;
  try {
    // 建包永远以**创作者**的身份走 §144：`buildProjectExport` 里的归属门判的是"项目在谁名下"，
    // 买家的下载授权由上面那道购买判定给（买过 / 免费 / 本人）。用 `user?.id` 会把它变成
    // "只有作者自己能下"——买家扣了点数却永远拿到 404，正是这一格存在的理由被推翻。
    zipped = await buildProjectExport(item.sourceProjectId, item.creatorId, ['design', 'code', 'assets']);
  } catch {
    return jsonError(500, 'export_failed', { message: '导出失败，请稍后重试' });
  }
  if (!zipped) {
    return jsonError(404, 'export_failed', { message: '导出失败，源项目不存在或无权访问' });
  }

  // 先把手上的包做成一个**能发出去的响应**，再写计数与审计：
  // 顺序反了的话，"响应头构造失败"这一类意外会留下一条没人拿到过东西的交付记录
  const response = zipResponse(zipped.bytes, item.title);

  await incrementDownloadCount(id);
  // 匿名下载没有身份可记（actor_id 非空），所以这一格只在有身份时留审计行
  if (user) {
    await auditMarketplaceAction({
      actorId: user.id,
      action: 'download',
      itemId: id,
      metadata: { isCreator },
    });
  }

  return response;
}

/**
 * 字节出口，与 §144 导出门同一写法（两个门不许给两套头部规则）：
 * - 体走 `Buffer.from`：它按元素复制，`Uint8Array` 背后是 `SharedArrayBuffer` 也吃得下；
 * - **`filename` 只放 ASCII**：HTTP 头的值是 ByteString（latin1），中文标题塞进去会在构造响应时
 *   直接抛 `TypeError`——标题是中文的条目在本门改之前是"每次交付都 500"；
 *   真名走 RFC 5987 的 `filename*`，浏览器拿得到原始标题。
 */
function zipResponse(bytes: Uint8Array, title: string): NextResponse {
  const ascii = title.replace(/[^ -~]/g, '').replace(/["\\]/g, '').trim().replace(/\s+/g, '_') || 'nexus-marketplace';
  const name = `${ascii}.zip`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(`${title}.zip`)}`,
      'content-length': String(bytes.length),
      'cache-control': 'private, max-age=3600',
    },
  });
}