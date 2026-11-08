import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { crc32, textEntry, zipStore } from '@/lib/zip';
import { readZip, readZipText, ZIP_MAX_ENTRIES } from '@/lib/zip-read';

/**
 * ZIP 读端的单测：不打库、不起服务。
 *
 * 两份"造包"的写法各管一半：
 * - `zipStore`（本仓写端）出的包要能被读回来 → 证明格式两端对得上；
 * - `buildZip`（这个文件里手写的，独立于写端）用来造**坏包与 deflate 包** →
 *   证明读端不是只认自家写端那种最规整的输出，也证明红是判据红了，不是构造器崩了。
 */

interface RawFile {
  name: Uint8Array;
  data: Uint8Array;
  method?: number;
  flags?: number;
  /** 覆盖中央目录里的声明值（CRC / 压缩前后体积 / 本地头地址），用来造自相矛盾的包 */
  crc?: number;
  comp?: number;
  uncomp?: number;
  localAt?: number;
}

function name(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function file(path: string, contents: string): RawFile {
  const data = new TextEncoder().encode(contents);
  return { name: name(path), data, method: 0, crc: crc32(data), comp: data.length, uncomp: data.length };
}

/** 手写一份 ZIP：与 `zip.ts` 没有共用一行代码，字段全由参数说话 */
function buildZip(files: RawFile[], opts: { comment?: string; declaredCount?: number } = {}): Uint8Array {
  const localBlobs: Uint8Array[] = [];
  let cursor = 0;
  const offsets: number[] = [];
  for (const f of files) {
    const method = f.method ?? 0;
    const head = new Uint8Array(30 + f.name.length);
    const v = new DataView(head.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, f.flags ?? 0x800, true);
    v.setUint16(8, method, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, (0 << 9) | (1 << 5) | 1, true);
    const data = f.data;
    v.setUint32(14, f.crc ?? crc32(data), true);
    v.setUint32(18, f.comp ?? data.length, true);
    v.setUint32(22, f.uncomp ?? data.length, true);
    v.setUint16(26, f.name.length, true);
    v.setUint16(28, 0, true);
    head.set(f.name, 30);
    offsets.push(cursor);
    localBlobs.push(head, data);
    cursor += head.length + data.length;
  }
  const localBytes = new Uint8Array(cursor);
  let at = 0;
  for (const blob of localBlobs) {
    localBytes.set(blob, at);
    at += blob.length;
  }

  const centralLen = files.reduce((sum, f) => sum + 46 + f.name.length, 0);
  const central = new Uint8Array(centralLen);
  const cv = new DataView(central.buffer);
  let cat = 0;
  files.forEach((f, i) => {
    cv.setUint32(cat, 0x02014b50, true);
    cv.setUint16(cat + 4, 20, true);
    cv.setUint16(cat + 6, 20, true);
    cv.setUint16(cat + 8, f.flags ?? 0x800, true);
    cv.setUint16(cat + 10, f.method ?? 0, true);
    cv.setUint16(cat + 12, 0, true);
    cv.setUint16(cat + 14, (0 << 9) | (1 << 5) | 1, true);
    cv.setUint32(cat + 16, f.crc ?? crc32(f.data), true);
    cv.setUint32(cat + 20, f.comp ?? f.data.length, true);
    cv.setUint32(cat + 24, f.uncomp ?? f.data.length, true);
    cv.setUint16(cat + 28, f.name.length, true);
    cv.setUint16(cat + 30, 0, true);
    cv.setUint16(cat + 32, 0, true);
    cv.setUint16(cat + 34, 0, true);
    cv.setUint16(cat + 36, 0, true);
    cv.setUint32(cat + 38, 0, true);
    cv.setUint32(cat + 42, f.localAt ?? offsets[i]!, true);
    central.set(f.name, cat + 46);
    cat += 46 + f.name.length;
  });

  const comment = new TextEncoder().encode(opts.comment ?? '');
  const eocd = new Uint8Array(22 + comment.length);
  const ev = new DataView(eocd.buffer);
  const count = opts.declaredCount ?? files.length;
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, count, true);
  ev.setUint16(10, count, true);
  ev.setUint32(12, centralLen, true);
  ev.setUint32(16, localBytes.length, true);
  ev.setUint16(20, comment.length, true);
  eocd.set(comment, 22);

  const out = new Uint8Array(localBytes.length + central.length + eocd.length);
  out.set(localBytes, 0);
  out.set(central, localBytes.length);
  out.set(eocd, localBytes.length + central.length);
  return out;
}

