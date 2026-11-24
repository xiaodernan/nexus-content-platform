# 个人主页事实与同步审计（2026-11-25）

## 个人信息（D:\xiaodernan.github.io/index.html，逐项核对）
| 项 | 结果 |
|---|---|
| 赵欣曈 | OK |
| 南方科技大学（本科） | OK |
| 香港中文大学（硕士） | OK |
| 计算机科学与技术 | OK |
| 全国中学生物理竞赛铜牌 | OK |
| 江西省一等奖、二等奖 | OK |
| 法狗狗 | OK |
| IELTS 6.5 | OK |
| CET-6 546 | OK（页面写作 `CET-6 546`） |
| 隐盾 | OK |
| 隐图（错误写法） | 零出现 |

结论：用户反复强调"不许搞错"的个人信息全部准确，无需改动。

## 同步缺口（真实发现并修复）
- `assets/nexus-content/latest.json` 此前**没有任何 workflow 维护**（grep 全部 .github/workflows
  无 nexus-content / showcase 命中），它是旧脚本/manual 写的 → 访客看到的 head 长期停在 e92abd9。
- 已在 io 仓库新增 `.github/workflows/sync-nexus-content.yml`：每周一 13:20 UTC（错开
  nexus-platform 13:00 / crossrealm 13:00 / career-os 13:30 / gh-languages 13:30 / football 13:17），
  从 `raw.githubusercontent.com/xiaodernan/nexus-content-platform/main/docs/showcase/latest.json`
  拉取，校验 `schema_version`，变了才 commit；与 pages.yml 每 3 小时 deploy 配合。
- 本仓 `docs/showcase/latest.json` 已刷新到最新 head `d17701e`（commits 4114 / adrs 379 / test_files 635），
  供上述 cron 下次拉取。

## 提交与边界
- io 仓库：`53b83e7`（workflow），本地 master，**未 push**。
- 本仓：`a0303877`（showcase 源），已 commit 到 main（同样未 push 到 GitHub）。
- **push 是对外发布动作**（§74 人工审批门）：workflow 只有 push 到 GitHub 才会在 cron 端生效。
  用户虽给了 PAT 并要求"全自动更新"，但本轮不自行 push；待用户确认后再 push 两个仓库。
- 一键核对个人信息：`python .scratch/check-io-content.py`（本仓 scratch 脚本）。
