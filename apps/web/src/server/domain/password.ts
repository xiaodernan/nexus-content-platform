import bcrypt from 'bcryptjs';

/**
 * 口令哈希（SECURITY.md「认证与授权」：Argon2id，回落 bcrypt）。
 *
 * 这里走 bcrypt 回落分支：bcryptjs 是纯 JS，Windows 上不需要 node-gyp 编译，
 * 而 Argon2id 的纯 JS/wasm 方案在本机要么带原生二进制要么体积巨大。
 * 关键点是把算法收在这一个文件后面（§64 provider 可替换）：将来接上 Argon2id
 * 只替换 hashPassword/verifyPassword 两个函数，调用方与会话层不动。
 * 换算法时旧的 bcrypt 串仍需能验证——用哈希前缀（$2a/$2b）分派，见 verifyPassword。
 * 决策记录见 docs/adr/0002-password-hashing-and-csrf.md。
 */

// 10 rounds：单次约 60-100ms，交互式登录可接受，离线爆破成本足够高。
const COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) throw new Error('口令过短，无法哈希');
  return bcrypt.hash(plain, COST);
}

/**
 * 恒定形状的错误口令校验：无论用户是否存在都跑一次哈希比较，
 * 避免「邮箱存在与否」的时序侧信道（登录接口用假哈希兜底）。
 */
export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // 没有真实哈希时也要花同样的时间，让 timing 不泄露「这个邮箱没注册」
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, stored);
}

// 一个固定 bcrypt 串，只为让「用户不存在」分支也消耗一次 compare 的时间。
const DUMMY_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO7ZBpP1nJpI1x0uUuVc7rLzVcV4Qe3Zm';
