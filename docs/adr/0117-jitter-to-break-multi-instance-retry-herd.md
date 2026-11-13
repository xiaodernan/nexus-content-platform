# ADR 0117 — 退避抖动：消除多实例同拍重试/探测（v684）

- 状态：Accepted
- 日期：2026-11-12
- 相关：ADR 0114（v681 有界重试，本片抖动的第一服务目标）、ADR 0115（v682 进程内熔断）、
  ADR 0116（v683 跨实例共享熔断，半开探测同拍的第二服务目标）、ADR 0113 / v680
  （"语义未定先做组件不接线"的先例）、ADR 0095（判据单一真值，本片据此抽 `bounds`）、
  ADR 0090/0094 X4（判据钉形状不钉字面 / 语义未定不定门）、ADR 0105（同进程 A/B 方法论）、ADR 0112（正向锚）

## 背景

三根容错柱都记下了同一条仍欠：**无 jitter**。v681 的指数退避 `min(base·2^i, cap)` 是
**确定性**的——真网关持续 503 时，所有副本（以及 v683 共享 breaker 转 HALF_OPEN 时的所有
实例）算出**完全相同**的等待，于是同时醒来、再次同时打挂刚恢复的上游，形成 thundering
herd。重试越有界、熔断越共享，这个同步尖峰反而越整齐。抖动把退避时刻打散，是三柱共同的
最后一块。

## 决策：纯新增可复用 `jitter.py` + 门 + 同进程 A/B，零生产接线

新增 `apps/ai-service/src/ai_service/jitter.py`：
`STRATEGIES` 常量 + 纯函数 `bounds(...)` + 薄采样层 `jittered_backoff(...)`。

按 v680/v683 / ADR 0113 纪律 **不接进 v681 `_backoff`**：选哪种策略（延迟 vs 抗 herd
权衡）、decorrelated 的有状态 `prev` 怎么跨 attempt 传、是否引入全局随机源——都是**跨契约
语义**，尚未定。按 ADR 0090/0094 X4 **语义未定就不定门、不接线、记 ADR 仍欠**。

### 四种策略（三种 AWS 经典 + 一个零回归对照）

| strategy | `bounds`（无 Retry-After） | 语义 |
|---|---|---|
| `full` | `[0, exp]` | 完全打散，抗 herd 最强；首拍可接近 0 |
| `equal` | `[exp/2, exp]` | 保底一半退避，抗 herd 同时留等待 |
| `decorrelated` | `[base, min(cap, prev·3)]` | 有状态（依赖上次 sleep）；首拍 `prev=None` 取 base 作确定初值 |
| `none` | `[exp, exp]` | **不抖动 = v681 现状**，零回归对照 |

`exp = min(base·2^attempt, cap)`（v681 同款）。`none` 存在是为了**证明门不惩罚正当的
无抖动部署**（ADR 0094 X4）：分散/统计门只对 jitter 策略要求，`none` 只需不越界、尊重
RA；将来若判定某低并发部署不该抖动，选 `none` 仍全绿。

### Retry-After 统一后处理（服务端指令压过本地策略，ADR 0114）

jitter 策略把区间抬到 `[max(lo, ra), max(hi, ra·(1+_SPREAD))]`：
- **尊重服务端硬下限**：采样 >= Retry-After，不早于服务端允许；
- **保留抗 herd 宽度**：即便 `ra` 主导（`ra >= exp`），区间也不塌成 0 宽（否则又同拍）。

`none` 不加 spread，有 RA 时精确返回 `max(exp, ra)`，与 v681 `_backoff` 字节级一致（门钉死
这条精确语义，不放宽）。`_SPREAD` 常数判据**不钉字面**（ADR 0094 X4）：改它只要仍 >0、
区间仍不塌、仍尊重 RA，门就仍绿。

### 判据单一真值 + 确定性可复现

- **区间计算全在纯函数 `bounds()`**，`jittered_backoff()` 只做最后一脚 `rng(lo, hi)` 采样；
  门与变异臂共用 `bounds`，杜绝"Lua 一份 / Python 一份"式双实现漂移（ADR 0095，与 v683 同款）。
- **rng 注入**（签名 `(low, high) -> float`）：生产传 `random.uniform`，门传
  `random.Random(seed).uniform`——不读全局随机状态、同 seed 同序列、可 A/B。
- **显式拒绝无效配置**：未知策略、`base<0`、`cap<0`、`cap<base`、`retry_after<0`、
  `attempt<0` 一律 `ValueError`（不静默退化成"没抖动"或"无限等待"）。

## 门设计（先红后绿）

`apps/ai-service/tests/test_jitter.py`，沿用 ADR 0110/0114/0115/0116 三段式：

1. **真值门（离线恒跑，先红 16 条，组件未落 `ModuleNotFoundError`）**：full 有界且分散、
   equal 保底 exp/2、decorrelated 随 prev 变且首拍确定、三策略都尊重 Retry-After 且 RA
   主导时仍留分散宽度、`none` 精确 = v681 退避（零回归）、同 seed 可复现、full 统计形状
   （均值收敛区间中点、方差>0）、5 种非法配置拒绝、`bounds` 单一真值（采样必落其区间）；
   **同进程 A/B 离散度门**。
