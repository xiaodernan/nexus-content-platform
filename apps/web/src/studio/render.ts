import type { CSSProperties } from 'react';
import {
  toHex,
  type ColorValue,
  type DesignNode,
  type Effect,
  type Paint,
  type ResolvedNode,
  type Stroke,
  type TokenStore,
} from '@nexus/design-model';

/**
 * 设计模型 → CSS 的投影（§16：画布、代码与预览都是同一个模型的投影）。
 * 只读模型，不写模型。
 */

export function resolveColor(value: ColorValue | undefined, tokens: TokenStore, mode: string | null): string {
  if (value === undefined) return 'transparent';
  const raw = tokens.resolveValue(value, mode);
  const candidate = (typeof raw === 'string' || typeof raw === 'object' && raw !== null ? raw : value) as ColorValue;
  try {
    return toHex(candidate);
  } catch {
    return 'transparent';
  }
}

function paintCss(paint: Paint, tokens: TokenStore, mode: string | null): string | null {
  if (paint.visible === false) return null;
  if (paint.kind === 'solid') return resolveColor(paint.color, tokens, mode);
  if (paint.kind === 'gradient') {
    const stops = paint.stops.map((s) => `${resolveColor(s.color, tokens, mode)} ${(s.at * 100).toFixed(1)}%`).join(', ');
    if (paint.type === 'radial') return `radial-gradient(circle, ${stops})`;
    if (paint.type === 'conic') return `conic-gradient(${stops})`;
    return `linear-gradient(${(paint.angle ?? 180) % 360}deg, ${stops})`;
  }
  // image 层需要资产服务（任务 #9）；在此之前明确跳过，不渲染破图占位
  return null;
}

function backgroundOf(node: DesignNode, tokens: TokenStore, mode: string | null): CSSProperties {
  // CSS 先写的层在上，模型里 fills[0] 是最上层 → 反转顺序
  const layers = node.style.fills.map((p) => paintCss(p, tokens, mode)).filter((v): v is string => Boolean(v)).reverse();
  if (!layers.length) return {};
  const colors = layers.filter((l) => !l.includes('gradient'));
  const images = layers.filter((l) => l.includes('gradient'));
  return {
    backgroundColor: colors[0],
    backgroundImage: images.length ? images.join(', ') : undefined,
  };
}

function shadowOf(node: DesignNode, tokens: TokenStore, mode: string | null): { shadows: string[]; blur: number; backdrop: number } {
  const shadows: string[] = [];
  let blur = 0;
  let backdrop = 0;
  const push = (stroke: Stroke, inset: boolean) => {
    const color = stroke.paints.map((p) => paintCss(p, tokens, mode)).find(Boolean) ?? 'transparent';
    const w = stroke.width;
    if (inset) shadows.push(`inset 0 0 0 ${w}px ${color}`);
    else shadows.push(`0 0 0 ${w}px ${color}`);
  };
  for (const stroke of node.style.strokes) {
    if (stroke.visible === false) continue;
    if (stroke.position === 'center') {
      push({ ...stroke, width: stroke.width / 2 }, true);
      push({ ...stroke, width: stroke.width / 2 }, false);
    } else push(stroke, stroke.position === 'inside');
  }
  for (const effect of node.style.effects as Effect[]) {
    if (effect.visible === false) continue;
    if (effect.kind === 'layer-blur') blur += effect.blur ?? 0;
    if (effect.kind === 'background-blur') backdrop += effect.blur ?? 0;
    if (effect.kind === 'drop-shadow' || effect.kind === 'inner-shadow') {
      const inset = effect.kind === 'inner-shadow' ? 'inset ' : '';
      shadows.push(`${inset}${effect.offsetX ?? 0}px ${effect.offsetY ?? 0}px ${effect.blur ?? 0}px ${effect.spread ?? 0}px ${resolveColor(effect.color ?? '#000000', tokens, mode)}`);
    }
  }
  return { shadows, blur, backdrop };
}

export interface NodeStyleContext {
  tokens: TokenStore;
  mode: string | null;
}

const TEXT_LABEL_TYPES = new Set(['text', 'button', 'input']);

function isTextLabel(node: DesignNode): boolean {
  return TEXT_LABEL_TYPES.has(node.type);
}

