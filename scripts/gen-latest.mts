#!/usr/bin/env node
/**
 * `docs/showcase/latest.json` 生成器——把本仓库的真值压缩成一个固定 schema 的 JSON 快照，
 * 给 `xiaodernan.github.io` 的 sync-latest 工作流用（同步到 `assets/nexus-content/latest.json`，
 * 让展示页的「NEXUS Content Platform」卡片实时刷新）。
 *
 * 只用可复现的真数据——从 `git`、目录数、自检产物取；
 * 绝不编造：任何一个计数读不出来就写 '—'，不给假数字（沿用 docs/showcase/nexus.html 生成器同款纪律）。
 *
 * 产物写到 `docs/showcase/latest.json`——被 commit 在 main，
 * 由 `xiaodernan.github.io` 仓库的 sync-nexus-content.yml 每周 cron fetch 到它自己的 `assets/` 里。
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'docs', 'showcase');
mkdirSync(OUT_DIR, { recursive: true });

const sh = (args: string[]) => {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return null; }
};

const countFiles = (dir: string, suffix = '') => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => (suffix ? e.name.endsWith(suffix) : e.isFile())).length;
  } catch { return null; }
};
const countDirs = (dir: string) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch { return null; }
};
const countRecursive = (dir: string, match: (name: string) => boolean) => {
  try {
    const walk = (d: string, acc: string[]) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (e.isFile() && match(e.name)) acc.push(p);
      }
      return acc;
    };
    return walk(dir, []).length;
  } catch { return null; }
};

// Which ref the fact pack describes. Defaults to HEAD (whatever the caller checked out), but
// NEXUS_FACT_REF lets a caller pin it.
// 2026-11-22 并轨后：main 与 master 已经是同一条历史（master 的全部成果已并入 main，
// 并轨提交 00bde67 + 后续并轨），不再是「两条互不相干的历史」。当初那段「main 陈旧、
// master 活跃」的说明只作历史记录保留——今天的默认仍是 HEAD。
// A sync script that happened to run on `main` used to publish main's numbers as "latest".
const REQUESTED_REF = (process.env.NEXUS_FACT_REF ?? 'HEAD').trim() || 'HEAD';
// 钉的 ref 必须真的解得开。2026-11-22 并轨后本地只剩 main 一条线（master 只存在于远端），
// 钉 `master` 会让 git rev-parse 失败 → head 空串、commits null，个人主页那几个数字就成空的。
// 静默降级是假数据的一种形态，所以这里：解不开就回退 HEAD，并如实打一行警告。
const FACT_REF = sh(['rev-parse', '--verify', '--quiet', REQUESTED_REF]) === null ? 'HEAD' : REQUESTED_REF;
if (FACT_REF !== REQUESTED_REF) {
  console.warn(`[gen-latest] 钉的 ref「${REQUESTED_REF}」在本机解不开（本地没有这条线）→ 回退到 HEAD`);
}
const commits = sh(['rev-list', '--count', FACT_REF]);
const headFull = sh(['rev-parse', FACT_REF]) ?? '';
const headShort = headFull.slice(0, 7);
const firstCommitDate = sh(['log', '--max-parents=0', '--format=%cs', '-1', FACT_REF]) ?? null;
// 分支名必须读真值：写死 'main' 会让个人主页把 master 的 head 标成 main。
// 指定了 FACT_REF 时就用它（去掉 origin/ 前缀），否则问 HEAD 现在挂在哪个分支上。
const branchName = FACT_REF === 'HEAD'
  ? (sh(['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'master')
  : FACT_REF.replace(/^refs\/heads\//, '').replace(/^origin\//, '');

const data = {
  schema_version: 'nexus-content.latest.v1',
  generated_at: new Date().toISOString(),
  branch: branchName,
  head: headShort,
  total_commits: commits === null ? null : Number(commits),
  first_commit_at: firstCommitDate,
  adrs: countFiles(join(ROOT, 'docs', 'adr'), '.md'),
  contracts: countFiles(join(ROOT, 'contracts'), '.schema.json'),
  services: countDirs(join(ROOT, 'services')),
  packages: countDirs(join(ROOT, 'packages')),
  apps: countDirs(join(ROOT, 'apps')),
  test_files: countRecursive(join(ROOT, 'apps'), (n: string) => n.endsWith('.test.ts') || n.endsWith('.test.tsx')),
  feature_surface: [
    'studio',
    'design-model',
    'ai-agents',
    'redis-completion-cache',
    'world-module',
    'constellation',
    'chronicle',
    'codex-reader',
    'ephemeris',
    'ship-log',
    'about-nexus',
    'user-guide-zh-en',
    'spring-cloud-microservices',
    'eureka-registry',
    'gateway-lb',
    'live-provider-cache',
    'cost-ledger',
    'evidence-census',
    'public-reading-i18n',
    'api-message-i18n',
    'play-surface-i18n',
    'canon-echoes',
  ],
  live_demo: null, // 不装部署：live demo 需要部署后的 URL。目前只在声明的事实基础上工作。
  headline: 'NEXUS Content Platform - AI Universe Studio: describe, design, build, enter.',
};

writeFileSync(join(OUT_DIR, 'latest.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`written docs/showcase/latest.json — commits=${data.total_commits}, adrs=${data.adrs}, contracts=${data.contracts}, services=${data.services}, packages=${data.packages}, apps=${data.apps}, test_files=${data.test_files}`);
