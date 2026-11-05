# ADR-0086：分镜的箭头进像素——整片那一张参考图补进没挂图的镜头，画面出处写进计划

状态：已采纳（2026-11-06）
关联：ROADMAP M5「Video Studio（text/image/storyboard→video）」（本片把它从 `[ ]` 推到 `[~]`，见文末第三十八片）、
M5「Storyboard → Shot list → 参考图 → 生成 → Timeline（§40-42）」、
`packages/video-model/src/index.ts`（`STORYBOARD_ARROWS` / `ARROW_SOURCE_NEEDS` / `missingArrowSource`）、
`packages/video-model/src/render.ts`（`RenderSource` / `planVideoRender`）、
`packages/video-model/src/ffmpeg.ts`（`buildFfmpegArgs` 按 shotId 取文件，这一层没动）、
`apps/web/src/server/domain/storyboard-render.ts`（取字节那一段）、
`apps/web/src/studio/StoryboardPanel.tsx`（原样显示 `plan.notes`，这一层没动）、
`packages/video-model/test/render.test.ts`、`apps/web/test/storyboard-render.integration.test.ts`、`e2e/storyboard.spec.ts`、
§159（不许假生成）/ §160（DEMO 明码标注）/ §16（模型是唯一真值）

## 背景

四条箭头（`text-to-video` / `image-to-video` / `storyboard-to-video` / `character-to-scene`）在模型里是一等字段：

1. **保存时验归属**：`missingArrowSource`（`index.ts:66-75`）按 `ARROW_SOURCE_NEEDS` 逐条箭头检查
   `source.referenceAssetId` / `source.characterId` 缺了哪个，缺就拒收，并把要补的那一格写在拒因里；
2. **界面上写明出处**：面板摘要读 `sb.source`，渲出来的那一版写着
   `来源：参考图 → 视频｜参考图 灯塔的光扫过浮冰.png`，"改来源"那条腿（`updateSource` 补丁）还能在建完之后换箭头；
3. **渲染层一个字都不读**。`grep` 出来的事实（不是推测）：`render.ts` 只看
   `shot.referenceAssetId`，`storyboard-render.ts` 取字节也只按 segment 的 `source.assetId`；
   `storyboard.source` 那一格在整条渲染链上零命中。

于是有一份真实可造的形态：作者把来源选成"参考图 → 视频"、挑了一张已定格的图、但**没有给任何一镜单独挂图**
（面板允许：镜头那一列的参考图默认就是"不用参考图"）。这时计划里每一镜都是 `card`，
成片是十二张确定性色卡轮流闪过，而界面上方写着"来源：参考图 → 视频｜参考图 …"。

这不是"界面在说谎"那种形状（那句话本身是真的，`source` 里确实存着那张图），
而是**元数据与产物各说各话**：一句关于画面的话，被一个不读它的人写在了画面上方。§159 禁的是假生成，
这一格差的是"说法没有被兑现"——比假生成轻，但同一种病：用户按界面那句话去理解成片，理解错。

顺带查清另一件事：`character-to-scene` 在这一层进不了像素，而且**不是忘了做**。
角色不是一张图，肖像是一件资产——`characters` 表只有 `profile` jsonb，
"这位角色的肖像"要靠 `assets.character_id` + `genMeta.characterPortrait` 认（`image-studio.ts:51/360`），
那是一次库查询。而这个包（`packages/video-model`）的三条纪律第一条就是**纯函数、无 IO**：
模型不许查库。所以它今天仍然渲成色卡，本片要决定的是"继续沉默"还是"说出来"。

## 选项

1. **界面上不再显示"来源"那一句**，把说法削到与事实齐平。能一致，但扔掉的是作者的意图与 §40 的契约——
   那条箭头是这份分镜的来历，不是装饰。否。
2. **web 层在渲染前把 `source.referenceAssetId` 复制进每一镜的 `referenceAssetId`**。
   像素立刻对了，但代价是三样：计划里"这一镜照哪张图演"变成"每镜各挂了一张一样的图"（出处消失）；
   整片的决定被写进镜头，撤销栈里多出 N 个作者没做过的改动（§150 的一次操作=一个事务）；
   库里那份分镜从此与作者写进去的不是同一件事（§16 的唯一真值被渲染层反向污染）。否。