export function nodeStyle(resolved: ResolvedNode, ctx: NodeStyleContext): CSSProperties {
  const { node } = resolved;
  const { tokens, mode } = ctx;
  const r = node.style.cornerRadius;
  const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : Number(tokens.resolveValue(v as string, mode)) || fallback);
  const style: CSSProperties = {
    position: 'absolute',
    left: resolved.x,
    top: resolved.y,
    width: Math.max(0, resolved.width),
    height: Math.max(0, resolved.height),
    opacity: node.style.opacity,
    ...backgroundOf(node, tokens, mode),
  };

  if (r.topLeft || r.topRight || r.bottomRight || r.bottomLeft) {
    style.borderRadius = `${num(r.topLeft)}px ${num(r.topRight)}px ${num(r.bottomRight)}px ${num(r.bottomLeft)}px`;
  }

  const fx = shadowOf(node, tokens, mode);
  if (fx.shadows.length) style.boxShadow = fx.shadows.join(', ');
  if (fx.blur) style.filter = `blur(${fx.blur}px)`;
  if (fx.backdrop) style.backdropFilter = `blur(${fx.backdrop}px)`;
  if (node.style.blendMode && node.style.blendMode !== 'normal') style.mixBlendMode = node.style.blendMode as CSSProperties['mixBlendMode'];
  if (node.style.rotation) style.transform = `rotate(${node.style.rotation}deg)`;
  if (node.style.cursor && node.style.cursor !== 'default') style.cursor = node.style.cursor;

  const scroll = node.layout.scroll ?? 'none';
  if (node.style.overflowX || node.style.overflowY) {
    style.overflowX = node.style.overflowX ?? 'visible';
    style.overflowY = node.style.overflowY ?? 'visible';
  } else if (node.layout.clipContent) style.overflow = 'hidden';
  else if (scroll !== 'none') style.overflow = 'auto';

  const t = node.typography;
  if (t) {
    const familyRaw = tokens.resolveValue(t.fontFamily ?? '{font.body}', mode);
    style.fontFamily = typeof familyRaw === 'string' ? familyRaw : 'var(--nexus-font-sans)';
    style.fontSize = num(t.fontSize, 16);
    style.fontWeight = t.fontWeight;
    style.lineHeight = t.lineHeight === 'auto' ? 'normal' : t.lineHeight;
    if (t.letterSpacing) style.letterSpacing = `${t.letterSpacing}px`;
    style.textAlign = t.align;
    if (t.textCase === 'upper') style.textTransform = 'uppercase';
    else if (t.textCase === 'lower') style.textTransform = 'lowercase';
    if (t.decoration && t.decoration !== 'none') style.textDecoration = t.decoration;
    // hug 宽度的文字：模型已经决定了换行，DOM 不能再按实际字体宽度二次换行（否则画布与模型漂移）
    style.whiteSpace =
      node.style.textWrap === 'nowrap' || (isTextLabel(node) && node.size.width === 'hug')
        ? 'pre'
        : 'pre-wrap';
    if (node.style.textWrap === 'truncate') {
      style.whiteSpace = 'nowrap';
      style.overflow = 'hidden';
      style.textOverflow = 'ellipsis';
    } else if (node.style.textWrap === 'truncate-2' || node.style.textWrap === 'truncate-3') {
      style.whiteSpace = 'normal';
      style.overflow = 'hidden';
      style.display = '-webkit-box';
      style.WebkitBoxOrient = 'vertical';
      style.WebkitLineClamp = Number(node.style.textWrap.split('-')[1]);
    }
    // text 节点用 fills[0] 表达字色；button / input 的 fills 是背景，字色只能来自 typography.color
    const first = node.style.fills.find((p) => p.kind === 'solid' && p.visible !== false);
    if (node.type === 'text' && first) {
      style.color = resolveColor((first as { color: ColorValue }).color, tokens, mode);
      style.backgroundColor = undefined;
      style.backgroundImage = undefined;
    } else if (t.color) {
      style.color = resolveColor(t.color, tokens, mode);
    }
    if (t.verticalAlign !== 'top') {
      style.display = 'flex';
      style.flexDirection = 'column';
      style.justifyContent = t.verticalAlign === 'middle' ? 'center' : 'flex-end';
    }
  }

  return style;
}
