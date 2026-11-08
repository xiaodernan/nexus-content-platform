import { afterEach, describe, expect, it } from 'vitest';
import { csrfHeaders, csrfToken } from '../src/lib/csrf';

/** 在 node 环境里临时挂一个最小的 document.cookie，测完还原。 */
function withDocument(cookie: string, run: () => void): void {
  const g = globalThis as { document?: { cookie: string } };
  const had = 'document' in g;
  const prev = g.document;
  g.document = { cookie };
  try {
    run();
  } finally {
    if (had) g.document = prev;
    else delete g.document;
  }
}

afterEach(() => {
  const g = globalThis as { document?: unknown };
  delete g.document;
});

describe('客户端 CSRF 双提交工具', () => {
  it('有 nexus_csrf cookie 时读回十六进制 token', () => {
    withDocument('theme=dark; nexus_csrf=abc123def; x=1', () => {
      expect(csrfToken()).toBe('abc123def');
      expect(csrfHeaders()).toEqual({ 'x-csrf-token': 'abc123def' });
    });
  });

  it('cookie 里没有 token 时返回空串（服务端会据此拒绝）', () => {
    withDocument('theme=dark', () => {
      expect(csrfToken()).toBe('');
      expect(csrfHeaders()).toEqual({ 'x-csrf-token': '' });
    });
  });

  it('SSR 阶段没有 document 不抛错，只给空头', () => {
    expect(typeof document).toBe('undefined');
    expect(csrfToken()).toBe('');
    expect(csrfHeaders()).toEqual({ 'x-csrf-token': '' });
  });
});
