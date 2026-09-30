-- §74 的最后一格：`awaiting_approval` 没有到期。
-- 那道门从接上写入方起就只有两种出口——有人批准、有人放弃——两者都要求**有人来点一下**。
-- 没人来点的那一行不会自己变旧：Studio 每次打开都把它当作"还等人裁决"找回来，
-- 而它对应的是一份**已经扣了几天**的设计补丁。工作区在这几天里早改过好几轮，
-- 批准按钮按下之后交回的还是当初那一版，落地时才会一句一句报"op 与当前文档不匹配"。
-- 所以这里给一个到期时间：过期即作废（fail-closed），补丁永远不落地。
--
-- 为什么另起一列而不是复用 `created_at` 或 `startedAt`：
-- - `created_at` 是"这一行被提交"的时刻。同步路径上它离挂起只有几秒，但 §162 的异步作业
--   可以在库里跑很久才挂起——拿提交时间算有效期，等于作业跑得越久用户能看的时间越短，
--   而那一短是看不见的（界面上只会突然出现一张"已过期"的卡片）。
-- - `startedAt` 在终态行上可能为 null（0000 建的那批行就是），挂起那一刻也不由它记账。
-- 挂起这个动作需要一个自己的时间戳，就像 `approved_at` 是批准动作自己的时间戳。
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "awaiting_since" timestamp with time zone;
--> statement-breakpoint
-- 回填：库里已经在等的行，唯一记过的时间就是 `created_at`。
-- 这个选择偏向哪一边要写清楚：`created_at` 只会**早于**真正的挂起时刻，
-- 所以回填出来的那些行会提前作废，不会多领一份有效期。过期是"补丁不落地"那一侧，
-- 提前过期最坏是让用户重新生成一次；反过来（少算已过时间）才会让一份真正过旧的补丁还能落地。
UPDATE "agent_tasks" SET "awaiting_since" = "created_at"
  WHERE "status" = 'awaiting_approval' AND "awaiting_since" IS NULL;
--> statement-breakpoint
-- 这一条是这张表替 `holdForApproval` 上的锁：等待态必须带着挂起时刻。
-- 没有它，将来多出一个"直接把状态写成 awaiting_approval"的写入方（迁移脚本、修数据、
-- 另一条 AI 路径）会静默地造出一批永不到期的行——那正是这一片在修的那个洞，
-- 只是修好了又能重新长回来，而且这次连测试都看不出差别。
ALTER TABLE "agent_tasks" DROP CONSTRAINT IF EXISTS "agent_tasks_awaiting_has_since";
--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_awaiting_has_since"
  CHECK ("status" <> 'awaiting_approval' OR "awaiting_since" IS NOT NULL);
--> statement-breakpoint
-- 作废走读取时收敛（ADR-0011 的口径：没有一个长驻的清扫进程），所以按项目找等待中的行
-- 已经够用；这一条是给"整个库里还有多少行在等"这类诊断查询用的，
-- 部分索引不吃任何写放大的代价（等待中的行本来就少）。
CREATE INDEX IF NOT EXISTS "agent_tasks_awaiting_since_idx"
  ON "agent_tasks" ("awaiting_since") WHERE "status" = 'awaiting_approval';
--> statement-breakpoint
COMMENT ON COLUMN "public"."agent_tasks"."awaiting_since" IS
  '这一行被挂起（状态改成 awaiting_approval）的时刻。只在 holdForApproval 那一条语句里写；
   到期时长是 @nexus/schemas 的 APPROVAL_TTL_MS，判定在 domain/agent-tasks.ts 的 approvalExpired()。
   终态行留 null 是有意的：批准/放弃之后这一列不再参与判断，把它的值抹掉反而看不出"等了多久"（§74）';
