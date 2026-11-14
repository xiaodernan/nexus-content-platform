# ADR-0157：rankCodeFiles 去重复 toLowerCase——把内层循环不变量提到外层

- 日期：2026-11-12
- 状态：Accepted
- 关联：ADR-0155（§PERF-4 code-index 预算裁剪去 O(n²)，其"诚实边界③"点名本片热点）、ADR-0154（静态门锚真实代码 / 变异臂是判据的验伪器）、§CRIT-1（声称覆盖纪律）、§69 Code Index / `context.ts:109` 每轮装配 AI 上下文的 CPU 重档

## 背景 / 先量再治

ADR-0155 修完预算裁剪后，在其"诚实边界③"里明记事主第三处热点未动。本片接手坐实：`apps/web/src/server/domain/code-index.ts` 的 `hit(haystack, token)`（旧 `:537-544`）**每次调用都对 `needle = token.toLowerCase()` 与 `value = haystack.toLowerCase()` 各做一次**，而 `rankCodeFiles`（旧 `:561-629`）是 **O(files × tokens × fields)** 的嵌套循环：

- 同一个 `token` 被小写 **O(files × fields)** 次（每 file 的 symbols.find / pageName / nodeName / path / externals.some 各一遍）；
- 同一个 file 的 path / pageName / nodeName / symbol names / externals 被小写 **O(tokens)** 次。

两处都是教科书级的**循环不变量**（`toLowerCase` 纯、幂等，结果只依赖字符串内容），完全可以各预计算一次复用。这份目录正是 `context.ts:109` 每次装配 AI 上下文时重算的纯函数投影——落在 user 反复点名的「用数据结构/算法/OS 知识优化运行速度与硬件适配」直线上。既有 `code-index.test.ts` 只盖结果正确性，无"重复小写工作量"判据，正是可先红转绿的空档。

## 先红读数（缺口坐实，非编译假红）

新建 `code-index-rank-lowercase.test.ts`（纯内存、零库/网络/时钟/切词除 `queryTokens` 外、零 sleep）：手动 spy `String.prototype.toLowerCase`，**按被小写的原文 `this` 精确分组计数**（不是墙钟），把"token 小写次数"与"字段小写次数"从总次数里干净摘出。未改生产时：

| 判据 | 先红读数 | 结论 |
| --- | --- | --- |
| 计数门①：文件 4→32（8×） | token 小写 **184→1472**（≈8×） | token 小写随 files 线性暴涨（应恒定） |
| 计数门②：8 files × 9 字段 | 字段小写 **472** 次，应 **72** | 每字段被 7 个 token 各小写一遍 |
| 计数门③：token 2→7 | 字段小写 **128→472**（≈3.7×） | 字段小写随 token 数线性增长 |
| 结构门 | 红：无预小写、hit 热路径仍两点 toLowerCase | 实现未落地 |

同时 **零行为门先红时绿**（16 组输入与 oracle 逐字节相等）——证明 oracle 忠实、当前语义正确，缺口纯粹是重复工作量，不是行为 bug。这是干净的先红。

## 决策：loop-invariant hoisting，只换"谁来做小写"、不动任何语义

1. `tokens.map((token) => token.toLowerCase())` 得 `needles`，对整份 query **只算一次**，与 `tokens` 按下标一一对应，供所有 file × 所有字段复用。
2. 每个 file 循环开头把 `path` / `pageName` / `nodeName` / `symbol names` / `externals` **各预小写一次**，原文仍保留给 reasons 文案与 symbolName，只用小写副本做命中判定。
3. `hit` → `hitLower(lowerValue, needle)`：只接收已小写值，内部**不再 toLowerCase**，语义逐条保留（空串早退 → 正向 includes → 反方向 ≥3 字 CJK 包含）。
4. `exact` 判定由 `symbol.name.toLowerCase() === token` 换成预小写的 `symbol.lower === needle`——**逐字节等价**：`queryTokens` 的输出恒满足 `token === token.toLowerCase()`（ASCII 分支已 `.toLowerCase()`、CJK 无大小写概念），故 `needle === token`、`symbol.lower === symbol.name.toLowerCase()`。

**零产品行为改动**：只动这一个生产函数族的输出等价改写，reasons 文案、score、find/some 短路顺序、去重、tier 排序、limit 截断全部逐字节不变。

## 验证 / 零行为风险的双重钉死

- **oracle 逐字节相等**：判据自带当前 `rankCodeFiles + hit + originTier` 的 oracle（`queryTokens` 直接调**导出的真实实现**、零复刻走样风险），对 16 组输入（CJK / exact / contains / pageId / nodeIds / externals / path / css 符号 / 空 query / limit / tier 排序）断言 `JSON.stringify(实测)` **逐字符等于** `JSON.stringify(oracle)`——连 reasons 文案顺序、去重、score 一字不差。
- **精确计数门①②③**：spy `toLowerCase` 按原文 this 分组，断言 token 小写与 files 无关、每字段恰 1 次、字段小写与 tokens 无关。这是**精确次数门**，非墙钟、也无法像 PERF-4 那样用 O(n log n) 全量蒙混，故**不需要**额外复杂度工作量门；另立一条**静态结构门**堵"换皮但热路径仍重复小写"（锚剥注释后的真实函数体，延续 ADR-0154）。
- **横向零回归**：`code-index.test.ts` 18 + `code-index-complexity.test.ts` 7 + 本片 6 = **31/31**（三份合跑无 SIGTERM）。
- **工程门**：eslint 两文件单进程 RC=0（抓到并修 2 处：**未使用的 `CJK_RUN`**、spy 捕获原生方法触发 `unbound-method` → 改用 `Reflect.get(String.prototype,'toLowerCase')`，语义同为替换前存下原生函数、不递归）；`tsc -p apps/web --noEmit` RC=0。SIGTERM/超时按纪律不算绿也不算红，未 skip hook。
- **未 push**。

