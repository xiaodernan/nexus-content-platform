/**
 * 图片资产的读取与净化（§80 / docs/SECURITY.md 文件上传）。
 *
 * 两件事必须在这里做，且**不依赖扩展名**：
 * 1. 按 magic bytes 判定真实格式——扩展名与 Content-Type 都是客户端可伪造的
 * 2. 剥掉元数据后再入库：EXIF/XMP/IPTC 里常见 GPS 与设备指纹，
 *    原图入库等于把上传者的位置信息发布出去
 *
 * 为什么手写而不是引 sharp/jimp：SECURITY.md 要求的是「去元数据 + 像素上限」，
 * 不需要转码；引原生图像库会连带一条跨平台的编译链。这里三种容器的元数据段
 * 都是可枚举的结构，剥离是纯字节操作，能被单测完全覆盖。
 * 真正的重新编码（缩略图、有损统一化）等 provider 层落地时再做，届时替换本文件。
 */

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export const IMAGE_MIME_EXTENSIONS: Record<ImageMime, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** 体积与像素上限（§80）：超了就拒，不缩——静默降质量等于对用户撒谎 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 12_000;
export const MAX_IMAGE_PIXELS = 40_000_000;

function u8(value: ArrayBufferView | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF87A = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89A = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

/** WebP 的画布尺寸是 24 位小端，DataView 没有对应的读取器 */
function readUint24LE(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);
}

/** 判定真实图片格式；不是受支持的位图就返回 null（调用方必须拒绝，不得猜测） */
export function sniffImageMime(input: ArrayBufferView | Uint8Array): ImageMime | null {
  const bytes = u8(input);
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, GIF87A) || startsWith(bytes, GIF89A)) return 'image/gif';
  return null;
}

/** 位图宽高。解析不出来就返回 null——上传方要据此拒绝，而不是存一张尺寸未知的图 */
export function readImageSize(input: ArrayBufferView | Uint8Array): { width: number; height: number } | null {
  const bytes = u8(input);
  const mime = sniffImageMime(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (mime === 'image/png') {
    // IHDR 固定是第一个块：8 字节签名 + 4 长度 + 4 类型，随后是宽高分辨率
    if (bytes.length < 24) return null;
    if (fourcc(bytes, 12) !== 'IHDR') return null;
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }

  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1] ?? 0;
      // SOF0..SOF15（跳过 DHT/DAC 等无帧信息的标记）
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        // SOF 段：FF Cx + 长度(2) + 精度(1) + 高(2) + 宽(2)，所以高在 +5、宽在 +7
        if (offset + 9 > bytes.length) return null;
        return { height: view.getUint16(offset + 5, false), width: view.getUint16(offset + 7, false) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const segmentLength = view.getUint16(offset + 2, false);
      if (segmentLength < 2) return null;
      offset += 2 + segmentLength;
    }
    return null;
  }

  if (mime === 'image/webp') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkType = fourcc(bytes, offset);
      const chunkSize = view.getUint32(offset + 4, true);
      const data = offset + 8;
      if (chunkType === 'VP8 ') {
        // 有损：帧头在第 6~13 字节里，宽高是 14 位
        if (data + 10 > bytes.length) return null;
        return { width: view.getUint16(data + 8, true) & 0x3fff, height: view.getUint16(data + 6, true) & 0x3fff };
      }
      if (chunkType === 'VP8L') {
        if (data + 5 > bytes.length) return null;
        const bits = view.getUint32(data + 1, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunkType === 'VP8X') {
        if (data + 10 > bytes.length) return null;
        return { width: readUint24LE(bytes, data + 4) + 1, height: readUint24LE(bytes, data + 7) + 1 };
      }
      offset = data + chunkSize + (chunkSize % 2);
    }
    return null;
  }

  if (mime === 'image/gif') {
    // 逻辑屏幕描述符：签名后 3 字节起是小端宽高
    if (bytes.length < 13) return null;
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  return null;
}

