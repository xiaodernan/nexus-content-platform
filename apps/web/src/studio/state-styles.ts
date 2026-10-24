import {
  NODE_STATES,
  type DesignNode,
  type NodeState,
  type NodeStateStyle,
  type ResolvedNode,
} from '@nexus/design-model';
import type { CSSProperties } from 'react';
import { nodeStyle, type NodeStyleContext } from './render';

/**
 * §124 状态层的只读投影（ADR-0062 part ③）。
 *
 * 画布是编辑面：hover 改变外观会和选择、拖拽、手柄互相干扰，所以画布不兑现状态。
 * 预览与发布是只读投影，才把状态补丁投影成一段 <style>：基础样式仍是内联
 * （nodeStyle 原样输出），状态规则用 !important 越过它——不写 !important，
 * 服务端渲染出来的 style="background-color: …" 永远赢。
 *
 * 差量才发射：规则里只出现基础态与状态态真正不同的属性。基础态有、状态态
 * 没有的通道显式重置（CSS_RESET）——少了重置，hover 会保留上一层的视觉，
 * 而这恰恰是作者明确说要换掉的东西（ADR-0062）。
 */

/** 状态名 → 真实 CSS 伪类/属性选择器（代码视图用 STATE_VARIANT 的 Tailwind 前缀，只读页面用这个） */
const STATE_CSS_PSEUDO: Record<NodeState, string> = {
  hover: ':hover',
  active: ':active',
  focus: ':focus',
  disabled: ':disabled',
  loading: '[data-state="loading"]',
  error: '[data-state="error"]',
  success: '[data-state="success"]',
};

/**
 * 基础态有、状态态没有的属性重置成什么。对应 ADR-0062 的点名：
 * bg-none/bg-transparent → 背景透明、border-0/border-[transparent] → 描边清零、
 * shadow-none → 无投影、blur-none/backdrop-blur-none → 无模糊、text-inherit → 字色继承。
 */
const CSS_RESET: Record<string, string> = {
  backgroundColor: 'transparent',
  backgroundImage: 'none',
  backgroundSize: 'auto',
  backgroundRepeat: 'repeat',
  backgroundPosition: '0% 0%',
  color: 'inherit',
  boxShadow: 'none',
  filter: 'none',
  backdropFilter: 'none',
  opacity: '1',
};

const kebab = (key: string): string => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** 状态补丁是整通道替换：补丁里出现的通道整体覆盖基础态，不逐项合并（ADR-0062） */
function styleWithPatch(node: DesignNode, patch: NodeStateStyle): DesignNode['style'] {
  return {
    ...node.style,
    ...(patch.fills ? { fills: patch.fills } : {}),
    ...(patch.strokes ? { strokes: patch.strokes } : {}),
    ...(patch.effects ? { effects: patch.effects } : {}),
    ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
  };
}

/** 基础态 vs 状态态求差：状态态没有而基础态有的属性走 CSS_RESET */
function diffDeclarations(base: CSSProperties, next: CSSProperties): [string, string][] {
  const out: [string, string][] = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    const before = base[key as keyof CSSProperties];
    const after = next[key as keyof CSSProperties];
    if (before === after) continue;
    if (after === undefined || after === null) {
      out.push([key, CSS_RESET[key] ?? 'initial']);
    } else {
      out.push([key, String(after)]);
    }
  }
  return out;
}

/**
 * 全部节点的状态规则。没有状态节点时返回空串——页面据此不产出 <style> 标签
 * （反向对照用例钉住：无状态的页面一行状态 CSS 都不该有）。
 */
export function stateStyleSheetFor(
  nodes: readonly ResolvedNode[],
  ctx: NodeStyleContext,
): string {
  const rules: string[] = [];
  for (const resolved of nodes) {
    const { node } = resolved;
    if (!node.states) continue;
    const base = nodeStyle(resolved, ctx);
    for (const state of NODE_STATES) {
      const patch = node.states[state];
      if (!patch) continue;
      const stateStyle = nodeStyle(
        { ...resolved, node: { ...node, style: styleWithPatch(node, patch) } },
        ctx,
      );
      const diff = diffDeclarations(base, stateStyle);
      if (!diff.length) continue;
      const body = diff.map(([key, value]) => `${kebab(key)}: ${value} !important`).join('; ');
      rules.push(`[data-node-id="${node.id}"]${STATE_CSS_PSEUDO[state]} { ${body} }`);
    }
  }
  return rules.join('\n');
}
