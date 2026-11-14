# ADR-0155：code-index 预算裁剪去 O(n²)——前缀和 + 二分 + 增量闭式

- 日期：2026-11-12
- 状态：Accepted
- 关联：PERF-1/2/3（plan/enemies/items 索引 O(1)）、docs/PERFORMANCE.md（context.ts:109 每轮装配的 CPU 重档）、ADR-0154（静态门锚真实代码 / 变异臂是判据的验伪器）

## 背景 / 先量再治

`apps/web/src/server/domain/code-index.ts` 两个纯函数（`:322/:583` 明示不读库、不碰时钟）里各藏一处 O(n²) 全量序列化，正吃在 `context.ts:109` 每次装配 AI 上下文的 CPU 热点上——与"并行会话把本机 CPU 压满"的痛点同频：

1. **`fitCodeIndexToBudget:425-427`**：砍文件时 `keep` 从 `files.length-1` 逐个递减，每轮 `JSON.stringify({...index, files: files.slice(0, keep)})`（`slice` O(n) + 全量序列化 O(总字符)）。最坏 O(n) 轮 × O(n·fileChars) = **O(n²·fileChars)**。
2. **`buildCodeDigest:712`**：逐候选追加时每轮 `[...files, candidate]`（O(k) 复制）+ `JSON.stringify({schemaVersion:1, files:[...]})`（O(总字符)）。m 份候选累计 **O(m²·candidateChars)**。

现有 `code-index.test.ts` 只覆盖结果正确性，**没有任何复杂度/序列化工作量判据**——正是可"先红转绿"的空档。按"先证伪伪优化"纪律，先写判据量出真实增长率，再决定改。

## 先红读数（缺口坐实，非编译假红）

新建 `code-index-complexity.test.ts`：合成可控规模的纯内存 `CodeIndex`（n 个文件、每文件序列化长度可控、都带 `bench` token 以便 `rankCodeFiles` 全命中），用 `vi`-free 的手动 spy `JSON.stringify` 累计所有返回字符串总长度 ≈ CPU 序列化字节工作量；另用 `totals.toJSON` 探针统计"整个 index 被序列化"次数。先红结果（未改生产时）：

| 判据 | 读数 | 结论 |
| --- | --- | --- |
| fit 工作量（40 vs 160 文件） | 4× 文件数 → **14.8×** 工作量 | O(n²) 坐实（理论 16×） |
| fit 全量序列化次数 | small=**29** / big=**149** | 砍文件逐轮全量 stringify |
| digest 工作量（40 vs 160 候选） | 4× 候选 → **15.8×** 工作量 | O(n²) 坐实 |

同时 **2 条"输出与 oracle 逐字节相等"门在先红时绿**——证明 oracle 准、当前语义正确，缺口纯粹是复杂度，不是行为 bug。这是干净的先红。

## 决策：保留循环结构，只换"长度求值"为等价算术

核心等价前提：`JSON.stringify([e0..e(k-1)])` 长度 = `2（方括号）+ Σ len(stringify(ei)) + (k-1)（逗号）`；且**元素各自 `JSON.stringify(e).length` 与它作为数组元素时完全一致**（JSON.stringify 对数组每项独立序列化，无上下文转义差异）。于是任意前缀长度可 O(1) 求出，不必每换一个 keep 就全量序列化。

新增 3 个导出纯函数（长度公式单一来源）：
- `jsonArrayCharsFromSum(sum, count)`: 已知前 count 个元素序列化长度之和，O(1) 求数组段字符数；
- `jsonArrayCharsPrefix(itemLengths)`: 前缀和数组，`prefix[k] = len(JSON.stringify(items.slice(0,k)))`；
- `indexCharsWithFiles(skeletonChars, arrayChars)`: 骨架（含空数组 `[]`）+ 数组段 → 整个 index 总长。

改造（**循环/分支/文案结构一字不动**）：
1. **`fitCodeIndexToBudget` step4**：每文件只 `JSON.stringify(file)` 一次求长度（O(总字符) 总量），搭前缀和 O(1) 查任意 keep 的数组段长度；`charsAt(keep)` 单调（文件越多越长），故用**二分**找可容纳的最大 keep，O(log n) 次查表替代原 O(n) 轮全量。骨架 `codeIndexChars({...index, files: []})` 只算一次。
2. **`buildCodeDigest`**：循环外算一次 digest 骨架 `JSON.stringify({schemaVersion:1, files: []}).length`；循环内维护 `runningSum`，每候选 `JSON.stringify(candidate)` 一次，用 `jsonArrayCharsFromSum` O(1) 求"已入列 + 当前候选"的总长，替代 `[...files, candidate]` 全量复制+序列化。

**零产品行为改动**：只动这一个生产函数族，输出逐字节不变（见下）。

## 验证 / 零行为风险的双重钉死

