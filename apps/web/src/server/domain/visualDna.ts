import { inflateSync } from 'node:zlib';
import type { VisualDna } from '@nexus/design-model';

/**
 * §30 / §172-174 参考图 → Visual DNA 的**本地像素统计**实现。
 *
 * 这里刻意只做能自证的事情：解出像素、数颜色、量亮度分布。字号、圆角、缓动曲线
 * 从一张位图上测不出来，所以本模块**不产出**这些字段（§159：宁可留空也不编）。
 * 想要"衬线标题 / 慢镜头"这类语义描述，得等真实视觉 provider 到位后在同一接口上叠加，
 * 届时 `VisualDna.source.method` 会是 `vision-model` 而不是 `pixel-stats`。
 *
 * 只支持非隔行的 8bit PNG：JPEG/WebP 解码要引入原生依赖（本机约束是免编译），
 * 所以遇到不支持的输入一律如实返回 reason，不猜、不降级成假数据。
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** 参与统计的像素上限：再多对描述符没有增益，却会把请求拖成 CPU 瓶颈 */
const MAX_SAMPLES = 60_000;

export interface PixelStats {
  width: number;
  height: number;
  /** 实际参与统计的像素数（降采样后） */
  samples: number;
  /** 0..1 平均亮度（Rec.709 加权，sRGB 值域） */
  meanLuminance: number;
  /** 亮度标准差，高对比的代理指标 */
  luminanceStdev: number;
  /** 0..1 平均饱和度 (max-min)/max */
  meanSaturation: number;
  /** 相邻采样点亮度差的均值：画面"忙碌程度"的代理指标 */
  edgeDensity: number;
  /** 暖冷倾向：R-B 的均值，[-1,1] */
  warmth: number;
  /** 降采样后仍保留的主色（按出现占比排序，最多 6 个） */
  palette: { color: string; share: number }[];
}

export type VisualDnaResult =
  | { ok: true; dna: VisualDna; stats: PixelStats }
  | { ok: false; reason: string };

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;
}

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
}

interface PngChunks {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  palette?: Uint8Array;
  transparency?: Uint8Array;
  idat: Uint8Array;
}

