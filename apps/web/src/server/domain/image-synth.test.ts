import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { synthesizeDemoImage, synthLimitViolations, type SynthOutcome, type SynthResult } from './image-synth';

/**
 * §38 DEMO 合成器的单测。这一节要挡的是两类"看起来出了图"：
 * 字节根本不是 PNG（或 CRC 对不上，浏览器会白屏），以及字节是合法 PNG 但里面是一张平图
 * （那等于什么都没画）。所以两道都要量：结构 + 内容。
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = (CRC_TABLE[(c ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface PngDump {
  width: number;
  height: number;
  types: string[];
  /** 解完滤波器的原始像素：(w*3+1)*h，每行首字节是 filter type */
  raw: Buffer;
}

/** 自己解一遍 PNG：校验和不是照抄被测代码的算法，而是按规范重算每段的 CRC */
function parsePng(bytes: Uint8Array): PngDump {
  const buf = Buffer.from(bytes);
  expect([...buf.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  let offset = 8;
  let width = 0;
  let height = 0;
  const types: string[] = [];
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + length);
    const storedCrc = buf.readUInt32BE(offset + 8 + length);
    expect(crc32(Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])), `块 ${type} 的 CRC 对不上`).toBe(storedCrc);
    types.push(type);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8); // bit depth
      expect(data[9]).toBe(2); // color type: 真彩色 RGB
      expect(data[12]).toBe(0); // 无交织
    }
    if (type === 'IDAT') idat.push(Buffer.from(data));
    offset += 12 + length;
  }
  expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
  const raw = inflateSync(Buffer.concat(idat));
  expect(raw.length).toBe((width * 3 + 1) * height);
  return { width, height, types, raw };
}

/** 数一数这张图里到底有多少种颜色——一张平图是 1 种。滤波全是 0，所以行内容就是像素本身 */
function colorCount(dump: PngDump): number {
  const stride = dump.width * 3;
  const colors = new Set<string>();
  for (let y = 0; y < dump.height; y += 1) {
    expect(dump.raw[y * (stride + 1)], '这一版合成器只写 filter 0').toBe(0);
    const base = y * (stride + 1) + 1;
    for (let x = 0; x < dump.width; x += 1) {
      const i = base + x * 3;
      colors.add(`${dump.raw[i]},${dump.raw[i + 1]},${dump.raw[i + 2]}`);
    }
  }
  return colors.size;
}

const hashOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** 整张图的平均亮度（0..1）：合成器只写 filter 0，raw 去掉行首字节就是像素本身 */
function meanLuminanceOf(bytes: Uint8Array): number {
  const dump = parsePng(bytes);
  const stride = dump.width * 3;
  let sum = 0;
  for (let y = 0; y < dump.height; y += 1) {
    const base = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) sum += dump.raw[base + x] ?? 0;
  }
  return sum / (stride * dump.height) / 255;
}

/** 前置失败要立刻报错，而不是把 `undefined` 传进下一句断言 */
function mustSynth(out: SynthOutcome): SynthResult {
  if (!out.ok) throw new Error(`合成被拒：${out.issues.join('；')}`);
  return out;
}