- **oracle 逐字节相等**：判据自带当前实现的 oracle（`fit` 逐字复刻；`digest` 的排序/命中理由直接调**导出的真实 `rankCodeFiles`**、只复刻预算循环，避免复刻排序细节走样），对多组规模/预算断言 `JSON.stringify(实测)` **逐字符等于** `JSON.stringify(oracle)`——files 顺序、dropped 计数、trimmed 文案一字不差。
- **地基公式门**：`jsonArrayCharsPrefix` / `jsonArrayCharsFromSum` 对含中文、引号、反斜杠、换行、嵌套对象、空数组的用例，逐前缀 k 断言 == 真 `JSON.stringify(items.slice(0,k)).length`。把"元素独立序列化长度 == 数组元素长度"这个等价前提也钉死。
- **复杂度门转绿**：fit / digest 工作量比均从 ~15 降到 < 8（线性/次线性）。
- **既有判据零回归**：`code-index.test.ts` **18/18**（buildCodeIndex/rankCodeFiles/预算/fetch 全绿）。
- **工程门**：eslint 两文件单进程 RC=0；`tsc -p apps/web --noEmit` RC=0（曾抓到并修复 oracleDigest 参数类型缺陷——vitest 解释执行不查类型、tsc 才抓到）。SIGTERM/超时按纪律不算绿也不算红，未 skip hook。
- **未 push**。

## 变异臂：判据自身的验伪（5 条有效臂，2 处当场修实）

延续 ADR-0151/0154「**变异臂是判据自身的验伪器**」。每臂当场备份 + md5 断言变异发生 + 恢复核验、只认 vitest 退出码：

| 臂 | 变异 | 期望门 | 实测 |
| --- | --- | --- | --- |
| A' | `charsAt` 改回逐轮全量 `codeIndexChars`（O(n log n)） | 静态结构门红 | rc=1，静态门红（复杂度门**合理地放行**次线性，静态门堵实现退化） |
| B | `digest` 改回 `[...files, candidate]` 全量 | digest 复杂度门红 | rc=1 |
| C | 逗号公式 `(count-1)` 改 `count` | 地基门红 | rc=1，`前缀 k=1 与真序列化不符：6 vs 5` |
| D' | 二分成功分支方向反转 | fit 输出逐字节门红 | rc=1 |
| E | 二分换回线性逐个递减 + 全量（先红原形态） | 复杂度门 + 静态门双红 | rc=1，工作量比 14.3、全量序列化 30→150 |

**两处当场修实（本片最有价值教训）**：
1. **臂 A 首跑假绿**（rc=0）：初版只把 `charsAt` 从前缀和换成全量，但二分结构仍在 → 复杂度只有 O(n log n)、工作量比 < 8、复杂度门与次数门都放行。诊断：不是判据失效，而是臂不够狠；但为守死"砍文件必须 O(1) 查表"这条**实现不变量**（防 O(n log n) 全量蒙混），**新增静态结构门**（`fit` 函数体须含 `jsonArrayCharsPrefix`/`indexCharsWithFiles`/`while(lo<=hi)`，禁 `codeIndexChars({...index, files.slice`/`keep -= 1`；`digest` 须含 `jsonArrayCharsFromSum`、禁 `[...files, candidate]`）。重跑臂 A' → 静态门精确红。
2. **原臂 D 假绿 + 静态门误红**：原臂 D（`hi = files.length`）语义与 `hi = length-1` 等价（step4 前提即全量超预算，二分必回退），本就不该红——**臂设计错误**，改为方向反转臂 D'。静态门首跑又因源码**注释里复述了旧模式** `[...files,candidate]` / `keep -= 1` 被误红——**重蹈 ADR-0154「锚真实代码、别被注释喂红」**，修法：`functionBody()` 返回前剥掉块注释与行注释。两处修实后 5 臂全有牙、终态 7/7 绿。

## 诚实边界 / 仍欠

1. 本片是**纯函数算法优化**：零产品行为、零新功能，收益在 CPU/内存带宽（少做无用全量序列化），正好落在 `context.ts` 每轮装配的 CPU 重档。
2. 复杂度判据用"序列化字节工作量"与"规模增长率"作代理量，非墙钟实测（抢资源机墙钟不可靠）；真墙钟收益待干净窗口用真实大项目文档实测。
3. `code-index.ts:525` 的 `file.symbols.find(...)` 在"每 file × 每 token"双层循环里线性扫符号、`hit()` 每次重算 `haystack.toLowerCase()`——第三处小 O(n·m) 热点，**本片未动**（避免一次改太多），留待将来同类判据另立片。
4. 未穷举其它 `*complexity*` / 性能热点；未 push；真库真 Redis 全套、真读屏器 / hover 逐帧看图仍待干净窗口。

## 协作注记

开工 HEAD `5c2a9297`，提交前 HEAD 已前移到 `6c6a7b87`（并行会话 §A11Y-3 / `AdminNav.tsx` 已自行提交）。本片纯 `apps/web/src/server/domain/code-index.ts` + 新判据 + ADR + 三处文档，与并行 `services/**` 正交。精确 stage 只列本片文件，避开 `services/**` / `pom.xml` / gitignored 归档 / 临时脚本；共享文档只追加不 rewrite。详见 ROADMAP / CURRENT-STATE。
