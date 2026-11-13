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
// §FE-CENSUS: globals.css 零引用门面类一毙一利（FE-6 死类清扫记账此门日后防回潮，tools/ci/facade-census.mjs）
const census = spawnSync(process.execPath, ['tools/ci/facade-census.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
if (census.status !== 0) {
  console.error('fe-gates: verify:census failed — globals.css 有零引用的门面类（详见上方列表）');
  process.exit(1);
}
console.log(`fe-gates: ${files.length} visual-style suites`);
/**
 * §GATE-2b：用 `vitest.fe.config.ts` 而不是根配置。
 *
 * 根配置的 `fileParallelism: false` 是给「共用同一个 Postgres 的集成测试」设的，
 * 而这 96 套判据一个都不碰库（只 readFileSync 读 CSS/源码做正则）。
 * 让它们跟着串行的代价是可量的：串行 161.66s 里 tests 只占 8.66s，
 * 其余全是 collect/prepare/transform 的排队。派生一份配置，让两种测试各按自己的约束跑。
 *
 * 仍然显式传文件列表：如果那份配置的 `include` 哪天写错，这里会因为"传了 96 个文件
 * 却 filter 出 0 个"而红，而不是安静地跑 0 套、报绿。
 */
const result = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.fe.config.ts', '--reporter=dot', ...files],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);
process.exit(result.status ?? 1);