2. **恒跑变异臂（7 条，先红阶段即绿）**：无分散 / 越界 / 早于 RA / equal 无下限 /
   非法未拒绝 / herd 未减少 / 统计方差为 0 逐条逼红；**正向对照**：`none` 正当无抖动
   不被分散门惩罚、判据不钉策略与 SPREAD（ADR 0094 X4）。判据纯函数、真值门与臂共用。
3. **无真线路腿**：jitter 是纯函数 + 注入 rng，不打网络/Redis；全套 opt-in 真腿（真
   gpt-6-sol + 真 Redis）与本片门同跑互不干扰。

**本片两次"红"都是门自己的 bug，不是生产 bug**（按"红一条先判三件事"归为**我假设错**）：
① 一个变异臂喂的观测同时违反两条断言、先撞上不含目标关键词的那条 → 只让它违反目标性质；
② `none+RA` 真值门初版断言过松（`abs(x-0.5)<ε or x>=3.0` 几乎恒绿、失去牙）→ 钉死精确
语义 `= max(exp, ra)=3.0`。**全程只改门，生产逻辑自始正确。**

## 同进程 A/B 离散度裁决（ADR 0105 方法论，非墙钟）

指标是**离散度**（M 个实例退避落点占用多少时间桶 / 碰撞对数），不是墙钟倍数——离散度是
与 JIT/GC 无关的确定性统计量，故不需要交替 A/B 抵消热身噪声；但仍**9 轮取 p50 中位数**
防单次 rng 采样波动（多轮本身即"反转先后"的一种）。**绝不**用跨进程 before/after 墙钟
（本宿主曾伪造出 +695%/≈8×，见 ADR 0105）。单次读数归档（M=64 实例、K=16 桶、attempt=3、
base=0.5、cap=8）：

| 指标（p50/9 轮） | 无 jitter | full jitter |
|---|---|---|
| 占用桶数 | 1 / 16（全同拍） | 8 / 16 |
| 碰撞对数 | 2016 = C(64,2) | 269（**13.3%**） |

判据钉"有 jitter 占用 >= 半数桶、碰撞 < 无抖动的 35%"，**不裁 1.x× 性能倍数**；且带
**正向锚**（ADR 0112）：无抖动臂碰撞对数必须 >0（否则裁决无意义，同"代理量恒 0 假绿"）。

## 验证

- 先红：16 真值门红 / 7 离线臂绿（组件未落）。
- 转绿：门文件 **23 passed**（CI 模式，含 A/B 离散度门）。
- 全套 ai-service：CI **205 passed / 8 skipped**（v683 182/8 → +23，零回归）；
  opt-in 真网关 + 真 Redis 双腿 **212 passed / 1 skipped**（v683 opt-in 189/1 → +23，
  所有真腿全打真 `gpt-6-sol` 与真 Redis `56379`，与 jitter 门同跑互不干扰）。
- `verify:record-encoding` exit 0，0 chargeable / 2260 files（新 CJK 注释干净）。
- census population 零漂移：只加 `src/jitter.py` + `tests/test_jitter.py`，不动 `docs/evidence/*`、
  不建 `verify:*`。2 个新文件 staged 无真 key。

## 仍欠（如实记）

1. **零生产接线**：v681 `_backoff` 仍是确定性退避；接 jitter 要定策略选择、decorrelated 的
   prev 跨 attempt 传递（改 `_backoff` 签名或 provider 存状态）、随机源（全局 vs 注入）——
   跨契约语义，需 owner 协同，别单方开大改。
2. **服务目标尚未实测**：本片证的是"抖动本身的离散度"，没有把 jitter 接进真重试/真熔断后
   实测 herd 尖峰下降（那需要接线 + 压测，属下一片）。
3. **decorrelated 首拍初值**：`prev=None` 取 base 是确定初值，但 AWS 原版的指数平滑首拍语义
   与之略有差异；属策略细节，接线时再定。
4. **`none` 与全局随机源**：生产若选 jitter 策略，`random.uniform` 是模块级全局 RNG（线程
   安全由 GIL 兜底但多进程会各自播种）；是否改注入密码学 RNG 或每实例播种未定。
5. **A/B 单次读数不宽裕**：M=64 落 16 桶，full jitter 碰撞降到 13.3%（理论期望约 9%）；
   已取 9 轮 p50 稳定，更大 M 或更多轮次的规模比例未测（只归档单次读数，不裁 1.x×）。
6. hosted Studio CI 无真 key/Redis → 真腿 skip，只跑配置门 + 离线臂（不假绿）。

## 结论

把 v681/682/683 三根容错柱共同的"无 jitter"欠账做成一个**可复用的退避抖动组件**：
区间纯函数单一真值（ADR 0095）、四种策略含零回归对照（ADR 0094 X4）、Retry-After 硬
下限 + 分散宽度、注入 rng 确定性可复现，并用**同进程 A/B 离散度**实证 64 实例的碰撞对数
从 2016 降到 269（13.3%，ADR 0105 方法论）。按 v680/ADR 0113 纪律**语义未定就先做组件 +
门 + 实证、零生产接线**，接线清单写仍欠。这是「计网 thundering herd + 概率/统计 + 同进程
A/B 方法论」的又一块集大成，补齐了三根容错柱的最后一块共同短板。
