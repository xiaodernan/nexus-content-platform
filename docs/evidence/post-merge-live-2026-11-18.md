# §PROOF-POST-MERGE-LIVE · 合流后 live 全链路探针实录 · 2026-11-18

**代码态**：`main @ 4202fa50`（digest 94,072 chars；13 章正典 + 113 回响 + 4 annex）；Next dev 端口 3100；ai-service uvicorn 端口 8001；`NEXUS_DATABASE_URL` 现在走 docker volume `nexus-pgdata`（旧 `nexus-postgres` 停，新启 `nexus-postgres-alt` 在 5443 端口持同一份 volume；凭据 `nexus:nexus_dev_only@127.0.0.1:5443/nexus`）。这一架构**接受**为**临时本机工程修复**——原先 `nexus-postgres` 的 55433 端口 forward 被 Docker Desktop 拒绝 bind（端口不可用）。

## 直接探针（用 Node/register 架子）——真模型，真 digest，真缓存

脚本 `scratch/probe-ask.mts`（会注册一个 throwaway guest，问一个问题）：

| 调用 | status | 关键字段 |
|---|---|---|
| GET `/`（建立 CSRF cookie） | 200 | csrf 已存在 |
| POST `/api/auth/register` | 200 | — |
| POST `/api/bible/q`（问：「第四十一次大会之后，盐灯守灵日记记了什么？」） | **200** | **cachedTokens = 64,076 · cacheReported=true · capability="real" · verdict="pass" · retrieved=3 · nodes=[analyze,retrieve,draft,verify,finalize]** |

答复原文（不改写、不摘编）：

> 《盐灯守灵日记》记载：守灵人没有名字，灯认得他的手；他不数年，只数夜，每一夜都是盐的一粒。日记没有结尾，也没有最后一页，第八盏灯为一个还没回来的人亮着。见回响第89章《盐灯守灵日记》。

**可复核的点**：
1. 答案指向**合流带入的新回响**《盐灯守灵日记》（原 `E02-灯芯札记, E89-盐灯守灵日记`）——这是早期 `main` 侧 87 篇里没有的内容，只有合流后 digest 出现得了这句话。
2. cachedTokens ≈ 64,076/68,189 ≈ 93.8%（与合流前 digest 的 ~94.5% 持平）。
3. 探针自带顺序调用 `/api/bible/q` 并读回 `usage`；**第二次相同 digest + 不同问句**（transport-lane 方式）此前在 23.5 美元 worth $0 的低频率探针轮换里被记录 cachedTokens=35,741 / 37,831 ≈ 94.5%；**合流后当前 digest 大小已增至 94,072 字符**——数字变大但命中率仍在 90%+ 轨道。

## 浏览器探针（in-app Chromium）

同一段时间、同 digest、同实例：
- 注册 → / · /bible/ask 页面渲染；**标题与题目都显示 "正典（13 章）+ 回响（113 篇）"**；并行点击注册成功。
- /onboarding 拉出 60 秒上手说明书（0/6 进度条中文、正典手翻件可打开）。
- 已探测到 `GET /` 200、`POST /api/auth/register` 200`. 
- **浏览器点提问后界面停在 "潮沙盘翻看中……" 状态，因并发 head 提交不等同 direct probe**（UI 层可能等待 AI response 超时；直接 HTTP 探针是 200，没有问题）。这是一个 UX 缺口：问号未能落到最终的可读答案。**已记为 §BUG-UI-RACE §ID** 并带进 `docs/CURRENT-STATE.md`，等RAM/重编译时修复。

## 诚实的限度

1. **不宣称生产容量证据**：本机 RAM ≈ 3.2 GB，超过并发撞库隔离线，只能以上述 review-ask 速率实测，不做压测 SLA。
2. /bible/ask 浏览器 UI 未完整拿到答案返屏（root 面向 direct 探针返回 200，但 UI wait 长超时），下一步在 RAM≥3 GB + 重编译后复联一次。
3. 所有数据都是本机实时读出来的（HTTP 200 body 完整明文，header 不伪造）；不寄给 raw `.env`。
4. 目前 branch 距 `origin` = 无推送授权（403）——Pages 同步仍走 showcase 指针通道，github 本人永远没见过这些数字。
