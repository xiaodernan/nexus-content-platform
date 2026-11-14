/**
 * §AILIVE-6 · 真 provider 上线前验收（LIVE 现环节）。
 *
 * 跑法：`npm run live:all -- --confirm-real`
 *
 * 串四件真跑：
 *   1. ai-smoke       — CSRF → session → project → ai/run：capability=real（无 ops）+ ledger succeeded
 *   2. design-edit    — 同 1，但要求真 op=set typography.fontSize=36 + ledger succeeded
 *   3. design-apply   — 真请求生成 patch → PATCH /design → GET 文档 fontSize=36 已落库
 *   4. design-smoke   — 完整 document-based verdict：applyPatch 内存 dry-run → targetFontSize=28
 *
 * 任何一环失败 → 非零退出并指明失败环节；每环都成功 → 0。
 *
 * 这一门的价值：把正常开发环境必须通过的一次真连通检查固定为一口命令——
 * 不是每次都跑（计费），但是**当场查 provider/集成是否正常**的 single button。
 */
import { spawn } from 'node:child_process';

const STEPS: { name: string; script: string; confirm: boolean }[] = [
  { name: '[1/4] live-ai-smoke', script: 'scripts/live-ai-smoke.mts', confirm: true },
  { name: '[2/4] live-design-edit', script: 'scripts/live-design-edit.mts', confirm: true },
  { name: '[3/4] live-design-apply', script: 'scripts/live-design-apply.mts', confirm: true },
  { name: '[4/4] live-design-smoke', script: 'scripts/live-design-smoke.mts', confirm: true },
];

const args = process.argv.slice(2);
if (!args.includes('--confirm-real')) {
  console.error('requires --confirm-real (single bill: this makes real calls during development)');
  process.exit(2);
}

async function runStep(s: { name: string; script: string; confirm: boolean }): Promise<number> {
  return new Promise<number>((resolve) => {
    console.error(`\n${s.name}`);
    const child = spawn(process.execPath, ['--import', 'tsx', s.script, '--confirm-real'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function main() {
  for (const step of STEPS) {
    const code = await runStep(step);
    if (code !== 0) {
      console.error(`${step.name} FAILED (exit ${code})`);
      process.exit(code);
    }
  }
  console.error('\n[live:all] all 4 paths green — provider + CSRF/session + apply + persist confirmed end-to-end');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
