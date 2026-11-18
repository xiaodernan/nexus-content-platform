#!/usr/bin/env node
/**
 * §FE-103 `verify:fe-gates`——FE 门面矩阵的统一入口。
 * 显式遍历 apps/web/test 下的 `-visual-style.test.ts`（视觉门面）与 `-behavior.test.ts`（行为契约门）后交给 vitest；
 * 避免 Windows 通配符（shell 不展开 `*.test.ts`）导致 vitest 找不到文件（见 ADR-0257/ FE-103）。
 * 行为契约门同属「只读源码做断言、零渲染、零库」的源码契约族，必须与视觉门面同一把闸一起跑——
 * 否则它会安静地落在 fe-gates 之外，永远没人跑。
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
      else if (/-(visual-style|behavior)\.test\.ts$/.test(name)) out.push(p);
    }
  };
  walk(join(root, 'apps/web/test'));
  return out;
}

const files = collect();
if (files.length === 0) {
  console.error('fe-gates: no *-visual-style.test.ts / *-behavior.test.ts found under apps/web/test');
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
console.log(`fe-gates: ${files.length} gate suites`);
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
// 直接用 process.execPath 跑 vitest.mjs（不经 cmd shell）：
// 全部绝对路径拼成的命令行超过 cmd.exe 的 8191 字符上限，shell:true 会直接炸「命令太长」。
// CreateProcess 上限是 32767，绰绰有余。
const vitestEntry = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(
  process.execPath,
  [vitestEntry, 'run', '--config', 'vitest.fe.config.ts', '--reporter=dot', ...files],
  {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  },
);
process.exit(result.status ?? 1);
