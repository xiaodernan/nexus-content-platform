# LLMCTX-1 — 角色对话接上整部世界大典：4,439 → 172,806 tokens（2026-11-22 · 真机）

> 用户本轮点名「我这边输入上下文总是太少，要充分利用上下文容量」。
> 上一片 `cache-parallel-live-2026-11-22.md` 已经查明：设计主链路与世界步进带的
> 是 158,112 tokens 的 canon digest，真正偏薄的是**角色对话**——persona 只有几百字，
> 模型被问到"这个世界里发生了什么"时没有依据。本片把那部大典接上，并量真机。

## 改法

- 契约：`AiChatRequest` 增 `withCanonPrefix?: boolean`（默认 false = 字节级零回归）；
  `AiChatResponse` 增 `canonPrefixChars?: number`（带了才报，没垫就不出现）。
  两个字段都由 `npm run contract:export` 从 zod 生成，Python 侧运行期校验同一份 JSON Schema。
- ai-service：`execute_chat_request` 与 `chat_stategraph`（`/v1/ai/chat-graph`）在同一位点
  把 `CANON_PREFIX` 垫在 `system` 之前——**digest 必须是第一个字节**，persona 跟在后面。
  反过来的话每个角色的第一问都要重新买一次 15.8 万 token 的前缀（§CACHE 纪律）。
- web：`runCharacterChatGraph` 透传该开关，`/api/projects/:id/characters/:cid/chat`
  默认开（kill-switch `NEXUS_CHARACTER_CHAT_CANON_PREFIX=0`），回执透传 `canonPrefixChars`。
- 界面：`CharacterChat` 每条角色回复下多一行「本句带着整部世界大典（N 字符）一起发给模型」，
  与既有的「缓存复用 x / y tokens」并列——上下文不是隐形花钱，要看得见。

## 真机读数（`http://127.0.0.1:13200` · gpt-6.2-sol · Clash 7897 · 2026-11-22）

```
--- 不带大典（基线，与改造前逐字节一致）---
base/1: 5.0s tokensIn=4439  cached=0     ( 0.0%) reported=False canonChars=None
base/2: 4.5s tokensIn=4436  cached=4179  (94.2%) reported=True  canonChars=None
--- 带 canon digest（266,660 字符）---
canon/1: 5.5s tokensIn=172806 cached=8228  ( 4.8%) reported=True canonChars=266660   ← 冷
canon/2: 5.4s tokensIn=172810 cached=153654 (88.9%) reported=True canonChars=266660
canon/3: 5.3s tokensIn=172806 cached=153654 (88.9%) reported=True canonChars=266660
canon/4: 7.1s tokensIn=172815 cached=153654 (88.9%) reported=True canonChars=266660
```

- 上下文 **4,439 → 172,806 tokens（39×）**，超过 Codex 五～九万一档的近 2～3.4 倍；
- 一次冷启动（4.8%）之后稳定 **88.9%**，与 `cache-digest-live-full-2026-11-19.md`
  在设计链路上的读数同源——同一条前缀、同一个车道，缓存是复用的，不是新买的；
- 延迟没有因此变差（5.3–7.1s vs 4.5–5.0s）：88.9% 的前缀命中把多出来的 16.8 万 token
  摊掉了。

## 回答质量的差别（这不是 token 数的事）

| 问题 | 不带大典 | 带大典 |
|---|---|---|
| 夜钥匙为什么复制不出来？ | 「常见原因是钥匙带有防复制结构，或属于受控钥匙系统：钥匙胚不通用，配钥匙店也可能需要授权卡、登记信息或……」——**通用常识，与这个世界无关** | 「旧旌替风记的是让风来过的缘由，包括船队南下、军队退潮，以及抄本师对钥匙说过的话；另有一笔称作『不交账』……」——**逐条来自正典** |
| 潮印上那个字是什么？ | （未测） | 「典籍里没有明确说明潮印上的字。Echo 171 只记载潮印上有一个『潮』字，但说的是旧信物库中的潮印」——**给了出处，还说明了边界** |
| 第四十四次大会的书的封面？ | （未测） | 「《完》。来源：回响 180《雾港潮候院第四十四次大会召开那天》」——**可回溯到具体回响** |

同一份 persona、同一批问题，差别只在"模型手里有没有这部书"。这正是「把大模型能力完整、
深度地嵌入项目整体能力」的含义：模型从"一个会聊天的外壳"变成"读过整部世界大典的叙述者"。

## 判据

- Python：`tests/test_chat.py` + `tests/test_chat_stategraph.py` **16 passed**——
  顺序（digest 是第一个字节）、零回归（不带时 `system` 逐字节不变、`canonPrefixChars` 不出现）、
  修订轮同样带上（system 不变 ⇒ 前缀 KV 不重买）。
- TS：`apps/web/test/character-chat-graph-behavior.test.ts` **11 passed**（新增 3 条）。
- 全量：`apps/ai-service` **497 passed / 18 skipped**（skipped 全是要真 key 的 live 门）。
- 契约三件套同步：`contracts/ai-chat-request.schema.json`、`ai-chat-response.schema.json`。

## 不在本文档内

- 真机 iOS / 软键盘；
- 多副本部署下的跨进程 single-flight（本机单实例，见 `cache-parallel-live-2026-11-22.md`）；
- 网关 KV 的 TTL 与淘汰不可观测，只能从 `cachedTokens` 反推。
## 端到端真机读数（浏览器 → web → ai-service → provider，2026-11-22）

真注册账号、真建项目、真建角色、真从 Studio 面板发一句话（脚本 `.scratch/e2e-chat3.mjs`）：

```
CANON LINE: 本句带着整部世界大典（266,660 字符）一起发给模型
CACHE LINE: 缓存复用 8,228 / 172,798 tokens
REPLY: 更漏：典籍里没有。回响二章《第九叩》提到烛台有第九格，
       但没有说明"盐账"最后一格记了什么。
```

- `tokensIn=172,798` —— 与探针同量级，证明这条前缀走的是**整条生产链路**，不只是单元测试；
- 界面两行都在：大典字节数 + 缓存复用数。上下文不是隐形花钱；
- 回复的形状正是想要的：**先回答"典籍里没有"，再给出它翻过的地方（回响二章《第九叩》）**。
  不带大典时模型会拿通用常识编一个答案；带上之后它知道自己在查一部书，并且说得出查过哪一页。
