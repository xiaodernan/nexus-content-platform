# docs/showcase — 项目公开快照

`nexus.html` 是 **`npm run gen:showcase`** 的产物——一个零依赖的 self-contained HTML 快照。
适合直接托管到 https://xiaodernan.github.io/ 等展示站点的「进入项目 / Enter project」入口。

生成：

```bash
npm run gen:showcase
```

只读真值：git rev-list 计数、ADR 数量、契约数量、services/packages 数量——所有数字都来自仓库本身，
不编造。快照在每次大的里程碑提交前手动更新（不重建了就自动过期、不谎称新鲜）。

## GitHub Pages 同步（需你来配置）

`.github/workflows/showcase.yml` 是一份**手动触发**的发布工作流（避免无意间覆盖展示站点）：
你在 GitHub → repo → Actions → `Publish showcase` → Run workflow。它会把
`docs/showcase/` 发布到你指定的展示仓库分支 `showcase/latest`。

需要的两样东西（你自己在 GitHub UI 里加，我不会假装有权限自带）：
1. **Secret `SHOWCASE_TOKEN`** —— 一个 fine-grained PAT，能推到目标展示仓（如 `xiaodernan/xiaodernan.github.io`）的 `main` 或 `showcase/*` 分支。
2. **Var `SHOWCASE_TARGET_REPO`** —— 目标仓，如 `xiaodernan/xiaodernan.github.io`

未配置时 workflow 不会推、不会造满红 CI。「自动更新」不承诺不经人手就发生：这里至少是手动触发的（§159）。

## 降低更新频率、有大提升再更新

推荐做法：只在里程碑 tag 或月度一次重跑 `npm run gen:showcase`, 然后压一个 `docs(showcase): 重新生成快照` 提交；
workflow 再手动触发。

## 什么进 / 什么不进

- ✅ 进快照：公开技术栈和指标、公开路由清单
- ❌ 不进快照：任何 API key、我内部的 task ledger、`NEXUS_LLM_*` ——快照生成器从 `git rev-list`/`readdirSync`/`execFileSync` 导出，不过任何 env（除 PATH 外只读文件与 git 元数据）。
