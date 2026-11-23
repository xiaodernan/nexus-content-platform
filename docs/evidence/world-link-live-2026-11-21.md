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
E2E 补充（限流窗口恢复后的那一轮）：真浏览器先填两条有正文的条目，再点牵线。第一次触发新加的护栏但条件写错（要求候选里至少 2 条有正文，而候选已排除源条目，实际只需 1 条），界面误报「候选条目还没有正文」——这是 E2E 抓到的真 bug，已修。修完想再跑时本小时 10 次额度再次用尽（429），没有继续打，也没有伪造代理头绕过；最后一格留到下个窗口。同轮「AI 写回声」的浏览器端到端已通过（见 memory-echo evidence）。

**最后一格已补（下一个限流窗口）**：真浏览器建项目 → 建骨架 → 写概述 → 连续填「地理」「势力」两节
（各 1 条）→ 点「AI 牵线」，回执「已从『潮候院』牵出一条『老石磨记时的院落』关系，星图可见」；
`GET /api/projects/:id/world` 实读 `links[0] = { to: wn_…, label: 老石磨记时的院落 }`，零 pageerror。
脚本：`scratch/final-link2.mjs`。

