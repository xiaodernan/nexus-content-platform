import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

/**
 * §38 Image Studio 的第一条箭头：Text → Image。
 *
 * 说清楚这里给的是什么，因为需求原文要的是"AI 生成"，而本机没有任何图像 provider
 * （`docs/ROADMAP.md` 的阻塞项写着"真实 AI provider key（文本/图像/视频）"）：
 * 这是一个**本地确定性合成器**——同一句 prompt 永远得到同一张图，像素由 prompt 的哈希驱动，
 * 不调用任何模型。所以它是"占位图形"而不是"生成结果"，界面上必须写 DEMO MODE（§160），
 * 资产行必须带 `source='generated'` + `genMeta.demoMode=true`，让事后的人分得清哪一张是真模型给的。
 *
 * 为什么仍然值得做而不是等 provider：
 * - 它把 §38 那条链的**其余环节全接成真的**：额度门（image 桶）→ 任务行 → 字节 → magic-bytes 校验
 *   → 元数据剥离 → 对象存储 → 资产清单 → 画布填充 → 撤销。接上真 provider 时换的只是这一格像素来源。
 * - 输出的字节是真的 PNG，走的是与用户上传完全同一道摄取门（§80），不是"假装存下来了"。
 */

export interface SynthInput {
  prompt: string;
  width: number;
  height: number;
  /** 同一句话换个 seed 就是另一张图；默认 0，所以默认情况下完全可复现 */
  seed?: number;
  /**
   * §38 的 Reference → Variation：给一个 0..1 的色相锚点，画面围绕它配色。
   * 它参与身份哈希——**同一句话同一 seed，但参考图不同，就不是同一份字节**，
   * 否则"变体"会被去重复用成原图那一张，第二次点击等于什么都没生成。
   */
  hueAnchor?: number;
  /**
   * §38 Image → Image：参考图的像素统计值（亮度、对比度、饱和度等），供合成器做确定性扰动。
   * 与 referencePixels 互斥：给了原始像素就不再传统计值（优先用像素）。
   */
  referenceStats?: {
    meanLuminance: number;
    luminanceStdev: number;
    meanSaturation: number;
    edgeDensity: number;
    warmth: number;
  };
  /**
   * §38 Sketch → Image：从草图量出来的两个构图统计值，都归一到 0..1。
   * - `inkCoverage`：落墨占比（1 - 平均亮度；白纸上黑线，空白纸≈0，涂满≈1）；
   * - `strokeDensity`：笔画密度（像素邻差密度，线越多越碎越大）。
   * 与 `referenceStats` 同一纪律：**给了才生效**，没给时哈希输入与渲染基线与两者都不存在时
   * 逐字节相同——同一句 prompt 的历史资产要能对上今天新生成的那一张（72b28d1 的教训）。
   * 边界写在注释里：草图影响的是**构图密度与明暗**，不是"照草图的形状画"——后者要真 provider
   * 的 img2img，这一格欠的是像素，不是接线。
   */
  sketchStats?: {
    inkCoverage: number;
    strokeDensity: number;
  };
}

const MAX_EDGE = 1024;

export function synthLimitViolations(input: SynthInput): string[] {
  const issues: string[] = [];
  if (input.prompt.trim().length === 0) issues.push('prompt 不能是空的');
  if (input.hueAnchor !== undefined && !(input.hueAnchor >= 0 && input.hueAnchor < 1)) {
    issues.push(`色相锚点要在 0（含）到 1（不含）之间，收到 ${input.hueAnchor}`);
  }
  for (const [key, value] of [
    ['落墨占比', input.sketchStats?.inkCoverage],
    ['笔画密度', input.sketchStats?.strokeDensity],
  ] as const) {
    if (value !== undefined && !(value >= 0 && value <= 1)) {
      issues.push(`${key}要在 0 到 1 之间，收到 ${value}`);
    }
  }
  for (const [key, value] of [
    ['宽', input.width],
    ['高', input.height],
  ] as const) {
    if (!Number.isInteger(value) || value < 16) issues.push(`${key}至少 16 像素，收到 ${value}`);
    else if (value > MAX_EDGE) issues.push(`${key}最多 ${MAX_EDGE} 像素（DEMO 合成器不上去，真 provider 的规格另算），收到 ${value}`);
  }
  return issues;
}

