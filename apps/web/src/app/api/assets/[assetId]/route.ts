import { NextResponse } from 'next/server';
import { deleteAsset } from '@/server/domain/assets';
import { requireUser } from '@/server/domain/session';
import { failure, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

/**
 * 删除资产（§101）。
 *
 * 刻意不做"软删保留 30 天"：平台还没有回收站语义，留着字节只会被当成仍在用。
 * 设计模型里引用它的 paint 由用户自己删；撤销能恢复引用，但字节回不来——
 * 界面提示里把这一点写明白，不让它悄悄发生（§159）。
 */
export async function DELETE(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { assetId } = await ctx.params;
  try {
    const user = await requireUser();
    const removed = await deleteAsset(assetId, user.id);
    if (!removed) return notFound();
    return NextResponse.json({ ok: true, removed: assetId });
  } catch (error) {
    return failure(error, `DELETE /api/assets/${assetId}`);
  }
}
