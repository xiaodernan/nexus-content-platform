import { colorToCss, parseDimension, resolveToken, type DesignDocument, type Paint, type RGBA, type Stroke, type TextStyle } from '@nexus/design-model';

function rgbaCss(c: RGBA): string {
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;
}

/** Stroke carries a plain RGBA color (not a Paint); resolve it to CSS. */
export function strokeToCss(stroke: Stroke): string {
  return rgbaCss(stroke.color);
}

/** Resolve a Paint (incl. token refs, §10) to a CSS color string using the document tokens. */
export function paintToCss(paint: Paint, doc: DesignDocument): string {
  switch (paint.kind) {
    case 'solid':
      return rgbaCss(paint.color);
    case 'token': {
      const t = resolveToken(doc.tokens, paint.ref);
      return t ? colorToCss(t.$value) : 'rgba(128,128,128,0.5)';
    }
    case 'linear': {
      const stops = paint.stops.map((s) => `${rgbaCss(s.color)} ${Math.round(s.at * 100)}%`).join(', ');
      return `linear-gradient(${paint.angle}deg, ${stops})`;
    }
    case 'image':
      return 'rgba(90,110,140,0.35)'; // image fills render as a labeled placeholder in DEMO
  }
}

export function tokenColorCss(doc: DesignDocument, ref: string, fallback = '#888'): string {
  const t = resolveToken(doc.tokens, ref);
  return t ? colorToCss(t.$value) : fallback;
}

export function resolveTextStyle(doc: DesignDocument, style: TextStyle) {
  const family = String(resolveToken(doc.tokens, style.fontFamilyToken)?.$value ?? 'Inter, sans-serif');
  const sizePx = parseDimension(resolveToken(doc.tokens, style.sizeToken)?.$value, 16);
  return {
    font: `${style.weight} ${sizePx}px ${family}`,
    sizePx,
    family,
    weight: style.weight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    align: style.align,
  };
}
