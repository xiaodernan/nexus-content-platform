# 回响（其三十二）《潮的名字》上线 · evidence（2026-11-19 · cont.249）

> 每当潮汐起来，潮的名字先出现在纸上；潮退的时候，那一张纸不见了。

## 内容

- `docs/world-bible/echoes/E32-潮的名字.md` / `.en.md` — 回响其三十二
- 纪元：潮上之夜 · 潮到下次退之前
- 5 组锚句 zh/en 全局唯一 · verify:world-bible **422 zh / 422 en 全绿**
- 故事：潮起之夜，纸先写出了「潮」字 —— 当潮落时，这张字纸不见了。守灯人揉成一团纸丢进潮纸篓。谁说过为什么潮要有名字
- 更深一层：潮的名字既没被问过；时刻表上却总写出了它。纸篓里每一张纸都是一个潮字

## 技术

- canon digest regenerated：**chars=63,012 · sha256=8a4a137d…**
- /bible 页脚 三十二/XXXII · guideCopy 同步 · quiz 92→**94**（zh/en 镜像 +2 题 E32）
- BibleQuiz / bible page SHA 重钉（`507b0ce8…` / `493b5153…`）
- fe-gates 147/147 · 1353/1353 · build 绿
- SSR 实锤 /bible /echo-032-the-name-of-the-tide 200 · /tide-oracle /tide-wire 全 200

## 独家硬核：Tide-Oracle 缓存命中基准报告

- 同一问题（Tide-Oracle 请求）：
  - call-1（首发）： 3.95s · cached=2,236/46,971 (4.8%) · reported=True
  - call-2（同问题同前缀）：**0.07s · cached=46,971/46,971 (100.0%) · reported=True**
  - call-3（同问题同前缀）：**0.05s · cached=46,971/46,971 (100.0%) · reported=True**

混合 KV 前缀 + Redis 完成缓存 `shared:true · degraded:false · 已验证 replay 真生效`。
