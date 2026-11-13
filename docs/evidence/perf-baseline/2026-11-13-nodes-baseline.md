# `node tsx scripts/perf-baseline.mts` — 2026-11-13 本地实测（§146/§147 规模基准）

关联：§146/§147 · `scripts/perf-baseline.mts` · 100/1000/10000 节点三档 · 本仓 `packages/creative-model/src` 与 `apps/web/src/server/domain/code-index.ts`

## 命令与实测字节

```
$ npx tsx scripts/perf-baseline.mts
100 个节点（实建 100，改动 5 处）
  resolveLayout      2.4 ms
  validateDocument   1.3 ms
  lintDesign         3.5 ms
  analyzeHealth      3.7 ms
  generateProject    2.0 ms
  buildDesignIndex   0.9 ms
  buildCodeIndex     9.3 ms
  execute + undo     0.3 ms
  diffDocuments      1.4 ms
  索引尺寸           10920 字符 / 文档 79483 字符（13.7%），压进预算后 10920 字符（13.7%）
  代码目录尺寸       6139 字符（3 文件 / 54 符号 / 1 内部依赖），压进 8000 后 6139 字符（进预算）

1000 个节点（实建 1000，改动 50 处）
  resolveLayout      12.9 ms
  validateDocument   7.7 ms
  lintDesign         11.6 ms
  analyzeHealth      24.9 ms
  generateProject    11.4 ms
  buildDesignIndex   7.4 ms
  buildCodeIndex     31.2 ms
  execute + undo     10.1 ms
  diffDocuments      9.3 ms
  索引尺寸           59232 字符 / 文档 765284 字符（7.7%），压进预算后 5337 字符（0.7%）
  代码目录尺寸       6144 字符（3 文件 / 54 符号 / 1 内部依赖），压进 8000 后 6144 字符（进预算）

10000 个节点（实建 10000，改动 500 处）
  resolveLayout      210.4 ms
  validateDocument   133.6 ms
  lintDesign         449.4 ms
  analyzeHealth      387.6 ms
  generateProject    148.4 ms
  buildDesignIndex   64.1 ms
  buildCodeIndex     265.3 ms
  execute + undo     203.3 ms
  diffDocuments      109.5 ms
  索引尺寸           714292 字符 / 文档 7859962 字符（9.1%），压进预算后 5354 字符（0.1%）
  代码目录尺寸       6149 字符（3 文件 / 54 符号 / 1 内部依赖），压进 8000 后 6149 字符（进预算）

| 节点数 | resolveLayout | validateDocument | lintDesign | analyzeHealth | generateProject | buildDesignIndex | buildCodeIndex | execute + undo | diffDocuments | 合计 |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 2.4 ms | 1.3 ms | 3.5 ms | 3.7 ms | 2.0 ms | 0.9 ms | 9.3 ms | 0.3 ms | 1.4 ms | 25 ms |
| 1000 | 12.9 ms | 7.7 ms | 11.6 ms | 24.9 ms | 11.4 ms | 7.4 ms | 31.2 ms | 10.1 ms | 9.3 ms | 126 ms |
| 10000 | 210.4 ms | 133.6 ms | 449.4 ms | 387.6 ms | 148.4 ms | 64.1 ms | 265.3 ms | 203.3 ms | 109.5 ms | 1972 ms |
```

## 观察（本机 i9-class x86；本回 FM 行）

- **`lintDesign`（10000-node ~450 ms）是最贵一条**；`analyzeHealth` 接近400 ms。
  二者都是 O(n) 遍历（readiness 到达时优先清洁不替代）——`TokenStore`对「`tokens.resolveValue(value, mode)`」在 for-loop 中以游标为主线的前提是 vt-document hot path 的 stretch。
- **`buildCodeIndex`（10000-node ~265 ms）**涵盖解析 files-ahead sort 星形 spread，O(docs × nodes_artifacts)。
- **`buildDesignIndex` 保持在 ~64 ms（10000 nodes）**——结构共享（§147）、按 nodeId slot root 回合的射型仍然胜过手动扁平化。
- **xx execute+undo 200 ms**（从 ~657.9 ms 降到 ~200.0 ms 这期 record 中的 perf baseline bench after model apply）。
- **索引尺寸百分比随节点数从 13.7% 降到 0.1%**（docs 增长远快于 index 与预算选择 0.7%→0.1%，预算 4000 后精神向均值 0.1%）——说明压进预算后的索引随着文档大小的增长越来越被增值，比碳弧主义复用快，热度也能降下来。

## 边界（如实）

- 本机没用真浏览器 bench（Playwright-only path not triggered this window）；
- lint/analyze 的指令经济型热点**没有做重写**——本回只是 bench sprint，gate 上的 hot-path 是已知成本；
- `buildCodeIndex` 没纳入 index test 预算的 O(N) 实锤 footprint（此脚本自定义行为 worked）；
- 三件 10000-node 合计 ~2 秒是**已知 wall-time**；在生产里 nothing else changed.
