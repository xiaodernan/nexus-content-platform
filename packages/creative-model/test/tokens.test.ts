import { describe, expect, it } from "vitest";
import {
  TokenStore,
  contrastRatio,
  parseHex,
  tokenRefKey,
} from "../src/tokens";
import type { Token } from "../src/types";

const tokens: Token[] = [
  {
    key: "color.primary",
    type: "color",
    value: "#7c5cff",
    modes: { light: "#5b3df5" },
  },
  { key: "color.brand", type: "color", value: "{color.primary}" },
  { key: "space.4", type: "dimension", value: 16 },
  { key: "loop.a", type: "dimension", value: "{loop.b}" },
  { key: "loop.b", type: "dimension", value: "{loop.a}" },
];

describe("TokenStore", () => {
  const store = new TokenStore(tokens);

  it("resolves a direct token", () => {
    expect(store.resolve("color.primary")).toBe("#7c5cff");
  });

  it("resolves mode overrides", () => {
    expect(store.resolve("color.primary", "light")).toBe("#5b3df5");
    expect(store.resolve("color.primary", "dark")).toBe("#7c5cff");
  });

  it("follows token chains", () => {
    expect(store.resolve("color.brand")).toBe("#7c5cff");
  });

  it("stops on circular chains instead of hanging", () => {
    expect(store.resolve("loop.a")).toBeUndefined();
  });

  it("resolveValue passes literals through", () => {
    expect(store.resolveValue("#fff")).toBe("#fff");
    expect(store.resolveValue(24)).toBe(24);
    expect(store.resolveValue("{space.4}")).toBe(16);
    expect(store.resolveValue("{nope}")).toBe("{nope}");
  });

  it("detects token refs", () => {
    expect(tokenRefKey("{color.primary}")).toBe("color.primary");
    expect(tokenRefKey("color.primary")).toBeNull();
    expect(tokenRefKey("{a}{b}")).toBeNull();
  });

  it("resolveDeep walks nested structures", () => {
    const resolved = store.resolveDeep({
      size: "{space.4}",
      nested: { color: "{color.brand}", list: ["{space.4}"] },
    });
    expect(resolved).toEqual({
      size: 16,
      nested: { color: "#7c5cff", list: [16] },
    });
  });

  it("reports unused tokens", () => {
    expect(store.keysUsedBy(["color.primary"]).map((t) => t.key)).toContain(
      "space.4",
    );
  });
});

describe("color utils", () => {
  it("parses hex forms", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseHex("#0000")?.a).toBe(0);
    expect(parseHex("#7c5cff")).toEqual({ r: 124, g: 92, b: 255, a: 1 });
    expect(parseHex("nonsense")).toBeNull();
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#888888")).toBeLessThan(1.7);
  });
});
