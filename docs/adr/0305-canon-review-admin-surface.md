# ADR-0305 · 正典评审从脚本变成管理员功能（2026-11-22）

## 状态

已接受（2026-11-22）

## 背景

`scripts/canon-review.mts` 能把一篇候选回响交给 gpt-6.2-sol，对照紧凑索引与全部既有锚句，
逐条挑出疑似新专名、设定冲突、锚句撞句。但它是开发者脚本——只有会跑 `npx tsx` 的人能用，
写新回响的人自己拿不到这把尺子。

用户的核心要求是「把大模型能力完整、深度地嵌进项目整体能力，而不是浅尝辄止」。一个只存在
于 scripts/ 里的评审器，是工具，不是产品能力。

## 选项

A. 保持脚本。否——用户要的是产品内的能力。
B. 把脚本逻辑复制进 API 路由。否——提示词构造与索引拼装会变成两份，必然漂移。
C. 抽成 domain 纯函数 + API 路由 + 管理台页面。采用。

## 决定

1. `apps/web/src/server/domain/canonReview.ts`（纯函数，可测）：
   - `REVIEW_SYSTEM` / `CANON_INDEX` / `ALL_ANCHORS`（模块级常量，正典静态只算一次）；
   - `extractCandidateAnchors()` / `buildReviewPrompt(candidate, kind)`；
   - `MAX_CANDIDATE_CHARS = 24_000`（一篇回响 3–6KB，超限说明贴错了整卷）。
   索引与锚句来自 `@/world-bible/generated` 与 `anchors.generated`，**不读文件系统**——
   与 `/bible/ask` 共用同一份真值。
2. `POST /api/admin/canon/review`：`role=admin` 才可；限流 10 次/10 分钟/管理员
   （每次要带全部既有锚句，不设闸等于给 provider 账单开无底洞）；走 `chatWithCharacter`，
   `modelClass: 'reasoning'`，`cacheLane: 'canon-review'`（同批稿子复用前缀）。
3. `/admin/canon-review` 页面 + `CanonReviewPanel`（client）：贴文本、选 echo/chapter、
   提交、只读显示结果与用量。**没有接受/拒绝按钮**——评审不改写、不写正典、不落库。
4. 管理台索引页与 `AdminNav` 各加一张卡/一个入口（第 14 卡 / 第 19 项）。

## 门禁（实测）

- `test/canon-review.test.ts` → **10/10**：索引覆盖全部章节与回响且不含锚句正文；锚句逐条在场；
  候选锚句提取；echo 版只问 A–D、chapter 版多问 E/F；system 明说「疑似不是定罪」；
  面板每个 `cr-*` 类在 globals.css 有定义；zh/en 键集合相等；data 钩子齐全；代码（剥注释）无接受/拒绝动作。
- `test/admin-home-style.test.ts` + `test/canon-review.test.ts` → **20/20**（登记第 14 卡）。
- `test/admin-hub-visual-style.test.ts` → **15/15**（登记第 19 导航项 + 重钉两个 SHA 基准）。
- `tsc -p apps/web --noEmit` → exit 0。

## 后果

### 变好的事

- 写新回响的人自己就能在发布前过一遍与脚本完全相同的尺子，不必找开发者。
- 提示词只有一份（domain），脚本与产品不会再各写一套。

### 边界

- **提示词与模型链路已真机验证**：对 E215《潮候院抄本院有人从页边取走了一张》跑同一套提示词
  （脚本入口，domain 与产品共用），`gpt-6.2-sol` 返回结构化评审——A 无明确疑似新专名、
  B 未见可据索引判定的冲突、C 指出一条与既有锚句「纸条越写越短，没有人让它更长」主题相近
  但非逐字撞句、D「可按现状通过」；`tokensIn=24348 / tokensOut=361`。
- **HTTP 路由层有行为门**（`test/canon-review-route.test.ts`，进程内真 route + mock 三接缝
  session/provider/rate-limiter）：未登录 401、非 admin 403、合法 200 且 system/user/modelClass/
  cacheLane 正确透传、太短 400、超上限 400、kind 白名单 400、provider 不可用 503 如实回、
  第 11 次 429。**仍未起真服务器 + 真 admin 会话做端到端**——不冒充已测。
- 评审质量取决于模型；「疑似新专名」永远是疑似（索引不含正文），这是设计而非缺陷。
- 每次评审约 24K tokens（全部既有锚句），故限流 10 次/10 分钟；管理员手动触发，不自动跑。

### 顺带修掉的脚本缺陷

`scripts/canon-review.mts` 用 `@/world-bible/anchors.generated` 别名，但从仓库根目录跑时
根 tsconfig 没有该别名 → `ERR_MODULE_NOT_FOUND`，脚本根本起不来（真机验证时撞到）。
已改为相对路径 `../apps/web/src/world-bible/anchors.generated`。

## 相关

- `apps/web/src/server/domain/canonReview.ts`、`apps/web/src/app/api/admin/canon/review/route.ts`
- `apps/web/src/app/admin/canon-review/{page,CanonReviewPanel}.tsx`
- `scripts/canon-review.mts`（同一套提示词的原型）
- ADR-0296（cacheLane 契约）、ADR-0300（gpt-6.2-sol 默认模型）