3. **采纳：模型读 `source`，并说清画面从哪来**。`image-to-video` 带的那张图补进**自己没挂图**的那些镜
   （每镜自己的优先，那是更具体的决定）；`RenderSource.reference` 加 `from: 'shot' | 'source'`；
   补了几镜、整片那张有没有进画面、这条箭头有没有可进的东西，各写一句 `notes`。
   web 层只多一件事：按 assetId 去重取字节。
4. **顺手把 `character-to-scene` 也在 web 层兑现**（查肖像、当作整片那张传进去）。
   做的是对的（web 层可以查库），但形状没定：要么模型收一个新的入参（"整片备选图"），
   要么 web 层在计划之外再补一层——两者都需要单独一轮取舍，而这一轮的取舍已经够多了。
   本片改成一条 note 把限度说清，欠账落到「仍欠 ①」。
5. **省掉 `from`，反正喂给 ffmpeg 的字节相同**。省下的那一格正是这一片要证的：
   "整片一张图补满各镜"与"每镜各挂了一张一样的图"在计划里同形，而那是两句不同的话，
   界面上、任务行里、以后接真 provider 时的路由（哪张图该送给 `imageToVideo()`）都要靠它。否。

## 决定

1. `planVideoRender` 读 `storyboard.source`，**只认 `image-to-video` 这一条箭头**。
   `ARROW_SOURCE_NEEDS` 里只有它 `referenceAssetId: true`，所以只有它该用整片那张图；
   别的箭头（`text-to-video` / `storyboard-to-video` / `character-to-scene`）即使 `source` 里残留一张图，
   也不进像素——那条箭头没许过这句话。
2. **每一镜自己的参考帧优先**，整片那张只补自己没挂图的镜。理由：镜头级的挂图是作者针对这一镜做的
   更具体的决定，整片那张是对全片的一句话；两条都在的时候，具体那条赢。
3. `RenderSource.reference` 带 `from: 'shot' | 'source'`。它不是装饰（选项 5 逐字反驳过），
   而且它决定 `motion` 之外的一件事也没变：**两种来源都有机位推演**，`from` 只说出处，不说有没有画面。
4. **`cardCount` 与 `sourceReferenceCount` 是两个数**，不合成一个。
   一个是"这一镜没有可看的，渲成色卡"，另一个是"这一镜的画面来自整片那张图"。
   合成一个就分不清"12 镜全渲成同一张图"与"12 镜里 8 镜是色卡"。
5. **三种形状三句话**（不是一条 note 管两种情况）：
   补上了 → `N/total 镜自己没挂参考帧，画面来自 image-to-video 带的那张整片参考图（source.referenceAssetId）…`；
   整片那张被每一镜自己的图盖住 → `…这张整片参考图这次没有进画面：每一镜都有自己的参考帧，更具体的那个决定赢`；
   `character-to-scene` 且真的渲出了色卡 → 明说这条箭头今天还不进像素、为什么（模型不查库）、
   以及作者现在能做的动作（先给角色生成肖像，把那张图挂到镜头上）。
   面板原样显示 `plan.notes`，所以这三句就是界面上的话——不需要新入口，也就不会有一处说法与另一处漂移。
6. **web 层按 assetId 去重**：一张整片图补 12 镜 ⇒ 读一次存储、写一份临时文件。
   归属门（`openAssetForOwner`）与 mime 门（只能是 image/video）**只在第一次读时走**，
   同一个 id 的判定不可能两次不同；ffmpeg 侧不变——同一个文件可以作为多个 `-i` 输入，各自有输入索引。
7. **任务行的 `input` 里两个数并排记**（`cardCount` + 新增 `sourceReferenceCount`）。
   渲染过的账要说清画面来自哪，只有前者时那一格是哑的。

## 后果

**得到的**：界面上"来源：参考图 → 视频"这句话由渲染层兑现了；计划里每一格画面都有出处；
一张图补满全片不再重复读存储；`character-to-scene` 的限度从沉默变成一句可执行的话（先去做肖像）。

**限度，别读多**：

1. 整片那一张是**同一张**图补满各镜，不是"按镜头生成的 N 张"。本机没有图像/视频 provider，
   这条链的像素仍是确定性推演，计划仍带 `demo: true`——箭头进像素改变的是"画面从哪来"，
   不改变"像素是谁产的"（§160 那格标识不动）。
