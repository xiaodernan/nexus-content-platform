import { afterAll, describe, expect, it } from 'vitest';
import { crc32, textEntry, zipStore, type ZipEntry } from '@/lib/zip';

/**
 * §144 导出的 zip 写入器。
 *
 * **主证据不在这个文件里。** 最强的一手是用真的解压器验：把 `zipStore()` 的字节写成临时文件，
 * 交给 Python 的 `zipfile` 去列、去解、去跑 `testzip()`（它校验 CRC）。那一手已经做过一次，
 * 结果记在 ROADMAP「§144 导出」那一段（4 个条目、中文路径按 UTF-8 往返正确、PNG 字节逐个对得上、
 * 日期固定 1980-01-01）。它**没有写进这条用例**，因为 vitest 里 spawn 外部进程会被沙箱挡住
 * （`spawnSync python EBUSY`，`unzip` 同样）——把一条依赖外部解释器的用例留在门禁里，
 * 会让门禁在别人机器上以与环境有关的原因变红。
 *
 * 所以这里守的是两样：
 * 1. 写死的两个 CRC 测试向量（查表或初始/收尾搞反会立刻红）；
 * 2. **一个按格式从头解析的读端**（不是复用写端的任何函数），它按 EOCD → 中央目录 → 本地头
 *    这个顺序把字节重新走一遍。自己写的读端不如真解压器权威，但它能抓住"偏移量记错一处"
 *    这类两端不会同时犯的错——而纯结构断言（只看签名）抓不住。
 */

interface ReadEntry {
  path: string;
  bytes: Uint8Array;
  crc: number;
  method: number;
  flags: number;
}

/** 与写端无关的读端：只认 PKZIP 的字节布局 */
function readZip(bytes: Uint8Array): ReadEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();

  // EOCD 在末尾；注释长度可能为 0，这里直接按 22 字节定位
  const eocd = bytes.length - 22;
  if (view.getUint32(eocd, true) !== 0x06054b50) throw new Error('结尾不是 EOCD');
  const total = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralAt = view.getUint32(eocd + 16, true);
  let at = centralAt;

  const out: ReadEntry[] = [];
  for (let i = 0; i < total; i += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error(`第 ${i} 个中央目录项签名不对`);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));

    // 回到本地头，独立地再确认一次名字与长度对得上
    if (view.getUint32(localAt, true) !== 0x04034b50) throw new Error(`${name} 的本地头签名不对`);
    const localNameLen = view.getUint16(localAt + 26, true);
    const localExtraLen = view.getUint16(localAt + 28, true);
    if (localNameLen !== nameLen) throw new Error(`${name} 的本地头与中央目录记的名字长度不一致`);
    const localName = decoder.decode(bytes.subarray(localAt + 30, localAt + 30 + localNameLen));
    if (localName !== name) throw new Error(`${name} 的本地头名字与中央目录不一致`);
    const dataAt = localAt + 30 + localNameLen + localExtraLen;
    const payload = bytes.subarray(dataAt, dataAt + compressed);

    out.push({ path: name, bytes: payload, crc, method, flags });
    at += 46 + nameLen + extraLen + commentLen;
  }
  // 走完中央目录正好落在 EOCD 上：EOCD 里记的目录长度与目录项逐项累加出来的长度必须一致，
  // 差一个字节就说明某一项的 extra/comment 长度记错了（那种错会让解压方把下一项读飞）
  if (at !== centralAt + centralSize) {
    throw new Error(`中央目录长度对不上：EOCD 记 ${centralSize}，逐项累加 ${at - centralAt}`);
  }
  return out;
}

const encoder = new TextEncoder();

describe('crc32', () => {
  it('两个公开的测试向量（对不上就说明查表或初始/收尾搞反了）', () => {
    expect(crc32(encoder.encode('hello'))).toBe(0x3610a686);
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
  });

  it('空输入是 0，不是"表里没查到的 NaN"', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('zipStore：按格式重新解析一遍', () => {
  const entries: ZipEntry[] = [
    textEntry('design/document.json', JSON.stringify({ name: '一份设计', pages: [] }, null, 2)),
    textEntry('code/styles/tokens.css', ':root { --nx-color-primary: #7c5cff; }'),
    textEntry('代码/页面一.tsx', 'export default function P() { return <div />; }'),
    { path: 'assets/logo.png', contents: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  ];

  it('中央目录与本地头指向同一份字节，且 CRC 与内容对得上', () => {
    const read = readZip(zipStore(entries));
    expect(read.map((e) => e.path)).toEqual(entries.map((e) => e.path));
    for (const entry of read) {
      expect(entry.method, `${entry.path} 应当是 store（0）`).toBe(0);
      // UTF-8 位：不置这一位，带中文的路径在解压方会读成乱码
      expect(entry.flags & 0x0800, `${entry.path} 没置 UTF-8 标志`).toBe(0x0800);
      expect(entry.crc, `${entry.path} 的 CRC`).toBe(crc32(entry.bytes));
    }
  });

  it('解出来的内容与写进去的逐字节相同（含二进制那一项）', () => {
    const read = readZip(zipStore(entries));
    for (const [index, entry] of entries.entries()) {
      expect(Buffer.from(read[index]!.bytes).equals(Buffer.from(entry.contents)), entry.path).toBe(true);
    }
    expect(Array.from(read[3]!.bytes)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('EOCD 里的条目数与中央目录里的一致（多一个少一个都会让解压方误判）', () => {
    const bytes = zipStore(entries);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = bytes.length - 22;
    expect(view.getUint16(eocd + 8, true)).toBe(entries.length);
    expect(view.getUint16(eocd + 10, true)).toBe(entries.length);
  });

  it('同一份内容两次导出的字节一模一样（时间戳固定，导出才可复现）', () => {
    const a = zipStore(entries);
    const b = zipStore(entries);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('空包也解析得出 0 条，不抛错', () => {
    expect(readZip(zipStore([]))).toEqual([]);
  });
});

describe('不安全的路径当场炸', () => {
  afterAll(() => {
    // 与上面那些用例分开：这一组故意传坏路径
  });

  it('zip slip 的四种输入都不会被打进包里', () => {
    for (const bad of ['/etc/passwd', 'C:\\evil.txt', 'a\\b.txt', '../outside.txt', 'a//b.txt']) {
      expect(() => zipStore([textEntry(bad, 'x')]), bad).toThrow();
    }
  });
});