describe('§38 DEMO 图像合成器：真字节、可复现、随 prompt 变', () => {
  it('出的是结构合法的 PNG，尺寸与请求一致，且不是一张平图', () => {
    const out = mustSynth(synthesizeDemoImage({ prompt: '黄昏后的海岸城市', width: 64, height: 48 }));
    const dump = parsePng(out.bytes);
    expect(dump.width).toBe(64);
    expect(dump.height).toBe(48);
    expect(out.mime).toBe('image/png');
    // 渐变 + 图形 + 横带：只画一层的实现（或全零像素）会在这里露出来
    expect(colorCount(dump)).toBeGreaterThan(200);
  });

  it('同一句话同一尺寸两次调用得到逐字节相同的图；换话或换 seed 就必须不一样', () => {
    const a = synthesizeDemoImage({ prompt: '黄昏后的海岸城市', width: 32, height: 32 });
    const b = synthesizeDemoImage({ prompt: '黄昏后的海岸城市', width: 32, height: 32 });
    const c = synthesizeDemoImage({ prompt: '黄昏后的海岸都市', width: 32, height: 32 });
    const d = synthesizeDemoImage({ prompt: '黄昏后的海岸城市', width: 32, height: 32, seed: 7 });
    const okA = mustSynth(a);
    const okB = mustSynth(b);
    const okC = mustSynth(c);
    const okD = mustSynth(d);
    expect(hashOf(okA.bytes)).toBe(hashOf(okB.bytes));
    expect(hashOf(okA.bytes), '换一句话还是同一张图，那 prompt 就没进依据').not.toBe(hashOf(okC.bytes));
    expect(hashOf(okA.bytes), '换 seed 还是同一张图，那 seed 就没进依据').not.toBe(hashOf(okD.bytes));
  });

  it('preflight 挡的是规格：空 prompt、非整数、过小、过大都拒，边界值放过', () => {
    expect(synthLimitViolations({ prompt: '   ', width: 64, height: 64 })).toContain('prompt 不能是空的');
    expect(synthLimitViolations({ prompt: 'x', width: 64.5, height: 64 }).length).toBe(1);
    expect(synthLimitViolations({ prompt: 'x', width: 8, height: 8 }).length).toBe(2);
    expect(synthLimitViolations({ prompt: 'x', width: 2048, height: 64 }).length).toBe(1);
    // 边界：两端都取到最大值时不许拒——上限写错方向会让所有请求都出不去
    expect(synthLimitViolations({ prompt: 'x', width: 16, height: 1024 })).toEqual([]);
    expect(synthesizeDemoImage({ prompt: 'x', width: 8, height: 8 })).toEqual({ ok: false, issues: synthLimitViolations({ prompt: 'x', width: 8, height: 8 }) });
  });

  it('genMeta 里写清了来源是 demo：事后要分得模型给的和本地合成的', () => {
    const out = mustSynth(synthesizeDemoImage({ prompt: '一只戴帽子的猫  ', width: 16, height: 16 }));
    expect(out.genMeta).toMatchObject({
      prompt: '一只戴帽子的猫', // 落库的是.trim 过的那一份，界面复述时不会再带空格
      seed: 0,
      provider: 'demo',
      model: 'local-deterministic-synth',
      demoMode: true,
    });
  });

  it('参考图统计值参与身份：同一 prompt 给不同统计值是另一张图，同一组统计值逐字节可复现', () => {
    // §38 Image → Image：变体必须是"另一张图"（否则第二次点击被去重成原图），
    // 同时必须可复现（DEMO 模式没有第三次随机的余地）
    const stats = { meanLuminance: 0.55, luminanceStdev: 0.18, meanSaturation: 0.42, edgeDensity: 0.2, warmth: 0.6 };
    const base = mustSynth(synthesizeDemoImage({ prompt: '同一句话', width: 32, height: 32 }));
    const variant = mustSynth(synthesizeDemoImage({ prompt: '同一句话', width: 32, height: 32, referenceStats: stats }));
    const again = mustSynth(synthesizeDemoImage({ prompt: '同一句话', width: 32, height: 32, referenceStats: { ...stats } }));
    const other = mustSynth(
      synthesizeDemoImage({ prompt: '同一句话', width: 32, height: 32, referenceStats: { ...stats, meanLuminance: 0.2 } }),
    );
    expect(hashOf(variant.bytes), '给了统计值还是原图，"变体"会被去重').not.toBe(hashOf(base.bytes));
    expect(hashOf(variant.bytes)).toBe(hashOf(again.bytes));
    expect(hashOf(other.bytes), '换一组统计值还是同一张图，统计值没进依据').not.toBe(hashOf(variant.bytes));
    // 变体也要是结构合法的 PNG：调制只改颜色，不改编码路径
    const dump = parsePng(variant.bytes);
    expect(dump.width).toBe(32);
    expect(colorCount(dump)).toBeGreaterThan(50);
  });

  // 反向对照：上面那套 CRC 校验本身必须能报错，否则"结构合法"是它给的绿灯而不是事实
  it('反向对照：改掉 IHDR 一个字节的 PNG 会被同一套校验挡下', () => {
    const out = mustSynth(synthesizeDemoImage({ prompt: '反向对照', width: 16, height: 16 }));
    const bytes = Uint8Array.from(out.bytes);
    // 8 字节签名 + 4 字节长度 + 4 字节类型之后就是 IHDR 的数据段（宽度的最高位）
    const ihdrData = 8 + 4 + 4;
    bytes[ihdrData] = (bytes[ihdrData] ?? 0) ^ 0xff;
    expect(() => parsePng(bytes)).toThrow(/CRC/);
  });

  it('草图统计值参与身份：同 prompt 同 seed，换草图就是换字节，同一份草图逐字节可复现', () => {
    // §38 Sketch → Image 的身份证据：不给草图的那一张必须原地不动（72b28d1 的教训——
    // 上次就是"顺手把基线改了"让无参考路径的字节跟着漂移），给了草图才多出一格哈希。
    const plain = mustSynth(synthesizeDemoImage({ prompt: '草图底座', width: 32, height: 32 }));
    const light = mustSynth(
      synthesizeDemoImage({ prompt: '草图底座', width: 32, height: 32, sketchStats: { inkCoverage: 0.05, strokeDensity: 0.02 } }),
    );
    const lightAgain = mustSynth(
      synthesizeDemoImage({ prompt: '草图底座', width: 32, height: 32, sketchStats: { inkCoverage: 0.05, strokeDensity: 0.02 } }),
    );
    const heavy = mustSynth(
      synthesizeDemoImage({ prompt: '草图底座', width: 32, height: 32, sketchStats: { inkCoverage: 0.8, strokeDensity: 0.3 } }),
    );
    expect(hashOf(light.bytes), '给了草图统计值还是没草图那一张，"从草图生成"会被去重').not.toBe(hashOf(plain.bytes));
    expect(hashOf(light.bytes)).toBe(hashOf(lightAgain.bytes));
    expect(hashOf(heavy.bytes), '换一张草图还是同一份字节，草图没进依据').not.toBe(hashOf(light.bytes));
    // 行为见证：落墨多 → 整体更暗。只钉方向不钉像素，合成器换实现时这一句仍然说的是"草图在起作用"
    expect(meanLuminanceOf(light.bytes)).toBeGreaterThan(meanLuminanceOf(heavy.bytes));
    // 两张都得是结构合法的 PNG：调制只改像素，不改编码路径
    expect(colorCount(parsePng(heavy.bytes))).toBeGreaterThan(50);
  });

  it('草图统计值的 preflight：越界与非有限数拒掉，0 与 1 两个端点放过', () => {
    expect(synthLimitViolations({ prompt: 'x', width: 64, height: 64, sketchStats: { inkCoverage: 1.2, strokeDensity: 0.1 } }))
      .toContain('落墨占比要在 0 到 1 之间，收到 1.2');
    expect(synthLimitViolations({ prompt: 'x', width: 64, height: 64, sketchStats: { inkCoverage: 0.5, strokeDensity: NaN } }))
      .toContain('笔画密度要在 0 到 1 之间，收到 NaN');
    expect(synthLimitViolations({ prompt: 'x', width: 64, height: 64, sketchStats: { inkCoverage: 0, strokeDensity: 1 } })).toEqual([]);
  });
});