function deflateFile(path: string, contents: string): RawFile {
  const data = new TextEncoder().encode(contents);
  const packed = new Uint8Array(deflateRawSync(data));
  return { name: name(path), data: packed, method: 8, crc: crc32(data), comp: packed.length, uncomp: data.length };
}

/** 拒收判据的表：每一行都点名是哪一条把这份包挡在门外 */
const REFUSALS: { label: string; bytes: Uint8Array; message: string }[] = [
  {
    label: '绝对路径',
    bytes: buildZip([{ ...file('/etc/passwd', 'x') }]),
    message: '路径会写到包外：/etc/passwd',
  },
  {
    label: '反斜杠（Windows 绝对路径的写法）',
    bytes: buildZip([{ ...file('C:\\Users\\x', 'x') }]),
    message: '路径会写到包外：C:\\Users\\x',
  },
  {
    label: '上级目录',
    bytes: buildZip([{ ...file('a/../../b', 'x') }]),
    message: '路径含 .. 或 .：a/../../b',
  },
  {
    label: '空段',
    bytes: buildZip([{ ...file('a//b', 'x') }]),
    message: '路径有空段：a//b',
  },
  {
    label: '空名字',
    bytes: buildZip([{ ...file('', 'x') }]),
    message: '名字为空',
  },
  {
    // 1025 字符这个名字其余规则全合规，只有长度这一条能挡它——A14 变异臂的见证
    label: '路径过长',
    bytes: buildZip([{ ...file('a'.repeat(1025), 'x') }]),
    message: '路径过长：1025 字符',
  },
  {
    label: '两份同名',
    bytes: buildZip([file('a.txt', '1'), file('a.txt', '2')]),
    message: '两份同名条目：第 1 条与第 2 条',
  },
  { label: '加密位', bytes: buildZip([{ ...file('a.txt', 'x'), flags: 0x801 }]), message: '加密条目不支持：第 1 条（a.txt）' },
  {
    label: '没置 UTF-8 位、名字又不是 UTF-8',
    bytes: buildZip([{ name: new Uint8Array([0xff, 0xfe]), data: new Uint8Array(0), method: 0, crc: 0, comp: 0, uncomp: 0, flags: 0 }]),
    message: '文件名不是 UTF-8（CP437 那一路不支持）',
  },
  {
    label: '压缩方式 99（AES）',
    bytes: buildZip([{ ...file('a.txt', 'x'), method: 99 }]),
    message: '压缩方式 99 不支持（只认 store 与 deflate）：第 1 条（a.txt）',
  },
  {
    label: '条目数超上限',
    bytes: buildZip(
      Array.from({ length: ZIP_MAX_ENTRIES + 1 }, (_, i) => file(`f${i}.txt`, 'x')),
      { declaredCount: ZIP_MAX_ENTRIES + 1 },
    ),
    message: `条目数 ${ZIP_MAX_ENTRIES + 1} 超过上限 ${ZIP_MAX_ENTRIES}`,
  },
  {
    label: 'zip64 的哨兵值',
    bytes: buildZip([file('a.txt', 'x')], { declaredCount: 0xffff }),
    message: '这是 zip64（32 位字段全是哨兵值），本读端不支持',
  },
  {
    label: '单条声明体积超上限',
    bytes: buildZip([{ ...file('a.txt', 'x'), uncomp: 65 * 1024 * 1024 }]),
    message: '单条解压后 68157440 字节超过上限 67108864：第 1 条（a.txt）',
  },
  {
    label: '累计声明体积超上限',
    bytes: buildZip(
      Array.from({ length: 5 }, (_, i) => ({ ...file(`f${i}.txt`, 'x'), uncomp: 60 * 1024 * 1024 })),
    ),
    message: '累计解压 314572800 字节超过上限 268435456',
  },
  {
    label: '压缩比不像真文件',
    bytes: buildZip([{ ...deflateFile('a.txt', 'x'), uncomp: 60 * 1024 * 1024 }]),
    message: '压缩比 1:',
  },
  {
    label: '本地头地址越界',
    bytes: buildZip([{ ...file('a.txt', 'x'), localAt: 999999 }]),
    message: '本地头指的地址不在文件里：a.txt',
  },
  {
    label: '本地头签名不是 PK\\x03\\x04',
    bytes: (() => {
      const bytes = buildZip([file('a.txt', 'x')]);
      new DataView(bytes.buffer).setUint32(0, 0x11223344, true);
      return bytes;
    })(),
    message: '本地头签名不对：a.txt',
  },
  {
    label: 'CRC 对不上',
    bytes: buildZip([{ ...file('a.txt', 'hello'), crc: 0xdeadbeef }]),
    message: 'CRC 对不上：a.txt',
  },
  {
    label: '声明体积与实际不符',
    bytes: buildZip([{ ...file('a.txt', 'hello'), uncomp: 2 }]),
    message: '声明解压 2 字节，实际 5 字节：a.txt',
  },
  {
    label: '目录项却带字节',
    bytes: buildZip([{ ...file('docs/', 'x') }]),
    message: '目录项却带字节：第 1 条（docs/）',
  },
  {
    label: '中央目录条数与盘上不一致',
    bytes: (() => {
      const bytes = buildZip([file('a.txt', 'x')]);
      const at = bytes.length - 22;
      const v = new DataView(bytes.buffer);
      v.setUint16(at + 8, 3, true);
      return bytes;
    })(),
    message: '本盘 3 条与总数 1 条不一致',
  },
  {
    label: '被截断的包',
    bytes: buildZip([file('a.txt', 'x')]).slice(0, 20),
    message: '字节太少，连一份空包都装不下',
  },
  {
    label: '根本不是 ZIP',
    bytes: new Uint8Array(64).fill(0x41),
    message: '找不到结尾的中央目录（不是 ZIP，或者被截断了）',
  },
];

