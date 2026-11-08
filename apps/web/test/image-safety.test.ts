import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  imageLimitViolations,
  readImageSize,
  sniffImageMime,
  stripImageMetadata,
} from '@/server/storage/images';

/**
 * 图片净化的字节级单测（§80）。全部用手搓的合法容器，不引图像库、不走网络：
 * 这里守的是"扩展名/Content-Type 不算数、元数据必须掉、坏结构宁可拒"。
 */

const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const u8 = (arr: number[]) => Uint8Array.from(arr);
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const le16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];

function pngChunk(type: string, data: number[]): number[] {
  return [...be32(data.length), ...enc(type), ...data, 0, 0, 0, 0];
}

function makePng(width = 4, height = 3, withMeta = true): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = [...be32(width), ...be32(height), 8, 6, 0, 0, 0];
  const parts = [...sig, ...pngChunk('IHDR', ihdr)];
  if (withMeta) {
    parts.push(...pngChunk('eXIf', enc('ExifII*GPS:37.77,-122.4')), ...pngChunk('tEXt', [...enc('Comment'), 0, ...enc('camera=secret')]));
  }
  parts.push(...pngChunk('IDAT', [1, 2, 3, 4]), ...pngChunk('IEND', []));
  return u8(parts);
}

function jpegSegment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...be16(payload.length + 2), ...payload];
}

function makeJpeg(width = 5, height = 6, withMeta = true): Uint8Array {
  const sof = [8, ...be16(height), ...be16(width), 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1];
  const parts = [0xff, 0xd8];
  parts.push(...jpegSegment(0xe0, [...enc('JFIF\0'), 1, 1, 0, ...be16(1), ...be16(1), 0, 0]));
  if (withMeta) {
    parts.push(...jpegSegment(0xe1, [...enc('Exif\0\0'), ...enc('Make=Canon GPS=37.77')]), ...jpegSegment(0xed, enc('photoshop-data')), ...jpegSegment(0xfe, enc('comment hello')));
  }
  parts.push(...jpegSegment(0xc0, sof));
  parts.push(0xff, 0xd9);
  return u8(parts);
}

function webpChunk(type: string, data: number[]): number[] {
  const pad = data.length % 2;
  return [...enc(type), ...le32(data.length), ...data, ...Array(pad).fill(0)];
}

function makeWebp(width = 2, height = 2, withMeta = true): Uint8Array {
  // 有损 VP8：帧标签 3B + 同步码 9D012A + height(14b) + width(14b)
  const vp8 = [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(height), ...le16(width), 0, 0];
  const body = [...webpChunk('VP8 ', vp8)];
  if (withMeta) {
    body.push(...webpChunk('EXIF', enc('ExifII*')), ...webpChunk('XMP ', enc('<x:xmpmeta>gps</x:xmpmeta>')));
  }
  return u8([...enc('RIFF'), ...le32(4 + body.length), ...enc('WEBP'), ...body]);
}

function makeGif(width = 2, height = 2, withMeta = true): Uint8Array {
  const header = [...enc('GIF89a'), ...le16(width), ...le16(height), 0, 0, 0];
  const parts = [...header];
  if (withMeta) parts.push(0x21, 0xfe, 3, ...enc('abc'), 0x00);
  parts.push(0x3b);
  return u8(parts);
}

describe('sniffImageMime · 只认 magic bytes', () => {
  it('识别四种位图容器', () => {
    expect(sniffImageMime(makePng())).toBe('image/png');
    expect(sniffImageMime(makeJpeg())).toBe('image/jpeg');
    expect(sniffImageMime(makeWebp())).toBe('image/webp');
    expect(sniffImageMime(makeGif())).toBe('image/gif');
  });

  it('非图片（含伪装成 PNG 名的文本/zip）一律 null，绝不猜', () => {
    expect(sniffImageMime(u8(enc('PK\x03\x04 zip 冒充 .png')))).toBeNull();
    expect(sniffImageMime(u8(enc('<svg xmlns="http://www.w3.org/2000/svg"/>')))).toBeNull();
    expect(sniffImageMime(new Uint8Array([]))).toBeNull();
  });
});