/** 只走一遍块链，把解码需要的段挑出来；结构不完整的图直接拒绝（不猜尺寸） */
function readPng(bytes: Uint8Array): PngChunks | string {
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return '不是 PNG 文件（签名不匹配）';
  }
  let cursor = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const idatParts: Uint8Array[] = [];
  let idatLength = 0;

  while (cursor + 8 <= bytes.length) {
    const length = u32(bytes, cursor);
    const type = fourcc(bytes, cursor + 4);
    const dataStart = cursor + 8;
    const end = dataStart + length;
    if (length > bytes.length || end + 4 > bytes.length) return `PNG 块 ${type} 超出文件长度`;
    const data = bytes.subarray(dataStart, end);
    if (type === 'IHDR') {
      if (length < 13) return 'PNG IHDR 段过短';
      width = u32(data, 0);
      height = u32(data, 4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      transparency = data;
    } else if (type === 'IDAT') {
      idatParts.push(data);
      idatLength += data.length;
    } else if (type === 'IEND') {
      break;
    }
    cursor = end + 4;
  }

  if (!width || !height) return 'PNG 缺少有效的 IHDR 尺寸';
  if (colorType === 3 && !palette) return '调色板 PNG 缺少 PLTE 段';
  const idat = new Uint8Array(idatLength);
  let offset = 0;
  for (const part of idatParts) {
    idat.set(part, offset);
    offset += part.length;
  }
  return { width, height, bitDepth, colorType, interlace, palette, transparency, idat };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** 解出 8bit RGBA；不支持的编码返回原因字符串（§159：不静默产出半张图） */
function decodePngToRgba(png: PngChunks): Uint8Array | string {
  if (png.interlace !== 0) return '暂不支持隔行（Adam7）PNG';
  if (png.bitDepth !== 8) return `暂不支持 ${png.bitDepth}bit 深度，只支持 8bit PNG`;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[png.colorType];
  if (!channels) return `暂不支持 colorType ${png.colorType}`;

  let raw: Uint8Array;
  try {
    raw = new Uint8Array(inflateSync(Buffer.from(png.idat)));
  } catch (error) {
    return `IDAT 解压失败：${error instanceof Error ? error.message : String(error)}`;
  }

  const stride = png.width * channels;
  const expected = png.height * (stride + 1);
  if (raw.length < expected) return `解压后字节数 ${raw.length} 小于所需的 ${expected}`;

  const filtered = new Uint8Array(png.height * stride);
  for (let y = 0; y < png.height; y += 1) {
    const filterType = raw[y * (stride + 1)]!;
    const rowStart = y * (stride + 1) + 1;
    const outStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[rowStart + x]!;
      const left = x >= channels ? filtered[outStart + x - channels]! : 0;
      const up = y > 0 ? filtered[outStart - stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? filtered[outStart - stride + x - channels]! : 0;
      let recon: number;
      switch (filterType) {
        case 0:
          recon = value;
          break;
        case 1:
          recon = value + left;
          break;
        case 2:
          recon = value + up;
          break;
        case 3:
          recon = value + ((left + up) >> 1);
          break;
        case 4:
          recon = value + paeth(left, up, upLeft);
          break;
        default:
          return `未知的 PNG 行过滤器 ${filterType}`;
      }
      filtered[outStart + x] = recon & 0xff;
    }
  }

  const rgba = new Uint8Array(png.width * png.height * 4);
  const palette = png.palette;
  const trns = png.transparency;
  for (let i = 0; i < png.width * png.height; i += 1) {
    const at = i * channels;
    let r: number;
    let g: number;
    let b: number;
    let a = 255;
    switch (png.colorType) {
      case 0:
        r = g = b = filtered[at]!;
        break;
      case 4:
        r = g = b = filtered[at]!;
        a = filtered[at + 1]!;
        break;
      case 2:
        r = filtered[at]!;
        g = filtered[at + 1]!;
        b = filtered[at + 2]!;
        break;
      case 6:
        r = filtered[at]!;
        g = filtered[at + 1]!;
        b = filtered[at + 2]!;
        a = filtered[at + 3]!;
        break;
      case 3: {
        const index = filtered[at]!;
        // 索引越界 = 畸形调色板：读出来是 undefined，会一路 NaN 进亮度/主色统计，
        // 于是 extractVisualDna 交回一份 ok:true 却全是 NaN 的"DNA"（§159 禁的假数据）。
        // 这里如实拒绝，不猜一个颜色、不降级成假数据。
        if (index * 3 + 2 >= palette!.length) {
          return `调色板索引 ${index} 超出 PLTE 范围（仅 ${Math.floor(palette!.length / 3)} 色）`;
        }
        r = palette![index * 3]!;
        g = palette![index * 3 + 1]!;
        b = palette![index * 3 + 2]!;
        a = trns && index < trns.length ? trns[index]! : 255;
        break;
      }
      default:
        return `暂不支持 colorType ${png.colorType}`;
    }
    const o = i * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = a;
  }
  return rgba;
}

function hex(r: number, g: number, b: number): string {
  const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

/**
 * 降采样统计 + 主色量化。
 *
 * 主色用 5bit/通道的直方图桶（32768 格），按桶计数后贪心取色：
 * 与已选色欧氏距离 < 30 的桶视为同一色，避免把渐变拆成一堆近似色。
 */
function measure(width: number, height: number, rgba: Uint8Array): PixelStats {
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / MAX_SAMPLES)));
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  let samples = 0;
  let sumL = 0;
  let sumL2 = 0;
  let sumS = 0;
  let sumWarm = 0;
  let edges = 0;
  let edgeCount = 0;

  let prevRowL: number[] = [];
  for (let y = 0; y < height; y += step) {
    const rowL: number[] = [];
    for (let x = 0; x < width; x += step) {
      const at = (y * width + x) * 4;
      const r = rgba[at]!;
      const g = rgba[at + 1]!;
      const b = rgba[at + 2]!;
      const a = rgba[at + 3]!;
      // 半透明像素混进统计会污染背景判断：alpha<128 一律跳过
      if (a < 128) {
        rowL.push(NaN);
        continue;
      }
      const l = luminance(r, g, b);
      rowL.push(l);
      samples += 1;
      sumL += l;
      sumL2 += l * l;
      sumS += saturation(r, g, b);
      sumWarm += (r - b) / 255;
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
      if (x >= step) {
        const left = rowL[rowL.length - 2];
        if (Number.isFinite(left)) {
          edges += Math.abs(l - left!);
          edgeCount += 1;
        }
      }
      if (prevRowL.length) {
        const above = prevRowL[x / step]!;
        if (Number.isFinite(above)) {
          edges += Math.abs(l - above);
          edgeCount += 1;
        }
      }
    }
    prevRowL = rowL;
  }

  const mean = samples ? sumL / samples : 0;
  const variance = samples ? Math.max(0, sumL2 / samples - mean * mean) : 0;
  const ranked = [...buckets.values()]
    .map((bucket) => ({
      color: hex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count),
      count: bucket.count,
    }))
    .sort((a, b) => b.count - a.count);

  const picked: { color: string; share: number }[] = [];
  for (const entry of ranked) {
    if (picked.length >= 6) break;
    const distance = (a: string, b: string) => {
      const d = (i: number) => parseInt(b.slice(1 + i * 2, 3 + i * 2), 16) - parseInt(a.slice(1 + i * 2, 3 + i * 2), 16);
      return Math.sqrt(d(0) ** 2 + d(1) ** 2 + d(2) ** 2);
    };
    if (picked.some((p) => distance(p.color, entry.color) < 30)) continue;
    picked.push({ color: entry.color, share: samples ? entry.count / samples : 0 });
  }

  return {
    width,
    height,
    samples,
    meanLuminance: mean,
    luminanceStdev: Math.sqrt(variance),
    meanSaturation: samples ? sumS / samples : 0,
    edgeDensity: edgeCount ? edges / edgeCount : 0,
    warmth: samples ? sumWarm / samples : 0,
    palette: picked,
  };
}

