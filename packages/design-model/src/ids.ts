/** Id + color helpers. Ids are prefixed and unique enough for a client session. */
let counter = 0;
export function newId(prefix = 'n'): string {
  counter = (counter + 1) % 0xffffff;
  const rand = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${prefix}_${counter.toString(36)}${rand}`;
}

/** Deterministic id for DEMO output so identical prompts yield identical models (ADR 0010). */
export function demoId(seed: string, salt = 0): string {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `d_${(h >>> 0).toString(36)}`;
}

import type { RGBA } from './types.js';

export function rgba(r: number, g: number, b: number, a = 1): RGBA {
  return { r, g, b, a };
}

export function hexToRgba(hex: string, a = 1): RGBA {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a,
  };
}

export function rgbaToCss(c: RGBA): string {
  const to255 = (v: number) => Math.round(clamp01(v) * 255);
  return `rgba(${to255(c.r)}, ${to255(c.g)}, ${to255(c.b)}, ${round2(c.a)})`;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
