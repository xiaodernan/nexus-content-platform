# ADR-0047：`downloadCount` 只有一个写入方——"下载（N）"从此就是"成功交付了几次"

- 状态：已采纳（§127 那一格从「只记数不交付」变成「记的就是交付」，界面上那句「交付还没接」也一起改掉）
- 日期：2026-10-21
- 关联：§127-128、§144、ADR-0024（导出 ZIP 的归属门与头部写法，本 ADR 复用不重定义）、ADR-0025（账号注销：审计与账本留行的那一格）、§159（不许假发布）、`docs/ROADMAP.md` 的 M7 一节

## 背景

#120 把交付接上之后，仓库里同时存在两道门：

- `GET /api/marketplace/[id]/content` —— 真交付（走 §144 的 `buildProjectExport` 拿 zip 字节）
- `POST /api/marketplace/[id]/download` —— 只 `incrementDownloadCount`，一个字节的包都不给

后者的调用方在界面换成前者之后就没了（`grep` 全站零引用），但它还活着，而且和交付门写的是**同一个数字**。
于是这个数不再等于任何一件真实发生过的事：一条 curl 循环就能把「下载（N）」灌成任意大，
而一次内容交付都没发生——正是 §159 禁止的那种"假发布"，只不过造假者是买家而不是平台。

同一批还量到三个洞，每一个都能用一条请求验证（不是推测）：

1. **买家永远拿不到包。** 建包传的是 `user?.id ?? creatorId`，而 §144 的归属门（ADR-0024）判的是
   "这个项目在谁名下"。买家扣了 credits、`hasPurchased` 为真、走到建包那一步照样 404。
2. **中文标题的条目每次交付都 500。** HTTP 头的值是 ByteString（latin1），把中文标题直接塞进
   `Content-Disposition: filename="…"` 会在 `new NextResponse(…)` 构造时抛 `TypeError`。
   平台上标题几乎必是中文，所以这条在集成测试之前就一直红着，只是没人打到那条路径。
3. **计数写在交付之前。** 先 `+1` 再建包，那么"没有源项目""源项目已删除""导出抛错"这三条失败路径
   照样让数字变大——界面上那个数印的是"没人拿到过东西的交付"。

另外两个形状问题：`id` 不是 uuid 时 `eq(marketplace_items.id, …)` 撞 22P02 翻成 500
（`domain/ids.ts` 记的同一口径，update/delete 两道门早已按 404 处理，这道门漏了）；
以及这道门匿名可下免费物品，却没有任何限流。

## 选项

1. **保留 `POST /download`，让它变成"意图"计数，界面显示两个数。**
   拒绝：买家点一次按钮就产生两条（一次意图 + 一次交付），两个数迟早对不上，而"哪个是真的"又要靠文案解释。
   §127 要的是可信的数字，不是多一个数字。
2. **把 `downloadCount` 改成从 `marketplace_audit` 的 download 行数派生。**
   拒绝：审计表的 `actor_id` 是非空列，匿名下载那一批压根没有行；派生出来的数会系统性少计，
   而这个字段是写进列表投影里的读数，改口径等于再引入一层"这个数字统计谁"的解释成本。
   计数留在 `marketplace_items` 上，代价是它的含义必须由代码结构保证（见决定第 1 条）。
3. **采纳：删掉第二道门，交付门成为唯一写入方，并把"交付"这件事的顺序与失败路径钉死。**

## 决定

- **结构上只允许一个写入方。** `incrementDownloadCount` 的调用点在生产的源文件里只出现两处：
  `app/api/marketplace/[id]/content/route.ts`（唯一的 HTTP 写入路径）与 `server/domain/marketplace.ts`（定义处）。
  这条不是靠注释维持的：`marketplace-content.integration.test.ts` 有一条普查断言，
  遍历 `apps/web/src` 下非 `*.test|spec` 的文件数这个调用，多一处就红；同文件另有一条断言
  `existsSync('api/marketplace/[id]/download/route.ts') === false`。测试文件里的调用被排除，
  因为域单测直接调这个函数证明的是函数本身，不构成"界面上的数"的第二条路。
- **计数跟着交付走，顺序是：门 → 建包 → 做成能发出去的响应 → 写计数与审计 → 返回。**
  最后两步放在响应构造之后，是因为第 2 条洞就是"响应头构造失败"造成的——那种情况下手上虽然有字节，
  但没人可能拿到它，写一条交付记录就是假话。
- **建包永远以创作者身份走 §144**（`item.creatorId`）。买家的授权来自购买判定，不来自项目归属；
  把两者混成一个，等价于宣布"市场里买到的东西只有作者自己能下载"。
- **头部口径与 §144 导出门同一写法**：`filename` 只放 ASCII（去不掉就落到 `nexus-marketplace.zip`），
  原始标题走 RFC 5987 的 `filename*=UTF-8''…`；体走 `Buffer.from`（`Uint8Array.buffer` 可能共享）。
  两个门不许给两套规则——第 2 条洞在导出门早已修过，交付门是抄漏了。
- **限流按"条目 + IP"，一小时 `MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR = 60`**，门开在读库之前。
  常量导出在 domain 层，`page.tsx` 的 `data-marketplace-limits` 那句披露读的是同一个常量，
  不手写数字（§164 那片"披露面走样"立的同一律）。
- **匿名下载免费物品不留审计行**，这是**披露的限度**而不是待补的洞：`actor_id` 非空，没有身份可记。
  风控看到的 download 审计因此只覆盖有身份的那些次，界面上那句话明说了。
