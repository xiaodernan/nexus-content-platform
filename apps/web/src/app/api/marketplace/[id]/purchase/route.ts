import { NextResponse } from 'next/server';
import { purchaseMarketplaceItem, settlePurchase, auditMarketplaceAction, detectSuspiciousPatterns } from '@/server/domain/marketplace';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { jsonError } from '@/server/http';

/**
 * §127-128 Marketplace 购买：用 credits 结算一次购买。
 *
 * 需要登录 + CSRF 双提交。幂等性由库里的 `UNIQUE(item_id, buyer_id)` 保证。
 * 购买成功后同步触发创作者分成（§128）。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });

  const user = await requireUser();
  const { id } = await params;

  try {
    const result = await purchaseMarketplaceItem({
      buyerId: user.id,
      itemId: id,
    });

    // 记录审计日志
    await auditMarketplaceAction({
      actorId: user.id,
      action: 'purchase',
      itemId: id,
      metadata: { pricePaid: result.pricePaid },
    });

    // 检测可疑行为
    const isSuspicious = await detectSuspiciousPatterns(id, user.id);
    if (isSuspicious) {
      console.warn(`[FRAUD] Suspicious purchase detected: buyer=${user.id}, item=${id}`);
      // TODO: 自动创建举报或标记为待审核
    }

    // 购买成功后触发创作者分成（静默失败，不影响购买流程）
    try {
      await settlePurchase({ purchaseId: result.purchaseId });
    } catch (settleError) {
      const msg = settleError instanceof Error ? settleError.message : String(settleError);
      // Already settled / No revenue to split 是正常情况，不报错
      if (msg !== 'Already settled' && msg !== 'No revenue to split') {
        console.error('Failed to settle purchase:', settleError);
      }
    }

    return NextResponse.json({
      purchaseId: result.purchaseId,
      pricePaid: result.pricePaid,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'Item not found or deleted') {
      return jsonError(404, 'not_found', { message: '物品不存在或已下架' });
    }
    if (msg === 'Free items do not require purchase') {
      return jsonError(400, 'free_item', { message: '免费物品无需购买' });
    }
    if (msg === 'Cannot purchase your own item') {
      return jsonError(400, 'own_item', { message: '不能购买自己的物品' });
    }
    if (msg === 'Already purchased') {
      return jsonError(400, 'already_purchased', { message: '已经购买过此物品' });
    }
    console.error('Purchase failed:', error);
    return jsonError(500, 'purchase_failed', { message: '购买失败，请稍后重试' });
  }
}
