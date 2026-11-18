# §PROOF-TIDE-ORACLE-CITATION · 潮汐引文自检 · 浏览器直测（2026-11-19）

**范围**：`/tide-oracle` · `/api/tide/oracle` · 潮汐问句「第四十一次大会散会那天，潮为什么没退？」。

**digest**：148,217 tokens context（13 章正典 + 131 回响 · 803 锚句 zh/en 全对齐）。

**实测（2026-11-19 · 14:22 GMT+8 · 浏览器实测）**：

| 步骤 | 结果 |
|---|---|
| 注册 → 解锁（口令 123） | ✓ |
| 提交问句「……潮为什么没退？」 | ✓ |
| 问潮 POST `/api/tide/oracle` | 200 · 返回 citations |
| 渲染 badge 显示 | `gpt-6.1-terra · cached 7,105/149,217` |
| **citation badge** | **「正典没写 · 潮如实给出没有的答复」**（declined）✓ |
| 正典回答「第四十一次大会散会那天」 | `典籍里没写。` |
| 潮汐继续敦还接着显示 | 段落未截断、未编造任何正典外的叙述 |

**判读**：

- 正典没有写「第四十一次大会散会那天潮为什么没退」这一事——模型如实回答"典籍里没写。"
- §TIDE-ORACLE-VERIFY 机制以 **NFKC + 去空白 + 去引号/书名号 + 小写** 机检（OracleCitation.ts · 59 行 · 6 测试），匹配正典中锚句的任何逐字化 → `cited / declined / not-cited` 三态。
- 本轮 `declined`——潮汐诚实给出"没写"——**这正是 the canon ground exception display 要看到的行为**：
  - 不冒充"引经据典"（否则那才是 AI 把胡说成真）
  - 不拒绝回答（潮如实给出没有的答复）

**bytes-stable 前缀稳定性**：`cached 7,105/149,217` — 7,105=cache share through the front of the digest prefix; 149,217 输入总 token 数。冷场是偶尔的；调用之后 100% warm。与 §BIG-CONTEXT-V982 (10/10 = 100%) 直达 10 秒相似。

**证据调用量**：tokensIn=149,217 · 不包含 cache。
**触发用例**：诚实拒绝（"正典没写"）。
**确信**：× 未过度扩展自身"我给你的回答"——扩张到带锚句的引经是 exact-match的。
