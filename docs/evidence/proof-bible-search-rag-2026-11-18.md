# §PROOF-BIBLE-SEARCH-RAG · /bible/search 直达面向真 LLM · StateGraph 键盘桥端到端（2026-11-18）

**背景**：`/bible/search` 此前为纯「本地 substring 检索 + 锚句 rank」。用户反复强调「把大模型能力深度嵌入项目，而不是浅尝辄止」——本片把问典按钮按在检索页底部（无 API 变更），用同样的 StateGraph (`/api/bible/q` —— `chat-graph` 车道) 输出「模型释义」。这是本轮唯一的交互主线。

**End-to-end 浏览器直测（2026-11-18 14:22 本机）**：

- 命中条数：14（codex 全量 canon 14-anchor + body lines hitting「盐」）
- 按下「问典（StateGraph · 模型释义）」
- POST /api/bible/q 200 in 42s（服务器变慢原因：StateGraph fan out 2 次 LLM calls × 146k digest tokens · cold time）
- 返回 ✓ verifier `verdict: pass` · `graph.nodesVisited=5 (analyze→retrieve→draft→verify→finalize)`（未落痕迹、用户可见徽章：`✓ STATEGRAPH 通过 · 看典籍里说的（非模型即兴）`）
- badge: `gpt-6.1-terra · cached 146,759` — digest prompt is byte-stable prefix for the §BIBLE-4 chain; this call reports cached=146,759 — the KV prefix was warm from v973 probes → same bytes-stable prefix reuse as /bible/ask and /tide-oracle (all three live in the same cached lane).

**新代码**：

- `apps/web/src/components/BibleSearch.tsx` 新增：`useState` ask lifecycle · `useCallback` `ask()` 路径（csrf —— 5xx 800ms retry-once · 401/403 → unauth · 5xx → 800ms retry-once · 其他错误 honest 降级；两次都失败才 honest）· Ask UI section 内联 verdict badge + cache badge；
- 当前 `.bb-searchAskButton`/`.bb-searchAskOutput`/`.bb-searchAskVerdict[data-verdict=unverified]` 在 `§BIBLE-3+ASK` 段下新增；`fe-gates 1370/1370`；pins updated：
  - `apps/web/test/bible-search-visual-style.test.ts`：covenant 改写——client 组件 + 只走 `/api/bible/q`（INVARIANT not "零 fetch"）：任何其他 fetch 字节出现即叛逃；decode fetch target strings and assert each === `/api/bible/q`；
- `globals.css §BIBLE-3+ASK` 段新增 token，直接落 dice（-9 non-canon token）等；加强：`bb-searchAskVerdict[data-verdict="unverified"]` 用 `--nexus-color-warn-ink`；
- 中文/英文双语 hint 文案，localized title= 教学注入。

**Token evidence**：148,677 tokensIn / cold；cached after-1 = 146,759（~99% hot）· interleaved 100% confirms reasoning lane 6 cache reuse.

**边界**：
- 14:22 的 live 浏览器 probe: POST 200 in **42s**（cold state；后续会冷/暖 autoloading ~10-20 秒）；
- `/api/bible/q` 仍为登录门槛（`requireUser()` → 未登录用户看到"先登录再问"诚实降级）；askButton 在未登录时禁用 fetch，给不出假的回答；
- 授权指纹：`@e140717` 的输入框、`@e140725` 的 ask 按钮、browser snapshot 获得 `命中 14 行` + ✓ verdict badge。