describe('§105/§144 ZIP 读端：先挡再读', () => {
  it('自家写端出的包能读回来，三样内容与路径逐字节一致', () => {
    const bytes = zipStore([textEntry('README.txt', '说明'), textEntry('code/index.html', '<p>hi</p>')]);
    const entries = readZip(bytes);
    expect(entries.map((e) => e.path)).toEqual(['README.txt', 'code/index.html']);
    expect(new TextDecoder().decode(entries[1]!.contents)).toBe('<p>hi</p>');
    expect(entries.every((e) => !e.directory)).toBe(true);
  });

  it('deflate 那一路读得开（读端不只认 store）', () => {
    const text = '把同一段话重复很多遍，deflate 才有得压。'.repeat(60);
    const entries = readZip(buildZip([deflateFile('big.txt', text), file('small.txt', 'ok')]));
    expect(entries).toHaveLength(2);
    expect(readZipText(entries, 'big.txt')).toBe(text);
    expect(readZipText(entries, 'small.txt')).toBe('ok');
  });

  it('目录项留着并标成目录，不当成"少了一个文件"', () => {
    const dirEntry: RawFile = { name: name('docs/'), data: new Uint8Array(0), method: 0, crc: 0, comp: 0, uncomp: 0 };
    const entries = readZip(buildZip([dirEntry, file('docs/a.md', '# hi')]));
    expect(entries.map((e) => [e.path, e.directory])).toEqual([
      ['docs/', true],
      ['docs/a.md', false],
    ]);
  });

  it('带注释的包照样读（EOCD 的注释长度要参与定位）', () => {
    const entries = readZip(buildZip([file('a.txt', 'x')], { comment: 'hello' }));
    expect(entries.map((e) => e.path)).toEqual(['a.txt']);
  });

  it('条目顺序跟中央目录走，不去排序', () => {
    const entries = readZip(buildZip([file('z.txt', '1'), file('a.txt', '2')]));
    expect(entries.map((e) => e.path)).toEqual(['z.txt', 'a.txt']);
  });

  it('readZipText 找不到那条时给 null，不抛', () => {
    const entries = readZip(buildZip([file('a.txt', 'x')]));
    expect(readZipText(entries, 'missing.json')).toBeNull();
  });

  it.each(REFUSALS)('$label → 整包拒收，报的是这一条判据', ({ bytes, message }) => {
    expect(() => readZip(bytes)).toThrow(message);
  });

  it('拒收发生在读之前：坏包不会留下半个结果', () => {
    const bomb = buildZip(Array.from({ length: 5 }, (_, i) => ({ ...file('f' + i + '.txt', 'x'), uncomp: 60 * 1024 * 1024 })));
    expect(() => readZip(bomb)).toThrow('累计解压');
    // 同一份包去掉坏的那一条就能整份读通——证明红的是判据，不是构造器
    expect(readZip(buildZip([file('a.txt', 'x'), file('b.txt', 'y')]))).toHaveLength(2);
  });
});
