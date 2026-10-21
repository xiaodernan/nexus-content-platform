import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  isTokenRef,
  luminance,
  makeTokenRef,
  mixColor,
  toHex,
  toRgba,
  withAlpha,
} from "../src/tokens";
import type { RGBA } from "../src/types";

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const RED: RGBA = { r: 255, g: 0, b: 0, a: 1 };
const MID: RGBA = { r: 100, g: 100, b: 100, a: 1 };

describe("isTokenRef / makeTokenRef", () => {
  it("只认完整花括号引用，非字符串/嵌套花括号都不算", () => {
    expect(isTokenRef("{color.primary}")).toBe(true);
    expect(isTokenRef("{a}{b}")).toBe(false);
    expect(isTokenRef("{}")).toBe(false);
    expect(isTokenRef("#fff")).toBe(false);
    expect(isTokenRef(16)).toBe(false);
    expect(isTokenRef(null)).toBe(false);
  });

  it("makeTokenRef 包出花括号引用", () => {
    expect(makeTokenRef("color.primary")).toBe("{color.primary}");
  });
});

describe("toHex", () => {
  it("字符串原样返回", () => {
    expect(toHex("#abc")).toBe("#abc");
  });

  it("不透明色省略 alpha 段", () => {
    expect(toHex(RED)).toBe("#ff0000");
  });

  it("半透明色追加两位 alpha", () => {
    expect(toHex({ r: 255, g: 0, b: 0, a: 0.5 })).toBe("#ff000080");
  });

  it("越界值被 clamp 回 0..255", () => {
    // 300→255(ff)、-10→0(00)、128→128(80)
    expect(toHex({ r: 300, g: -10, b: 128, a: 1 })).toBe("#ff0080");
  });
});

describe("toRgba", () => {
  it("按 rgba() 串输出并对 alpha 三位取整", () => {
    expect(toRgba({ r: 255, g: 0, b: 0, a: 0.5 })).toBe("rgba(255, 0, 0, 0.5)");
    expect(toRgba({ r: 18, g: 52, b: 86, a: 1 })).toBe("rgba(18, 52, 86, 1)");
  });
});

describe("luminance / contrastRatio", () => {
  it("luminance：黑为 0、白为 1", () => {
    expect(luminance(BLACK)).toBe(0);
    expect(luminance(WHITE)).toBe(1);
  });

  it("contrastRatio：黑白为 21、同色为 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 6);
    expect(contrastRatio(MID, MID)).toBe(1);
  });

  it("contrastRatio：解析失败返回 1（不抛错）", () => {
    expect(contrastRatio("#zzz", "#000000")).toBe(1);
  });
});

describe("mixColor", () => {
  it("t=0/1 取端点，t=0.5 取中点", () => {
    expect(mixColor(BLACK, MID, 0)).toEqual(BLACK);
    expect(mixColor(BLACK, MID, 1)).toEqual(MID);
    expect(mixColor(BLACK, MID, 0.5)).toEqual({
      r: 50,
      g: 50,
      b: 50,
      a: 1,
    });
  });

  it("t 越界被 clamp 到 [0,1]", () => {
    expect(mixColor(BLACK, MID, 5)).toEqual(MID);
    expect(mixColor(BLACK, MID, -5)).toEqual(BLACK);
  });
});

describe("withAlpha", () => {
  it("RGBA 叠加 alpha", () => {
    expect(withAlpha(RED, 0.5)).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
  });

  it("字符串先解析再叠加 alpha", () => {
    expect(withAlpha("#ff0000", 0.5)).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
  });

  it("无法解析的字符串退回黑色，alpha 仍 clamp", () => {
    expect(withAlpha("#nope", 0.5)).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(withAlpha(RED, 5)).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(withAlpha(RED, -5)).toEqual({ r: 255, g: 0, b: 0, a: 0 });
  });
});
