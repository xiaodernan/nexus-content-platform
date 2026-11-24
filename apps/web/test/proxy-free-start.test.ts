/**
 * 无代理启动门：本仓提供的启动脚本必须先删掉所有代理变量，
 * 不能再让从 Clash shell 继承的 HTTP_PROXY 把 localhost 也绑走。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(process.cwd(), 'scripts/start-web-clean.mjs'), 'utf8');

describe('start-web-clean · 无代理启动', () => {
  it('六种代理变量（大小写）全部 delete', () => {
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
      expect(src, `${key} 未清除`).toContain(`'${key}'`);
    }
    expect(src).toMatch(/for \(const key of \[[^\]]+\]\) \{\s*delete env\[key\]/);
  });

  it('显式设置 NO_PROXY 覆盖本机回路', () => {
    expect(src).toContain("env.NO_PROXY = 'localhost,127.0.0.1,::1'");
  });

  it('dev 与 start 两种模式都在（start 用于压测生产构建）', () => {
    expect(src).toContain("mode = process.argv[2] === 'start' ? 'start' : 'dev'");
    expect(src).toContain("['run', mode, '-w', '@nexus/web']");
  });

  it('package.json 暴露 dev:web:clean 与 start:web:clean', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['dev:web:clean']).toContain('start-web-clean.mjs dev');
    expect(pkg.scripts['start:web:clean']).toContain('start-web-clean.mjs start');
  });
});
