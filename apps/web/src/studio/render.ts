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
import {
  fitToBackgroundRepeat,
  fitToBackgroundSize,
  type AssetFit,
  type AssetUrlContext,
} from './assets';

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

/**
 * 一层 paint 的投影结果。
 *
 * 必须是**结构化**的，不能靠 CSS 字符串嗅探判别类型：image 的投影是 `url(...)`，
 * 它既不含也不含 'gradient'——早期实现用 `l.includes('gradient')` 分类，
 * 一旦引入图片层就会把图片误判成纯色层（多层 fills 时静默丢图）。
 */
type PaintedLayer =
  | { kind: 'color'; css: string }
  | { kind: 'image'; css: string }
  | { kind: 'gradient'; css: string };

function paintLayer(
  paint: Paint,
  tokens: TokenStore,
  mode: string | null,
  assets: AssetUrlContext | undefined,
): PaintedLayer | null {
  if (paint.visible === false) return null;
  if (paint.kind === 'solid') return { kind: 'color', css: resolveColor(paint.color, tokens, mode) };
  if (paint.kind === 'gradient') {
    const stops = paint.stops.map((s) => `${resolveColor(s.color, tokens, mode)} ${(s.at * 100).toFixed(1)}%`).join(', ');
    if (paint.type === 'radial') return { kind: 'gradient', css: `radial-gradient(circle, ${stops})` };
    if (paint.type === 'conic') return { kind: 'gradient', css: `conic-gradient(${stops})` };
    return { kind: 'gradient', css: `linear-gradient(${(paint.angle ?? 180) % 360}deg, ${stops})` };
  }
  // image 层：模型只持有 assetId，URL 由投影上下文解析（§64/§101 模型不认识存储）。
  // 解析不出 URL（资产缺失 / 当前场景无权限）时明确返回 null —— 不渲染破图占位（§159）。
  const url = assets?.assetUrl(paint.assetId) ?? null;
  if (!url) return null;
  return { kind: 'image', css: `url("${url}")` };
}

/** 只关心颜色（描边、字色）的场景：取第一层可见的纯色 / 渐变 */
function paintCss(paint: Paint, tokens: TokenStore, mode: string | null, assets?: AssetUrlContext): string | null {
  return paintLayer(paint, tokens, mode, assets)?.css ?? null;
}

/**
 * 多层 fills → CSS 背景。
 *
 * CSS 的 `background-image` **先写的层在最上面**，模型里 `fills[0]` 是最上层 →
 * 两者顺序天然一致，不需要反转。`background-color` 不参与层叠顺序，只能承载
 * 一个颜色，因此取最靠下的那层颜色（fills 数组末尾）。
 *
 * 渐变和图片都是 background-image 的层——只把渐变当颜色的实现会在多层 fills
 * 时静默丢层，所以这里按 `PaintedLayer.kind` 结构化分类，绝不嗅探 CSS 字符串。
 */
function backgroundOf(
  node: DesignNode,
  tokens: TokenStore,
  mode: string | null,
  assets?: AssetUrlContext,
): CSSProperties {
  const layers = node.style.fills
    .map((p) => paintLayer(p, tokens, mode, assets))
    .filter((v): v is PaintedLayer => v !== null);
  if (!layers.length) return {};

  const imageLayers = layers.filter((l) => l.kind !== 'color');

  const style: CSSProperties = {};
  // 最靠下的颜色层承载 backgroundColor；纯色层之下的层在 CSS 里看不到，忽略
  const bottom = layers[layers.length - 1] as PaintedLayer | undefined;
  if (bottom && bottom.kind === 'color') style.backgroundColor = bottom.css;
  if (imageLayers.length) {
    style.backgroundImage = imageLayers.map((l) => l.css).join(', ');
    style.backgroundSize = imageLayers.map(() => imageSizeOf(node)).join(', ');
    style.backgroundRepeat = imageLayers.map(() => imageRepeatOf(node)).join(', ');
    style.backgroundPosition = imageLayers.map(() => 'center').join(', ');
  }
  return style;
}

/**
 * 取本节点上第一层 image paint 的 fit。
 * 目前 design-model 把 fit 放在 paint 上，但 background-size 是整条
 * background-image 的共有属性：一层以上图片时以最上层为准，文档化在 types 注释里。
 */
function imageFitOf(node: DesignNode): AssetFit | undefined {
  const paint = node.style.fills.find((p) => p.kind === 'image' && p.visible !== false);
  return paint && paint.kind === 'image' ? paint.fit : undefined;
}

function imageSizeOf(node: DesignNode): string {
  return fitToBackgroundSize(imageFitOf(node));
}

function imageRepeatOf(node: DesignNode): string {
  return fitToBackgroundRepeat(imageFitOf(node));
}

function shadowOf(node: DesignNode, tokens: TokenStore, mode: string | null, assets?: AssetUrlContext): { shadows: string[]; blur: number; backdrop: number } {
  const shadows: string[] = [];
  let blur = 0;
  let backdrop = 0;
  const push = (stroke: Stroke, inset: boolean) => {
    const color = stroke.paints.map((p) => paintCss(p, tokens, mode, assets)).find(Boolean) ?? 'transparent';
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
  /**
   * 资产 URL 解析（可选）。不传时 image paint 一律不投影——
   * 这样截图/发布等不该出现本地资产的场景不会漏出半张图。
   */
  assets?: AssetUrlContext;
}

const TEXT_LABEL_TYPES = new Set(['text', 'button', 'input']);

function isTextLabel(node: DesignNode): boolean {
  return TEXT_LABEL_TYPES.has(node.type);
}

export function nodeStyle(resolved: ResolvedNode, ctx: NodeStyleContext): CSSProperties {
  const { node } = resolved;
  const { tokens, mode, assets } = ctx;
  const r = node.style.cornerRadius;
  const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : Number(tokens.resolveValue(v as string, mode)) || fallback);
  const style: CSSProperties = {
    position: 'absolute',
    left: resolved.x,
    top: resolved.y,
    width: Math.max(0, resolved.width),
    height: Math.max(0, resolved.height),
    opacity: node.style.opacity,
    ...backgroundOf(node, tokens, mode, assets),
  };

  if (r.topLeft || r.topRight || r.bottomRight || r.bottomLeft) {
    style.borderRadius = `${num(r.topLeft)}px ${num(r.topRight)}px ${num(r.bottomRight)}px ${num(r.bottomLeft)}px`;
  }

  const fx = shadowOf(node, tokens, mode, assets);
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
      // 字色吃掉的是那层纯色，图片层仍然是这个 text 节点的背景 → 只清 backgroundColor
      style.backgroundColor = undefined;
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
