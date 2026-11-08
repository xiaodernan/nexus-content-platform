import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { hashPassword, verifyPassword } from '../src/server/domain/password';

/** 口令哈希（SECURITY.md 认证节；ADR-0002 bcrypt 回落分支）。 */
describe('password（bcryptjs 哈希 / 校验）', () => {
  it('哈希不是明文，且带 bcrypt 版本前缀', async () => {
    const h = await hashPassword('correct horse');
    expect(h).not.toContain('correct horse');
    expect(h.startsWith('$2')).toBe(true);
  });

  it('正确口令通过，错误口令失败', async () => {
    const h = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('Correct horse', h)).toBe(false);
  });

  it('同一口令两次哈希不同（带盐）', async () => {
    const a = await hashPassword('repeat-me');
    const b = await hashPassword('repeat-me');
    expect(a).not.toBe(b);
    expect(await verifyPassword('repeat-me', a)).toBe(true);
    expect(await verifyPassword('repeat-me', b)).toBe(true);
  });

  it('口令过短时拒绝哈希，绝不存弱口令', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/过短/);
  });

  it('stored 为 null 时返回 false（游客无口令 / 邮箱不存在走这条路）', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
  });

  it('能验证历史 bcrypt 串（算法前缀兼容，为换 Argon2id 铺路）', async () => {
    const legacy = await bcrypt.hash('legacy pass', 10);
    expect(legacy.startsWith('$2b$')).toBe(true);
    expect(await verifyPassword('legacy pass', legacy)).toBe(true);
  });
});
