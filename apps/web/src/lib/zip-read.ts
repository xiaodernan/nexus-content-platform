/**
 * §105（CODE IMPORT 走 ZIP）与 §144（导出的包要能被另一个实例读回来）要的 ZIP **读端**。
 *
 * 与 `zip.ts`（写端）分家的理由：写端只用 store，不需要 `node:zlib`；把读端塞进同一个文件
 * 会让"打包"这条路径背上解压依赖。两边各自最小，中间靠格式对接——写端的输出由读端与
 * 第三方的 unzip 共同作证，任何一边格式跑偏都会红。
 *
 * 读的是**别人给的字节**，所以分两遍走：
 * 1. **预检**只读中央目录里声明的元数据（名字、路径、方式、旗标、三条体积上限、压缩比、
 *    重名、条目数）——一个字节的数据都不碰，更不分配解压缓冲。炸弹在这一遍就该被挡下。
 * 2. **取出**才按声明去读本地头、解压、比对声明体积与 CRC。
 * 合成一遍的话，"累计解压超限"这一条永远轮不到说话：第一条目就会先在自己的"声明与实际不符"上红，
 * 那条红是真的，但它把总量这一格挡在了身后（测试表里就是这么露出来的）。
 *
 * 判据不过就整包拒绝，不"丢掉坏的那一条继续读"：一份少了几百个文件的导入比一次失败的导入难查得多。
 */

import { inflateRawSync } from 'node:zlib';
import { crc32 } from './zip';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
/** zip64 定位器的签名（EOCD 往前 20 字节那一处）：读到就说明这份包不是我们能兑现的形状 */
const SIG_EOCD64_LOCATOR = 0x07064b50;

/** 通用位标志：第 3 位（数据描述符）不去挡——条目的长度一律以中央目录为准，那一位只是在数据后再留一份副本 */
const FLAG_ENCRYPTED = 0x0001;
/** 第 11 位：文件名按 UTF-8 */
const FLAG_UTF8 = 0x0800;

/** 压缩方式：0 = store，8 = deflate（raw 流）。其余一律拒绝，不做"看起来像就试一下" */
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/**
 * 上限。为什么是这个量级：一份 4000 节点的项目导出实测在几 MB（store 不压缩），
 * §105 要的仓库 ZIP 会大得多——所以这三个数只管"明显不是真包"的那一侧，
 * 真正的配额（每个用户能存多少）在导入那一片接进 credits，不在格式层。
 */
export const ZIP_MAX_ENTRIES = 5000;
export const ZIP_MAX_ENTRY_BYTES = 64 * 1024 * 1024;
export const ZIP_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/** 压缩比：deflate 对纯文本能到 1:10 左右，1:200 只可能是造出来的炸弹 */
export const ZIP_MAX_RATIO = 100;

export interface ZipFileEntry {
  path: string;
  contents: Uint8Array;
  /** 目录项（名字以 `/` 结尾、体积 0）：留着而不是丢掉，因为 GitHub 那份 ZIP 里就有它们 */
  directory: boolean;
}

/** 预检留下的凭据：第二遍不再重新解析中央目录 */
interface Planned extends ZipFileEntry {
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function refuse(what: string): never {
  throw new Error(`ZIP 拒绝：${what}`);
}

/** 与写端 `safePath` 同一套规则，但这里是读端：不能信任名字里没有越界 */
function checkPath(name: string): void {
  if (!name) refuse('名字为空');
  if (name.startsWith('/') || name.includes('\\') || /^[A-Za-z]:/.test(name)) {
    refuse(`路径会写到包外：${name}`);
  }
  const segments = name.split('/');
  if (segments.some((s) => s === '..' || s === '.')) refuse(`路径含 .. 或 .：${name}`);
  // 目录项以 '/' 结尾，最后一段因此为空——那是它作为目录的身份，不是空段
  if (segments.slice(0, -1).some((s) => s === '')) refuse(`路径有空段：${name}`);
  if (name.length > 1024) refuse(`路径过长：${name.length} 字符`);
}

/** 从尾部往前找 EOCD：注释最长 65535，所以窗口只有这么大，且必须"签名 + 头长 + 注释长 == 文件尾" */
function findEocd(bytes: Uint8Array): { at: number; view: DataView } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let at = bytes.length - 22; at >= lowest; at -= 1) {
    if (view.getUint32(at, true) !== SIG_EOCD) continue;
    const commentLength = view.getUint16(at + 20, true);
    if (at + 22 + commentLength === bytes.length) return { at, view };
  }
  return refuse('找不到结尾的中央目录（不是 ZIP，或者被截断了）');
}

/** 解不开就不是我们能兑现的名字：宁可拒收，也不用替换字符凑出一个"查无此文件"的路径 */
function decodeName(raw: Uint8Array, utf8Flag: boolean): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    refuse(
      utf8Flag
        ? '文件名声明了 UTF-8 却解不出 UTF-8'
        : '文件名不是 UTF-8（CP437 那一路不支持）',
    );
  }
}

