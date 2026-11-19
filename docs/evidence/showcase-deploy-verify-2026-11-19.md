# IO 展示页 · 部署与 canon 对账 · evidence（2026-11-19 · cont.447）

> 背景：大模型 API 换成 gpt-6.2-sol（`https://api.aizzz.xyz/v1`，Clash 7897 出口，`NEXUS_LLM_STREAM=1`）之后，
> IO 页与 GitHub 个人主页做了一轮"真值对账"：身份字符串、头像、Most Used Languages、部署链路、fact pack。
> 本片只记实测数据，不写推断。

## 1. Pages 部署链路

- 自托管 runner（lenovo-pages / lenovo-pages-2）：**PATH 里没有 `node`**，且这台机器的 `C:\WINDOWS\system32\bash.EXE`
  实际是 WSL 且没有 `/bin/bash` → `actions/upload-pages-artifact` 的 bash 步骤必死
  （`execvpe(/bin/bash) failed`，失败 run 44505338842 / 44506780662 / 44507470129 三个样本）。
- 修复（并轨线落地的路径）：master 切到 `ubuntu-latest`，`pages.yml` 加 `environment: github-pages`；
  identity-guard 保留自托管（node-only，加 `actions/setup-node@v4` + pwsh 后可跑）。
- 部署两次手动 dispatch：**44513018719 ✓ success（11:41:57→11:42:15Z）** · **44519701682 ✓ success**。
- 我的一次 legacy-build 探针（`build_type=legacy`，master source）已**完整回滚**为 `workflow`（原配置）。
- 自托管 runner 已在本机启动（`_actions-runner-pages`、`_actions-runner-pages-2`）。

## 2. 线上 IO 页与 GitHub 主页（逐字符串计数，UTF-8）

| 检查项 | xiaodernan.github.io | raw README (main) |
|---|---|---|
| 隐图（错） | **0** | **0** |
| 隐盾（对） | 26 | 6 |
| 赵欣曈 | 14 | 1 |
| 南方科技大学 | 6 | 4 |
| 香港中文大学 | 6 | 5 |
| 计算机科学与技术 | 6 | — |
| 全国中学生物理竞赛 | 4 | 3 |
| 江西省一等奖 / 二等奖 | 3 / 2 | 各 4 |
| 法狗狗公司 | 7 | 4 |
| IELTS 6.5 | 9 | 4 |
| CET6 546 | 9 | 4 |

- 头像：`.hero-profile` 上限 460→**620px**；`object-fit:contain`；`.profile-frame` 去 padding 0 + 实测 `framePad=0px`；
  全脸 `natural 415×492` 完整渲染。
- **Most Used Languages**：根因 = `github-readme-stats` top-langs 卡在双语渲染时无法输出数字（显示 NaN）。
  已整体移除 `github-readme-stats` / `streak-stats` / `github-profile-trophy`（后者 Payment required / DEPLOYMENT_DISABLED），
  换成本地静态 SVG（`assets/languages.svg`、`assets/stats-contrib.svg`、`assets/banner.svg`），
  数字 = 2026-11-19 GitHub REST API `languages_url` 逐仓求和（**TypeScript 31.95% / Python 24.85% /
  JavaScript 19.44% / HTML 12.41% / Java 8.93%**，`./assets/nexus-content` 与 profile 两处一致）。

## 3. fact pack / oracle 与 canon 对账

- 记录时点：platform `master == main == origin/main`，HEAD=cdf5c49f。
- `verify:world-bible`：**1080/1080** zh/en 锚句通过；`verify:bible-snapshot` 一致；digest 251,350 chars（sha 8025626e）。
- `assets/nexus-content/latest.json`（Pages master）：`head: 69dce3f` · `total_commits: 3,747` · `generated_at: 2026-11-19T11:58:17Z`。
- IO 页 baked oracle strip：`1080 锚句 · digest 251,350 · 178 回响`。
- io 页 fact pack 读取链路：`script.js` 运行时 fetch `./assets/nexus-content/latest.json`，徽标随部署更新。

## 4. 平台侧回归（本次合并后）

- `verify:fe-gates`：**152 文件 · 1386/1386 通过**（含 BibleQuiz 104 题 SHA pin 通过）。
- `typecheck`：4/4 包通过。
- CDP harness：**8/8 通过**（视口可见性 / rAF / canvas 读回 / 截图 / 信任输入）。
- 主页（guest）：完整渲染 quick start、6 步上手、教学提示（nav 每项有 title，provider 面板如实显示 llm=REAL / embedding|image|video=UNAVAILABLE/DEMO），中文无错字。
- live 系统行为（此前即记）：`/admin/observe`（口令 123）面板真实渲染
  （3,440 注册 / 877 总览 / 114 待批任务 / 91 疑似机器人 / 完成度 71.2% / 最小二乘外推），
  「生成 AI 深读」按钮真实走到 gpt-6.2-sol，返回「形势 / 展望·7 天推断（带区间）/ 下一步·优先级」，每句数字。

## 5. 已知欠账（如实）

- `origin/master` ref 仍停在 `e9c4ba8f`（§CANON-156，behind 1 / ahead 120），需用户点头 `--force-with-lease` 或废弃该 ref。
- `backup/echo168-169-duplicate`：我一度与并轨线同题手写了 E168/E169，已丢弃（canon 以并轨线为准），内容保留在此分支。
