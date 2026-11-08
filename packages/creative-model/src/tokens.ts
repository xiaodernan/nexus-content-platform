import type { ColorValue, RGBA, Token, TokenKey, TokenRef } from "./types";

export const TOKEN_REF = /^\{([^{}]+)\}$/;

export function isTokenRef(value: unknown): value is TokenRef {
  return typeof value === "string" && TOKEN_REF.test(value);
}

export function tokenRefKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = TOKEN_REF.exec(value);
  return m ? m[1]! : null;
}

export function makeTokenRef(key: TokenKey): TokenRef {
  return `{${key}}`;
}

export function parseHex(hex: string): RGBA | null {
  const h = hex.trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    const a = h.length === 4 ? parseInt(h[3]! + h[3]!, 16) / 255 : 1;
    return Number.isNaN(r + g + b) ? null : { r, g, b, a };
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return Number.isNaN(r + g + b) ? null : { r, g, b, a };
  }
  return null;
}

export function toHex(color: ColorValue): string {
  if (typeof color === "string") return color;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const a = Math.round(clamp(color.a * 255));
  const body = [clamp(color.r), clamp(color.g), clamp(color.b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  return a === 255 ? `#${body}` : `#${body}${a.toString(16).padStart(2, "0")}`;
}

export function toRgba(color: RGBA): string {
  const a = Math.round(Math.max(0, Math.min(1, color.a)) * 1000) / 1000;
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${a})`;
}

/** 相对亮度（WCAG） */
export function luminance(color: RGBA): number {
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * chan(color.r) + 0.7152 * chan(color.g) + 0.0722 * chan(color.b)
  );
}

/** §32 / §90 对比度检查所需 */
export function contrastRatio(a: ColorValue, b: ColorValue): number {
  const ca = typeof a === "string" ? parseHex(a) : a;
  const cb = typeof b === "string" ? parseHex(b) : b;
  if (!ca || !cb) return 1;
  const la = luminance(ca);
  const lb = luminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
    a: a.a + (b.a - a.a) * k,
  };
}

export function withAlpha(color: ColorValue, alpha: number): RGBA {
  const base =
    typeof color === "string"
      ? (parseHex(color) ?? { r: 0, g: 0, b: 0, a: 1 })
      : color;
  return { ...base, a: base.a * Math.max(0, Math.min(1, alpha)) };
}

export class TokenStore {
  private byKey = new Map<string, Token>();

  constructor(tokens: Token[] = []) {
    for (const t of tokens) this.byKey.set(t.key, t);
  }

  list(): Token[] {
    return [...this.byKey.values()];
  }

  get(key: TokenKey): Token | undefined {
    return this.byKey.get(key);
  }

  set(token: Token): void {
    this.byKey.set(token.key, token);
  }

  remove(key: TokenKey): boolean {
    return this.byKey.delete(key);
  }

  /** token 可引用其它 token（如 color.brand → color.primary），解析时递归 */
  resolve(key: TokenKey, mode?: string | null, depth = 0): unknown {
    if (depth > 8) return undefined;
    const token = this.byKey.get(key);
    if (!token) return undefined;
    let value: unknown =
      mode && token.modes && mode in token.modes
        ? token.modes[mode]
        : token.value;
    if (typeof value === "string") {
      const ref = tokenRefKey(value);
      if (ref) value = this.resolve(ref, mode, depth + 1);
    }
    return value;
  }

  /** 解析任意属性值：token 引用 → 真值；普通字面量原样返回 */
  resolveValue(value: unknown, mode?: string | null): unknown {
    if (typeof value !== "string") return value;
    const ref = tokenRefKey(value);
    if (!ref) return value;
    const resolved = this.resolve(ref, mode);
    return resolved === undefined ? value : resolved;
  }

  /** 递归解析对象/数组中的全部 token 引用（渲染层与代码生成层用） */
  resolveDeep<T>(input: T, mode?: string | null): T {
    if (Array.isArray(input)) {
      return input.map((item) => this.resolveDeep(item, mode)) as unknown as T;
    }
    if (input && typeof input === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input))
        out[k] = this.resolveDeep(v, mode);
      return out as T;
    }
    return this.resolveValue(input, mode) as T;
  }

  /** §121 未使用 token 检查用 */
  keysUsedBy(usedKeys: Iterable<string>): Token[] {
    const used = new Set(usedKeys);
    return this.list().filter((t) => !used.has(t.key));
  }
}
