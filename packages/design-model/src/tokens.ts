import type { RGBA, TokenGroup, TokenValue } from './types.js';

function isTokenValue(v: unknown): v is TokenValue {
  return typeof v === 'object' && v !== null && '$value' in (v as Record<string, unknown>);
}

export function resolveToken(group: TokenGroup, path: string): TokenValue | undefined {
  const parts = path.split('.');
  let cur: TokenValue | TokenGroup = group;
  for (const p of parts) {
    if (isTokenValue(cur)) return undefined;
    const next: TokenValue | TokenGroup | undefined = (cur as TokenGroup)[p];
    if (next === undefined) return undefined;
    cur = next;
  }
  return isTokenValue(cur) ? cur : undefined;
}

export function flattenTokens(group: TokenGroup, prefix = ''): Record<string, TokenValue> {
  const out: Record<string, TokenValue> = {};
  for (const [k, v] of Object.entries(group)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isTokenValue(v)) out[path] = v;
    else Object.assign(out, flattenTokens(v, path));
  }
  return out;
}

export function parseDimension(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = /^(-?\d+(?:\.\d+)?)(px|rem|%)?$/.exec(v.trim());
    if (m) return parseFloat(m[1] as string);
  }
  return fallback;
}

/** Token colors are stored as #hex or as an RGBA object; normalize to CSS. */
export function colorToCss(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null) {
    const c = v as RGBA;
    return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a ?? 1})`;
  }
  return 'transparent';
}
