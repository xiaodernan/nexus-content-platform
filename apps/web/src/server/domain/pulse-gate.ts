/**
 * §PULSE-0 · 公开管理台的口令闸（ADR-0276）。
 * 单独一个模块是为了让 page 与两条 route 共享常量而不互相 import 对方。
 * 口令硬编码是项目主人的显式决定（用户原话：「密码输入 123 就能进，所有用户都知道密码也都能进管理员页面」），
 * 属于产品设计的一部分，不是缺省值、也不是推断。
 */
export const PULSE_PASSWORD = '123';
export const PULSE_COOKIE = 'nexus_pulse';
