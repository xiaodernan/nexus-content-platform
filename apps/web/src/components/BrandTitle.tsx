import type { ReactNode } from 'react';

/**
 * 统一品牌大标题（v687 / cont. 68 引入，合并后改为零原子门面实现）。
 *
 * 全站 21 处各自手写同一组渐变字 className，这一格只写一次（ADR 0109 指纹识别纪律）。
 * 门面是 `.brand-title`（globals.css）：brand 主色渐变（fg-1 → accent-mix → accent-1）+
 * bg-clip-text 透出白字，配色与强制高对比度回退都在 globals.css 里裁决。
 *
 * 目前全站标题统一走 §FE 渐变墨字族（.nf-title / .pub-title / .dv-title …），本组件是
 * 门面组件库里为"需要 h1/h2/h3 标签语义切换的品牌标题"留的一格——零原子、零 hex。
 */

type BrandTag = 'h1' | 'h2' | 'h3';

export function BrandTitle({
  tag = 'h1',
  className = '',
  children,
}: { tag?: BrandTag; className?: string; children?: ReactNode }) {
  const Tag = tag as 'h1';
  return <Tag className={`brand-title${className ? ` ${className}` : ''}`}>{children}</Tag>;
}
