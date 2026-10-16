-- §168 第三片：爬虫与真人区分。一行访客现场多一栏"疑似爬虫/自动化"。
--
-- 判定不在这一列上做（判定是纯函数 classifyVisit：UA 名单 + 客户端自报的
-- navigator.webdriver），这一列只存结论。为什么存结论而不是每次读时现算：
-- UA 会随版本变、名单会补——历史行按**当时的判定**读，今天改名单不改写旧账
-- （与 capped_reports 同一条纪律：被动过/被判定过的东西要留得下痕迹）。
--
-- 默认 false：存量行都是当时按老口径记的，不给它们补判（没有当时的 UA 可判）。
ALTER TABLE "publication_visits" ADD COLUMN IF NOT EXISTS "suspected_bot" boolean NOT NULL DEFAULT false;
