# 世界「AI 牵线」实测（2026-11-21）

新功能：WorldPanel 每条条目下加「AI 牵线」按钮，真调一次模型，从**这个世界已有的条目**里
挑一个目标并写出具体关系名；结果走 `linkWorldNodes` 落库，星图/编年的连线随之变密。

安全/诚实边界：
- 候选 id 由服务端下发，模型只能原样挑一个；自造 id 被纯函数 `parseLinkReply` 丢弃；
- 自环、重复边由 `linkWorldNodes` 挡掉并把原因显示给用户，不静默；
- 模型判断两条正文之间没有关系时输出空 toId，界面照实说没拿到可用条目，不硬连。

直连 ai-service 真 provider（`gpt-6.2-sol`, capability=real）实测回话：

```
{"toId":"wn_1","label":"盐道尽头通向老石磨"}
```

目标 id 在候选表内，`parseLinkReply` 原样取回 `{toId:'wn_1', label:'盐道尽头通向老石磨'}`。

验证：`world-fill` + WorldPanel 门 23/23；`apps/web` tsc exit 0；record-encoding 全绿。
web 按钮端到端仍受本轮 10 次/小时限流影响（同记忆回声那篇的诚实说明），未伪造代理头绕过。