/** 上限检查：任何一项不合规都返回原因，绝不返回"截断后能用" */
export function imageLimitViolations(size: { width: number; height: number } | null, byteLength: number): string[] {
  const issues: string[] = [];
  if (!size || size.width <= 0 || size.height <= 0) issues.push('无法解析图片尺寸，已拒绝');
  if (byteLength > MAX_IMAGE_BYTES) issues.push(`图片体积 ${Math.round(byteLength / 1024 / 1024)}MB 超过上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
  if (size) {
    if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) {
      issues.push(`边长 ${size.width}×${size.height} 超过单边上限 ${MAX_IMAGE_SIDE}px`);
    }
    if (size.width * size.height > MAX_IMAGE_PIXELS) {
      issues.push(`像素总量 ${(size.width * size.height) / 1e6}M 超过上限 ${MAX_IMAGE_PIXELS / 1e6}M`);
    }
  }
  return issues;
}

export interface SanitizeResult {
  bytes: Uint8Array;
  /** 被剥掉的段名，写进日志与资产元数据（§80 可审计） */
  removed: string[];
}

/** 剥掉图片元数据。不支持的格式原样返回但由调用方拒绝，此处绝不"尽力而为" */
export function stripImageMetadata(input: ArrayBufferView | Uint8Array): SanitizeResult {
  const bytes = u8(input);
  const mime = sniffImageMime(bytes);
  if (mime === 'image/png') return stripPng(bytes);
  if (mime === 'image/jpeg') return stripJpeg(bytes);
  if (mime === 'image/webp') return stripWebp(bytes);
  if (mime === 'image/gif') return stripGif(bytes);
  return { bytes, removed: [] };
}

const PNG_TEXT_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(bytes: Uint8Array): SanitizeResult {
  const removed: string[] = [];
  const out: number[] = [];
  for (let offset = 0; offset < PNG_SIGNATURE.length; offset += 1) out.push(bytes[offset]!);
  let cursor = PNG_SIGNATURE.length;
  let ended = false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (cursor + 8 <= bytes.length) {
    const length = view.getUint32(cursor, false);
    const type = fourcc(bytes, cursor + 4);
    const end = cursor + 12 + length; // 长度 + 类型 + 数据 + CRC
    if (end > bytes.length) throw new Error(`PNG 块 ${type} 超出文件长度`);
    if (PNG_TEXT_CHUNKS.has(type)) {
      removed.push(type);
    } else {
      for (let i = cursor; i < end; i += 1) out.push(bytes[i]!);
    }
    cursor = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  // 没有 IEND 就是断掉的 PNG：宁可拒绝上传，也不存一张打不开的图
  if (!ended) throw new Error('PNG 缺少 IEND 块（文件不完整）');
  return { bytes: Uint8Array.from(out), removed };
}

/** JPEG：APP0 是 JFIF（渲染要用的宽高比），其余 APPn 与 COM 段全丢 */
const JPEG_APPn = (marker: number) => marker >= 0xe0 && marker <= 0xef;

function stripJpeg(bytes: Uint8Array): SanitizeResult {
  const removed: string[] = [];
  const out: number[] = [];
  const push = (from: number, to: number) => {
    for (let i = from; i < to; i += 1) out.push(bytes[i]!);
  };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const segmentLengthAt = (markerAt: number): number => {
    if (markerAt + 4 > bytes.length) throw new Error('JPEG 段头被截断');
    const length = view.getUint16(markerAt + 2, false);
    if (length < 2) throw new Error('JPEG 段长度非法');
    return length;
  };

  let offset = 0;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // 熵编码数据：整段照抄到下一个标记
      const next = findNextMarker(bytes, offset);
      push(offset, next);
      offset = next;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      push(offset, offset + 2);
      // EOI 之后可能挂着缩略图等杂数据（旧相机常见），一并丢掉
      if (marker === 0xd9) break;
      offset += marker === 0xda ? 2 + segmentLengthAt(offset) : 2;
      continue;
    }
    const end = offset + 2 + segmentLengthAt(offset);
    if (end > bytes.length) throw new Error('JPEG 段超出文件长度');
    if (JPEG_APPn(marker) && marker !== 0xe0) {
      removed.push(marker === 0xe1 ? 'APP1(EXIF/XMP)' : marker === 0xed ? 'APP13(IPTC)' : `APP${marker - 0xe0}`);
    } else if (marker === 0xfe) {
      removed.push('COM');
    } else {
      push(offset, end);
    }
    offset = end;
  }
  return { bytes: Uint8Array.from(out), removed };
}

/** 扫描到下一个 `FF xx`（xx 不是 00/FF/RST），返回其下标；找不到返回末尾 */
function findNextMarker(bytes: Uint8Array, from: number): number {
  let i = from;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < bytes.length && bytes[j] === 0xff) j += 1;
    if (j >= bytes.length) return bytes.length;
    const marker = bytes[j]!;
    if (marker !== 0x00 && !(marker >= 0xd0 && marker <= 0xd7)) return i;
    i = j + 1;
  }
  return bytes.length;
}

const WEBP_METADATA_CHUNKS = new Set(['EXIF', 'XMP']);
/** VP8X 的布局标志：bit0 ICC、bit1 Alpha、bit2 EXIF、bit3 XMP */
const VP8X_FLAG = { exif: 1 << 2, xmp: 1 << 3 };

function stripWebp(bytes: Uint8Array): SanitizeResult {
  const removed: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Uint8Array(bytes.length);
  let write = 0;
  const take = (from: number, to: number) => {
    out.set(bytes.subarray(from, to), write);
    write += to - from;
  };
  // RIFF 头 12 字节：长度稍后按剥离结果重写
  take(0, 12);
  let cursor = 12;
  let flagsAt = -1;
  const dropped = new Set<string>();
  while (cursor + 8 <= bytes.length) {
    const type = fourcc(bytes, cursor).trim();
    const size = view.getUint32(cursor + 4, true);
    const end = cursor + 8 + size + (size % 2);
    if (end > bytes.length) throw new Error(`WebP 块 ${type} 超出文件长度`);
    if (WEBP_METADATA_CHUNKS.has(type)) {
      removed.push(type);
      dropped.add(type);
    } else {
      if (type === 'VP8X') flagsAt = cursor + 8; // 块数据首字节就是标志位
      take(cursor, end);
    }
    cursor = end;
  }
  if (flagsAt >= 0) {
    if (dropped.has('EXIF')) out[flagsAt] = (out[flagsAt] ?? 0) & ~VP8X_FLAG.exif;
    if (dropped.has('XMP')) out[flagsAt] = (out[flagsAt] ?? 0) & ~VP8X_FLAG.xmp;
  }
  const stripped = out.subarray(0, write);
  new DataView(stripped.buffer, stripped.byteOffset, stripped.byteLength).setUint32(4, write - 8, true);
  return { bytes: stripped, removed };
}

function stripGif(bytes: Uint8Array): SanitizeResult {
  const removed: string[] = [];
  const out: number[] = [];
  const push = (from: number, to: number) => {
    for (let i = from; i < to; i += 1) out.push(bytes[i]!);
  };
  const skipSubBlocks = (from: number): number => {
    let i = from;
    while (i < bytes.length && bytes[i] !== 0) i += 1 + (bytes[i] ?? 0);
    // 0 终止块本身也要跳过；越界说明块链断了
    return Math.min(i + 1, bytes.length);
  };

  const flags = bytes[10] ?? 0;
  let cursor = 13;
  if (flags & 0x80) cursor += 3 * 2 ** ((flags & 0x07) + 1); // 全局颜色表
  if (cursor > bytes.length) throw new Error('GIF 全局颜色表超出文件长度');
  push(0, cursor);

  while (cursor < bytes.length) {
    const introducer = bytes[cursor]!;
    if (introducer === 0x3b) {
      push(cursor, bytes.length);
      break;
    }
    if (introducer === 0x21) {
      const label = bytes[cursor + 1] ?? 0;
      const end = skipSubBlocks(cursor + 2);
      if (label === 0xfe) removed.push('Comment');
      else push(cursor, end);
      cursor = end;
      continue;
    }
    if (introducer === 0x2c) {
      if (cursor + 10 > bytes.length) throw new Error('GIF 图像描述符被截断');
      // 描述符 = 0x2C + 8 字节几何 + 1 字节标志；标志位决定有无局部颜色表
      const descriptor = bytes[cursor + 9] ?? 0;
      let end = cursor + 10;
      if (descriptor & 0x80) end += 3 * 2 ** ((descriptor & 0x07) + 1);
      end = skipSubBlocks(end + 1); // LZW 最小码长 + 子块链
      push(cursor, end);
      cursor = end;
      continue;
    }
    cursor += 1; // 结构外的杂字节：保留，不猜
  }
  return { bytes: Uint8Array.from(out), removed };
}
