#!/usr/bin/env node
/**
 * §FE-103 `verify:fe-gates`——FE 门面矩阵的统一入口。
 * 显式 play 遍历 apps/web/test/*-visual-style.test.ts 后交给 vitest；
 * 避免 Windows 通配符（shell 不展开 `*.test.ts`）导致 vitest 找不到文件（见 ADR-0257/ FE-103）。
 */
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function collect() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/-visual-style\.test\.ts$/.test(name)) out.push(p);
    }
  };
  walk(join(root, 'apps/web/test'));
  return out;
}

const files = collect();
if (files.length === 0) {
  console.error('fe-gates: no *-visual-style.test.ts found under apps/web/test');
  process.exit(1);
}
console.log(`fe-gates: ${files.length} visual-style suites`);
const result = spawnSync('npx', ['vitest', 'run', '--reporter=dot', ...files], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
