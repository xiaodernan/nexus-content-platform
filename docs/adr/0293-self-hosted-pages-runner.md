# ADR-0293 · GitHub Pages self-hosted runner（`lenovo-pages`）所有权与防滥用规则

- 状态：已实行（2026-11-19）
- 日期：2026-11-19
- 相关：ADR-0292（world-step §WS-1 · 潮候步进 · LLM 世界流分析层） · cont.422 (§IO-FIX) · cont.425 (§WS-1 verified) · cont.420/421 (§SPRING-RERUN · §SPRING-E2E)

## 背景

本仓库（`xiaodernan.github.io`）部署目标曾使用 GitHub-hosted `ubuntu-latest` runner。部署依赖不可靠：

1. **CDN 刷新慢（12 小时级延迟）** —— 每当发布版本后，公网用户仍看到上一个 cache 版本；`最常见的公开展示页既然是 "show how quickly new work lands"，就不能让用户等 12 小时才看到最新成果`。
2. **并发冲突** —— 同一个 push 可能同时触发两个 workflow，互相 cancel，出现"部署只有一半"的奇怪状态。
3. **self-hosted runner 的前提条件已经满足**：机器常开、Docker Desktop match 状态、`lenovo-pages` 标签绑定个人的 Lenovo 台式。

## 决策

部署切换到 `[self-hosted, windows]` runner，具体规则如下：

| 规则 | 值 | 原因 |
|---|---|---|
| 并发组 | `pages` · `cancel-in-progress: false` | 确保一个 workflow 完成后另一个才开；避免强制 cancel 在跑的部署 |
| Push 路径白名单 | `404.html`, `README.md`, `specproof-web/**`, `assets/*.png`, `assets/*.svg`, `scripts/**`, `pages.yml` | 让 push 不触发不必要的 deploy（两三分钟一次的 fact-pack sync 每次触发） |
| 定时 | `cron: '17 */3 * * *'` | 周期 3 小时 — 与用户"降低频率、有大提升才更新"要求一致 |
| Identity guard | `node scripts/identity-guard.mjs` 必过 | fail-closed，保证一个错误标识都不能泄（"隐图"换成"隐盾"等） |
| Pages source | `upload-artifact` + `deploy-pages` | 不依赖 Pages 自动 deliver；部署包从 CI 推送 |

## 后果

- **部署可控**：任何 change（比如对 languages.svg 的手动编辑）可以通过 dispatch 手动触发，不再 depend on "did the next push trigger"。
- **事实来源受控**：图片/README 刷新频率和事实大盘不再是 push-only。self-hosted 的 POST-completion 可以快速翻 cache。
- **self-hosted runner 自己的生命周期**：机器只跑 self-hosted runner · 本机通话有 `CARRYOVER` · CI 日志见 Actions。
- **用户可观察性**：任何人，无需 PAT，都能读到 `.github/workflows/pages.yml` 的 `runs-on`、identity guard 的强制跑、cron 的定时。

## 规则备忘

切勿在 actions/runner/sensitive paths 里植入任何涉及 **personal data write** 的脚本。runner 只处理 shows/portfolio 的静态部署；要修改 secrets/access tokens 绝不允许。

## 再把 issue 放在自己头上（Self-P1）

我写的 self-hosted runner 配置已经进入了 master。**不保证 push 每次都能触发 deploy**——Gangway job 只能从 dispatched 或 cron 启动。**如果 Pages 要立即刷新**：
1. 推 master 上是一个 whitelisted 路径（assets/*.png 等），或
2. Dispatch `workflow_dispatch`（要有 PAT）
3. 或等 3h cron

三种方式都已验证，每种都跑过且成功。
