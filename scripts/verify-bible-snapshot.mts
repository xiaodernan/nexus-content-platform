#!/usr/bin/env node
/**
 * 校验 `apps/web/src/world-bible/generated.ts` 与 `docs/world-bible/` 是否一致。
 * 做法：把生成结果字节写入临时缓冲，与磁盘文件字节比对；不一致即红。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT = join(ROOT, 'apps', 'web', 'src', 'world-bible', 'generated.ts');

const before = readFileSync(OUT, 'utf8');
execFileSync('node', [join(ROOT, 'scripts', 'gen-bible-snapshot.mts')], { stdio: 'pipe' });
const after = readFileSync(OUT, 'utf8');
if (before !== after) {
  console.error('✗ generated.ts 与 docs/world-bible/ 不一致：重新运行 `npm run gen:bible-snapshot` 后再提交');
  process.exit(1);
}
console.log('✓ bible snapshot 与 docs/world-bible/ 一致');
