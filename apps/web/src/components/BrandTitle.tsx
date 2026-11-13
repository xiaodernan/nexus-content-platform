import type { ReactNode } from 'react';

/**
 * 统一品牌大标题：brand 主色渐变 + bg-clip-text 透出白字（v687 / cont. 68 引入）。
 * 此前 21 处各自复制同一组 className；这一格只写一次，撤图片设计纪律（ADR 0109）。
 *
 * - `tag`：h1/h2/h3，默认 h1（各页原 h1 形状 1:1 继承）
 * - `pb-2` 默认开：brand 渐变下方预留一行给底弦（不靠页面自己写位置）
 */
type BrandTag = 'h1' | 'h2' | 'h3';

export function BrandTitle({
  tag = 'h1',
  className = '',
  children,
}: { tag?: BrandTag; className?: string; children?: ReactNode }) {
  const Tag = tag as 'h1';
  return (
    <Tag className={`relative inline-block text-gradient-brand pb-2 text-28 font-bold tracking-tight ${className}`.trim()}>
      {children}
    </Tag>
  );
}
