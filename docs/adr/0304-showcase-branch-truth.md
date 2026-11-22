# ADR-0304 · 个人主页展示指针的分支名必须读真值（2026-11-22）

## 状态

已接受（2026-11-22）

## 背景

个人主页 `https://xiaodernan.github.io/` 的 NEXUS 卡片从
`assets/nexus-content/latest.json` 读数据，页面渲染 `main @ <head>`。

两个硬编码叠在一起，导致展示错误：

1. `scripts/gen-latest.mts:58` 写死 `branch: 'main'`——不论在哪个分支生成都写 main；
2. 个人主页 `index.html` 的 JS 写死 `` `main @ ${d.head}` ``——不读 `d.branch`。

本仓库 `main` 与 `master` 是两条**无关历史**（见项目记忆/ADR-0291）：
`main` 最新 E211、`master` 最新 E215 + 第十四章 + margins 模块。
个人主页因此把 `master` 的 head 标成 `main @`，且展示的是旧 `main` 的 E211，
用户点进去看到的不是最新成果——直接违反用户「每次点进去看到最新成果」的要求。

## 选项

A. 只改 latest.json 的数字。否——下次生成又写回 main，且页面前缀仍错。
B. 两侧都改成读真值。采用。

## 决定

1. `scripts/gen-latest.mts`：`branch` 改为 `git rev-parse --abbrev-ref HEAD`，读不到才回落 `main`。
2. 个人主页 `index.html`：`` `main @ ${d.head}` `` → `` `${d.branch || 'main'} @ ${d.head}` ``。
3. 重新生成 `docs/showcase/latest.json`：`branch=master`、`head=65ef69b`、`total_commits=3919`、
   数据来自当前 HEAD（E215 线），同步到个人主页。

## 后果

### 变好的事

- 个人主页诚实地写 `master @ 65ef69b`，不再把 master 的 SHA 标成 main。
- 数据源从旧 `main`（E211）切到活跃 `master`（E215），用户看到的是最新成果。
- 未来在任一分支生成都自动正确，不需要再手改。

### 边界

- `total_commits` 会从 3971（main 线）变成 3919（master 线），数字看似变小——这是两条无关历史的真实差异，
  不是倒退；页面同时显示分支名，读者能分辨。
- 个人主页的静态占位（JS 加载前）仍写着旧 SHA，JS 会立即覆盖；未改静态占位以免触碰多语言区块。
- 个人主页的 `assets/nexus-content/latest.json` 没有 cron（只有 `sync-nexus-platform.yml` 管另一个仓库），
  本次是手动同步；后续仍按用户「有大提升再更新」的低频约定。

## 相关

- `scripts/gen-latest.mts`、`docs/showcase/latest.json`
- 个人主页 `index.html`、`assets/nexus-content/latest.json`
- ADR-0291（main/master 无关历史）

## 补记（2026-11-22 · 并轨之后）

本文写的是并轨**之前**的状态：那时 `main` 与 `master` 是两条互不相干的历史，
个人主页只能二选一。今天两条线已经合成一条：`origin/master` 的全部成果（E211–E215、
第十四章、页边角落模块、canon-review、压测脚本）已并入 `main`，`master` 与 `main` 指向同一条历史。

因此：
- 「数据源从旧 main 切到 master」这一步不再需要——**只有一个数据源**；
- `total_commits` 的「两条无关历史的真实差异」这个边界随之消失；
- `NEXUS_FACT_REF` 仍保留（多分支时还能钉），但默认 HEAD 就是最新；
- 并轨后正典真值：**14 章 · 217 回响 · 1311 锚句**（回响 211–215 整体后移两位并入）。
