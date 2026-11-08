import { createHmac, createHash } from 'node:crypto';

/**
 * 极简 S3 兼容客户端（§64/§101 文件存储）。
 *
 * 为什么不用 AWS SDK：本项目的 provider 纪律是「可替换」（§76-79），而这里只需要
 * 三个动词（PUT / GET / DELETE）对象。手写 SigV4 让依赖面保持在零，也让任何
 * S3 兼容实现（MinIO / R2 / S3 / OSS 兼容层）都能直接接进来。
 * 完整 SDK 的能力（multipart、分页 listing、传输加速）在本项目里没有用武之地。
 */

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO 用 path-style；AWS S3 走 virtual-host 时置 false */
  forcePathStyle: boolean;
}

export interface ObjectBody {
  bytes: Uint8Array;
  contentType: string;
}

const UNRESERVED = /[^A-Za-z0-9\-._~]/g;

/**
 * SigV4 的 URI 编码：空格必须是 %20（encodeURIComponent 给的是 +）。
 *
 * 必须先编码成 UTF-8 字节再逐字节转义。直接对字符串逐字符转义会把中文
 * 打成 `%542B` 这种码元，而不是 S3 要求的 `%E5%90%AB`——签名与服务端
 * 各自算一遍 canonical URI，不一致就是 403。
 */
function encodeRfc3986(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('latin1')
    .replace(UNRESERVED, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

/** 规范化 URI：逐段编码，保留分隔符 */
function canonicalUri(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => encodeRfc3986(seg))
    .join('/');
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** S3 的签名时间戳：20240101T000000Z */
function amzDate(now: Date): { stamp: string; date: string } {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { stamp, date: stamp.slice(0, 8) };
}

export interface S3Request {
  method: 'PUT' | 'GET' | 'HEAD' | 'DELETE';
  /** 不含 bucket 的对象键，如 `projects/<id>/cover.png` */
  key?: string;
  body?: Uint8Array;
  contentType?: string;
  /** 追加查询串（用于 list 等），会被一并签名 */
  query?: Record<string, string>;
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * 生成一个已签名的请求。纯函数：同一 (config, request, now) 必得同一结果。
 * 这样签名逻辑可被单测完全覆盖，不需要真的起一个对象存储。
 */
export function signS3Request(config: S3Config, request: S3Request, now: Date): SignedRequest {
  const { stamp, date } = amzDate(now);
  const host = new URL(config.endpoint).host;
  const basePath = new URL(config.endpoint).pathname.replace(/\/$/, '');
  const objectPath = request.key
    ? `${basePath}/${encodeRfc3986(config.bucket)}/${canonicalUri(request.key)}`
    : `${basePath}/${encodeRfc3986(config.bucket)}`;
  const queryEntries = Object.entries(request.query ?? {})
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalQuery = queryEntries.map(([k, v]) => `${k}=${v}`).join('&');
  const url = `${new URL(config.endpoint).protocol}//${host}${objectPath}${canonicalQuery ? `?${canonicalQuery}` : ''}`;

  const payload = request.body ?? new Uint8Array(0);
  const payloadHash = sha256Hex(payload);

  // 需要签名的头：host + x-amz-* + content-type（有则签），全部小写并按字典序
  const signed: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': stamp,
  };
  if (request.contentType) signed['content-type'] = request.contentType;

  const signedNames = Object.keys(signed).sort();
  const canonicalHeaders = signedNames.map((n) => `${n}:${signed[n]}\n`).join('');
  const signedHeaderList = signedNames.join(';');

  const canonicalRequest = [
    request.method,
    objectPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderList,
    payloadHash,
  ].join('\n');

  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${config.secretAccessKey}`, date);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hex(hmac(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaderList}, Signature=${signature}`;

  const headers: Record<string, string> = {
    ...signed,
    authorization,
  };
  return { url, headers };
}

/** 把响应头里的 headers 规范成小写 key，便于大小写无关读取 */
export function normalizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}
