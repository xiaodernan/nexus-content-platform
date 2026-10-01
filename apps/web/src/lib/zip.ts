/**
 * §144 导出要用的 ZIP 写入器：**只写 store（不压缩）**。
 *
 * 为什么自己写而不是装一个 `jszip`：
 * - Node 没有内置 zip，而这里只需要"把若干文件打成一份能解压的字节流"这一件事；
 *   本仓有手写小协议的先例（S3 客户端、PNG 合成），多一个依赖就要多一份供应链要审。
 * - **store 就够**：包里主要是代码与 JSON，体积不是瓶颈；而 deflate（zlib 的 raw 流）要额外处理
 *   "压缩后反而更大"与比特序，收益不抵复杂度。真要压，改 `method` 那一格即可，格式其余部分不动。
 *
 * 为什么**时间戳固定成 1980-01-01 00:00**：同一份内容每次导出的字节必须一模一样，
 * 否则没法断言"这份 zip 里有什么"——而"导出的是不是当时的设计"正是这件事要证的。
 *
 * 格式（PKZIP APPNOTE 的最小子集）：每个文件一段"本地文件头 + 数据"，末尾接中央目录与 EOCD。
 * 不做 zip64（包里不会有 >4GB 的单文件），不做目录项（目录由文件路径里的 `/` 表达）。
 */

/** 本地文件头 / 中央目录项 / EOCD 三处签名 */
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/** DOS 时间戳：1980-01-01 00:00（见文件头注释——固定它才能让导出可复现） */
const DOS_TIME = 0x0000;
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980 年 1 月 1 日

/** 通用位标志里的第 11 位：文件名按 UTF-8 读，不是 CP437 */
const FLAG_UTF8 = 0x0800;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** 包内路径。用 `/` 分隔；不以 `/` 开头（以 `/` 开头是 zip slip 的输入源，见下面的检查） */
  path: string;
  contents: Uint8Array;
}

/** 只在这个字符集里挑扩展名，避免把路径里的怪字符带进文件名 */
function safePath(path: string): string {
  // zip slip：绝对路径、`..`、盘符都会让解压方把文件写到包外面去
  if (path.startsWith('/') || path.includes('\\') || /^[A-Za-z]:/.test(path)) {
    throw new Error(`导出路径不合法（会写出包外）：${path}`);
  }
  const segments = path.split('/');
  if (segments.some((s) => s === '..' || s === '')) throw new Error(`导出路径不合法（空段或 ..）：${path}`);
  return path;
}

/**
 * 打一份 store zip。
 *
 * 文件名统一按 UTF-8 记（置 `FLAG_UTF8`）：包里的路径带中文，不置这一位的话
 * 解压方按 CP437 读会得到一堆乱码名字。
 */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const prepared = entries.map((entry) => {
    const name = encoder.encode(safePath(entry.path));
    return { name, bytes: entry.contents, crc: crc32(entry.contents), offset: 0 };
  });

  const localSize = prepared.reduce((sum, e) => sum + 30 + e.name.length + e.bytes.length, 0);
  const centralSize = prepared.reduce((sum, e) => sum + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;

  for (const entry of prepared) {
    entry.offset = at;
    view.setUint32(at, SIG_LOCAL, true);
    view.setUint16(at + 4, 20, true); // version needed
    view.setUint16(at + 6, FLAG_UTF8, true);
    view.setUint16(at + 8, 0, true); // method: store
    view.setUint16(at + 10, DOS_TIME, true);
    view.setUint16(at + 12, DOS_DATE, true);
    view.setUint32(at + 14, entry.crc, true);
    view.setUint32(at + 18, entry.bytes.length, true);
    view.setUint32(at + 22, entry.bytes.length, true);
    view.setUint16(at + 26, entry.name.length, true);
    view.setUint16(at + 28, 0, true); // extra field length
    at += 30;
    out.set(entry.name, at);
    at += entry.name.length;
    out.set(entry.bytes, at);
    at += entry.bytes.length;
  }

  const centralAt = at;
  for (const entry of prepared) {
    view.setUint32(at, SIG_CENTRAL, true);
    view.setUint16(at + 4, 20, true); // version made by
    view.setUint16(at + 6, 20, true);
    view.setUint16(at + 8, FLAG_UTF8, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, DOS_TIME, true);
    view.setUint16(at + 14, DOS_DATE, true);
    view.setUint32(at + 16, entry.crc, true);
    view.setUint32(at + 20, entry.bytes.length, true);
    view.setUint32(at + 24, entry.bytes.length, true);
    view.setUint16(at + 28, entry.name.length, true);
    view.setUint16(at + 30, 0, true); // extra
    view.setUint16(at + 32, 0, true); // comment
    view.setUint16(at + 34, 0, true); // disk number start
    view.setUint16(at + 36, 0, true); // internal attrs
    view.setUint32(at + 38, 0, true); // external attrs
    view.setUint32(at + 42, entry.offset, true);
    at += 46;
    out.set(entry.name, at);
    at += entry.name.length;
  }

  view.setUint32(at, SIG_EOCD, true);
  view.setUint16(at + 4, 0, true); // disk number
  view.setUint16(at + 6, 0, true); // disk with central directory
  view.setUint16(at + 8, prepared.length, true);
  view.setUint16(at + 10, prepared.length, true);
  view.setUint32(at + 12, at - centralAt, true);
  view.setUint32(at + 16, centralAt, true);
  view.setUint16(at + 20, 0, true); // comment length
  return out;
}

/** 把字符串当 UTF-8 塞进包里（代码与 JSON 都是文本） */
export function textEntry(path: string, contents: string): ZipEntry {
  return { path, contents: new TextEncoder().encode(contents) };
}