2. `character-to-scene` 仍然不进像素（决定 5 那句 note 是它的可见出口，「仍欠 ①」是它的账）。
3. `storyboard-to-video` 不需要一格特判：它的语义就是"这份分镜的镜头表是输入"，
   而本地链渲的正是镜头表——它与 `text-to-video` 在这一层同形不是缺口，是同一件事的两种说法。
4. 去重只到"按 assetId"：12 镜挂 12 张不同的图仍然读 12 次，没有并发上界。

## 见证

- 模型层：`npx vitest run --no-file-parallelism packages/video-model/test` → **6 files / 100 passed**
  （本片起点基线 93 passed，+7 条新用例；`render.test.ts:63` 那条旧断言同时被改成
  `{ kind: 'reference', assetId: 'asset-1', from: 'shot' }`——见证要说出画面从哪来，这是有意让它转红再改齐的）。
- 集成层（真 Postgres + 真 ffmpeg + ffprobe）：
  `npx vitest run --no-file-parallelism apps/web/test/storyboard-render.integration.test.ts` → **1 file / 15 passed**
  （起点 13，+2）；三个渲染套件一起跑 → **3 files / 28 passed**。
  新那条"整片参考图进像素"读的是**画面平均色**：参考帧是 ffmpeg 现造的纯色 `0x406080` PNG，
  所以第 0.6 秒与第 1.8 秒（两镜各自的中段）都该量到 rgb(64,96,128)±10；
  对照组是同一份两镜、箭头换成 `text-to-video`，同样渲成功、同样 2.4 秒，但读不出那个色——
  这一条才让"色读数"归因于箭头而不是归因于"渲出来了"。
- 界面（e2e，常驻门）：`@smoke 整片参考图进画面：每镜都不挂图时，notes 说画面来自那张图而不是色卡`。
  流程全是真点击：切一版两镜 → 按镜头生成一颗 DEMO 参考图（让名册里有一张已定格的图）→ **把它从镜头上摘下来**
  （两镜都是"不用参考图"）→ 改来源选"参考图 → 视频"挑那张图 → 应用 → DEMO 渲染。
  摘要逐字读数：`2 镜 · 共 6 秒 · 来源：参考图 → 视频｜参考图 灯塔的光扫过浮冰.png`；
  渲染回执里有 `2/2 镜自己没挂参考帧` 与 `image-to-video 带的那张整片参考图`，且整块 `[data-storyboard-render-result]`
  不含"色卡"二字；再加一条"确实渲成了"的证据：播放器 `src` 是 `/api/assets/<id>/file` 那个鉴权 URL。
  截图：`screenshots/storyboard-whole-piece-reference.png`。
  **这一条第一次跑是红的**，红在断言里我把箭头中文标签写成"图片 → 视频"，而 `ARROW_LABELS['image-to-video']`
  是"参考图 → 视频"——改断言、没改产品（那一格产品本来就是对的）。

## 臂（每条都点过、跑过、逐字抄回，然后当场恢复；`grep -rn "MUT "` 归零）

| 臂 | 改的是什么 | 红项（逐字） |
| --- | --- | --- |
| A7 | 箭头完全不进像素（＝本片改动前的样子：`wholePiece = undefined`） | `image-to-video 的那张整片参考图补进自己没挂图的镜头，并说清画面从哪来`、`每一镜自己的参考帧优先：更具体的那个决定赢`、`全片都自己挂了图时说明整片那张没进画面，而不是不提它` → **3 failed / 16 passed** |
| A1 | 不分箭头都用整片那张图（`wholePiece = storyboard.source.referenceAssetId`） | `整片那张只属于 image-to-video：别的箭头就算带了图也不进像素` → **1 failed / 18 passed** |
| A3 | 整片那张盖过每一镜自己的（回落链顺序反过来） | `每一镜自己的参考帧优先：更具体的那个决定赢`、`全片都自己挂了图时说明整片那张没进画面，而不是不提它` → **2 failed / 17 passed**（第二项红得对：顺序一反，那句"没有进画面"就成了假话） |
| A4 | 画面出处不区分（`from: 'source'` 写成 `'shot'`） | `image-to-video 的那张整片参考图补进自己没挂图的镜头，并说清画面从哪来`、`每一镜自己的参考帧优先` → **2 failed / 17 passed** |
| A5 | 整片那张被盖住时保持沉默（去掉那句 note） | `全片都自己挂了图时说明整片那张没进画面，而不是不提它` → **1 failed / 18 passed** |
| A6 | `character-to-scene` 的限度回到沉默 | `character-to-scene 渲成色卡时把限度说出来；每镜都挂了图就不虚构这个缺口` → **1 failed / 18 passed** |
| A2 | 不去重（`cached` 恒为 `undefined`，同一个 id 读一遍算一遍） | 集成层 `image-to-video 的整片参考图进像素：两镜都没挂图也渲出那张图，且那张图只读一次`，逐字 `AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]`，多出来的那一项与已有那一项是**同一个 assetId** → **1 failed / 14 skipped** |