/**
 * 只依赖 prompt/seed/尺寸/色相锚点/统计值：不读时钟、不读随机数，所以两次调用必须给同一份字节。
 *
 * **没有 referenceStats 时，哈希输入与加这个字段之前逐字节相同**（`parts.join('|')` 里没有那一格）。
 * 这不是洁癖：DEMO 模式下"同一句话生成的图"要能跨代码版本对得上——否则同一句 prompt
 * 今天和昨天出两张不同的图，历史资产行与新生成行静默对不上，而那种漂移没人能从界面上发现。
 * 给参考图统计值时才多出一格，于是"变体"必然是另一份字节，原图那份原地不动。
 */
function seedBytes(input: SynthInput): Buffer {
  const seed = (input.seed ?? 0).toString(36);
  const anchor = input.hueAnchor === undefined ? '-' : input.hueAnchor.toFixed(6);
  const parts = [seed, `${input.width}x${input.height}`, anchor];
  if (input.referenceStats) {
    // referenceStats 参与哈希：同一句话同一 seed，但参考图统计不同，就不是同一份字节
    parts.push(
      `${input.referenceStats.meanLuminance.toFixed(4)}-${input.referenceStats.luminanceStdev.toFixed(4)}-${input.referenceStats.meanSaturation.toFixed(4)}`,
    );
  }
  if (input.sketchStats) {
    // 草图也参与身份：换一张草图就是另一份字节，否则"从草图生成"会被去重复用成同一张
    parts.push(`sketch:${input.sketchStats.inkCoverage.toFixed(4)}-${input.sketchStats.strokeDensity.toFixed(4)}`);
  }
  parts.push(input.prompt.trim().toLowerCase());
  return createHash('sha256').update(parts.join('|')).digest();
}

