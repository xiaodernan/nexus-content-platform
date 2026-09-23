# ADR-0008：发布机检只升级、不认证

日期：2026-09-24 · 状态：已采纳 · 关联：§129-132、§159、`docs/SECURITY.md`「内容安全」

## 背景

`published_projects.moderation` 这一列从建库起就存在，取值 `pending / approved / rejected / flagged`，
而代码里永远写 `pending`——因为平台没有审核管线，写 `approved` 就是假状态（这一点当时就写在
`publish.ts` 的注释里）。§131 要求的是
`upload → automated moderation → risk classification → publish or human review`。

问题：我们**现在**能自动做的是确定性的两件事——可见文字过一份红线词表、看公开页引用到的图像/视频
是从哪里来的（上传/导入 vs 平台生成）。这两件事都没有模型参与，召回率未知。
而 `moderation` 这一列的语义（"审核通过了"）恰好是这种扫描最容易谎报的地方。

## 选项

1. **机检结果直接写 `approved`**，命中才改回 `pending`。省一步人工，队列也短。
2. **机检只升级、不认证**：扫描产出 `clear / review / blocked`，只有人（`role='admin'`）能把
   `moderation` 写成 `approved / rejected`；`clear` 之后 `moderation` 仍是 `pending`。
3. 干脆不加机检，等接了真实内容审核模型再做，`moderation` 继续挂 `pending`。

## 决定

选 2。三个配套约束：

- 扫描结果自带 `limits`（这一轮覆盖不到什么）与 `rulesVersion`（哪一版规则扫的），
  一路随报文发到发布面板；UI 上 `clear` 的措辞是"这次没命中规则"，不是"内容合规"。
- 被挡下的发布也立案（那次没有 publication 行，`publication_id` 允许为空）。
- `rejected` 必须真的能撤下内容：`resolvePublishedPath` 认这一列，裁决之后公开 URL 立刻 404。

同时落一条举报路径（§132）：公开页能提交举报，命中三条硬红线的类别自动挂一条待复核案并按案子去重；
举报本身不撤下内容。

## 后果

- 好处：`approved` 这个词在数据库里重新变成"有人看过"的可信信号；机检的限度变成用户能读到的文字，
  而不是只有写代码的人知道。挡下的尝试可追溯。
- 代价：绝大多数案子会长期停在 `pending`（现在还没有审核 UI，队列只能 `GET /api/admin/moderation` 读 JSON），
  所以"机检跑过"在产品上**不**等于"内容安全"——这是刻意的。
- 已知不足（都写进 `limits`，不留到将来才发现）：词表挡不住换措辞、图片内容、别的语言；
  没有图像/视频内容模型；没有版权比对；block / mute 还没有承载面（要等 M7 的关系面）。
- 顺带修掉一个隐患：admin 路由不能用 `requireUser()`——它会给无会话请求现造 guest 身份，
  于是任何人反复探测 admin 端点就能白手造出成堆用户与会话行。新增 `currentUserOrNull()` 只读不签发。
