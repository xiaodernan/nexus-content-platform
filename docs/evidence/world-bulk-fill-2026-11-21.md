# 世界「AI 补全空节」实测（2026-11-21）

新按钮：WorldPanel 底部「AI 补全空节」——九类里**正文为空**的节一次最多补 3 节，
每节都是真 provider 调用；title 里明说 token 代价，不静默打满九次。

E2E 抓到并修掉的两个真 bug：
1. 起初按 `counts[ kind ]` 判空节，但骨架九类各有一条空壳节点，导致按钮报"九类都已有条目"——
   改为按正文是否为空判定，抽成纯函数 `fillableKinds` 并加 2 条门。
2. 起初批量回执把"尝试了 3 节"报成"已补 3 节"，即使三次都 429——
   `fillSection` 改为返回 `Promise<boolean>`，批量只数成功数。

E2E 过程与第三个真 bug：第一次批量撞到 `/api/ai/world-fill` 的 10 次/小时 IP 限流，
三次全 429，界面如实显示"已补 0/9"，零 pageerror；没有伪造代理头绕过。
窗口恢复后重跑，回执"已补 3/9"，但 API 实读只有 1 条 body——`fillSection` 闭包持有
点击那一刻的旧 `world`，三次写入互相覆盖。改为每次从 `worldStore.getSnapshot().world`
取最新文档后再跑：节点 9→12，正文非空的条目 3 条，分属 lore/history/geography，
零 pageerror。脚本 `scratch/bulk-e2e.mjs`。

验证：world-fill + WorldPanel 门 27/27；`apps/web` tsc exit 0；record-encoding 全绿。
