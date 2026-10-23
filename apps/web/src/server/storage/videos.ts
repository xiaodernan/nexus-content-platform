/**
 * 视频字节的嗅探与元数据判定（§80 / 已知技术债第 2 条的另一半）。
 *
 * 位图那条链（`images.ts`）按 magic bytes 判格式、剥元数据再入库。视频走到同一个路口，
 * 但有两处根本不同，所以另起一个文件，不往 `images.ts` 里塞 `if (mime === 'video/mp4')` 的分支：
 *
 * 1. **没有"纯字节剥离"这条路**。PNG 的 tEXt、JPEG 的 APP1 都是可枚举的段，摘掉即可；
 *    mp4 / webm 的元数据长在容器结构里（mp4 的 `moov/udta/meta/ilst`、webm 的 `Tags` 元素），
 *    摘它要重写索引与偏移，字节级手术做不了。所以视频的元数据不在摄入时剥，
 *    而在**渲染时就不写进去**，摄入时按容器结构复核一遍（`videoMetadataViolations`）。
 * 2. **视频字节只有一个来源**：本服务自己跑的 ffmpeg（§40-42 的 DEMO 渲染）。
 *    用户上传通道对视频保持关闭——收下一颗来路不明的 mp4，等于收下它的 GPS 与设备指纹，
 *    而我们没有能力在不重编码的前提下把它摘掉。
 *
 * 于是这个文件提供三道判定，全部按 magic bytes，不看扩展名与 Content-Type：
 * - `sniffVideoMime`：这是什么容器。mp4 认第 4 字节起的 `ftyp` 盒（ISO BMFF 规定它
 *   必须是第一个盒）；webm 认 EBML 魔数**再加** EBML 头里的 DocType——单认魔数会把
 *   mkv 也当成 webm 收进来，那是给字节改姓；
 * - `videoMetadataViolations`：字节里还挂着元数据吗。挂了就拒；
 * - `MAX_VIDEO_BYTES`：视频比位图贵得多，上限单独定，不与图片共用 10MB 那条。
 *
 * **"干净"按容器分别定义，定义的依据是"本服务的渲染链能做到多干净"**（拿做不到的标准
 * 当门禁，只会把自家渲染产物拒之门外）：
 * - mp4：渲染命令带 `-map_metadata -1 -map_chapters -1 -bitexact` 后，ffmpeg 连
 *   `©too = Lavf…` 品牌标签都不写。但 muxer 无论如何都会留一个**空的** ilst 盒
 *   （实测，8 字节无子项）——那是容器形状，不是内容。所以 mp4 的标准是
 *   **ilst 里不许住东西**，顶层也不许有 meta/udta/uuid 盒；
 * - webm：matroska muxer 无论如何都会写一个 `Tags` 元素，里面至少有 ENCODER 与
 *   DURATION（实测，`-bitexact` 只能把版本号抹掉、去不掉标签本身）。所以 webm 的
 *   标准是**Tags 里只许有这两个 muxer 自己的名字**——出现第三个（TITLE / GPS /
 *   评论…）就说明这颗字节不是本服务渲染链的产物。
 */
export type VideoMime = 'video/mp4' | 'video/webm';

export const VIDEO_MIME_EXTENSIONS: Record<VideoMime, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

/**
 * 一条 12 秒 720p30 的成片只有几 MB；128MB 是"渲染参数被人为放大"与"正常渲染"之间的界。
 * 与 `MAX_IMAGE_BYTES` 分开定：拿图片的上限量视频，正常渲染会被拒；拿视频的上限量图片，
 * 上传通道就多了一个塞 128MB 假图的口子。
 */
export const MAX_VIDEO_BYTES = 128 * 1024 * 1024;

/**
 * webm 的 Tags 里允许出现的标签名：ffmpeg 的 matroska muxer 自己写的那两个。
 * 白名单而不是黑名单——黑名单要列遍世上所有元数据名，白名单只认得出自家 muxer 的笔记。
 */
export const BENIGN_WEBM_TAGS = new Set(['ENCODER', 'DURATION']);

/** mp4 顶层盒里承载元数据的三种。`meta`（内含 ilst）是主的一处；`udta` 与 `uuid` 也能挂 */
const MP4_TOPLEVEL_METADATA_BOXES = new Set(['meta', 'udta', 'uuid']);
/** 盒里可能套盒、且元数据可能藏在里面的容器。深度钉死：顶层 → moov → udta → meta 就够 */
const MP4_CONTAINER_BOXES = new Set(['moov', 'udta', 'meta']);
const MP4_MAX_DEPTH = 3;

const FTYP_BOX = [0x66, 0x74, 0x79, 0x70]; // 'ftyp'
const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const EBML_IDS = {
  header: 0x1a45dfa3,
  docType: 0x4282,
  segment: 0x18538067,
  tags: 0x1254c367,
  tag: 0x7373,
  simpleTag: 0x67c8,
  tagName: 0x45a3,
} as const;

