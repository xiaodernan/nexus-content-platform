# ADR-0295 · /ship 速览注入字节稳定 canon 前缀（2026-11-19）

## 状态
已接受（2026-11-19 · cont.450 · 已实测）

## 背景

"输入上下文总是那么少"（用户反复指出）——在这里是因为 /ship 的速览只带一份 ~2K 的 git 统计
JSON，模型完全不知道这个平台在讲什么，产出是"平台持续高速发展"之类的通用话。

BibleAsk / 问典早已把全量 digest（259,309 chars · 192 回响正典 + 13 章正典 + 附录，KV 前缀复用
93.9%→100%）作为 system 前缀喂给模型。/ship 是同一个平台；没理由把模型蒙在鼓里再指望它说
出"这是个什么平台"。

## 选项

A. 保持现状（仅 git 统计），模型必然产出通用话——被用户点名的"上下文总那么少"照旧成立。
B. 在 user 里追加"这是 NEXUS 平台"一句话——不稳定前缀对 KV 不友好，且模型仍然不知道潮候院是什么。
C. 在 system 注入同一份字节稳定 canon 前缀（与 /bible/ask 完全同一份 SYSTEM_PROMPT）+ 明说
   本次速览只允许看 JSON——采用。

## 决定

C。

- `ship/digest` 的 `system` = `SYSTEM_PROMPT`（bibleAsk 导出，与 digest 车道同源、字节稳定）
    + 分隔符 + `/ship 速览纪律`（模型只允许引用 user JSON 数字；禁编里程碑）；
- `user` 仍保留 histo JSON（可变参数，天然不参与前缀复用）；
- 数字纪律不变：缺数字→502（"模型速览未落在实测数字上"）；
- DEMO MODE → 409；每 IP 5/h；24h LRU（16 槽）；纯只读不写库；
- 契约顶：system.max 320,000（cont.449 已抬）；实际 usage tokensIn ≈ 259,565——provider 侧
  实测 200 OK。

## 后果

### 变好的事
- 模型从"看 git 数字报数"升级为"带着平台世界观交付一段平台自我描述"——用户要求的
  "大模型能力完整深度的嵌入项目整体能力"在 /ship 这一格兑现；
- 前缀完全字节稳定 → KV 复用率与 digest 车道同源；
- 冷调用成本不变（与 bibleAsk 完全相同的 system，cache hit 时 ~0 额外诉消费）。

### 变差的事
- 冷调用 tokensIn 增加约 259K（这是 digest 车道的已知成本，用户明确要求大上下文）；
- 数字纪律没有放到一个字——前缀给的是身份，不是"允许编里程碑"的通行证。

### 能撤销
一行 import + join 数组改回去即撤销。

## 相关

- `apps/web/src/app/api/ship/digest/route.ts`
- `apps/web/src/lib/bibleAsk.ts`（SYSTEM_PROMPT 256K→320K 与 cont.449 契约漂移修复同族）
- ADR-0286、ADR-0290、ADR-0291（契约 drift 家族在 cont.449 根除）、ADR-0294
