import { describe, expect, it } from 'vitest';
import { signS3Request, type S3Config } from '@/server/storage/s3';
import { LocalStorageDriver, resolveStorage } from '@/server/storage';

/**
 * SigV4 是自研的（§76 provider 可替换，不引 SDK），因此必须用 AWS 官方
 * 测试向量之外的方式把「签名在改代码时会变」这件事钉住：固定时间 + 固定输入
 * → 固定 Authorization。若签名算法漂移，这些断言会立刻炸。
 */
const config: S3Config = {
  endpoint: 'http://localhost:59000',
  region: 'us-east-1',
  bucket: 'nexus-assets',
  accessKeyId: 'nexus_dev_only',
  secretAccessKey: 'nexus_dev_only_secret',
  forcePathStyle: true,
};

const at = new Date('2024-01-01T00:00:00.000Z');

describe('signS3Request', () => {
  it('builds a path-style URL with the bucket in front of the key', () => {
    const { url } = signS3Request(config, { method: 'PUT', key: 'projects/p1/cover.png' }, at);
    expect(url).toBe('http://localhost:59000/nexus-assets/projects/p1/cover.png');
  });

  it('signs host / content-type / x-amz-* with a stable credential scope', () => {
    const { headers } = signS3Request(
      config,
      { method: 'PUT', key: 'a.png', body: new Uint8Array([1, 2, 3]), contentType: 'image/png' },
      at,
    );
    expect(headers['x-amz-date']).toBe('20240101T000000Z');
    expect(headers['content-type']).toBe('image/png');
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=nexus_dev_only\/20240101\/us-east-1\/s3\/aws4_request, /,
    );
    expect(headers.authorization).toMatch(/SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, /);
    expect(headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it('hashes the payload, so two different bodies never share a signature', () => {
    const a = signS3Request(config, { method: 'PUT', key: 'k', body: new Uint8Array([1]) }, at).headers;
    const b = signS3Request(config, { method: 'PUT', key: 'k', body: new Uint8Array([2]) }, at).headers;
    expect(a['x-amz-content-sha256']).not.toBe(b['x-amz-content-sha256']);
    expect(a.authorization).not.toBe(b.authorization);
  });

  it('hashes the empty body to the well-known constant for GET / DELETE', () => {
    const digest = signS3Request(config, { method: 'GET', key: 'k' }, at).headers['x-amz-content-sha256'];
    expect(digest).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('keeps a literal key with slashes unencoded but escapes unsafe characters', () => {
    const { url } = signS3Request(config, { method: 'GET', key: 'projects/p 1/含中文.png' }, at);
    expect(url).toContain('projects/');
    expect(url).not.toContain(' ');
    expect(url).toContain('%20');
    expect(url).toContain('%E5%90%AB');
  });

  it('is deterministic for the same inputs', () => {
    const first = signS3Request(config, { method: 'GET', key: 'same' }, at);
    const second = signS3Request(config, { method: 'GET', key: 'same' }, at);
    expect(first).toEqual(second);
  });

  it('does not leak the secret into any header', () => {
    const { headers } = signS3Request(config, { method: 'PUT', key: 'x', body: new Uint8Array([9]) }, at);
    expect(JSON.stringify(headers)).not.toContain(config.secretAccessKey);
  });
});

describe('resolveStorage', () => {
  it('uses S3 when full credentials are present', () => {
    const resolved = resolveStorage({
      NEXUS_S3_ENDPOINT: 'http://localhost:59000',
      NEXUS_S3_ACCESS_KEY_ID: 'k',
      NEXUS_S3_SECRET_ACCESS_KEY: 's',
    });
    expect(resolved.driver.name).toBe('s3');
    expect(resolved.configured).toBe(true);
  });

  it('falls back to local when credentials are incomplete', () => {
    const resolved = resolveStorage({ NEXUS_S3_ENDPOINT: 'http://localhost:59000' });
    expect(resolved.driver.name).toBe('local');
    expect(resolved.configured).toBe(false);
  });
});

describe('LocalStorageDriver', () => {
  it('round-trips bytes and content type', async () => {
    const dir = `${process.cwd()}/.nexus-storage-test/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const driver = new LocalStorageDriver(dir);
    const key = 'projects/p1/cover.png';
    await driver.put(key, new Uint8Array([1, 2, 3]), 'image/png');
    const got = await driver.get(key);
    expect([...(got?.bytes ?? [])]).toEqual([1, 2, 3]);
    expect(got?.contentType).toBe('image/png');
    await driver.delete(key);
    expect(await driver.get(key)).toBeNull();
  });

  it('refuses a key that tries to escape the storage root', async () => {
    const driver = new LocalStorageDriver(`${process.cwd()}/.nexus-storage-test/escape`);
    await expect(driver.put('../outside.txt', new Uint8Array([1]), 'text/plain')).rejects.toThrow(/逃出存储根目录/);
  });
});
