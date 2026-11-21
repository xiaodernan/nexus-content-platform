# 世界「AI 写记忆回声」实测（2026-11-21）

新细节功能：WorldPanel 的**每条**世界条目下都有「AI 写回声」按钮，真调一次模型，写一段
≤240 字的纯感官刻痕（声音/味道/触感/光线里的一瞬），不写梗概、不评价；写入 `lore.memory`，
原有 `era`/`order` 原样保留。按钮 `title` 里有完整教学说明。

直连 ai-service 真 provider（`gpt-6.2-sol`, capability=real）实测：

```
[{"title":"盐道尽头","body":"路面向里一寸寸泛白，石缝里的细盐硌着鞋底。潮气漫来，湿冷的光贴着地面浮起，空气里有淡淡的咸味。"}]
```

`parseEchoReply` 取出 47 字正文，符合 ≤240 字上限；不是剧情梗概。

**诚实边界**：web 侧 `/api/ai/world-fill` 的 10 次/小时/IP 限流已被本轮多次 E2E 打满，
浏览器按钮的端到端点击这次拿到 429 而不是成功回执；没有伪造 `x-forwarded-for` 绕过这道门
（那等于削弱产品安全）。可用部分是：模型提示词真调用成功、纯函数验收成功、按钮接线与
类型检查通过。限流窗口恢复后可直接重跑 `.scratch/echo-e2e.mjs` 补最后一格。

验证：`world-fill` + WorldPanel 门 20/20；`apps/web` tsc exit 0。
