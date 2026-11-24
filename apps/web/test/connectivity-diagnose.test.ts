/**
 * 网络/端口自查门：把反复排查的结论固化——自检必须覆盖应用端口、系统代理、
 * WinHTTP、代理端口监听、env 代理五个维度，避免以后漏查。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(process.cwd(), 'scripts/diagnose-connectivity.mjs'), 'utf8');

describe('diagnose-connectivity · 一键网络自查', () => {
  it('探测两个应用端口 3100 / 3101', () => {
    expect(src).toContain('out.app3100 = await probe(3100)');
    expect(src).toContain('out.app3101 = await probe(3101)');
  });

  it('覆盖系统代理、WinHTTP、代理端口、env 代理四个维度', () => {
    expect(src).toContain('Internet Settings');
    expect(src).toContain('winhttp');
    expect(src).toContain('7890,7891,7897,1080,10809');
    expect(src).toContain('process.env.HTTP_PROXY');
  });

  it('零外网依赖：只探测本机 127.0.0.1', () => {
    expect(src).toContain('127.0.0.1:');
    expect(src).not.toContain('api.aizzz.xyz');
  });
});
