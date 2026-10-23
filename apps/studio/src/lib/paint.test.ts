import { describe, expect, it } from 'vitest';
import { createEmptyDocument, type DesignDocument, type TextStyle } from '@nexus/design-model';

import { strokeToCss, paintToCss, tokenColorCss, resolveTextStyle } from './paint';

/**
 * M7 v411 — the PAINT resolver’s own rules, graded directly.
 *
 * This module is the seam every renderer shares: the canvas puts its answers on a context, the artifact
 * writes them into a `style` attribute, the thumbnail into SVG attributes. So a value that is really
 * `'bold" onload="x'` would take three shapes of damage from one malformed style — which is why the
 * coercion happens HERE, once, and why the defenses are graded directly: a reference that is not a path
 * resolves to nothing (a missing token already meant that), a number that is not finite falls back, and
 * an align that is not one of the three the model owns reads as `left`.
 */
const doc = (): DesignDocument => createEmptyDocument('Harbour');

describe('paintToCss — a Paint becomes a CSS colour (v411)', () => {
  it('a solid is its own rgba, rounded to 8-bit channels', () => {
    expect(paintToCss({ kind: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } }, doc())).toBe('rgba(255, 0, 0, 1)');
    expect(paintToCss({ kind: 'solid', color: { r: 0.5, g: 0.25, b: 0.125, a: 0.5 } }, doc())).toBe('rgba(128, 64, 32, 0.5)');
  });

  it('a token ref resolves through the document’s own tokens', () => {
    expect(paintToCss({ kind: 'token', ref: 'color.brand' }, doc())).toBe('#6ea8fe');
  });

  it('a token whose value is an RGBA object is normalized, not passed through raw', () => {
    const d = doc();
    (d.tokens.color as Record<string, unknown>).rgb = { $type: 'color', $value: { r: 0, g: 1, b: 0, a: 1 } };
    expect(paintToCss({ kind: 'token', ref: 'color.rgb' }, d)).toBe('rgba(0, 255, 0, 1)');
  });

  it('a token the document does not have is a NAMED grey, not a crash and not transparent', () => {
    expect(paintToCss({ kind: 'token', ref: 'color.nope' }, doc())).toBe('rgba(128,128,128,0.5)');
  });

  it('a linear gradient lists its stops in order, positions rounded to whole percents', () => {
    const css = paintToCss(
      {
        kind: 'linear',
        angle: 90,
        stops: [
          { at: 0, color: { r: 1, g: 1, b: 1, a: 1 } },
          { at: 0.255, color: { r: 0, g: 0, b: 0, a: 1 } },
        ],
      },
      doc(),
    );
    expect(css).toBe('linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(0, 0, 0, 1) 26%)');
  });

  it('an image fill is the labeled placeholder DEMO ships, never a broken url', () => {
    expect(paintToCss({ kind: 'image', assetId: 'a1', fit: 'cover' }, doc())).toBe('rgba(90,110,140,0.35)');
  });
});

describe('strokeToCss — a stroke is a plain colour, not a Paint (v411)', () => {
  it('resolves the stroke’s own rgba', () => {
    expect(strokeToCss({ weight: 2, color: { r: 0.2, g: 0.4, b: 0.6, a: 0.75 }, align: 'inside' })).toBe('rgba(51, 102, 153, 0.75)');
  });
});

describe('tokenColorCss — the token reader with a named fallback (v411)', () => {
  it('resolves a token the document has, and answers the fallback for one it has not', () => {
    const d = doc();
    expect(tokenColorCss(d, 'color.text')).toBe('#e6ecf5');
    expect(tokenColorCss(d, 'color.absent')).toBe('#888');
    expect(tokenColorCss(d, 'color.absent', 'red')).toBe('red');
  });
});

describe('resolveTextStyle — the three members a document may not have authored well (v411)', () => {
  const style = (over: Partial<TextStyle> = {}): TextStyle => ({
    fontFamilyToken: 'font.family.body',
    sizeToken: 'font.size.xl',
    weight: 700,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: 'left',
    ...over,
  });

  it('reads the family and the size out of the document’s tokens', () => {
    const st = resolveTextStyle(doc(), style());
    expect(st.family).toBe('Inter, system-ui, sans-serif');
    expect(st.sizePx).toBe(28);
    expect(st.font).toBe('700 28px Inter, system-ui, sans-serif');
  });

  it('a size token that is a bare number is a pixel count, and a missing one falls back to 16', () => {
    const d = doc();
    (d.tokens.font as unknown as Record<string, unknown>).size = { bare: { $type: 'dimension', $value: 20 } };
    expect(resolveTextStyle(d, style({ sizeToken: 'font.size.bare' })).sizePx).toBe(20);
    expect(resolveTextStyle(d, style({ sizeToken: 'font.size.absent' })).sizePx).toBe(16);
  });

  it('a reference that is not a path resolves to nothing — one malformed style cannot take the page down', () => {
    // A published document is JSON a client posted: the ref can be a number, an object, null. Asking
    // resolveToken about a non-string used to THROW out of here, and the artifact has always called this.
    const d = doc();
    const broken = style({
      fontFamilyToken: 42 as unknown as string,
      sizeToken: { nope: true } as unknown as string,
    });
    const st = resolveTextStyle(d, broken);
    expect(st.family).toBe('Inter, sans-serif');
    expect(st.sizePx).toBe(16);
  });

  it('a number that is not finite falls back rather than reaching a renderer as NaN', () => {
    const st = resolveTextStyle(doc(), style({ weight: Number.NaN, letterSpacing: Number.POSITIVE_INFINITY, lineHeight: 'x' as unknown as number }));
    expect(st.weight).toBe(400);
    expect(st.letterSpacing).toBe(0);
    expect(st.lineHeight).toBe(1.2);
  });

  it('align is one of three values — anything else reads as left, never as a broken attribute', () => {
    expect(resolveTextStyle(doc(), style({ align: 'center' })).align).toBe('center');
    expect(resolveTextStyle(doc(), style({ align: 'right' })).align).toBe('right');
    expect(resolveTextStyle(doc(), style({ align: 'justify' as unknown as TextStyle['align'] })).align).toBe('left');
    expect(resolveTextStyle(doc(), style({ align: 7 as unknown as TextStyle['align'] })).align).toBe('left');
  });
});
