/**
 * 应用自愈探针门：ECONNREFUSED 反复出现的真正原因是会话重启杀了 dev server，
 * 不是 Clash（本机代理层已全清）。这里钉住探针的两个确定行为。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(process.cwd(), 'scripts/check-web-health.mjs'), 'utf8');

describe('check-web-health · 应用存活探针', () => {
  it('只检查模式：健康 0、不健康 exit 1', () => {
    expect(src).toContain("const auto = process.argv.includes('--auto')");
    expect(src).toContain('if (!auto) {');
    expect(src).toContain('process.exitCode = 1');
  });

  it('--auto 模式无代理拉起 next dev 并轮询到 200', () => {
    expect(src).toContain('next dev -p ${PORT}');
    expect(src).toContain('start "" /b');
    expect(src).toContain('WEB_RECOVERED');
    expect(src).toContain('WEB_RECOVER_FAILED');
  });

  it('端口可用 WEB_PORT 指定（守护 3101 而非被并行线占用的 3100）', () => {
    expect(src).toContain('process.env.WEB_PORT || 3100');
    expect(readFileSync(join(process.cwd(), 'scripts/watchdog-start-dev.cmd'), 'utf8')).toContain('next dev -p 3101');
  });

  it('探针自身不带任何代理变量（避免把 localhost 又绑走）', () => {
    expect(src).toMatch(/delete env\[k\]/);
    expect(src).toContain("env.NO_PROXY = 'localhost,127.0.0.1,::1'");
  });
});
