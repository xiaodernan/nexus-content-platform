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

const commits = sh(['rev-list', '--count', 'HEAD']);
const headFull = sh(['rev-parse', 'HEAD']) ?? '';
const headShort = headFull.slice(0, 7);
const firstCommitDate = sh(['log', '--max-parents=0', '--format=%cs', '-1']) ?? null;

const data = {
  schema_version: 'nexus-content.latest.v1',
  generated_at: new Date().toISOString(),
  branch: 'main',
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
  ],
  live_demo: null, // 不装部署：live demo 需要部署后的 URL。目前只在声明的事实基础上工作。
  headline: 'NEXUS Content Platform - AI Universe Studio: describe, design, build, enter.',
};

writeFileSync(join(OUT_DIR, 'latest.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`written docs/showcase/latest.json — commits=${data.total_commits}, adrs=${data.adrs}, contracts=${data.contracts}, services=${data.services}, packages=${data.packages}, apps=${data.apps}, test_files=${data.test_files}`);
