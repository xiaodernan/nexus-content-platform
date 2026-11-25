/**
 * 行为模拟脚本的输出门：默认按 UTC 日期单独留档，不再覆盖历史证据。
 * 之前写死 2026-11-16.json，低内存下重跑读数变差时会抹掉旧的成功证据——真实踩过。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(process.cwd(), 'scripts/simulate-user-behavior.mts'), 'utf8');

describe('simulate-user-behavior · 输出不覆盖历史', () => {
  it('默认文件名带当天 UTC 日期（动态），不再写死 2026-11-16', () => {
    expect(src).toContain('simulated-user-behavior-${new Date().toISOString().slice(0, 10)}.json');
    expect(src).not.toContain("'simulated-user-behavior-2026-11-16.json'");
  });

  it('保留 --out 显式指定路径的向后兼容', () => {
    expect(src).toContain("process.argv.indexOf('--out')");
    expect(src).toMatch(/provided\s*\n?\s*\? join\(process\.cwd\(\), provided\)/);
  });
});
