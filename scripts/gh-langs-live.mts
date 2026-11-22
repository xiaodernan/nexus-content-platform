#!/usr/bin/env node
/**
 * gh-langs-live.mts — 从 GitHub API 拉真实语言字节数（2026-11-22）
 *
 * io 页面「MOST USED LANGUAGES」此前是一次离线跑的静态数（2026-11-19）。
 * 指令第九条要求「尽可能接入联网得到的真实数据，不要全部是演示数据堆砌」——
 * 这个脚本用 PAT 走 api.github.com，把所有公开仓库的 languages_url 字节求和，
 * 输出一份可核对的 JSON（每个仓库各自的语言明细也在里面，任何人能复核）。
 *
 * 用法：GH_TOKEN=<pat> npx tsx scripts/gh-langs-live.mts [--owner xiaodernan]
 * 输出：docs/showcase/github-languages-<owner>.json
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const OWNER = flag('--owner', 'xiaodernan');
const TOKEN = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
if (!TOKEN) {
  console.error('需要 GH_TOKEN（fine-grained PAT，公开仓库只读即可）');
  process.exit(2);
}

const headers = {
  authorization: `token ${TOKEN}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'nexus-langs-live',
};

async function gh(path: string): Promise<any> {
  const resp = await fetch(`https://api.github.com${path}`, { headers });
  if (!resp.ok) throw new Error(`GET ${path} -> ${resp.status}`);
  return resp.json();
}

async function main(): Promise<void> {
  const repos = await gh(`/users/${OWNER}/repos?per_page=100&type=public`);
  const perRepo: Record<string, Record<string, number>> = {};
  const totals = new Map<string, number>();
  for (const repo of repos) {
    const langs: Record<string, number> = await gh(`/repos/${OWNER}/${repo.name}/languages`);
    perRepo[repo.name] = langs;
    for (const [name, bytes] of Object.entries(langs)) {
      totals.set(name, (totals.get(name) ?? 0) + (bytes as number));
    }
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8).map(([name, bytes]) => ({
    name,
    bytes,
    pct: Number(((bytes / sum) * 100).toFixed(2)),
  }));
  const rest = sorted.slice(8);
  const payload = {
    generatedAt: new Date().toISOString(),
    owner: OWNER,
    publicRepos: repos.length,
    totalBytes: sum,
    top,
    restCount: rest.length,
    restBytes: rest.reduce((a, [, b]) => a + b, 0),
    restPct: Number((((rest.reduce((a, [, b]) => a + b, 0)) / sum) * 100).toFixed(2)),
    perRepo,
    source: 'GitHub REST API /users/{owner}/repos + /repos/{owner}/{repo}/languages',
  };
  const out = join(ROOT, 'docs/showcase', `github-languages-${OWNER}.json`);
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${out}`);
  console.log(`repos=${repos.length} bytes=${sum}`);
  for (const row of top) console.log(`  ${row.name}: ${row.pct}% (${row.bytes})`);
  console.log(`  其他 ${rest.length} 种: ${payload.restPct}%`);
}

void main();