/** 描述符只说测得出来的事：每条都能回指到 stats 上的一个数字 */
export function descriptorsOf(stats: PixelStats): string[] {
  const out: string[] = [];
  if (stats.meanLuminance < 0.28) out.push('暗色底');
  else if (stats.meanLuminance > 0.72) out.push('浅色底');
  else out.push('中间调');

  if (stats.luminanceStdev > 0.26) out.push('高对比');
  else if (stats.luminanceStdev < 0.1) out.push('低对比');

  if (stats.meanSaturation > 0.45) out.push('高饱和');
  else if (stats.meanSaturation < 0.15) out.push('近中性色');

  if (stats.warmth > 0.08) out.push('暖色倾向');
  else if (stats.warmth < -0.08) out.push('冷色倾向');

  if (stats.edgeDensity > 0.08) out.push('信息密集');
  else if (stats.edgeDensity < 0.02) out.push('大面积留白');

  const ratio = stats.width / stats.height;
  if (ratio >= 1.8) out.push('横幅比例');
  else if (ratio <= 0.7) out.push('纵向比例');

  if (stats.palette.length >= 4) out.push('多色');
  else if (stats.palette.length <= 2) out.push('单主色');
  return out;
}

/** 主色 → 带角色的调色板：背景取占比最高，前景取与之最远，强调色取饱和度最高的那个 */
export function paletteRolesOf(stats: PixelStats): VisualDna['palette'] {
  const top = stats.palette;
  if (!top.length) return [];
  const background = top[0]!;
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  let foreground = top[0]!;
  let bestGap = -1;
  let accent = top[0]!;
  let bestSat = -1;
  for (const entry of top.slice(1)) {
    const [r, g, b] = parse(entry.color);
    const gap = Math.abs(luminance(r, g, b) - luminance(...parse(background.color)));
    if (gap > bestGap) {
      bestGap = gap;
      foreground = entry;
    }
    const sat = saturation(r, g, b);
    if (sat > bestSat) {
      bestSat = sat;
      accent = entry;
    }
  }
  const roles: VisualDna['palette'] = [{ role: 'background', color: background.color }];
  if (foreground.color !== background.color) roles.push({ role: 'foreground', color: foreground.color });
  // 强调色可以与前景同色：两色设计里那个唯一的亮色本来就同时承担文字与强调
  if (accent.color !== background.color && bestSat > 0.2) roles.push({ role: 'accent', color: accent.color });
  return roles;
}

/** 从一张参考图的字节里提取 Visual DNA（§30）；失败一定带回原因，不返回空壳冒充成功 */
export function extractVisualDna(
  bytes: Uint8Array,
  options: { assetId?: string; extractedAt?: string } = {},
): VisualDnaResult {
  const png = readPng(bytes);
  if (typeof png === 'string') return { ok: false, reason: png };
  const rgba = decodePngToRgba(png);
  if (typeof rgba === 'string') return { ok: false, reason: rgba };
  const stats = measure(png.width, png.height, rgba);
  if (!stats.samples) return { ok: false, reason: '整张图都是透明的，没有可统计的像素' };
  const dna: VisualDna = {
    source: {
      assetId: options.assetId,
      method: 'pixel-stats',
      extractedAt: options.extractedAt ?? new Date().toISOString(),
      notes: ['只统计了亮度/饱和度/边缘/主色，排版、圆角、动效无法从位图测出，因此未填写'],
    },
    palette: paletteRolesOf(stats),
    descriptors: descriptorsOf(stats),
  };
  return { ok: true, dna, stats };
}
