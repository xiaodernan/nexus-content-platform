/**
 * Cookie 名字常量。
 *
 * 单独成文件、且零 Node 依赖，因为 Edge middleware 与 Node route handler 都要引用它。
 * 若 middleware 直接从 session.ts 拿 SESSION_COOKIE，就会把 node:crypto / postgres 驱动
 * 一并拉进 Edge 包并报错（native module not found）。
 */
export const SESSION_COOKIE = 'nexus_session';
export const CSRF_COOKIE = 'nexus_csrf';
