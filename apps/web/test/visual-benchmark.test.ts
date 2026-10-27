import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compareVisuals, GRID } from '../src/server/domain/visualBenchmark';

/**
 * §86 视觉基准的纯函数那一侧。喂的是**真 PNG 字节**（与 visual-dna.test.ts 同一套编码器，
 * filter 0 + 一条手工 Paeth 行），断言钉的是每个指标"该动的时候动、不该动的时候不动"：
 * 同图全 1 / 挪位掉布局与对齐 / 换色只掉颜色 / 换节奏掉间距 / 形状差要披露。
 */

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), Buffer.from(data), Buffer.alloc(4)]);
}

type Rgba = [number, number, number, number];

function png(width: number, height: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const at = rowStart + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];
const BLUE: Rgba = [0, 0, 200, 255];
const RED: Rgba = [200, 0, 0, 255];

const S = 128;
const inRect = (x: number, y: number, x0: number, y0: number, w = 32, h = 32): boolean =>
  x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;

/** 白底 + 左上一块 32×32 的内容（格子坐标 2..9，正好 8×8 格） */
const blockAt =
  (x0: number, y0: number, ink: Rgba = BLACK) =>
  (x: number, y: number): Rgba =>
    (inRect(x, y, x0, y0) ? ink : WHITE);

/** 白底 + 通宽横条：间距节奏的 fixtures */
const bars =
  (rows: [number, number][]) =>
  (x: number, y: number): Rgba =>
    (rows.some(([a, b]) => y >= a && y < b) ? BLACK : WHITE);

describe('§86 compareVisuals（纯函数，真 PNG 字节）', () => {
  it('同一张图自己比自己 ⇒ 全部指标是 1，像素差是 0', () => {
    const bytes = png(S, S, blockAt(8, 8));
    const result = compareVisuals(bytes, bytes);
    if (!result.ok) throw new Error(result.reason);
    const { metrics } = result.result;
    expect(metrics.layout.score).toBe(1);
    expect(metrics.spacing.vertical).toBe(1);
    expect(metrics.spacing.horizontal).toBe(1);
    expect(metrics.alignment.score).toBe(1);
    expect(metrics.alignment.refEdges).toBe(metrics.alignment.matched);
    expect(metrics.color.score).toBeCloseTo(1, 10);
    expect(metrics.pixel.meanAbsLuminanceDiff).toBe(0);
    expect(result.result.shapeMismatch).toBe(false);
    // 测不出的维度要如实说，且只说这两件
    expect(result.result.notMeasured.map((n) => n.area).sort()).toEqual(['componentCorrectness', 'typography']);
  });

  it('内容挪到对角 ⇒ 布局与对齐都掉到 0，颜色不动', () => {
    const reference = png(S, S, blockAt(8, 8));
    const candidate = png(S, S, blockAt(72, 72));
    const result = compareVisuals(reference, candidate);
    if (!result.ok) throw new Error(result.reason);
    const { metrics } = result.result;
    expect(metrics.layout.score).toBe(0);
    expect(metrics.alignment.score).toBe(0);
    expect(metrics.alignment.matched).toBe(0);
    expect(metrics.color.score).toBeCloseTo(1, 10);
  });

  it('挪半格（±2 格容差内）⇒ 对齐仍是 1，布局掉一半', () => {
    const reference = png(S, S, blockAt(8, 8));
    const candidate = png(S, S, blockAt(16, 8));
    const result = compareVisuals(reference, candidate);
    if (!result.ok) throw new Error(result.reason);
    const { metrics } = result.result;
    expect(metrics.alignment.score).toBe(1);
    expect(metrics.layout.score).toBeGreaterThan(0.5);
    expect(metrics.layout.score).toBeLessThan(1);
  });

  it('同一布局换颜色 ⇒ 布局 / 间距 / 对齐全是 1，只有颜色那一格掉', () => {
    const reference = png(S, S, blockAt(8, 8, BLUE));
    const candidate = png(S, S, blockAt(8, 8, RED));
    const result = compareVisuals(reference, candidate);
    if (!result.ok) throw new Error(result.reason);
    const { metrics } = result.result;
    expect(metrics.layout.score).toBe(1);
    expect(metrics.spacing.vertical).toBe(1);
    expect(metrics.alignment.score).toBe(1);
    expect(metrics.color.score).toBeGreaterThan(0.9);
    expect(metrics.color.score).toBeLessThan(1);
    // 像素差如实反映"颜色变了"，但它只是一个读数
    expect(metrics.pixel.meanAbsLuminanceDiff).toBeGreaterThan(0);
  });

  it('两条横条换成三条 ⇒ 间距节奏那一格掉下来（对齐的容差是设计好的松）', () => {
    const reference = png(S, S, bars([
      [16, 48],
      [80, 112],
    ]));
    const candidate = png(S, S, bars([
      [8, 32],
      [56, 80],
      [104, 128],
    ]));
    const same = compareVisuals(reference, reference);
    if (!same.ok) throw new Error(same.reason);
    const result = compareVisuals(reference, candidate);
    if (!result.ok) throw new Error(result.reason);
    expect(result.result.metrics.spacing.vertical).toBeLessThan(0.5);
    expect(same.result.metrics.spacing.vertical).toBe(1);
  });

  it('宽高比差超过 5% ⇒ shapeMismatch 如实标出（指标照算，但读者得知道前提变了）', () => {
    const reference = png(S, S, blockAt(8, 8));
    const candidate = png(S, 100, blockAt(8, 8));
    const result = compareVisuals(reference, candidate);
    if (!result.ok) throw new Error(result.reason);
    expect(result.result.shapeMismatch).toBe(true);
    expect(result.result.reference).toEqual({ width: 128, height: 128 });
    expect(result.result.candidate).toEqual({ width: 128, height: 100 });
  });

  it('全透明的图没有"背景"可言 ⇒ 如实拒绝，不返回一份空指标', () => {
    const transparent = png(S, S, () => [0, 0, 0, 0]);
    const normal = png(S, S, blockAt(8, 8));
    const result = compareVisuals(transparent, normal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('参考图');
  });

  it('解不开的字节如实拒绝（不猜、不静默给 0 分）', () => {
    const bytes = png(S, S, blockAt(8, 8));
    const garbage = bytes.subarray(0, 20);
    const result = compareVisuals(garbage, bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('参考图解不开');
  });

  it(`网格常量是 ${GRID}：meaning 里披露的分辨率上限与实现是同一份`, () => {
    expect(GRID).toBe(32);
  });
});
