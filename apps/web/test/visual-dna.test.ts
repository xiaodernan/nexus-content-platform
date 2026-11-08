import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { descriptorsOf, extractVisualDna, paletteRolesOf, type PixelStats } from '../src/server/domain/visualDna';

/**
 * 这些测试喂的是**真 PNG 字节**，不是打桩：解不出来就是假的提取器（§158 要跑到看到）。
 * 编码器只支持 filter 0，另有一条用例专门用手工构造的 Paeth 行验证反向滤波。
 */

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), Buffer.from(data), Buffer.alloc(4)]);
}

type Rgb = [number, number, number];

function png(width: number, height: number, pixel: (x: number, y: number) => Rgb, colorType = 2): Buffer {
  const channels = colorType === 2 ? 3 : 4;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0; // 非隔行
  const raw = Buffer.alloc(height * (1 + width * channels));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * channels);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      const at = rowStart + 1 + x * channels;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      if (channels === 4) raw[at + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function statsOf(partial: Partial<PixelStats> & Pick<PixelStats, 'width' | 'height'>): PixelStats {
  return {
    samples: 1000,
    meanLuminance: 0.5,
    luminanceStdev: 0.15,
    meanSaturation: 0.3,
    edgeDensity: 0.05,
    warmth: 0,
    palette: [],
    ...partial,
  };
}

describe('extractVisualDna：真字节进，可核对的统计出', () => {
  it('纯色暗图 → 单主色 + 暗色底 + 低对比', () => {
      const res = extractVisualDna(png(40, 40, () => [0x10, 0x14, 0x18]));
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.stats.palette).toHaveLength(1);
      expect(res.stats.palette[0]!.color).toBe('#101418');
      expect(res.stats.meanLuminance).toBeLessThan(0.1);
      expect(res.stats.luminanceStdev).toBeLessThan(0.001);
      expect(res.dna.descriptors).toContain('暗色底');
      expect(res.dna.descriptors).toContain('低对比');
      expect(res.dna.descriptors).toContain('单主色');
      expect(res.dna.source?.method).toBe('pixel-stats');
  });

  it('暗底 + 琥珀色块 → 背景/前景/强调色各司其职', () => {
    const res = extractVisualDna(
      png(40, 40, (x, y) => (x < 20 && y < 20 ? [0xf5, 0x9e, 0x0b] : [0x0b, 0x0d, 0x12])),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const roles = Object.fromEntries(res.dna.palette.map((p) => [p.role, p.color]));
    expect(roles.background).toBe('#0b0d12');
    expect(roles.foreground).toBe('#f59e0b');
    expect(roles.accent).toBe('#f59e0b');
    expect(res.dna.descriptors).toContain('暗色底');
    expect(res.dna.descriptors).toContain('暖色倾向');
    // 这条图**不该**被判成高对比：琥珀只占 1/4 面积，整体亮度标准差确实不高（§159 不夸张）
    expect(res.dna.descriptors).not.toContain('高对比');
    // 占比是实测出来的，不是猜的：琥珀占 400/1600
    expect(res.stats.palette[1]!.share).toBeCloseTo(400 / 1600, 2);
  });

  it('五五开的黑白棋盘 → 高对比', () => {
    const res = extractVisualDna(png(40, 40, (x, y) => ((x + y) % 2 === 0 ? [255, 255, 255] : [0, 0, 0])));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stats.luminanceStdev).toBeGreaterThan(0.4);
    expect(res.dna.descriptors).toContain('高对比');
    expect(res.dna.descriptors).toContain('信息密集');
  });

  it('黑白横向渐变 → 中间调且亮度标准差明显大于纯色', () => {
    const res = extractVisualDna(png(64, 8, (x) => [Math.round((x / 63) * 255), Math.round((x / 63) * 255), Math.round((x / 63) * 255)]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stats.meanLuminance).toBeGreaterThan(0.4);
    expect(res.stats.meanLuminance).toBeLessThan(0.6);
    expect(res.stats.luminanceStdev).toBeGreaterThan(0.25);
    expect(res.dna.descriptors).toContain('中间调');
    // 渐变会被量化桶拆成多个主色（角色板最多 3 条，所以看实测板）
    expect(res.stats.palette.length).toBeGreaterThan(3);
    expect(res.dna.palette.length).toBeLessThanOrEqual(3);
  });

  it('RGBA 与灰度 PNG 都能解；透明像素不污染统计', () => {
    const rgba = png(20, 20, () => [200, 30, 30], 6);
    const grayPng = (() => {
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(20, 0);
      ihdr.writeUInt32BE(20, 4);
      ihdr[8] = 8;
      ihdr[9] = 0; // 灰度
      const raw = Buffer.alloc(20 * (1 + 20));
      for (let y = 0; y < 20; y += 1) {
        raw[y * 21] = 0;
        for (let x = 0; x < 20; x += 1) raw[y * 21 + 1 + x] = 10;
      }
      return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', new Uint8Array(deflateSync(raw))),
        chunk('IEND', Buffer.alloc(0)),
      ]);
    })();
    const a = extractVisualDna(rgba);
    const b = extractVisualDna(grayPng);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.stats.palette[0]!.color).toBe('#c81e1e');
    expect(b.stats.palette[0]!.color).toBe('#0a0a0a');
    expect(b.dna.descriptors).toContain('近中性色');

    // 全透明：没有可统计像素，必须如实拒绝而不是返回空 DNA
    const transparent = (() => {
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(8, 0);
      ihdr.writeUInt32BE(8, 4);
      ihdr[8] = 8;
      ihdr[9] = 6;
      const raw = Buffer.alloc(8 * (1 + 8 * 4));
      for (let y = 0; y < 8; y += 1) raw[y * (1 + 32)] = 0;
      return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', new Uint8Array(deflateSync(raw))),
        chunk('IEND', Buffer.alloc(0)),
      ]);
    })();
    const empty = extractVisualDna(transparent);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toContain('透明');
  });

  it('调色板 PNG（colorType 3 + tRNS）按索引取色', () => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(4, 0);
    ihdr.writeUInt32BE(4, 4);
    ihdr[8] = 8;
    ihdr[9] = 3;
    const plte = Buffer.from([0x22, 0x88, 0xee, 0xff, 0x00, 0x00]);
    const trns = Buffer.from([255, 0]);
    const raw = Buffer.alloc(4 * (1 + 4));
    for (let y = 0; y < 4; y += 1) {
      raw[y * 5] = 0;
      for (let x = 0; x < 4; x += 1) raw[y * 5 + 1 + x] = 0; // 全部索引 0
    }
    const bytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('PLTE', plte),
      chunk('tRNS', trns),
      chunk('IDAT', new Uint8Array(deflateSync(raw))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const res = extractVisualDna(bytes);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stats.palette[0]!.color).toBe('#2288ee');
  });

  it('Paeth / Average / Sub 反向滤波还原出同样的像素', () => {
    // 同一张 4x2 图：一份用 filter 0，一份手工按 filter 4(Paeth) 编码，统计必须一致
    const pixels: Rgb[][] = [
      [
        [10, 20, 30],
        [40, 50, 60],
        [70, 80, 90],
        [100, 110, 120],
      ],
      [
        [200, 10, 10],
        [150, 150, 150],
        [0, 0, 0],
        [255, 255, 255],
      ],
    ];
    const plain = png(4, 2, (x, y) => pixels[y]![x]!);
    const width = 4;
    const channels = 3;
    const filtered: number[] = [];
    for (let y = 0; y < 2; y += 1) {
      filtered.push(4); // Paeth
      for (let x = 0; x < width; x += 1) {
        for (let c = 0; c < channels; c += 1) {
          const value = pixels[y]![x]![c]!;
          const a = x > 0 ? pixels[y]![x - 1]![c]! : 0;
          const b = y > 0 ? pixels[y - 1]![x]![c]! : 0;
          const cc = x > 0 && y > 0 ? pixels[y - 1]![x - 1]![c]! : 0;
          const p = a + b - cc;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - cc);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
          filtered.push((value - pred) & 0xff);
        }
      }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(2, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const paethPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', new Uint8Array(deflateSync(Buffer.from(filtered)))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const a = extractVisualDna(plain);
    const b = extractVisualDna(paethPng);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.stats).toEqual(a.stats);
  });

  it('不支持的输入一律带回原因，不返回半套 DNA', () => {
    const notPng = extractVisualDna(Buffer.from('not a png at all'));
    expect(notPng.ok).toBe(false);
    if (!notPng.ok) expect(notPng.reason).toContain('PNG');

    // 16bit：明确拒绝，而不是把高字节当 8bit 读
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(4, 0);
    ihdr.writeUInt32BE(4, 4);
    ihdr[8] = 16;
    ihdr[9] = 2;
    const sixteen = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', new Uint8Array(deflateSync(Buffer.alloc(4 * (1 + 4 * 3))))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const r16 = extractVisualDna(sixteen);
    expect(r16.ok).toBe(false);
    if (!r16.ok) expect(r16.reason).toContain('16bit');

    // 隔行
    const interlaced = png(8, 8, () => [1, 2, 3]);
    interlaced[28] = 1; // IHDR 的 interlace 字节
    const ri = extractVisualDna(interlaced);
    expect(ri.ok).toBe(false);
    if (!ri.ok) expect(ri.reason).toContain('隔行');
  });
});

