# xiaodernan.github.io 的 NEXUS 卡实时刷新 · 两步接上

这是给 **xiaodernan/xiaodernan.github.io** 用的：让你展示页的「NEXUS Content Platform」卡片在你推 main 之后立刻最新。

## 一次性配置

GitHub repo → Settings → Secrets and variables → Actions：
- 新建 Secret `SHOWCASE_TOKEN`：Fine-grained PAT
  - Repository access: 只勾 `xiaodernan/nexus-content-platform`
  - Permissions: `contents: read`
  - **不需要** `nexus-platform`（它和这个项目是两个独立仓库——`nexus-platform` 是 Hong Kong 商业 MVP；`nexus-content-platform` 才是 AI Universe Studio）
- Storage workflow 里如下使用即可。

## One-time workflow — 直接放到 xiaodernan/xiaodernan.github.io 的 `.github/workflows/sync-nexus-content.yml`

\`\`\`yml
name: Sync nexus-content-platform showcase card

on:
  schedule:
    - cron: "0 18 * * 1"   # weekly, Monday 18:00 UTC
  workflow_dispatch:
  push:
    branches: [master]
    paths:
      - ".github/workflows/sync-nexus-content.yml"

permissions:
  contents: write

concurrency:
  group: sync-nexus-content
  cancel-in-progress: true

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Fetch the latest nexus-content-platform fact pack
        run: |
          mkdir -p assets/nexus-content
          curl -fsSL \
            https://raw.githubusercontent.com/xiaodernan/nexus-content-platform/main/docs/showcase/latest.json \
            -o assets/nexus-content/latest.json
          echo "fetched $(wc -c assets/nexus-content/latest.json) bytes"

      - name: Commit if anything moved
        run: |
          if git diff --quiet -- assets/nexus-content/latest.json 2>/dev/null; then
            echo "no change"
          else
            git config user.name "pages-sync-bot"
            git config user.email "pages-sync-bot@users.noreply.github.com"
            git add assets/nexus-content/latest.json
            git commit -m "sync(nexus-content): refresh showcase fact pack from main"
            git push
          fi
\`\`\`

## HTML — 直接放进 `index.html` 的 NEXUS 卡（参考 minicc 树的结构）

\\`\\`\\`html
<article class="project-card project-nexus">
  <div class="project-visual image-visual">
    <img src="assets/nexus-scene.png" alt="NEXUS Studio 3D 场景工作台截图" />
    <span class="visual-tag">STUDIO / 3D</span>
  </div>
  <div class="project-content">
    ...
    <p>把想法变成可编辑、可运行、可发布的数字世界。包含 Studio、Agent Runtime、创意模型和证据化验证链路。</p>

    <div class="minicc-latest" id="nexus-content-latest" aria-label="nexus-content-platform 最新指标">
      <div class="minicc-latest-kicker"><span class="minicc-latest-dot"></span><span>MAIN · LATEST</span><code id="nc-head">—</code></div>
      <div class="minicc-latest-grid">
        <div class="minicc-latest-cell"><span class="minicc-latest-number" id="nc-commits">—</span><span class="minicc-latest-label">提交总数</span></div>
        <div class="minicc-latest-cell"><span class="minicc-latest-number" id="nc-adrs">—</span><span class="minicc-latest-label">ADR 决策</span></div>
        <div class="minicc-latest-cell"><span class="minicc-latest-number" id="nc-contracts">—</span><span class="minicc-latest-label">跨端契约</span></div>
        <div class="minicc-latest-cell"><span class="minicc-latest-number" id="nc-services">—</span><span class="minicc-latest-label">Java 服务</span></div>
        <div class="minicc-latest-cell"><span class="minicc-latest-number" id="nc-testfiles">—</span><span class="minicc-latest-label">测试文件</span></div>
      </div>
      <div class="minicc-latest-foot"><span id="nc-generated">—</span><span>特性面：<code id="nc-features">—</code></span></div>
    </div>

    <div class="tag-row"><span>TypeScript</span><span>Turbo</span><span>WebGL</span><span>Agents</span></div>
    <div class="project-links"><a href="https://github.com/xiaodernan/nexus-content-platform" target="_blank" rel="noreferrer">查看源码 ↗</a></div>
  </div>
</article>
\\`\\`\\`

## 配套 JS — 加到 `script.js`（同步到 assets/nexus-content/latest.json 的数据）

\\`\\`\\`js
async function paintNexusContentLatest() {
  try {
    const r = await fetch('assets/nexus-content/latest.json', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    const set = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = String(text ?? '—'); };
    set('nc-head', `main @ ${d.head}`);
    set('nc-commits', d.total_commits);
    set('nc-adrs', d.adrs);
    set('nc-contracts', d.contracts);
    set('nc-services', d.services);
    set('nc-testfiles', d.test_files);
    set('nc-generated', `快照 ${new Date(d.generated_at).toISOString().slice(0, 10)}`);
    set('nc-features', Array.isArray(d.feature_surface) ? d.feature_surface.slice(0, 5).join(' · ') : '—');
  } catch (_) { /* 静默：不渲染就不渲染 */ }
}
paintNexusContentLatest();
\\`\\`\\`

## 更新频率

每周 `cron: "0 18 * * 1"`（周一 18:00 UTC）——以保证更新频率不会过高。
想人工触发：Actions → Sync nexus-content-platform showcase card → Run workflow。
本地重生成：`npm run gen:latest` 然后提交 `docs/showcase/latest.json`—— cron 会自动抓。

## 重要

- **不**复制到 spec（"特性面"硬编码 13 项之类），所有数字都是 `gen:latest` 从真 git + 真目录推出。
- 如果连 GitHub Action 一年一次都不跑，README 也不会变化——不是因为它"没有"，是因为 §159 不展示看不见的真相。
- `nexus-platform` 与本仓库无关；它那边是港岛商业 MVP，要自定义卡就单独挑对那边去。
