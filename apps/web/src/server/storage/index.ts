import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { signS3Request, type S3Config } from './s3';

/**
 * 对象存储驱动（§64/§101）。
 *
 * 业务代码只认 `StorageDriver`。默认 S3 兼容实现（MinIO / R2 / S3）；
 * 本机未起 MinIO 时由 `local` 驱动兜底，让资产链路在 M2 就能端到端跑通，
 * 而不是「等基础设施就位才能验证」。两者的 key 语义完全一致，互换不掉数据。
 */
export interface StorageDriver {
  readonly name: 's3' | 'local';
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string | null } | null>;
  delete(key: string): Promise<void>;
  /** 工厂：本驱动的实现名，写进日志与健康检查 */
  readonly kind: string;
}

/** 本地文件系统驱动：仅用于开发兜底，路径逃逸必须被拒（§80 文件上传安全） */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;
  readonly kind = 'local';

  constructor(private readonly root: string) {}

  /** 把 object key 落成绝对路径，并确保没有 `../` 逃出 root */
  private pathOf(key: string): string {
    const root = resolve(this.root);
    const full = resolve(root, key);
    if (full !== root && !full.startsWith(root + sep)) {
      throw new Error(`非法的存储 key（试图逃出存储根目录）：${key}`);
    }
    return full;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    // contentType 存成旁路文件，读回时保持一致（本地驱动没有元数据头）
    await writeFile(`${path}.content-type`, contentType, 'utf8');
  }

  async get(key: string): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
    const path = this.pathOf(key);
    try {
      await stat(path);
    } catch {
      return null;
    }
    const bytes = await readFile(path);
    let contentType: string | null;
    try {
      contentType = (await readFile(`${path}.content-type`, 'utf8')).trim();
    } catch {
      contentType = null;
    }
    return { bytes, contentType };
  }

  async delete(key: string): Promise<void> {
    const path = this.pathOf(key);
    await rm(path, { force: true });
    await rm(`${path}.content-type`, { force: true });
  }
}

/** S3 兼容驱动（MinIO / R2 / S3） */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;
  readonly kind = 's3';

  constructor(
    private readonly config: S3Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const signed = signS3Request(this.config, { method: 'PUT', key, body: bytes, contentType }, new Date());
    const res = await this.fetchImpl(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body: Buffer.from(bytes),
    });
    if (!res.ok) throw new Error(`S3 PUT 失败：${res.status} ${await safeText(res)}`);
  }

  async get(key: string): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
    const signed = signS3Request(this.config, { method: 'GET', key }, new Date());
    const res = await this.fetchImpl(signed.url, { method: 'GET', headers: signed.headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET 失败：${res.status} ${await safeText(res)}`);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get('content-type'),
    };
  }

  async delete(key: string): Promise<void> {
    const signed = signS3Request(this.config, { method: 'DELETE', key }, new Date());
    const res = await this.fetchImpl(signed.url, { method: 'DELETE', headers: signed.headers });
    // S3 的 DELETE 是幂等的：404 说明目标已不存在，视为成功
    if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE 失败：${res.status} ${await safeText(res)}`);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '<无响应体>';
  }
}

export interface StorageEnv {
  NEXUS_S3_ENDPOINT?: string;
  NEXUS_S3_REGION?: string;
  NEXUS_S3_BUCKET?: string;
  NEXUS_S3_ACCESS_KEY_ID?: string;
  NEXUS_S3_SECRET_ACCESS_KEY?: string;
  NEXUS_S3_FORCE_PATH_STYLE?: string;
  NEXUS_STORAGE_LOCAL_DIR?: string;
}

export interface ResolvedStorage {
  driver: StorageDriver;
  /** 之所以选它：写进日志，避免「以为在用 S3」实际落盘 */
  reason: string;
  configured: boolean;
}

/**
 * 从环境变量解析驱动。凭据齐全 → S3；否则 → 本地目录兜底。
 * 这里**不抛错**：M2 的资产链路不该因为少一个凭据就整站不可用。
 */
export function resolveStorage(env: StorageEnv, fetchImpl: typeof fetch = fetch): ResolvedStorage {
  const endpoint = env.NEXUS_S3_ENDPOINT?.trim();
  const accessKeyId = env.NEXUS_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.NEXUS_S3_SECRET_ACCESS_KEY?.trim();
  const bucket = env.NEXUS_S3_BUCKET?.trim() || 'nexus-assets';

  if (endpoint && accessKeyId && secretAccessKey) {
    return {
      configured: true,
      reason: `S3 兼容存储 ${endpoint} / bucket ${bucket}`,
      driver: new S3StorageDriver(
        {
          endpoint,
          bucket,
          accessKeyId,
          secretAccessKey,
          region: env.NEXUS_S3_REGION?.trim() || 'us-east-1',
          // MinIO 默认 path-style，显式默认开着
          forcePathStyle: env.NEXUS_S3_FORCE_PATH_STYLE !== 'false',
        },
        fetchImpl,
      ),
    };
  }

  const dir = env.NEXUS_STORAGE_LOCAL_DIR?.trim() || join(process.cwd(), '.nexus-storage');
  return {
    configured: false,
    reason: `未配置 NEXUS_S3_* 凭据，回落到本地目录 ${dir}（开发兜底，非生产形态）`,
    driver: new LocalStorageDriver(dir),
  };
}
