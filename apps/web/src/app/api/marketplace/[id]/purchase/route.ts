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
 *
 * 拒绝按 `PurchaseResult.reason` 翻码（§151）：不存在/已下架/私有草稿 → 404；
 * 免费/自己的/已经买过 → 400。以前这里比对四句英文，句子一改状态码就跟着变。
 * 未知异常仍由 catch 回 500，并记一条服务端日志。
 *
 * 风控（§123）：命中规则的购买写一行 `marketplace_audit_log`
 * （action = `suspicious_purchase`，metadata 带规则与读数）。审计是旁证不是业务前提，
 * 写失败只记 stderr——购买已经成功，不能因为旁证没落库就翻成 500。
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

    if (!result.ok) {
      switch (result.reason) {
        case 'not_found':
          return jsonError(404, 'not_found', { message: '物品不存在或已下架' });
        case 'free_item':
          return jsonError(400, 'free_item', { message: '免费物品无需购买' });
        case 'own_item':
          return jsonError(400, 'own_item', { message: '不能购买自己的物品' });
        case 'already_purchased':
          return jsonError(400, 'already_purchased', { message: '已经购买过此物品' });
      }
    }

    // 记录审计日志
    await auditMarketplaceAction({
      actorId: user.id,
      action: 'purchase',
      itemId: id,
      metadata: { pricePaid: result.pricePaid },
    });

    // 检测可疑行为：命中时把规则与读数落进审计，不再只打一行 warn
    const detection = await detectSuspiciousPatterns(id, user.id);
    if (detection.fired.length > 0) {
      console.warn(
        `[FRAUD] Suspicious purchase: buyer=${user.id}, item=${id}, rules=${detection.fired.join(',')}`,
      );
      try {
        await auditMarketplaceAction({
          actorId: user.id,
          action: 'suspicious_purchase',
          itemId: id,
          metadata: { rules: detection.fired, counts: detection.counts },
        });
      } catch (auditError) {
        console.error('Failed to record suspicious purchase audit:', auditError);
      }
    }

    // 购买成功后触发创作者分成（静默失败，不影响购买流程）
    try {
      const settled = await settlePurchase({ purchaseId: result.purchaseId });
      // 已经结过 / 价格 0 没有收入可分 是正常结局；其余 reason 才值得记一条
      if (!settled.ok && settled.reason !== 'already_settled' && settled.reason !== 'no_revenue') {
        console.error('Failed to settle purchase:', settled.reason);
      }
    } catch (settleError) {
      console.error('Failed to settle purchase:', settleError);
    }

    return NextResponse.json({
      purchaseId: result.purchaseId,
      pricePaid: result.pricePaid,
    });
  } catch (error) {
    console.error('Purchase failed:', error);
    return jsonError(500, 'purchase_failed', { message: '购买失败，请稍后重试' });
  }
}
