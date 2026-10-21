import { colorToCss, parseDimension, resolveToken, type DesignDocument, type Paint, type RGBA, type Stroke, type TextAlign, type TextStyle, type TokenValue } from '@nexus/design-model';

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

/**
 * Ask the token tree about a reference that came from a DOCUMENT, not from the editor.
 *
 * A published document is JSON a client posted: a text style can name a token that does not exist (the
 * resolver already answers that with the fallback), and can carry a member that is not a path at all. Asking
 * `resolveToken` about a non-string used to throw out of `resolveTextStyle`, which the artifact has always
 * called and the thumbnail and the canvas call now — one malformed style took down the whole gallery page.
 * A reference that is not a path resolves to nothing, which is what a missing token already meant.
 */
function tokenOf(doc: DesignDocument, ref: unknown): TokenValue | undefined {
  return typeof ref === 'string' ? resolveToken(doc.tokens, ref) : undefined;
}

/**
 * The three style members the model types as NUMBER or as an ENUM, read out of a document that may not have
 * authored them that way. `resolveTextStyle` is the shared seam — the canvas puts the result on a context,
 * the artifact writes it into a `style` attribute and the thumbnail into SVG attributes, so a value that is
 * really `'bold" onload="x'` would take three shapes of damage from one malformed style. Coerced here, once,
 * so no renderer has to remember to defend itself.
 */
const num = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const alignOf = (x: unknown): TextAlign => (x === 'center' || x === 'right' ? x : 'left');

export function resolveTextStyle(doc: DesignDocument, style: TextStyle) {
  const family = String(tokenOf(doc, style.fontFamilyToken)?.$value ?? 'Inter, sans-serif');
  const sizePx = parseDimension(tokenOf(doc, style.sizeToken)?.$value, 16);
  const weight = num(style.weight, 400);
  const letterSpacing = num(style.letterSpacing, 0);
  const lineHeight = num(style.lineHeight, 1.2);
  const align = alignOf(style.align);
  return { font: `${weight} ${sizePx}px ${family}`, sizePx, family, weight, lineHeight, letterSpacing, align };
}
