/**
 * 资产的 URL 投影（§16：设计模型是唯一真值，渲染/预览/发布都是它的投影）。
 *
 * 设计模型里 image paint 只持有 `assetId`——模型不认识存储（§64/§101）。
 * 「assetId → 可请求的 URL」这一步属于**投影**，它随渲染场景变化：
 *   - Studio 画布、预览      → 走鉴权 API `/api/assets/<id>/file`
 *   - 已发布站点 / 截图       → 走稳定的公共 URL（§57 分享链接必须能被匿名访问）
 * 所以这里把解析器做成**可注入**的，render.ts 只依赖接口，不依赖数据库与存储。
 */

/** 模型里 image paint 的 fit 语义（§design-model Paint.image.fit） */
export type AssetFit = 'cover' | 'contain' | 'fill' | 'tile';

export interface AssetUrlContext {
  /**
   * assetId → URL。返回 null 表示该资产不可解析（缺失、无权限）；
   * 此时渲染层**明确跳过**，不产出破图占位（§159 禁止假渲染）。
   */
  assetUrl: (assetId: string) => string | null;
}

/**
 * Studio / 预览用解析器：任何 assetId 都映射到鉴权 API 路由。
 * 是否存在、是否有权限由该路由自己判定（404 → 渲染层跳过）。
 */
export function apiAssetUrl(assetId: string): string {
  return `/api/assets/${encodeURIComponent(assetId)}/file`;
}

/**
 * 已发布站点 / 截图用解析器：公共读路径（§57）。
 * 发布产物不认识 assetId 的权限语义，只认稳定的公开地址。
 */
export function publicAssetUrl(handle: string, assetId: string): string {
  return `/api/public/${encodeURIComponent(handle)}/assets/${encodeURIComponent(assetId)}`;
}

/** fit → CSS background-size 的确定性映射（不可映射的组合一律显式报错，不猜） */
export function fitToBackgroundSize(fit: AssetFit | undefined): string {
  switch (fit) {
    case 'contain':
      return 'contain';
    case 'fill':
      return '100% 100%';
    case 'tile':
      return 'auto';
    case 'cover':
    case undefined:
      return 'cover';
    default: {
      const exhaustive: never = fit;
      throw new Error(`未知的 image fit：${String(exhaustive)}`);
    }
  }
}

/** tile 需要 repeat，其余一律不重复 */
export function fitToBackgroundRepeat(fit: AssetFit | undefined): string {
  return fit === 'tile' ? 'repeat' : 'no-repeat';
}
