#!/usr/bin/env node
/**
 * scripts/sync-showcase.mts — one command to keep the showcase live.
 *
 * Runs entirely in this repo. Steps:
 * 1. Regenerate docs/showcase/latest.json from git truth (gen-latest.mts)
 * 2. Clone https://github.com/xiaodernan/xiaodernan.github.io.git into .scratch/showcase-site/site (or reuse existing)
 * 3. Copy latest.json into assets/nexus-content/latest.json
 * 4. If anything moved, commit + push master
 *
 * Design rules (read AGENTS.md line 116): the local clone is owned by this repo's script; we can push only
 * when user has granted credentials (git push from this local machine, not from CI here).
 */

import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SHOWSPATIAL = join(ROOT, '.scratch', 'showcase-site', 'site');

const sh = (cmd: string, opts: { cwd?: string; env?: Record<string, string> } = {}): string =>
  execSync(cmd, {
    encoding: 'utf8',
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

function run(): void {
  // 1. regenerate latest.json
  // 事实包钉在 `master` 上——这曾经是必须的（那时 main 与 master 是两条互不相干的历史，
  // main 那条停在 E211、还没有 margins 模块，页面会把旧分支当"最新"）。
  // 2026-11-22 并轨后两条线合并成一条，钉 master 与钉 HEAD 等价；保留这行是为了
  // 万一将来又分叉时，事实包仍从活跃那条线出（注释不许撒谎，所以这里如实说明现状）。
  sh('npx tsx scripts/gen-latest.mts', { cwd: ROOT, env: { NEXUS_FACT_REF: 'master' } });

  // 2. clone or reuse existing clone
  if (!existsSync(SHOWSPATIAL)) {
    mkdirSync(join(ROOT, '.scratch', 'showcase-site'), { recursive: true });
    sh(`git clone --quiet https://github.com/xiaodernan/xiaodernan.github.io.git ${JSON.stringify(SHOWSPATIAL)}`, { cwd: ROOT });
  } else {
    sh('git fetch --quiet origin', { cwd: SHOWSPATIAL });
    sh('git checkout --quiet master && git reset --hard origin/master', { cwd: SHOWSPATIAL });
  }

  // 3. ensure target dir
  const destDir = join(SHOWSPATIAL, 'assets', 'nexus-content');
  mkdirSync(destDir, { recursive: true });
  // Windows 上 cpSync 覆盖已存在文件会走 unlink，本机偶发 errno 0（AV/索引器持句柄）。
  // 直接截断写：不 unlink、不换 inode，目标文件被谁短暂打开都不影响。
  writeFileSync(join(destDir, 'latest.json'), readFileSync(join(ROOT, 'docs', 'showcase', 'latest.json')));

  // 4. commit if changed
  const status = sh('git status --porcelain', { cwd: SHOWSPATIAL });
  if (!status) {
    console.log('showcase already up-to-date: no commit, no push');
    return;
  }
  sh('git add -A', { cwd: SHOWSPATIAL });
  execSync('git -c user.name="showcase-sync-bot" -c user.email="showcase-sync-bot@users.noreply.github.com" commit -m "sync(nexus-content): refresh latest.json from nexus-content-platform"', { cwd: SHOWSPATIAL, stdio: 'inherit' });
  execSync('git push origin master', { cwd: SHOWSPATIAL, stdio: 'inherit' });
  console.log('showcase synced - master pushed to xiaodernan.github.io');
}

run();
