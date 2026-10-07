import { NextResponse } from 'next/server';
import { incrementDownloadCount, getMarketplaceItem } from '@/server/domain/marketplace';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { jsonError } from '@/server/http';

/**
 * §127-128 Marketplace 下载追踪：记一次下载并回当前计数。
 *
 * 这个接口**匿名可写**（公开物品谁都能下），所以与 §168 的 `/api/published/visit` 同一档处理——
 * 那一条是这个仓库里"匿名可写"的参照实现，三道边界一条都不能少：
 *
 * 1. **CSRF 双提交照样要**。middleware 给每个访客（含游客）都签了 `nexus_csrf`，
 *    不存在"匿名就没有 token"这回事。客户端那边 `MarketplaceItemRow` 的 DELETE / PATCH
 *    本来就带着 `csrfHeaders()`，只有下载这一处漏了——两边一起漏，所以一直没红。
 * 2. **按 IP + 条目限流**。`downloadCount` 是给人看的数字（列表与详情都印它），
 *    不限流的话一个脚本能把它灌成任意大的数，那个数字从此就没有意义。
 *    这一格今天不参与排序（排序按 `createdAt`），所以现在只是"数字会变成假话"；
 *    但数字一旦假了，排序真接上那天就是直接可刷。
 * 3. **报错走 `jsonError`**。以前这里回的是 `{ error: 'Item not found...' }`——那个字段装的是
 *    一句**英文人话**，客户端拿不到可判别的码；`jsonError` 把它换成全站一致的
 *    **机器可读的码**（`error: 'not_found'`），人话挪到 `message` 里并且是中文。
 *
 * 成功那条仍然回 `{ downloadCount }`（客户端读的就是它），与上面的边界无关。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { id } = await params;

  // 上限按"一个人一天能点几次下载"定：正常用是个位数，给到 60 次/小时已经很宽松
  const rl = getRateLimiter().hit(rateKey('marketplace/download', clientIp(req), id), 60, 60 * 60 * 1000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '下载上报太频繁', retryAfterMs: rl.retryAfterMs });
  }

  const item = await getMarketplaceItem(id);
  // 不存在与已下架在这里给同一个答案（404）：403 会泄露"这个 id 存在但你看不到"
  if (!item) return jsonError(404, 'not_found', { message: '没有这个条目，或它已经下架' });

  if (item.visibility !== 'public' && item.visibility !== 'free') {
    return jsonError(403, 'not_downloadable', { message: '这个条目不开放下载' });
  }

  const newCount = await incrementDownloadCount(id);
  return NextResponse.json({ downloadCount: newCount });
}