## 变异臂：判据自身的验伪（1 条假绿 → 当场修实为可达性门 + 3 条有效臂）

延续 ADR-0151/0154/0155「**变异臂是判据自身的验伪器**」。每臂当场备份、md5 断言变异发生、恢复核验基线 `cfe321f2…`、红绿只认 vitest 退出码：

| 臂 | 变异 | 期望门 | 实测 |
| --- | --- | --- | --- |
| A | `exact` 改回现场 `symbol.name.toLowerCase()` | 计数门②红 | rc=1，字段小写 **80>72** |
| B | `hitLower` 热路径恢复现场两点 toLowerCase（幂等、行为不变） | 计数门①②③ + 结构门红 | rc=1（191→1479 / 280>72 / 136→280 / 结构门） |
| C（原） | 反方向 `needle.includes(value)` 恒 false | 零行为门红 | **假绿 rc=0**——见下 |
| C′ | `exact` 判定破坏（10 分退化为 5 分） | 零行为门红 | rc=1，`CouponCountdown` 用例逐字节不符 |
| D′ | `hitLower` needle/value 方向反转 | 零行为门红 | rc=1 |
| E′ | contains 正向 `includes`→`startsWith` | 零行为门红 | rc=1，`coupon` 用例逐字节不符 |

**本片最有价值教训——臂 C 假绿逼出"声称覆盖"诚实性修复（§CRIT-1 纪律再次生效）**：原判据 JSDoc 声称 oracle 覆盖了 `hit` 的"反方向包含"分支，但臂 C 把该分支恒置 false 后**没有任何门变红**。深挖坐实：`hit` 反方向触发前提是 `CJK_CHAR.test(needle) && needle.length >= 3`，而 `queryTokens` 的 CJK 分支只产**单字(1) / 二元组(2)**、ASCII 分支产的词不含 CJK——两者**无法同时成立**，该分支在当前实现下是**防御性死代码**。旧表述是把"没覆盖"粉饰成"覆盖了"，与 §CRIT-1 假绿同款诚实性口子。

修法（不删防御逻辑、不谎称覆盖）：
1. 生产注释与判据 JSDoc 的"含反方向"改成**诚实边界**——明说该分支当前不可达、保留只为防御未来切词变更；
2. **新增可达性门**：断言 `queryTokens` 对一组 CJK 查询产出的含 CJK token 恒 `<3` 字（把"反方向当前不可达"这一事实本身钉死），并正向验一个 CJK 二元组确实命中中文页面名（证明 CJK 命中走的是 `value.includes(needle)` 正向）。一旦未来切词改变让该分支复活，此门变红，提醒补 oracle 用例；
3. 臂 C 换成 C′/D′/E′ 三条真正能验伪行为等价的臂，全部红。

修实后终态判据 **6/6** 绿（零行为 + 可达性 + 计数①②③ + 结构）。

## 诚实边界 / 仍欠

1. 本片是**纯函数算法优化**：零产品行为、零新功能，收益在 CPU/内存带宽（少做 O(files×tokens×fields) 次无用小写），落在 `context.ts` 每轮装配的 CPU 重档。
2. 计数判据用"toLowerCase 调用次数（按原文 this 分组）"作 CPU 工作量的**精确代理量**，非墙钟实测（抢资源机墙钟不可靠）；真实墙钟收益待干净窗口用真实大项目文档实测。
3. `hit` 的反方向分支当前为防御性死代码（见上），本片**不删**、以可达性门标记其不可达性，不宣称已验证其运行时行为。
4. `file.symbols.find(...)` 在"每 file × 每 token"双层循环里**仍线性扫符号**（本片只消除重复小写，未改扫描复杂度）；若将来符号表规模成为瓶颈，可另立片评估"按小写 symbol name 建索引"之类，但那会动到命中顺序语义，需单独 oracle 论证。
5. 未穷举其它性能热点；未 push；真库真 Redis 全套、真读屏器 / hover 逐帧看图仍待干净窗口。

## 协作注记

开工 HEAD `f48e9dd1`（我的 §SHARED-1），提交前 HEAD 未前移（本轮无并行会话抢 web index）。本片纯 `apps/web/src/server/domain/code-index.ts` + 新判据 + ADR + 三处文档，与并行 `services/**` 正交。精确 stage 只列本片文件，避开 `services/**` / `pom.xml` / gitignored 归档（`.next-dev-archives/` / `test-results-mine*`）/ 临时脚本；共享文档只追加不 rewrite。详见 ROADMAP / CURRENT-STATE。
