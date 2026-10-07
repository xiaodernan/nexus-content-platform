import { NextResponse } from 'next/server';
import { getMarketplaceItem, hasPurchased, incrementDownloadCount, auditMarketplaceAction } from '@/server/domain/marketplace';
import { requireUser } from '@/server/domain/session';
import { buildProjectExport } from '@/server/domain/export';
import { jsonError } from '@/server/http';

/**
 * §127-128 Marketplace 内容交付：下载物品的 ZIP 包。
 *
 * 三条规则：
 * - **免费物品**：任何人（包括未登录）都能下；
 * - **付费物品**：必须是购买者或创作者本人才能下；
 * - **每次成功交付**：`downloadCount` +1，计数与下载行为绑定。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // 先查物品基本信息（公开检查不需要登录）
  const item = await getMarketplaceItem(id);
  if (!item) return jsonError(404, 'not_found', { message: '没有这个条目，或它已经下架' });

  // 免费物品：任何人都能下
  if (item.visibility === 'free') {
    await incrementDownloadCount(id);
    // 记录审计日志（匿名用户用 null actorId，但数据库要求非空，所以跳过匿名下载的审计）
    return serveContentZip(item, null);
  }

  // 付费物品或私有物品：需要登录鉴权
  let user;
  try {
    user = await requireUser();
  } catch {
    return jsonError(401, 'unauthorized', { message: '需要登录后才能下载此物品' });
  }

  // 创作者本人可以下载自己的物品
  const isCreator = item.creatorId === user.id;

  // 检查是否已购买
  const purchased = await hasPurchased(id, user.id);

  if (!isCreator && !purchased) {
    return jsonError(403, 'not_purchased', {
      message: '尚未购买此物品，请先完成购买',
    });
  }

  // 成功交付：计数 +1，记录审计日志
  await incrementDownloadCount(id);
  await auditMarketplaceAction({
    actorId: user.id,
    action: 'download',
    itemId: id,
    metadata: { isCreator },
  });
  return serveContentZip(item, user.id);
}

async function serveContentZip(item: Awaited<ReturnType<typeof getMarketplaceItem>>, userId: string | null) {
  if (!item) {
    return jsonError(404, 'not_found', { message: '物品不存在' });
  }

  // 如果没有源项目，返回 404（无法导出内容）
  if (!item.sourceProjectId) {
    return jsonError(404, 'no_source', { message: '该物品没有可导出的源项目' });
  }

  try {
    // 构建 ZIP 导出包（免费版只包含 design + code，不含 assets）
    const result = await buildProjectExport(item.sourceProjectId, userId ?? item.creatorId, ['design', 'code']);
    if (!result) {
      return jsonError(404, 'export_failed', { message: '导出失败，源项目不存在或无权访问' });
    }

    const bytes = result.bytes;
    // 确保 buffer 是 ArrayBuffer 而非 SharedArrayBuffer
    let safeBytes: Uint8Array<ArrayBuffer>;
    if (bytes.buffer instanceof SharedArrayBuffer) {
      safeBytes = new Uint8Array(Array.from(bytes)) as Uint8Array<ArrayBuffer>;
    } else {
      safeBytes = bytes as Uint8Array<ArrayBuffer>;
    }
    return new NextResponse(new Blob([safeBytes]), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${item.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.zip"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Failed to build export ZIP:', error);
    return jsonError(500, 'export_failed', { message: '导出失败，请稍后重试' });
  }
}
