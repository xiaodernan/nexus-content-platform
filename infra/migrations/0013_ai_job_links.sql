-- §162 web 侧作业消费者：异步生成作业的真值在 ai-service 那边，但 web 的账本必须知道
-- "这一行任务对应它的哪一个 job"——否则轮询回来的状态没有地方落，收件箱也就永远等不到
-- 那条"作业真的结束了"的事件（§164 现在还把 Build complete / Agent task complete 挂在"没有来源"单子上）。
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "provider_job_id" text;
--> statement-breakpoint
-- 一个 jobId 只能被一行任务认领：两行认领同一个 job，轮询就会把同一批活动推两遍、终态写两次。
-- 带 WHERE 是因为绝大多数行这一列是 NULL（今天 /api/ai/run 那条同步路径全都是 NULL），
-- 部分索引只装真正对应异步作业的那几行。
CREATE UNIQUE INDEX IF NOT EXISTS "agent_tasks_provider_job_key"
  ON "agent_tasks" ("provider_job_id") WHERE "provider_job_id" IS NOT NULL;
--> statement-breakpoint
-- 已经翻译成实时事件的活动条数。为什么要存在库里：作业的活动列表是单调增长的，
-- 而"这一条我推过了没有"要跨请求记住——进程内存里的 Set 在一次 HTTP 之后就没了，
-- 多实例下更是各记各的（这一列就是那条限度写在 ADR-0010 的换来的东西）。
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "activity_cursor" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
COMMENT ON COLUMN "public"."agent_tasks"."provider_job_id" IS
  'ai-service 那一侧的作业号（POST /v1/ai/jobs 返回的 jobId）；NULL 表示这次是同步请求，没有异步作业可查';
--> statement-breakpoint
COMMENT ON COLUMN "public"."agent_tasks"."activity_cursor" IS
  '已翻译成 agent.step / agent.activity 实时事件的活动条数；轮询一次推进一次，不回头';