- **非 uuid 的 id 在读库前按 404 处理**，与 `domain/ids.ts` 记的那条横切纪律同一口径（`updateMarketplaceItem`
  与 `deleteMarketplaceItem` 已经在域函数里挡，缺的是 `getMarketplaceItem` 这条读路径——所以这一片的门挡在
  路由层，是临时位置，收口应该回域层，记为 #147）；不存在与已下架给同一个答案，
  403 会泄露"这个 id 存在但你看不到"。

## 后果

- **正面**：`下载（0）` 与 `下载（1）` 现在是同一条断言的两半——e2e `@smoke §127` 里一条**不挂**来源项目
  的条目报 `该物品没有可导出的源项目` 且数字停在 0，另一条**挂上**来源项目的条目在真浏览器里收到一个
  zip（前两字节 `PK`）、消息是 `包已交付（设计文档 + 代码）。`、数字走到 1。只留一半的话任何一边写错都能自洽。
- **见证的成本**：`apps/web/test/marketplace-content.integration.test.ts` 14 条（匿名免费、头部消毒、
  下架/非 uuid 的 404、付费的 401/403、买后成功、作者自下、`no_source`、源项目软删、限流 60 满额后 429、
  401 也吃配额而换一个 IP 不受影响、上面那两条结构断言），基线 14/14 绿。
  **这份凭证差点自己塌过一次**：`beforeAll` 装配两个身份 + 两整份文档 + 六个条目 + 一次软删，
  机器忙的时候撞上默认 30s 的 hook 超时——而 hook 超时不取消那段异步工作，它继续在后台插行，
  `afterAll` 的清理正好撞在插到一半的 `projects` 外键上（23503），14 条全部 skipped、报文里看不出交付门坏没坏。
  现在两个 hook 各写自己的时限（120s / 60s），装配失败就不做清理。**"套件红了"与"套件没跑"是两件事**，
  后者要用时限挡在前面。
  四只变异臂各自把一条律改坏，跑完都回到字节相同的原文件（还原后 sha256 逐次为 `5d8f653b5740ffac`），
  **红了多少条是从输出里读的，不是先想的**：
  `count_before_build`（把计数挪回建包之前）**7 failed**——凡是"成功一次数才动一次"的读数全部多算，
  连免费/购买/自下那三条正对照也一起红，说明这条律不是只管失败路径；
  `export_as_downloader`（用下载者身份建包）**2 failed**，第一条断言就是
  「买过的人拿不到包，交付这一格就没存在过：expected 404 to be 200」；
  `no_limiter`（摘掉限流）**2 failed**（那两条洪水用例）；
  `raw_title_header`（中文标题原样进 `filename`）**5 failed**——所有能真交付的路径全崩在构造响应那一步。
  第 1、2、3 号洞从此不可复发。
- **买家的钱与包终于对上**：购买 → 下载成功 → 一条 `metadata.isCreator=false` 的审计，这条链以前是断的。
- **欠账（本 ADR 明确留下，不在这一片偷偷补）**：
  1. 交付的是 design + code 两档，**资产字节没进去**——那需要开作者名下的私有素材读路径，买家未必要得到，是另一片。
  2. 市场其余**读路径**同样没挡形状：详情 GET 与 `preview` 走的是同一条 `getMarketplaceItem`
     （实测 `GET /api/marketplace/not-a-uuid/preview` 现在回 **500 空报文**，而且匿名可达——卡片上的 `<img>` 就会打到），
     `purchaseMarketplaceItem` 里的 `eq(id, …)` 也没守卫。`PATCH`/`DELETE` 因为在
     `updateMarketplaceItem` / `deleteMarketplaceItem` 里已经挡过，回的是 400（"不存在"却报成正文错误，也不干净）。
     这一片只给自己那道门负责，因为它是唯一会写用户可见数字的门；收口应该回域层并接进
     `id-shape.integration.test.ts` 那条横切纪律，记为 #147。
  3. `MarketplaceItemRow` 的下载走 `URL.createObjectURL` + 延迟 60s 回收（与 `ExportPanel` 同一寸）；
     同期发现 `apps/web/src/studio/GameCodeExport.tsx:50-58` 在 click 之后**立即**回收对象 URL，
     疑似拿到 0 字节文件。那是另一条链的界面，需要自己的见证，不在这里顺手改。

## 2026-10-21 补记（#147）：欠账 2 已还——形状门收进域层，路由那道临时门删掉

同一天的第二片，落到域层而不是三条路由各抄一遍：

- `getMarketplaceItem` 形状不对 → `null`（详情 GET、预览图、交付三条读路共用这一处）；
  `hasPurchased` → `false`；`incrementDownloadCount` → `0`（没有行被 +1）；
  `purchaseMarketplaceItem` → 与"不存在或已下架"**同一句** throw（路由照旧翻成 404，不新造一句）。
- 交付门里那道临时 `isUuid` 与它的 import 一并删掉：`getMarketplaceItem` 返回 null 之后，
  下面那句 `if (!item) return 404` 已经把形状不对的 id 和其它"没有"收进同一个答案。
- 见证补进 `id-shape.integration.test.ts`（第十个家族，18 → 27 条）：**修前先跑，7 条红**——
  四个域助手与详情 GET、预览 GET 各以 `PostgresError 22P02` 失败，购买 POST 断言 `expected 500 to be 404`；
  修后 27/27 绿，市场七套件回归 87/87 绿。正对照钉住"真条目照旧读得到、买得成（价格 0 不写扣点流水，
  买家因此删得掉——账本只追加）、数得上"，防的是守卫把正常路径一起挡了。
- 仍不干净的一处：`PATCH` / `DELETE` 在域函数里 throw、路由 catch 成 **400**（"不存在"被报成正文错误，
  且回显的是内部那句话）。`marketplace-update.integration.test.ts` 已按 400 钉住，改口径要连同那两条一起动，
  另作一片。
