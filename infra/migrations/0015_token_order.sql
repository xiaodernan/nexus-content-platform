-- #40 的根因：`design_tokens` 从来没有一列记录"文档里的顺序"。
-- saveDocument 是 delete + 按文档顺序 insert，loadDocument 却是一句**没有 ORDER BY 的 SELECT**——
-- 于是同一份内容每过一轮存取，token 数组的顺序都可能按物理行序变一次。
-- 用户看到的直接后果是设计系统面板里的顺序会自己重排；更隐蔽的那一个在分支切换上：
-- `stashCurrent` 用 `documentsMatch` 比"工作区那一份"与"这一分支 head 快照那一份"，
-- 而它对数组是**按序**比的（stableKey 只对对象键排序，不重排数组）——
-- 内容没变、只是顺序换了，就被判成"有改动"，于是每次切换多出一条"切到 X 前的现场"的噪音快照。
-- 那条偶发噪音快照找了一轮没找到根因，就是因为它根本不是偶发在比较逻辑上，而是偶发在读取顺序上。
ALTER TABLE "design_tokens" ADD COLUMN IF NOT EXISTS "sort_index" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
COMMENT ON COLUMN "public"."design_tokens"."sort_index" IS
  '这份 token 表在设计文档里的位置（§16：模型是唯一真值，数组顺序也是它的一部分）。'
  '默认 0 是给历史行的兜底：那部分行没有顺序信息，读回来按 key 排；下一次保存就写上真实顺序。';