A2 是这一片唯一"结果对不对"抓不到的臂：不去重照样渲出逐字节相同的正确成片。所以门必须是"读了几次"，
而 `refReads` 那个 `vi.mock` 包的是**转发不是替换**——真实现照跑，归属门与 mime 门的行为与生产逐字相同。

## 没牙的格子（点名，不含糊过去）

1. **只证了"这张图进了画面"，没证"每一镜拿的是它自己那一张"**。两镜同源正是本片的行为，
   所以色读数无法区分"串号"；要区分得逐镜取样并给每镜不同的图（成本：一次渲染 + N 次取样，下一片的活）。
2. **别的箭头残留 `source.referenceAssetId` 时，界面上看不到"这张图没进画面"**。
   决定 1 由 A1 那臂的守门用例钉住了行为，但 notes 只在"整片那张被每镜盖住"那格说话，
   `text-to-video` + 一张多余的图 = 静默。保存门（`missingArrowSource`）只管缺、不管多带，所以那一格现在没人出声。
3. **去重只数了存储读几次，没数临时文件写几份**。写紧跟在读之后、命中缓存就 `continue`，所以不会多写，
   但这一条没有独立断言（要靠 FS 计数把临时目录数出来，不值当，记在这儿）。
4. **e2e 那条没有对照**。同一个访客同一个项目只渲得了一版（`PLAN_MONTHLY_GRANTS.free.video` = 5 点，
   一次渲染扣 5 点），换箭头再渲一版会被额度门挡下——那红的就不是"界面话术"而是"额度"。
   对照在集成层（色读数），所以 e2e 那句 `not.toContain('色卡')` 靠的是同块里"确实渲成了"的播放器断言撑着。
5. **`sourceReferenceCount` 进了任务行的 `input`，还没有界面读它**。渲染面板上看得见的是 notes 那句话，
   数字本身要等到任务/额度那一屏把它列出来（属于另一片的范围）。

## 仍欠

1. **`character-to-scene` 进像素**：web 层按 `assets.character_id` + `genMeta.characterPortrait` 查肖像，
   把它作为整片那张传进计划。形状要先定：给 `planVideoRender` 加一个"整片备选图"的入参，
   还是让 web 层装配一份"补好 source 的 Storyboard"再投影——前者把 IO 的边界写进签名（干净），
   后者容易变成选项 2 那个污染模型真值的形状。决定 4 与那条 note 就是这一片的入口。
2. **渲染结果逐镜可指认**：界面上说得出"第 3 镜的画面来自哪一张图"。`from` 已经进了计划，
   面板还没读它——现在只有聚合的一句话，没有逐镜那一格。
3. **接上真视频 provider 之后**：`image-to-video` 应当由 provider 读整片那张图
   （`packages/schemas` 的 `imageToVideo()`），`from: 'source'` 就是那时要用的路由依据——
   本片的这一格是给那时留的接口位，不是过渡期的临时字段。
4. **优先级没有作者可改的入口**：规则写死"每镜优先"（决定 2）。如果有作者要的是"整片那一张压过镜头"
   （例如做一版"同一张图从头看到尾"的样片），需要一个显式字段，而不是把镜头上的图挨个摘掉。
5. **参考帧的读取没有并发上界**（限度 4）：12 镜 12 张不同的图 = 12 次顺序存储读 + 12 份临时文件，
   都在渲染起跑之前串行完成。镜头多的分镜要么并发取、要么加上限，两种都要先有读数才好选。
