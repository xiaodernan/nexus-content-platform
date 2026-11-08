import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extractVisualDna } from '../src/server/domain/visualDna';

/**
 * §30 参考图 → Visual DNA 的**畸形输入**守卫。
 *
 * visualDna 读的是别人上传的字节，本模块的契约是"遇到不支持的输入一律如实返回 reason，
 * 不猜、不降级成假数据"（§159）。调色板 PNG（colorType 3）有一条越界路径：像素里的
 * 索引可以超过 PLTE 实际色数，读出来是 `undefined`，会一路 NaN 进亮度/主色统计，
 * 于是 extractVisualDna 交回一份 ok:true 但全是 NaN 的"DNA"——那正好是 §159 禁的假数据。
 *
 * 这一条与 `visual-dna.test.ts`（合法 PNG 全链路）互补：那里证明"正常图测得准"，
 * 这里证明"畸形图被拒、且守卫不误伤合法图"。
 */

// 与 visual-dna.test.ts 同款 chunk：visualDna 的读端不校验 CRC，所以占位即可
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), Buffer.from(data), Buffer.alloc(4)]);
}

/** 一张 colorType 3 的灰度调色板 PNG；indices 是那唯一一行的像素索引序列，plteEntries 是 PLTE 色数 */
function palettePng(indices: number[], plteEntries: number): Uint8Array {
  const width = indices.length;
  const height = 1;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // colorType 3 = palette
  const plte = Buffer.alloc(plteEntries * 3);
  for (let i = 0; i < plteEntries; i += 1) {
    plte[i * 3] = (i * 10) & 0xff;
    plte[i * 3 + 1] = (i * 20) & 0xff;
    plte[i * 3 + 2] = (i * 30) & 0xff;
  }
  // colorType 3：每像素 1 字节（索引）
  const raw = Buffer.alloc(height * (1 + width));
  raw[0] = 0; // filter None
  for (let x = 0; x < width; x += 1) raw[1 + x] = indices[x]!;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('PLTE', plte),
      chunk('IDAT', new Uint8Array(deflateSync(raw))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

describe('visualDna：畸形调色板输入如实拒绝', () => {
  it('调色板索引越界 → 拒绝，不把 undefined 当像素（§159 不降级成假数据）', () => {
    // PLTE 只有 1 色，但像素用了索引 5：越界。守卫缺位时 r/g/b=undefined → NaN 一路进统计，
    // extractVisualDna 会 ok:true 交回一份全是 NaN 的"DNA"——那是假的，必须在这里红。
    const res = extractVisualDna(palettePng([0, 5], 1));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('调色板索引');
  });

  it('索引都在 PLTE 范围内 → 正常提取（守卫不误伤合法图）', () => {
    const res = extractVisualDna(palettePng([0, 1], 2));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.stats.samples).toBe(2);
      expect(Number.isFinite(res.stats.meanLuminance)).toBe(true);
    }
  });

  it('小 IHDR + 大 IDAT 的解压炸弹 → 拒绝，不把内存打爆', () => {
    // IHDR 只声明 1x1（RGBA 的 expected = 1*(1*4+1) = 5 字节），但 IDAT 解压出来 1MB。
    // 没有 maxOutputLength 时 inflateSync 会先解出整块 1MB 才轮到 raw.length<expected 检查——
    // 攻击者用几十 KB 的压缩包就能把它吹到 GB 级（上游只卡了"压缩体积"与"声明像素数"，
    // 声明 1x1 两者都过）。所以必须给 inflate 一个解压上限。
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 6; // 8bit RGBA
    const bomb = deflateSync(Buffer.alloc(1024 * 1024)); // 1MB 全 0，压缩后仅约 1KB
    const bytes = new Uint8Array(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', new Uint8Array(bomb)),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    );
    const res = extractVisualDna(bytes);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('IDAT 解压失败');
  });
});