function u8(value: ArrayBufferView | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/** EBML 变长 ID：首字节前导零的个数决定长度，取值**含**标志位（0x1A45DFA3 是四字节 ID） */
function readEbmlId(bytes: Uint8Array, at: number): { id: number; length: number } | null {
  const first = bytes[at];
  if (first === undefined) return null;
  let length = 1;
  let mask = 0x80;
  while (length < 8 && mask > 0 && (first & mask) === 0) {
    length += 1;
    mask >>= 1;
  }
  if (at + length > bytes.length) return null;
  let id = first;
  for (let i = 1; i < length; i += 1) id = id * 256 + (bytes[at + i] ?? 0);
  return { id, length };
}

/** EBML 变长长度：同一套前导零规则，但取值**不含**标志位 */
function readEbmlSize(bytes: Uint8Array, at: number): { value: number; length: number } | null {
  const first = bytes[at];
  if (first === undefined) return null;
  let length = 1;
  let mask = 0x80;
  while (length < 8 && mask > 0 && (first & mask) === 0) {
    length += 1;
    mask >>= 1;
  }
  if (at + length > bytes.length) return null;
  let value = first & (mask - 1);
  for (let i = 1; i < length; i += 1) value = value * 256 + (bytes[at + i] ?? 0);
  return { value, length };
}

/** 读一段 EBML 元素当 UTF-8 文本（标签名、DocType 用） */
function ebmlText(bytes: Uint8Array, from: number, to: number): string {
  let text = '';
  for (let i = from; i < Math.min(to, bytes.length); i += 1) {
    text += String.fromCharCode(bytes[i]!);
  }
  return text;
}

/**
 * EBML 头里的 DocType 字符串（`webm` / `matroska`）。读不出来返回 null——
 * 调用方按"不是受支持的视频"处理，不猜：猜错的代价是把 mkv 存成 .webm。
 */
function ebmlDocType(bytes: Uint8Array): string | null {
  const header = readEbmlId(bytes, 0);
  if (!header || header.id !== EBML_IDS.header) return null;
  const size = readEbmlSize(bytes, header.length);
  if (!size) return null;
  const end = Math.min(bytes.length, header.length + size.length + size.value);
  let cursor = header.length + size.length;
  while (cursor < end) {
    const id = readEbmlId(bytes, cursor);
    if (!id) return null;
    const len = readEbmlSize(bytes, cursor + id.length);
    if (!len) return null;
    const dataStart = cursor + id.length + len.length;
    if (id.id === EBML_IDS.docType) return ebmlText(bytes, dataStart, dataStart + len.value);
    cursor = dataStart + len.value;
  }
  return null;
}

/** 判定真实视频容器；不是受支持的两种之一就返回 null（调用方必须拒绝，不得猜测） */
export function sniffVideoMime(input: ArrayBufferView | Uint8Array): VideoMime | null {
  const bytes = u8(input);
  if (startsWith(bytes, FTYP_BOX, 4)) return 'video/mp4';
  if (startsWith(bytes, EBML_MAGIC) && ebmlDocType(bytes) === 'webm') return 'video/webm';
  return null;
}

/**
 * mp4 盒走一遍：size(4, 大端) + type(4) + data。
 * `size === 1` 是 64 位扩展长度（随后 8 字节），`size === 0` 是"一直到容器尾"。
 *
 * 递归深度钉死在 `MP4_MAX_DEPTH`：元数据住在 `moov > udta > meta > ilst` 这条链上，
 * 而 ffmpeg 默认写的 `©too = Lavf…` 就在第三层——只扫顶层会整颗漏掉。
 * 再往下（trak/stbl/…）只有媒体数据，没有元数据，不必走。
 */
function mp4MetadataBoxes(bytes: Uint8Array): string[] {
  const found: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  /** 返回非 null 表示结构坏了（调用方要把这条说明带出去，不假装走完） */
  const walk = (start: number, end: number, depth: number, path: string): string | null => {
    let cursor = start;
    while (cursor + 8 <= end) {
      const size = view.getUint32(cursor, false);
      const type = String.fromCharCode(bytes[cursor + 4]!, bytes[cursor + 5]!, bytes[cursor + 6]!, bytes[cursor + 7]!);
      let dataStart = cursor + 8;
      let boxEnd: number;
      if (size === 1) {
        if (cursor + 16 > end) return `盒 ${path}${type} 的 64 位长度字段被截断`;
        boxEnd = cursor + 16 + Number(view.getBigUint64(cursor + 8, false));
        dataStart = cursor + 16;
      } else if (size === 0) {
        boxEnd = end;
      } else {
        if (size < 8) return `盒 ${path}${type} 的长度 ${size} 连盒头都装不下`;
        boxEnd = cursor + size;
      }
      if (boxEnd > end) return `盒 ${path}${type} 超出容器长度`;
      // ilst 非空才算挂元数据：ffmpeg 的 bitexact 产物里也有一个空 ilst（无子项），
      // 拿"出现即违规"当标准，自家渲染链的干净成片会被自家门拒在门外
      const hasChildren = boxEnd - dataStart > 0;
      if ((type === 'ilst' && hasChildren) || (depth === 0 && MP4_TOPLEVEL_METADATA_BOXES.has(type))) {
        found.push(`${path}${type}`);
      }
      // meta 是 FullBox：子盒前面还有 4 字节版本/标志
      const childrenAt = dataStart + (type === 'meta' ? 4 : 0);
      if (depth < MP4_MAX_DEPTH && MP4_CONTAINER_BOXES.has(type)) {
        const broken = walk(childrenAt, boxEnd, depth + 1, `${path}${type}/`);
        if (broken) return broken;
      }
      cursor = boxEnd;
    }
    return null;
  };
  const broken = walk(0, bytes.length, 0, '');
  return broken ? [...found, broken] : found;
}

/**
 * webm 走 Segment 的顶层子元素，把 `Tags` 里非白名单的标签名收回来。
 * 只走两层（Tags → Tag → SimpleTag → TagName）：标签名就住在这里，再往下只有值。
 * Segment 的长度字段允许是"未知"（全 1，流式写法的产物）：那时就走到文件尾。
 */
function webmMetadataTags(bytes: Uint8Array): string[] {
  const found: string[] = [];
  const header = readEbmlId(bytes, 0);
  if (!header || header.id !== EBML_IDS.header) return ['EBML 头缺失或损坏'];
  const headerSize = readEbmlSize(bytes, header.length);
  if (!headerSize) return ['EBML 头长度读不出'];
  const segmentAt = header.length + headerSize.length + headerSize.value;
  const segment = readEbmlId(bytes, segmentAt);
  if (!segment || segment.id !== EBML_IDS.segment) return ['Segment 元素缺失或损坏'];
  const segmentSize = readEbmlSize(bytes, segmentAt + segment.length);
  if (!segmentSize) return ['Segment 长度读不出'];
  const bodyStart = segmentAt + segment.length + segmentSize.length;
  const end = Math.min(bytes.length, bodyStart + segmentSize.value);

  const namesInTags = (from: number, to: number): { names: string[]; broken: string | null } => {
    const names: string[] = [];
    let cursor = from;
    while (cursor < to) {
      const id = readEbmlId(bytes, cursor);
      if (!id) return { names, broken: 'Tags 子元素损坏' };
      const size = readEbmlSize(bytes, cursor + id.length);
      if (!size) return { names, broken: 'Tags 子元素长度读不出' };
      const dataStart = cursor + id.length + size.length;
      const elementEnd = dataStart + size.value;
      if (id.id === EBML_IDS.tag || id.id === EBML_IDS.simpleTag) {
        const inner = namesInTags(dataStart, Math.min(elementEnd, bytes.length));
        for (const name of inner.names) if (!names.includes(name)) names.push(name);
        if (inner.broken) return { names, broken: inner.broken };
      } else if (id.id === EBML_IDS.tagName) {
        names.push(ebmlText(bytes, dataStart, elementEnd));
      }
      cursor = elementEnd;
    }
    return { names, broken: null };
  };

  let cursor = bodyStart;
  while (cursor < end) {
    const id = readEbmlId(bytes, cursor);
    if (!id) return [...found, 'Segment 子元素损坏'];
    const size = readEbmlSize(bytes, cursor + id.length);
    if (!size) return [...found, 'Segment 子元素长度读不出'];
    const dataStart = cursor + id.length + size.length;
    if (id.id === EBML_IDS.tags) {
      const { names, broken } = namesInTags(dataStart, Math.min(dataStart + size.value, bytes.length));
      if (broken) return [...found, broken];
      for (const name of names) {
        if (!BENIGN_WEBM_TAGS.has(name)) found.push(`Tags/${name}`);
      }
    }
    cursor = dataStart + size.value;
  }
  return found;
}

/**
 * 字节里还挂着元数据吗。空数组 = 干净。
 *
 * 解析不出结构时返回一条说明而不是空数组：把"读不懂"当成"干净"放行，
 * 这道门就从来没关上过——而被它放过去的恰是结构最可疑的那一颗。
 */
export function videoMetadataViolations(input: ArrayBufferView | Uint8Array): string[] {
  const bytes = u8(input);
  const mime = sniffVideoMime(bytes);
  if (mime === 'video/mp4') return mp4MetadataBoxes(bytes);
  if (mime === 'video/webm') return webmMetadataTags(bytes);
  return [];
}