/** 一个小到能一眼看完的伪随机流：从摘要出发，每次取 4 字节滚动 */
function rngFrom(digest: Buffer): () => number {
  let state = digest.readUInt32BE(0);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** 画一张"prompt 决定的"图：底色渐变 + 若干由哈希决定位置与形状的图形。纯 CPU，无 IO */
function renderPixels(input: SynthInput): Uint8Array {
  const { width, height } = input;
  const digest = seedBytes(input);
  const rand = rngFrom(digest);
  // 色相那一格**总是**从流里取一次：有参考图时用它只是把这一格换掉，后面的形状/横带位置不变，
  // 于是"变体"确实是同一张图的换色，而不是另一张不相干的图
  const drawnHue = rand();
  const hue = input.hueAnchor ?? drawnHue;
  
  // §38 Image → Image：有参考图统计值时才调制基底颜色与渐变末端。
  // 没有参考图时 r1/r2 保持**这个字段加进来之前的基线**（0.45/0.28 与 0.55/0.62）：
  // image-synth.test.ts 里"颜色数 > 200"那条断言是拿旧基线校准的，顺手改基线会让
  // "没有参考图也变了一个样"——合成器变矮了而没人看得出来，那是最难发现的一类漂移。
  let baseLightness = 0.28;
  let baseSaturation = 0.45;
  let endLightness = 0.62;
  let endSaturation = 0.55;
  if (input.referenceStats) {
    // 用参考图的亮度与饱和度调制基底的明暗与鲜艳程度；渐变末端跟着同一组调制走
    baseLightness = Math.max(0.1, Math.min(0.9, input.referenceStats.meanLuminance * 0.6 + 0.2));
    baseSaturation = Math.max(0.2, Math.min(0.8, input.referenceStats.meanSaturation * 0.7 + 0.3));
    endLightness = baseLightness * 1.3;
    endSaturation = baseSaturation * 1.2;
  }
  // §38 Sketch → Image：落墨越多底色越暗（白纸轻稿 → 亮底，涂满 → 暗底）；
  // 笔画越碎图形越多（edgeDensity 在真草图上落在 0.02–0.15，×24 后是 0–4 个追加，封顶 8）。
  // 与 referenceStats 同一纪律：这个字段不给时下面两行都不执行，基线原样。
  if (input.sketchStats) {
    baseLightness = Math.max(0.1, Math.min(0.9, 0.75 - 0.65 * input.sketchStats.inkCoverage));
    endLightness = Math.min(0.95, baseLightness * 1.6);
  }

  const [r1, g1, b1] = hslToRgb(hue, baseSaturation, baseLightness);
  const [r2, g2, b2] = hslToRgb((hue + 0.18) % 1, endSaturation, endLightness);
  const pixels = new Uint8Array(width * height * 3);

  // 没有参考图：画底色渐变；有参考图时仍然画渐变，但用统计值调过色
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x / Math.max(width - 1, 1) + y / Math.max(height - 1, 1)) / 2;
      const i = (y * width + x) * 3;
      pixels[i] = Math.round(r1 + (r2 - r1) * t);
      pixels[i + 1] = Math.round(g1 + (g2 - g1) * t);
      pixels[i + 2] = Math.round(b1 + (b2 - b1) * t);
    }
  }

  const put = (x: number, y: number, [r, g, b]: readonly [number, number, number]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (Math.floor(y) * width + Math.floor(x)) * 3;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  };
  const shapes =
    3 + Math.floor(rand() * 5) + (input.sketchStats ? Math.min(8, Math.round(input.sketchStats.strokeDensity * 24)) : 0);
  for (let s = 0; s < shapes; s += 1) {
    const cx = rand() * width;
    const cy = rand() * height;
    const radius = (0.08 + rand() * 0.22) * Math.min(width, height);
    const color = hslToRgb((hue + rand()) % 1, 0.7, 0.35 + rand() * 0.4);
    const kind = Math.floor(rand() * 3);
    for (let y = Math.floor(cy - radius); y <= cy + radius; y += 1) {
      for (let x = Math.floor(cx - radius); x <= cx + radius; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const inside =
          kind === 0
            ? Math.hypot(dx, dy) <= radius
            : kind === 1
              ? Math.abs(dx) <= radius * 0.8 && Math.abs(dy) <= radius * 0.6
              : Math.hypot(dx, dy) <= radius && Math.hypot(dx, dy) >= radius * 0.62;
        if (inside) put(x, y, color);
      }
    }
  }
  // 几条横带：让"同一 prompt 的图"在缩略图尺寸下也看得出是同一张
  const bands = 2 + Math.floor(rand() * 3);
  for (let b = 0; b < bands; b += 1) {
    const y = Math.floor(rand() * height);
    const thickness = 1 + Math.floor(rand() * 4);
    const color = hslToRgb((hue + 0.5) % 1, 0.35, 0.85);
    for (let dy = 0; dy < thickness; dy += 1) {
      for (let x = 0; x < width; x += 1) put(x, y + dy, color);
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(chunks: Buffer[]): number {
  let c = 0xffffffff;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) c = (CRC_TABLE[(c ^ (chunk[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(4 + body.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32([body]), out.length - 4);
  return out;
}

/** 真 PNG（8 位 RGB、无交织、单 IDAT）。字节要能过 §80 那道 magic-bytes 门，所以不能是"看起来像图片" */
function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolour RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, rowStart + 1);
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

export interface SynthResult {
  ok: true;
  bytes: Uint8Array;
  mime: 'image/png';
  width: number;
  height: number;
  /** 写进 `assets.gen_meta`：事后要能看出这是哪句话、哪个 seed、哪种来源 */
  genMeta: Record<string, unknown>;
}

export type SynthOutcome = SynthResult | { ok: false; issues: string[] };

export function synthesizeDemoImage(input: SynthInput): SynthOutcome {
  const issues = synthLimitViolations(input);
  if (issues.length) return { ok: false, issues };
  const bytes = encodePng(input.width, input.height, renderPixels(input));
  return {
    ok: true,
    bytes,
    mime: 'image/png',
    width: input.width,
    height: input.height,
    genMeta: {
      prompt: input.prompt.trim(),
      seed: input.seed ?? 0,
      provider: 'demo',
      model: 'local-deterministic-synth',
      demoMode: true,
    },
  };
}
