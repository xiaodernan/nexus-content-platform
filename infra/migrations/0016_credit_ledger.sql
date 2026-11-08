-- §134 CREDIT SYSTEM：用户看得到 AI / Image / Video / Compute 四类额度，且"所有消费透明"。
--
-- 为什么只有一张账本、没有"余额"这一列：余额一旦存成一份可写的数，就有了第二份真值
-- （发放、扣减、退款任何一处忘了同步，界面上就是一个谁也解释不了的数）。
-- 余额 = SUM(delta) 是派生出来的，跟快照/搜索那几处"能派生就不存储"是同一条纪律。
--
-- 为什么不做充值入口：§133 写的是订阅档位，§134 写的是"看得到 + 消费透明"，
-- 两样都没要求接支付。接一个假支付或"点一下就加 1000 额度"的按钮就是 §159 禁止的那种假。
-- 所以这一版的额度只有一个来源：档位按月发放（plan_grant）。要改余额得由服务端代码调
-- adjust（source='adjust'，reason 必填），今天没有任何 HTTP 入口通向它。
CREATE TABLE IF NOT EXISTS "credit_ledger" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  -- §134 原文点名的四类，一类不多一类不少。compute 今天没有任何消耗方，
  -- 界面上会照实写"这一类只有发放、没有扣减来源"，不拿 CPU 时间编一个数
  "kind" text NOT NULL,
  -- 正数=发放，负数=消费。余额就是这个人和这一类的 SUM(delta)
  "delta" integer NOT NULL,
  -- 人读的一句话，且必须能追到一件事：有 task_id 的行写的是"哪一次生成"，
  -- 发放行写的是"哪个月、哪个档位"。空话（"系统调整"）在这张表里没有位置
  "reason" text NOT NULL,
  "source" text NOT NULL,
  -- 一次 AI 任务对应一行消费；发放行与手工调整行是 NULL
  "task_id" uuid,
  "project_id" uuid,
  -- 发放行的幂等键（'2026-09'）。消费行留 NULL：同一秒跑两次生成是两件事，不该合并
  "period" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
-- 账号注销之后这笔账没有归属者了：留一行指向不存在的人，余额页会显示一个查不到的人的流水
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE no action;
--> statement-breakpoint
-- 任务行是"这件事发生过"的证据，但账要留：任务被清理时把指针摘掉，别把流水一起带走
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_task_id_agent_tasks_id_fk"
  FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_kind" CHECK ("kind" IN ('ai', 'image', 'video', 'compute'));
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_source"
  CHECK ("source" IN ('plan_grant', 'generation', 'adjust'));
--> statement-breakpoint
-- delta=0 的一行会出现在流水里、却对余额毫无影响——那种行是 bug 的现场，不是账
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_delta_nonzero" CHECK ("delta" <> 0);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_reason_not_empty" CHECK (length(btrim("reason")) > 0);
--> statement-breakpoint
-- 消费行必须是指着一次真任务的负数；发放行必须带着月份。这条检查让"写了一行说不清来源的账"
-- 在库里就写不进去，而不是只写在注释里。
-- 为什么 generation 这一支不写 `"task_id" IS NOT NULL`：任务行可以被清理（上面那条外键是 SET NULL，
-- 意图就是"事没了、账留下"），而表级 CHECK 分不清"插入时就没指针"与"后来被摘掉"。
-- 插入时的那一半由下面的触发器管（它看得见 TG_OP）。
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_source_shape" CHECK (
  ("source" = 'plan_grant' AND "period" IS NOT NULL AND "delta" > 0)
  OR ("source" = 'generation' AND "delta" < 0)
  OR ("source" = 'adjust')
);
--> statement-breakpoint
-- 一次任务的一类产品只扣一次：finishTask 有同步与异步轮询两条路都会走，
-- 没有这条唯一索引的话，同一次生成可以在账上出现两次
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_task_kind_key"
  ON "credit_ledger" USING btree ("task_id", "kind") WHERE "task_id" IS NOT NULL;
--> statement-breakpoint
-- 同一档位同一月同一类只发一次：发放是"看账时确保本月已发"的幂等动作，
-- 打开页面二十次不该发二十份额度
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_grant_once_key"
  ON "credit_ledger" USING btree ("user_id", "kind", "period") WHERE "source" = 'plan_grant';
--> statement-breakpoint
-- 看账的主查询就是"这个人最近的流水"
CREATE INDEX IF NOT EXISTS "credit_ledger_user_idx"
  ON "credit_ledger" USING btree ("user_id", "created_at" DESC);
--> statement-breakpoint
-- 流水只追加。改一行余额就跟着变，而"谁在什么时候改过谁的额度"这件事不能只靠代码自觉：
-- 这一条触发器把**直接**打在 credit_ledger 上的 UPDATE / DELETE 挡在库里，
-- 退款与更正一律是**新写一行**（source='adjust'）。触发器对表 owner 同样生效，
-- 所以这不是"只挡住忘记的人"那种装饰性检查。
--
-- 两件事要分清，不然这条规则会把库自己锁死：
-- 1. 引用完整性动作放行。删掉一行 agent_tasks 时，Postgres 必须把它在账本里指着的 task_id 置空
--    （外键是 SET NULL）；删掉一个账号时，这个人的账要跟着走（user_id 是 CASCADE）。
--    这类调用只会从**别的表**上的一条语句里发生：pg_trigger_depth() 在本机实测
--    直接 UPDATE = 1、外键动作 = 2。放行条件写死成"除了两个外键指针，其余各列一模一样"，
--    所以哪天有人从别处级联出一条改点数的语句，它照样会被挡下。
-- 2. 插入这一行时才要求"generation 必须指着一次真任务"——那半句表级 CHECK 分不清"就没写"
--    与"后来被摘掉"，只能看 TG_OP。
CREATE OR REPLACE FUNCTION "nexus_credit_ledger_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'generation' AND NEW.task_id IS NULL THEN
      RAISE EXCEPTION '一行 generation 的账必须指着一次真任务（task_id）：说不清是哪次生成的消费就不记';
    END IF;
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    IF (NEW.id, NEW.user_id, NEW.kind, NEW.delta, NEW.reason, NEW.source, NEW.period, NEW.created_at)
         IS NOT DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.kind, OLD.delta, OLD.reason, OLD.source, OLD.period, OLD.created_at)
       AND (NEW.task_id IS NULL OR NEW.task_id = OLD.task_id)
       AND (NEW.project_id IS NULL OR NEW.project_id = OLD.project_id)
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'credit_ledger 是只追加的账本：% 不允许（更正请新写一行 source=adjust）', TG_OP
    USING HINT = '只有从别的表派生出来的外键动作可以置空 task_id / project_id';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "credit_ledger_append_only" ON "credit_ledger";
--> statement-breakpoint
CREATE TRIGGER "credit_ledger_append_only"
  BEFORE INSERT OR UPDATE OR DELETE ON "credit_ledger"
  FOR EACH ROW EXECUTE FUNCTION "nexus_credit_ledger_append_only"();
--> statement-breakpoint
-- §133 的五档。上限（AI / 存储 / 生成 / 团队协作 / 发布）先记在代码里的 PLANS 表：
-- 今天没有改档位的界面，存进库就等于多一份没人写的真值。
-- 这一列只是"这个人属于哪一档"，档位给多少额度由 PLANS 决定。
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" text NOT NULL DEFAULT 'free';
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan"
  CHECK ("plan" IN ('free', 'pro', 'creator', 'studio', 'enterprise'));