/** 第一遍：只看声明，一个字节的数据都不碰 */
function plan(bytes: Uint8Array): Planned[] {
  const { at: eocdAt, view } = findEocd(bytes);
  const entriesOnDisk = view.getUint16(eocdAt + 8, true);
  const totalEntries = view.getUint16(eocdAt + 10, true);
  const centralSize = view.getUint32(eocdAt + 12, true);
  const centralOffset = view.getUint32(eocdAt + 16, true);

  if (totalEntries === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    refuse('这是 zip64（32 位字段全是哨兵值），本读端不支持');
  }
  if (eocdAt >= 20 && view.getUint32(eocdAt - 20, true) === SIG_EOCD64_LOCATOR) {
    refuse('这是 zip64，本读端不支持');
  }
  if (entriesOnDisk !== totalEntries) refuse(`本盘 ${entriesOnDisk} 条与总数 ${totalEntries} 条不一致`);
  if (totalEntries > ZIP_MAX_ENTRIES) refuse(`条目数 ${totalEntries} 超过上限 ${ZIP_MAX_ENTRIES}`);
  if (centralOffset + centralSize > eocdAt) refuse('中央目录指的地址不在文件里');

  const seen = new Map<string, number>();
  const planned: Planned[] = [];
  let at = centralOffset;
  let totalDeclared = 0;

  for (let i = 0; i < totalEntries; i += 1) {
    const n = `第 ${i + 1} 条`;
    if (at + 46 > bytes.length) refuse(`${n}的中央目录项越界`);
    if (view.getUint32(at, true) !== SIG_CENTRAL) refuse(`${n}不是中央目录项`);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const uncompressedSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    if (at + 46 + nameLength + extraLength + commentLength > bytes.length) refuse(`${n}的名字/附加区越界`);

    const path = decodeName(bytes.subarray(at + 46, at + 46 + nameLength), (flags & FLAG_UTF8) !== 0);
    const label = `${n}（${path}）`;
    checkPath(path);
    const prior = seen.get(path);
    if (prior !== undefined) refuse(`两份同名条目：第 ${prior + 1} 条与${n}`);
    seen.set(path, i);

    if (flags & FLAG_ENCRYPTED) refuse(`加密条目不支持：${label}`);
    if (method !== METHOD_STORE && method !== METHOD_DEFLATE) {
      refuse(`压缩方式 ${method} 不支持（只认 store 与 deflate）：${label}`);
    }
    const directory = path.endsWith('/');
    if (directory && uncompressedSize !== 0) refuse(`目录项却带字节：${label}`);
    if (uncompressedSize > ZIP_MAX_ENTRY_BYTES) {
      refuse(`单条解压后 ${uncompressedSize} 字节超过上限 ${ZIP_MAX_ENTRY_BYTES}：${label}`);
    }
    if (compressedSize > ZIP_MAX_ENTRY_BYTES) {
      refuse(`单条压缩后 ${compressedSize} 字节超过上限 ${ZIP_MAX_ENTRY_BYTES}：${label}`);
    }
    totalDeclared += uncompressedSize;
    if (totalDeclared > ZIP_MAX_TOTAL_BYTES) {
      refuse(`累计解压 ${totalDeclared} 字节超过上限 ${ZIP_MAX_TOTAL_BYTES}：读到第 ${i + 1} 条`);
    }
    if (method === METHOD_DEFLATE && compressedSize > 0 && uncompressedSize / compressedSize > ZIP_MAX_RATIO) {
      refuse(
        `压缩比 1:${Math.round(uncompressedSize / compressedSize)} 不像真文件（上限 1:${ZIP_MAX_RATIO}）：${label}`,
      );
    }
    planned.push({
      path,
      contents: new Uint8Array(0),
      directory,
      method,
      crc,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (at !== centralOffset + centralSize) refuse('中央目录项的总长与声明的目录大小不符');
  return planned;
}

/** 第二遍：按声明去取字节、解压、验体积与 CRC */
function extract(bytes: Uint8Array, planned: Planned[]): ZipFileEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const entry of planned) {
    const { path, method, compressedSize, uncompressedSize, localOffset } = entry;
    // 数据位置从**本地头**算：它有自己的一段 extra，长度则以中央目录为准
    if (localOffset + 30 > bytes.length) refuse(`本地头指的地址不在文件里：${path}`);
    if (view.getUint32(localOffset, true) !== SIG_LOCAL) refuse(`本地头签名不对：${path}`);
    if (view.getUint16(localOffset + 8, true) !== method) refuse(`本地头与中央目录的压缩方式不一致：${path}`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataAt = localOffset + 30 + localNameLength + localExtraLength;
    if (dataAt + compressedSize > bytes.length) refuse(`数据越界：${path}`);
    const raw = bytes.subarray(dataAt, dataAt + compressedSize);

    if (method === METHOD_STORE) {
      entry.contents = raw.slice();
    } else {
      let inflated: Uint8Array;
      try {
        // 传 Buffer 本身而不是它的 `.buffer`：Node 的 Buffer 共用一个内存池，取 pool 会得到别人的字节
        inflated = new Uint8Array(inflateRawSync(raw, { maxOutputLength: ZIP_MAX_ENTRY_BYTES }));
      } catch (error) {
        refuse(`deflate 解不开（${error instanceof Error ? error.message : String(error)}）：${path}`);
      }
      entry.contents = inflated;
    }
    if (entry.contents.length !== uncompressedSize) {
      refuse(`声明解压 ${uncompressedSize} 字节，实际 ${entry.contents.length} 字节：${path}`);
    }
    if (!entry.directory && crc32(entry.contents) !== entry.crc) refuse(`CRC 对不上：${path}`);
  }
  return planned.map(({ path, contents, directory }) => ({ path, contents, directory }));
}

/**
 * 读一份 ZIP，返回按中央目录顺序排列的条目。
 *
 * 以 `Error` 抛出即"整包不收"，消息里带着是哪一条判据——调用方（导入那一片的路由）
 * 把它翻译成 4xx 给用户看，不需要重新猜原因。
 */
export function readZip(bytes: Uint8Array): ZipFileEntry[] {
  if (bytes.length < 22) refuse('字节太少，连一份空包都装不下');
  return extract(bytes, plan(bytes));
}

/** 按路径取一份条目的文本（导入那一片读 `design/document.json` 用） */
export function readZipText(entries: ZipFileEntry[], path: string): string | null {
  const hit = entries.find((entry) => entry.path === path);
  return hit ? new TextDecoder().decode(hit.contents) : null;
}