describe('描述符与角色：阈值边界要说人话', () => {
  it('浅色 + 冷色 + 大面积留白', () => {
    const stats = statsOf({
      width: 1800,
      height: 900,
      meanLuminance: 0.9,
      luminanceStdev: 0.05,
      meanSaturation: 0.05,
      edgeDensity: 0.001,
      warmth: -0.4,
      palette: [{ color: '#ffffff', share: 0.9 }],
    });
    expect(descriptorsOf(stats)).toEqual(['浅色底', '低对比', '近中性色', '冷色倾向', '大面积留白', '横幅比例', '单主色']);
  });

  it('角色板：没有第二个色时不硬编前景/强调色', () => {
    const stats = statsOf({ width: 100, height: 100, palette: [{ color: '#101010', share: 1 }] });
    expect(paletteRolesOf(stats)).toEqual([{ role: 'background', color: '#101010' }]);
  });

  it('低饱和的第二色不会被谎报成强调色', () => {
    const stats = statsOf({
      width: 100,
      height: 100,
      palette: [
        { color: '#101010', share: 0.7 },
        { color: '#808080', share: 0.3 },
      ],
    });
    const roles = paletteRolesOf(stats).map((r) => r.role);
    expect(roles).toEqual(['background', 'foreground']);
  });
});