describe('readImageSize', () => {
  it('四种容器都能读出宽高', () => {
    expect(readImageSize(makePng(4, 3))).toEqual({ width: 4, height: 3 });
    expect(readImageSize(makeJpeg(5, 6))).toEqual({ width: 5, height: 6 });
    expect(readImageSize(makeWebp(2, 2))).toEqual({ width: 2, height: 2 });
    expect(readImageSize(makeGif(7, 9))).toEqual({ width: 7, height: 9 });
  });

  it('非图片返回 null（调用方据此拒绝）', () => {
    expect(readImageSize(u8(enc('not an image')))).toBeNull();
  });
});

describe('imageLimitViolations', () => {
  it('体积超上限时报原因', () => {
    const issues = imageLimitViolations({ width: 10, height: 10 }, MAX_IMAGE_BYTES + 1);
    expect(issues.some((i) => i.includes('体积'))).toBe(true);
  });
  it('单边超 12000 时报原因', () => {
    const issues = imageLimitViolations({ width: 13000, height: 10 }, 100);
    expect(issues.some((i) => i.includes('单边'))).toBe(true);
  });
  it('尺寸解析失败时拒绝而非照收', () => {
    expect(imageLimitViolations(null, 100)).toContain('无法解析图片尺寸，已拒绝');
  });
  it('合规图返回空数组', () => {
    expect(imageLimitViolations({ width: 100, height: 100 }, 1024)).toEqual([]);
  });
});

describe('stripImageMetadata · 剥离后仍是可读的好图', () => {
  it('PNG：掉 eXIf/tEXt，宽高与 IEND 保留', () => {
    const out = stripImageMetadata(makePng());
    expect(out.removed.sort()).toEqual(['eXIf', 'tEXt']);
    expect(sniffImageMime(out.bytes)).toBe('image/png');
    expect(readImageSize(out.bytes)).toEqual({ width: 4, height: 3 });
    expect(out.bytes.length).toBeLessThan(makePng().length);
  });

  it('JPEG：掉 APP1(EXIF)/APP13(IPTC)/COM，APP0(JFIF) 与 SOF 保留', () => {
    const out = stripImageMetadata(makeJpeg());
    expect(out.removed).toEqual(['APP1(EXIF/XMP)', 'APP13(IPTC)', 'COM']);
    expect(sniffImageMime(out.bytes)).toBe('image/jpeg');
    expect(readImageSize(out.bytes)).toEqual({ width: 5, height: 6 });
  });

  it('WebP：掉 EXIF/XMP 并重写 RIFF 长度', () => {
    const out = stripImageMetadata(makeWebp());
    expect(out.removed.sort()).toEqual(['EXIF', 'XMP']);
    expect(sniffImageMime(out.bytes)).toBe('image/webp');
    expect(readImageSize(out.bytes)).toEqual({ width: 2, height: 2 });
    // RIFF 声明长度必须等于实际内容 - 8
    const declared = new DataView(out.bytes.buffer, out.bytes.byteOffset, out.bytes.byteLength).getUint32(4, true);
    expect(declared).toBe(out.bytes.length - 8);
  });

  it('GIF：掉注释扩展块，头部与结束符保留', () => {
    const out = stripImageMetadata(makeGif());
    expect(out.removed).toEqual(['Comment']);
    expect(sniffImageMime(out.bytes)).toBe('image/gif');
    expect(readImageSize(out.bytes)).toEqual({ width: 2, height: 2 });
  });

  it('无元数据时 removed 为空，字节原样', () => {
    const clean = makePng(3, 3, false);
    const out = stripImageMetadata(clean);
    expect(out.removed).toEqual([]);
    expect(Array.from(out.bytes)).toEqual(Array.from(clean));
  });

  it('截断的 PNG（缺 IEND）直接抛错，让上传被拒而不是存坏图', () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const ihdr = [...be32(2), ...be32(2), 8, 6, 0, 0, 0];
    const broken = u8([...sig, ...pngChunk('IHDR', ihdr)]); // 没有 IDAT/IEND
    expect(() => stripImageMetadata(broken)).toThrow(/IEND/);
  });
});
