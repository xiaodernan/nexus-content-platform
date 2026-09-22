import { resolveStorage, type ResolvedStorage, type StorageDriver, type StorageEnv } from './index';

/**
 * 存储驱动的进程级入口（§64）。
 *
 * 为什么单独一个文件：驱动选择只在进程启动时算一次，且必须能被日志与
 * 健康检查读出"当前到底在用 S3 还是本地目录"。把它藏在 domain 里，
 * 就会出现"以为在生产其实落在 /tmp"这类事故（§84 观测）。
 */

let cached: ResolvedStorage | undefined;

function readEnv(): StorageEnv {
  return {
    NEXUS_S3_ENDPOINT: process.env.NEXUS_S3_ENDPOINT,
    NEXUS_S3_REGION: process.env.NEXUS_S3_REGION,
    NEXUS_S3_BUCKET: process.env.NEXUS_S3_BUCKET,
    NEXUS_S3_ACCESS_KEY_ID: process.env.NEXUS_S3_ACCESS_KEY_ID,
    NEXUS_S3_SECRET_ACCESS_KEY: process.env.NEXUS_S3_SECRET_ACCESS_KEY,
    NEXUS_S3_FORCE_PATH_STYLE: process.env.NEXUS_S3_FORCE_PATH_STYLE,
    NEXUS_STORAGE_LOCAL_DIR: process.env.NEXUS_STORAGE_LOCAL_DIR,
  };
}

export function storageInfo(): ResolvedStorage {
  if (!cached) {
    cached = resolveStorage(readEnv());
    console.info(
      `[storage] 驱动=${cached.driver.name} configured=${String(cached.configured)} —— ${cached.reason}`,
    );
  }
  return cached;
}

export function getStorage(): StorageDriver {
  return storageInfo().driver;
}

/** 测试用：换一组环境变量后重新解析（不碰生产代码路径） */
export function resetStorageForTests(env?: StorageEnv): void {
  cached = env ? resolveStorage(env) : undefined;
}
