# 真实数据 · GitHub 语言字节来自 API 实拉（2026-11-22）

> 指令第九条：「尽可能接入联网搜索得到的真实数据、真实实验数据，不要全部是演示数据堆砌」。
> io 页面「MOST USED LANGUAGES」自 2026-11-19 起是一次**离线跑**的静态数——
> 数字是对的，但来源是一次性的，读者无法核对，也不会随代码增长更新。

## 本次实拉（GitHub REST API · PAT 只读公开仓）

`scripts/gh-langs-live.mts`（`GH_TOKEN=<pat> npx tsx scripts/gh-langs-live.mts`）：

- `/users/xiaodernan/repos?type=public` → **16 个公开仓**
- 每个仓 `/repos/{owner}/{repo}/languages` → 字节明细（全部落在输出的 `perRepo` 里，可逐仓复核）
- 合计 **152,517,763 bytes = 145.45 MiB**，19 种语言

| 语言 | 字节 | 占比 | 相对最大 |
|---|---|---|---|
| TypeScript | 48,099,975 | 31.54% | 100.0% |
| Python | 36,696,716 | 24.06% | 76.28% |
| JavaScript | 30,903,565 | 20.26% | 64.24% |
| HTML | 18,445,204 | 12.09% | 38.33% |
| Java | 14,397,468 | 9.44% | 29.93% |
| CSS | 2,287,459 | 1.50% | 4.76% |
| Shell | 582,791 | 0.38% | 1.20% |
| PLpgSQL | 413,290 | 0.27% | 0.86% |
| 其他 11 种 | 691,295 | 0.45% | 1.43% |

与 2026-11-20 那版相比：Java 8.83% → **9.44%**（本仓 Spring Cloud / 工具注册表的增长），
JavaScript 19.48% → 20.26%，TypeScript 32.28% → 31.54%——份额移动方向与真实提交一致。

## 落点

- io 仓 `index.html` 两块语言面板（中/英）与「代码字节合计」格子全部换成实拉值；
  面板脚注写明「2026-11-22 由 GitHub API 实拉（16 仓 145.45 MiB）」。
- io 仓新增 `assets/nexus-content/github-languages.json`（含每仓明细）。
- io 仓 `scripts/identity-guard.mjs` 的语言份额 pin 同步更新（否则 guard 会挡住这次刷新——
  它存在的意义就是抓漂移，所以更新 pin 必须与数据同一次提交）。
- 线上验证：`https://xiaodernan.github.io/` 渲染出的 `.lang-pct` 为
  `31.54 / 24.06 / 20.26 / 12.09 / 9.44 / 1.50 / 0.38 / 0.27 / 0.45`。

## 复跑

```powershell
$env:GH_TOKEN='<pat>'
npx tsx scripts/gh-langs-live.mts            # 输出 docs/showcase/github-languages-xiaodernan.json
```

## 诚实限度

- 只覆盖**公开仓**（私有仓字节不进公开页面，这是既有口径，不是本次回避）。
- 语言字节是 GitHub 的 linguist 统计，不等于"我写了多少行"——页面脚注一直这么写。
- PAT 只用于只读 GET；未写进任何提交（io 仓 remote URL 用完即复位）。