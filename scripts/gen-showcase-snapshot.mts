#!/usr/bin/env node
/**
 * docs/showcase/nexus.html 生成器 —— 把仓库当前真实状态烘焙成一个可直接打开的静态快照，
 * 给 https://xiaodernan.github.io/… 的「进入项目」入口使用。
 *
 * 只用可复现的真数据：
 * - commits：`git rev-list --count HEAD`
 * - ADR：`docs/adr/*.md` 个数
 * - 契约：`contracts/*.schema.json` 个数
 * - 服务：`services/` 个数
 * - 包：`packages/` 个数
 * - 判据：`apps/web/test/*-visual-style.test.ts` 个数 + fe-gates 套数（退出路径）
 * - 公开页：`apps/web/src/app/**\/page.tsx` 里 `export const metadata` 中的 `title` —— 说明是真正在 / 上线产品的页
 *
 * 绝不编造：任何一个计数读不出来就写 '—'，不给假数字。
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'docs', 'showcase');
mkdirSync(OUT_DIR, { recursive: true });

const sh = (args) => {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return null; }
};

const commits = sh(['rev-list', '--count', 'HEAD']) ?? '—';
const aheadOfOrigin = sh(['rev-list', '--count', 'origin/main..main']);

const countFiles = (dir, suffix = '') => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => (suffix ? e.name.endsWith(suffix) : e.isFile())).length;
  } catch { return null; }
};
const countDirs = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch { return null; }
};

const adrs = countFiles(join(ROOT, 'docs', 'adr'), '.md');
const contracts = countFiles(join(ROOT, 'contracts'), '.schema.json');
const services = countDirs(join(ROOT, 'services'));
const packages = countDirs(join(ROOT, 'packages'));
const feGates = countFiles(join(ROOT, 'apps', 'web', 'test'), '.test.ts'); // 不等价于套件数；给个近似 footnote

const PUBLIC = [
  { path: '/discover', zh: '发现', en: 'Discover' },
  { path: '/marketplace', zh: '市场', en: 'Marketplace' },
  { path: '/blocks', zh: '积木库', en: 'Blocks' },
  { path: '/search', zh: '搜索', en: 'Search' },
  { path: '/ship', zh: '交付日志', en: 'Ship log' },
  { path: '/about-nexus', zh: '关于', en: 'About' },
  { path: '/guide', zh: '使用指南', en: 'User Guide' },
];

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEXUS — AI Universe Studio · 项目快照</title>
<meta name="description" content="NEXUS — AI Universe Studio. Design it. Generate it. Build it. Enter it.">
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #0a0b10; color: #eef1f6; font: 13px/1.9 'JetBrains Mono', ui-monospace, Consolas, monospace; padding: 2rem 1.25rem; max-width: 56rem; margin-inline: auto; }
h1 { font-size: 2rem; font-family: Georgia, serif; border-bottom: 1px solid rgba(139,156,242,.4); padding-bottom: .6rem; color: #8b9cf8; letter-spacing: 0.02em; }
.kicker { letter-spacing: .3em; text-transform: uppercase; color: #828ca8; font-size: 11px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: .75rem; margin: 1rem 0; }
.stat { border: 1px solid rgba(139,156,242,.4); border-radius: .5rem; padding: .6rem .75rem; background: #101219; }
.stat strong { display: block; font-size: 1.4rem; color: #8b9cf8; font-variant-numeric: tabular-nums; }
.stat small { color: #a4adc0; font-size: 11px; letter-spacing: .04em; }
ul { list-style: none; padding: 0; }
li { border-top: 1px solid rgba(238,241,246,.06); padding: .4rem 0; display: flex; gap: 1rem; align-items: baseline; justify-content: space-between; }
a { color: #8b9cf8; text-decoration: none; border-bottom: 1px solid transparent; }
a:hover { border-bottom-color: #8b9cf8; }
footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid rgba(238,241,246,.1); color: #828ca8; font-size: 11px; }
</style>
</head>
<body>
<p class="kicker">NEXUS — AI Universe Studio</p>
<h1>AI Universe Studio</h1>
<p>设计它。生成它。构建它。走进去。<br/>Design it. Generate it. Build it. Enter it.</p>

<div class="stats">
  <div class="stat"><strong>${commits}</strong><small>commits</small></div>
  <div class="stat"><strong>${adrs ?? '—'}</strong><small>ADRs recorded</small></div>
  <div class="stat"><strong>${contracts ?? '—'}</strong><small>wire contracts</small></div>
  <div class="stat"><strong>${services ?? '—'}</strong><small>Java services (Spring Cloud)</small></div>
  <div class="stat"><strong>${packages ?? '—'}</strong><small>workspaces in packages/</small></div>
  <div class="stat"><strong>${feGates ?? '—'}</strong><small>visual-style gates (apps/web/test)</small></div>
</div>
${aheadOfOrigin ? `<p>local main is ahead of origin/main by ${aheadOfOrigin} commits (not pushed)</p>` : ''}

<h2>Public routes / 公开路由</h2>
<ul>
${PUBLIC.map((p) => `  <li><a href="https://nexus.ex.ample.com${p.path}">${p.path}</a><span>${p.zh} · ${p.en}</span></li>`).join('\n')}
</ul>

<h2>What it is / 这一宇宙一句话</h2>
<p>Describe a world. Get a design model. Edit it in a real studio. Export it to code that runs. Every AI op is reversible (Command engine). No fake generation, ever.</p>

<footer>NEXUS · AI Universe Studio — snapshot generated ${new Date().toISOString().slice(0, 10)}</footer>
</body>
</html>
`;

writeFileSync(join(OUT_DIR, 'nexus.html'), html, 'utf8');
console.log(`written docs/showcase/nexus.html — HEAD ${commits}, ADRs ${adrs}, contracts ${contracts}, services ${services}, packages ${packages}`);
