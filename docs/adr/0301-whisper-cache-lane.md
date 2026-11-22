# ADR-0301 · 答问者玩法接入会话级缓存车道（2026-11-21）

## 状态

已接受（2026-11-21）

## 背景

`/bible/whisper`（答问者）是一个真正接了 gpt-6.2-sol 的正典问答玩法：读者选一卷
正典、问一句，模型只依据该卷摘录回答。它承诺「零记忆」——不落库、不记住任何用户。

排查发现它调 `chatWithCharacter` 时**没有传 `cacheLane`**（ADR 0296 已把该字段加进
`AiChatRequest` 契约并透传）。后果：多个读者同时问同一卷时，system 虽字节稳定，
却都落到 provider 的默认 sticky lane，彼此把对方的前缀挤出——正是用户反复反馈的
「并行会话互冲缓存、中途掉缓存」。角色对话主链路已修，但这个玩法漏了。

## 选项

A. 按用户/IP 派生 lane。否——答问者明确承诺零记忆，那等于偷偷制造它否认的用户态。
B. 按 (卷 slug, 语言) 派生稳定 lane。采用。
C. 不修（玩法小）。否——用户要求「把缓存基本措施做好」，这是同一根因的遗漏点。

## 决定

1. `whisperCanon.ts` 新增 `whisperCacheLane(slug, locale)`：FNV-1a 确定性哈希，输出
   `whisper-<locale>-<8位hex>`；只是路由提示，不写任何存储、不进 completion cache key。
2. route 传入 `cacheLane`。语义：同一卷同语言共用一条车道（system 逐字节相同 → 前缀复用），
   不同卷/语言各自一条（互不挤出）；同一问题连问两次只有 requestId 变，system/user/lane 恒定——零记忆承诺不被破坏。
3. 新增 `apps/web/test/bible-whisper-cache-lane.test.ts`：车道稳定/分区、system 字节稳定、
   真 route 透传车道、问题只在 user（不污染 system）、零记忆连问两轮不变量。4/4 通过。

## 门禁（实测）

- `NODE_OPTIONS= npx vitest run --root apps/web --no-file-parallelism test/bible-whisper-cache-lane.test.ts` → **4/4 passed**。
- `tsc -p apps/web/tsconfig.json --noEmit` → exit 0。

## 后果

### 变好的事

- 答问者玩法不再参与并行会话的缓存互冲；同一卷的并发问答共享稳定前缀。
- 零记忆承诺保持：车道按卷不按人，无用户态泄漏。

### 边界

- 未做真机多会话交错实测（本轮只到单元/route 门 + 类型检查）；provider 前缀收益依据
  与 ADR 0296 同构，但本玩法自己的 live 交错读数没有单独测，未冒充已测。
- 仍用 `canonPrelude` 全量大典当背景（该玩法只答单章摘录）——这是既有设计，本增量不为
  此改前缀形状（会牵动大量静态门），记为后续可优化项。

## 相关

- ADR 0296（会话级 prompt cache lane，本增量复用其契约）
- `apps/web/src/server/domain/whisperCanon.ts`、`apps/web/src/app/api/bible/whisper/route.ts`
- `apps/web/test/bible-whisper-cache-lane.test.ts`
