// 用户说明书 / User guide —— 说明书与 Studio 内置帮助抽屉（InAppGuide）共用这同一份字典
// （v788 起抽离为 shared module；改文案只改这里，不改页面里）
import type { Locale } from '@/lib/i18n';
type GuideCopyInput = Record<Locale, { kicker: string; title: string; lede: string; sections: { heading: string; body: string[] }[] }>;

const COPY: GuideCopyInput = {
  zh: {
    kicker: '用户指南',
    title: 'NEXUS 使用指南：从第一个项目到发布与游玩',
    lede: '这不是一份帮助文档，是一册工具说明书——告诉你这里的每一项能力是什么、怎么用。当前外部模型 API 已关闭：文中所有「AI / 模型」动作只在已配置且可用的真实 provider 下执行；关闭时保持 DEMO MODE 或明确显示不可用，本地检索与确定性玩法仍可使用。',
    sections: [
      {
        heading: '① 这个平台是什么？',
        body: [
          'NEXUS 是一个 AI Universe Studio——把你说出口的想法装配成设计模型，再变成真的可以打开的网站、游戏、视频与世界。',
          '创建一个项目 → 在 Project 里画设计稿 → 用 AI 辅助改成你想要的样子 → 导出 / 发布 / 玩里面的游戏。',
          '它不是"AI 写代码的玩具"：所有 AI 的改动都走可撤销的 Command 栈；所有素材都是你项目自己的素材；DEMO MODE 常驻提醒——未接真 provider 之前不假装已经能做。',
        ],
      },
      {
        heading: '② 新手快速演示·第一次跑通',
        body: [
          '注册 → 点"新建项目"→ 起个名字 → 自动进 Studio（左栏面板 + 中央画布 + 右检视器）。',
          '在 Studio 画布上选中一个元素（鼠标或 Tab 都行）→ 顶栏点"新建页"加一页，或从左栏把组件拖上来。',
          '对 AI 说一句话就行（例："把标题换成 72px 的衬线字"）——每次 AI 产出都是一个可以 ⌘Z 撤销的 Command；没有 provider 时它不假装做了，会挂 DEMO MODE。',
          '⌘K（或 Ctrl K）打开命令面板——输入页面动作或已登记路径的关键词（如 "发布" 或 "ship"），Enter 直接跳；项目名不在这份命令清单里。',
          'Ctrl S（Mac ⌘S）保存；按 "?" 键呼出键盘速览卡——真实清单（⌘K 面板、Ctrl Z / Ctrl Y、方向键微移、Shift+方向键 8px 网格、Ctrl+A 全选、Ctrl+G 网格、Delete 删除）。',
          'Ctrl G 显示或隐藏对齐网格；方向键微移 1px、Shift+方向键 8px 网格、Delete 删除选中。',
          '做完一切后先 Ctrl S 保存，再点顶栏"发布"：选择"公开""仅链接"或"私有"，通过门禁后点"发布"。只有公开作品会进入 /discover；仅链接不进列表，未发布项目只有你自己能看。',
          '下一站：/ship 看这次交付的每日日志；换真 provider 之后同一条流水线产出真东西。',
          '卡住了？点 Studio 顶栏「帮助」打开内置说明书；说明书打开后按 Esc 或 F1 关闭，F1 本身不会打开它。也可以按 ? 键读速览卡，或先看本页 ④ 游戏怎么玩、⑤ 额度 & DEMO MODE。',
        ],
      },
      {
        heading: 'AI 是怎么在这里说话的？（StateGraph 小课）',
        body: [
          '遇到 AI 改设计时，请求会坐两条车道之一：车道 A 直发 /v1/ai/run；车道 B 走一条可推演的**状态图**——LangGraph 的显式状态机：validate（校验输入）→ check_provider（检查已配置的 provider 与模型档位）→ build_prefix（拼装稳定前缀，为 provider 前缀缓存创造条件）→ call_llm（仅在真实 provider 可用时调用）→ cache_read（命中即跳过 provider）→ parse_and_release（补丁合法性校验）→ assemble（组装契约响应）。任何失败直通 END——绝不空转。',
          '为什么要一条图而不是一根绳子？状态图让 AI 调用可以追踪、推演与局部重放；真正落到设计文档的改动仍走可撤销 Command。x-nexus-orchestration: stategraph 是「你刚刚看的是那条图」的公开标志；响应体与车道 A 同构。',
          '历史实测记录：同字节前缀的一轮二连发曾测得 prefix 缓存命中 21265/21268（≈99.99%）。这是当时那组请求的证据，不是当前命中率或省钱保证；/admin/savings 的 tokensIn 与 cachedTokens 才是当前账。',
          '想更深？apps/ai-service/src/ai_service/stategraph.py 是这张图的文字实现——可读性即可教性；测试 tests/test_stategraph.py 8 臂逐一说明 validate / check_provider / dryRun / patch 非法 时直通 END 的原因。',
          '想亲手按一下试试？/stategraph —— 公开只读的 StateGraph 落点页：七个节点的旅程、失败直通 END 的条件边、以及一个真图试跑按钮（固定 critique + dryRun + fast）。只有已配置且可用的真实 provider 才会产生真实调用与计量；当前 provider 关闭或不可用时，页面必须如实显示不可用，不能把试跑当成成功。',
          'LangGraph 是默认车道：POST /api/ai/run 缺省即走 /v1/ai/design-graph（validate → check_provider → build_prefix → call_llm → cache_read → parse_and_release → assemble）；要降级回顺序执行，带请求头 x-nexus-orchestration: lane-a 或设服务端 env NEXUS_AI_ORCHESTRATION=lane-a；响应头如实回声车道，/admin 指标 nexus_ai_run_lane_total 计数每次分流；拼写错误绝不悄悄换道。',
        ],
      },
      {
        heading: '③ 功能路径索引（复制路径到地址栏前往）',
        body: [
          '/discover 广场（热门/最新/ trending / 我关注的；为你推荐：真实 provider 可用时，AI 照你自己的实测阅读 myOpens 排——没有实测阅读记录就不给你排推荐位；馆长批注：真实 provider 可用时，trending 榜前三由 AI 照真实指标（浏览/赞/评/转/热度分）各写一句为什么值得打开，每条必含数字；关闭时明确显示不可用）· /marketplace 组件/模板/资产市场 · /blocks 积木库 · /search 全站搜索（站内九类 + 站外「现实世界」维基百科那一块，两边分开排）',
          '/studio/<project> 项目主场：画布/图层/设计系统/3D · /world/<id> 走进这个世界（3D 步行）· /world/<id>/digest 世界速览 · /world/<id>/integrity 世界体检 · /world/<id>/tide 世界潮汐 · /world/<id>/almanac 世界年鉴 · /world/<id>/constellation 人物关系星图 · /world/<id>/codex 设定集（纸面投影）· /world/<id>/chronicle 编年 · /world/<id>/ephemeris 世界切片 · /world/<id>/network 万象脉络（枢纽榜 / 势力团 / 割边关节 / 跨类关系）',
          'Studio 世界面板的「AI 续写编年」只在已配置且可用的真实 provider 下调用模型，只在你已经写过的纪元下面补一条故事（自造的纪元名会被丢掉，不替你发明历史分期）；新条目带纪元标签，/world/<id>/chronicle 编年页立刻能看到。面板底部的「AI 补全空节」同样只在真实 provider 可用时工作，可一次把最多 3 个还没写正文的类别补上（已有内容的不动，再点继续；补写时会检索你已有的条目作证据，让新细节长在旧细节上）。想随手看看这片土地还会长出什么，点「掷命运骰」——它从你已写的条目里重组成事件卡，不调模型也不写库；看中哪张还可以点「把这张卡写进世界」，它以故事条目落库并标明 seed 与来源，不冒充模型新写的史实。想把手上的世界带走，点「导出 Markdown」——九类固定顺序、纪元/序号与记忆回声都在文件里，纯本地不联网。世界条目多了以后，用概要下方的筛选框按题名/正文/纪元/记忆回声找，九类分组会只留有命中的条目。筛选框旁边的「排序」按钮在「原序／纪元／标题」之间切换，只改这一栏的显示顺序，不改你写下的文档。想把它读回来，点「导入 Markdown」选那份 .md——只追加有正文的条目到当前世界，不覆盖原有内容；纪元/序号/记忆回声一并还原，格式不对会明确报错、什么也不写。世界大了难免有空条目、重名、断链，随时点「世界体检」——它只读地量出问题并给一条可执行的下一步，不改任何内容。条目之间连成网才耐看：点「串联建议」，它只根据你写下的纪元和正文里的共同词指出可能有关的条目，点「连上」才真的写关系，不替你编内容。想快速铺开一片土地，点「播下世界种子」——它从世界名确定性地长出九类齐全的起始条目，地名、势力、角色互相引用；程序生成、只追加，不是史实，随便改。',
          '/bible 典籍室：正典精读 → 《潮汐教团》十四章 + 二百二十九回响；/bible/search 直达（正典本地检索）· /bible/quiz 潮汐挑战（正典问答）· /bible/well 七口井（典籍室第二个玩法）· /bible/threads 回响线索索引（哪几篇在写同一件东西）',
          '/bible 收录第三种玩法：/bible/anchors 锚句回放——1383 句中英锚句逐字回放，抢答它出自哪一章（连对 / 历史最佳本地记）；第四个角落 /bible/margins 页边批注——抄本师写在页边、不进名册的话，先读再决定要不要知道出处；第五个角落 /bible/dot-road 点路——照 E220 的十九步走一遍，六个站各留一句原文，尽头是一格空白',
          '/n/<handle>/<slug> 公开页（访客第一眼看到的是这一版）· /preview/<project> 同源只读镜头（发布前同一排断点与缩放）',
          '/tasks 任务账本（每次 AI 请求一行，含第几次、真/DEMO、用量、用时）· /credits 我的额度（SavingsCard：缓存替你省下的重复计算）· /api-tokens API 令牌 · /analytics 我作品的数据 · /pulse 观测大厅（平台聚合匿名统计，口令 123）· /notifications 收件箱 · /ship 交付日志 · /about-nexus 关于',
          '/admin/* 平台管理台（role=admin）：审核台、pricing、dead-letter、ai-cache、audit、observability、users、pricing、rate-limit 等',
          '/admin/observe 只读观察站（口令 123 · 口令公开）：展示已有服务端聚合数据——注册、打开、点赞、评论、收藏、任务结局、套餐分布、7 天打开趋势与规则建议；它不是通用点击流，也不把合成模拟流量冒充真人行为。顶部「趋势预测」是服务端最小二乘线性外推，明确标注非 AI；样本不足 4 天不拟合，空序列或全零序列也不应伪装成有效预测。「AI 深读」与结构化建议只在真实 provider 可用时工作；provider 关闭时保留原始指标并明确说明不可用。',
        ],
      },
      {
        heading: '④ 游戏怎么玩',
        body: [
          '动作面（/game/<id>）：WASD 或方向键移动；空格攻击；右上角 HUD 会实时显示 生命、时间、场上敌人数、拾取计数（物品 x/y）、发现量 与 激活量——把一张图完整走完再看结算。',
          '失败了就重来：失败的结果画面上「重新开始」按钮可以一键重开，键盘上也绑了空格键；每一局固定、检查点不跨盘。',
          '下一段的敌人布局由游戏设计系统（@nexus/game-model）接上一局的落点决定——你走到哪里、没走到哪里，下一盘的敌人就按那个坐标长出来。',
          'RPG 冒险（/game/<id>?view=rpg）：WASD/方向键走，靠近 NPC 按空格/Enter 开始对话；上下箭头选选项、空格确认；对话的决定会写进你的世界档案。',
          '这些游戏是项目自己长出来的：棋盘、敌人、数值全来自你项目里的设计系统/角色，没有"看价目表定死的成品"——Studio 里改数，下一盘就按新数跑。',
          '典籍室里也收着游戏：/bible/quiz 潮汐挑战（正典问答，答对点亮路标）与 /bible/well 七口井（凭线索找回失落的七口井）——见 ⑪',
          '诚实说明书：游戏本体没有云存档、没有自动保存点——每一局独立结算，交了卷就没有下一盘继承你的 HP。',
        ],
      },
      {
        heading: '⑤ 额度 & DEMO MODE 是什么？',
        body: [
          '真实额度只会在已配置且可用的 provider 完成调用后产生。当前外部 API 关闭时，相关入口应保持 DEMO MODE 或明确显示不可用；DEMO 输出是确定性模拟，不是真模型作品，也不能冒充真实用量。',
          '/credits 页面可以实时看消费账单：每次 AI 调用都记 token in/out/model/latency/cost——任何一笔都是真的数字，不是演出来的；账本里的 SavingsCard 会把"缓存替你省下的重复计算"摊给你看（命中率、输入 token 复用、真模型/DEMO 轮次分得清）。',
          '看到"缓存命中率"这个词：它反映 provider 端的 prefix cache 复用率。命中通常意味着重复前缀的计费 token 减少；未命中可能与前缀变化、路由、缓存状态或时间窗口有关，不能直接断定是你做错了。',
        ],
      },
      {
        heading: '⑥ 常见问答',
        body: [
          'Q：为什么生成页空白或报不可用？A：空白不是成功。先看页面是否标明 DEMO MODE、provider 未配置或服务不可用，再检查网络与服务状态；只有真实 provider 成功返回才算真实生成。',
          'Q：缓存命中率低是我的问题吗？A：不一定。前缀字节、请求路由、provider 缓存状态与时间窗口都可能影响命中；先在 /admin/ai-cache 看当前账与请求分布，不要把历史高命中率当成每次都会发生。',
          'Q：怎么让别人看到我的作品？A：保存后在顶栏打开发布，选择 Public、Unlisted 或 Private，通过门禁再点发布。只有 Public 进入 /discover；Unlisted 不进列表；Private 与未发布项目保持私有。',
          'Q：数据安全吗？A：设计文档的编辑走 Command 历史，发布可见性由你选择；这些机制不等于自动备份或权限审计。公开作品可以在发布面板改回 Private，重要内容仍应另行备份。',
        ],
      },
      {
        heading: '⑦ 分镜怎么玩（Storyboard，§40–§42）',
        body: [
          '打开 Studio 底部的「分镜」Tab → 写一句话、点「切一版分镜」——这是本地确定性断句（按标点切成镜头表），不是 AI 分镜；provider 未接入前不做假生成。',
          '镜头行可改：时长（毫秒）、机位（宽景/中景/特写/细部/跟移/航拍）、转场（硬切/淡入/叠化/划像）；点「DEMO 参考图」为本镜合成一张参考帧——像素来自本地确定性合成器，不是 AI 出图；撤销只断开引用、不删资产。',
          '「DEMO 渲染整条分镜」会把整条分镜渲成一条 mp4 并挂回第一镜：真 ffmpeg、真额度门、真视频摄入门，成片为 DEMO（本地推演，不是 AI 生成），按钮处明码标注。',
          '时间线可直接编辑：拖右边缘改长度（吸附 100ms、下限 200ms）、拖整块换位、双击一格在点击处切成两镜；键盘 Tab 到格子的右边缘、方向键调整（Shift 一档 500ms），Enter 落库、Esc 取消——四条路改的是同一份模型，全程可撤销。',
        ],
      },
      {
        heading: '⑧ 走进一个世界玩（World）',
        body: [
          '/world/<id> 进入 3D 走动视角：WASD 或方向键移动；按住鼠标左键拖拽可以环视四周（向上拖 = 往上看）；靠近 NPC 后按角色旁出现的「跟角色说话」入口对话。',
          '/world/<id>/chronicle 编年史：故事/历史条目按纪元排开（灰灯纪/灰烬纪/铁月纪……你项目自己的纪元名），人物星图 ↔ 编年互相点亮（世界面板的「AI 牵线」在真实 provider 可用时可调模型从已有条目里挑一条写关系，自造 id 会被丢掉）；条目可挂「记忆回声」——纯感官刻痕，≤ 240 字，不是梗概；在世界面板点「AI 写回声」可调真实模型写一段，只依据该条正文。',
          '/world/<id>/digest 世界速览 · /world/<id>/integrity 世界体检（只报真问题：纪元错位/回声缺失/孤儿条目，不打分不假绿）· /world/<id>/quests 世界委托（每天从真实缺口里挑三件能动手的事，三步怎么做都写在卡上；计数归零就真的从板上消失，空世界会先教你怎么落第一条）· /world/<id>/tide 世界潮汐 · /world/<id>/ephemeris 世界日历投影 · /world/<id>/codex 设定集 · /world/<id>/constellation 人物关系星图 · /world/<id>/network 万象脉络（把九类条目与有向关系算成骨架：枢纽榜回答“谁被最多关系穿过”，势力团是互相纠缠的强连通分量，关节是“一断全散”的割边——都是对同一份世界文档的图算法投影，不改数据）。',
          '这些页面全部是你的项目数据的投影——世界页不是"官方故事"，是你画的世界自己的结构。',
          '想读这个宇宙的正典文字？去 /bible 翻《低语诸王》十四章正典——锚句中英字字对齐的正典、可以直接收藏的典籍室。另外还有两个按钮：「潮汐挑战」是正典小测（一百三十一题，答错带题目直通问典）；「问典」在真实 provider 可用时把正典喂给模型——问中文答中文、问英文答英文、典籍里没有的它直接说"典籍里没有"。',
          '想让 AI 读你的数据？/analytics 里的 Creator Agent 规则分析底下——也藏着一个「让大模型看看我的数据」按钮——它只在真实 provider 可用时调用模型，不是模板；关闭时明确显示不可用。',
        ],
      },
      {
        heading: '⑨ 市场、邀请与团队',
        body: [
          '/marketplace 组件市场：浏览作者挂牌的东西、看谁买过、买下或退货；市场里卖的东西每一件都有真实结算路径。顶部的「AI 选品」只在真实 provider 可用时让模型读货架前三件的实测字段（价格 / 下载量），各写一句为什么值得看——价格与下载量都是真的，作品质量模型不碰。',
          '/invites/<token> 接受队伍邀请：项目成员从 Studio 的 Team 面板发出邀请链接，接受后成为协作者（席位有上限；过期邀请不再占席）。',
          '/api-tokens 自建机器人：给 CI/脚本一枚令牌，就能用程序化方式读写你的内容与作品；/tasks 里能看到每个云端任务的真实排队与状态。',
          '/ship 每日交付日志（AI 平台速览：真实 provider 可用时，模型照当前 git log 的机械统计写两段话；提交数、类型分布与 ADR 数都按当前读数计算，不写死历史样例）· /notifications 收件箱（AI 先读一下：真实 provider 可用时，模型只看按类型聚合的实测计数——等你结论的 moderation/approval/team 优先，like/follow 最后；标题 / 正文一个字都不进模型）· /analytics 你的作品数据 · /pulse 观测大厅（平台全站聚合匿名，口令 123）· /observatory 公共观测大厅（带规则外推预测的公开围观，口令 123；AI 深读与独立复核只在真实 provider 可用时工作：基于实测聚合数字起草建议或逐条重算，关闭时明确显示不可用）· /credits 你的额度账本——每个都是真实数据页。',
        ],
      },
      {
        heading: '⑩ 走错一步怎么走回来',
        body: [
          '画布聚焦时，⌘Z（或 Ctrl Z）撤销设计模型 History 里最近一个 Command，⌘⇧Z / Ctrl Y 重做。History 是真实的可逆操作栈，不是浏览器文本输入的撤销；聊天、世界、游戏与分镜各有自己的状态，不能说它们共享这一个栈。',
          'Studio 的设计、世界、游戏与分镜 store 分别保存。Ctrl/⌘+S 只执行当前保存流程，不等于创建命名快照，也不保证四个 store 已分别持久化；需要快照时使用快照入口。',
          '不同删除操作的确认与恢复能力不同，使用前看该按钮自己的说明；不要把 Ctrl Z 当成删项目、撤发布或删镜头的通用恢复键。发布面板直接提交所选可见性，没有额外确认卡；改回 Private 可停止公开分发，但不等于删除已缓存或已下载的副本。',
        ],
      },
      {
        heading: '⑪ 典籍室（/bible）怎么玩',
        body: [
          '/bible 正典精读：《潮汐教团》十四章 + 二百二十九回响——每一章点开就能读，锚句在中英之间字对齐（zh 原字节 / en 对照，不混写）。想知道哪几篇回响在写同一件东西？典籍室页脚进「回响线索索引」：潮印、盐账、夜钥匙这些有名字的东西，各自由哪几篇写成、每篇的锚句原文都列出来。',
          '/bible/search 直达：在正典里按关键词做本地检索，直接读出命中的那一段（不出 AI、不出库外来源，慢一步但是真检索）。想知道现实世界里这个词指什么？/search 页面下方有「现实世界 · 站外资料」那一块，来自维基百科，和站内结果分开排、不混在一起。',
          '/bible/quiz 潮汐挑战：以正典出题——答错回哪一章重新对，点亮的路标留在本机（无云存档，刷新照旧）。',
          '/bible/well 七口井：典籍室的第二个玩法——顺着七条线索找回失落的七口井；找对了就开出一段地方，找不到的照实说找不到。',
          '/bible/whisper 答问者：真实 provider 可用时，挑一卷正典再问一句——典籍里有写的就照它写的答，没写的就直说没写。零持久化、零记忆，刷新就是忘了；关闭时明确显示不可用。',
          '/tide-oracle 潮语 · 潮汐预言：真实 provider 可用时，向潮问一句话，潮从正典里读给潮说的那句话——两句以内；不预言、不投资、不替你拿主意，正典里没有的一个字也不编。关闭时明确显示不可用。解锁同 /insight（口令 123）。',
          '/daily 今日潮候：每天一期，从正典里确定性地抽一叶——真实 provider 可用时，模型只读这一叶、写三句话和一句思考题；关闭时保留原文并明确显示不可用，同一天所有人看到同一期。',
          '/tidewatch 潮候步进（Tidewatch）：让潮记下你这一步——真实 provider 可用时，每一步才执行一张编译后的 StateGraph（analyze 读局 → retrieve 本地锚句检索 → narrate 潮回叙事 + 结构化 delta → canon_guard 逐字核验 → assemble 落账）；状态随 localStorage 走（不落库），回响解锁只接受典籍室里真实存在的编号；解锁同 /insight（口令 123）。',
'/tide-wire 今日潮声：公开页，真实平台聚合数字上潮说两句（不预言、不认项目）；计数来自实库，真实 provider 可用时模型每小时最多被问一次，关闭时保留真实计数并留白，空平台也诚实留白。',
          '/bible 每章末尾还有「让 AI 读给你听」：真实 provider 可用时，模型只读本章原文摘录，三句话说清这章，最后递一句思考题（不替你回答）；同一章 / 同语言 7 天内缓存，不重复计费。',
          '回声（Echoes）：给正典条目挂一条纯感官的微刻痕（≤ 240 字，不是梗概），它能在星图与编年里互相点亮——星图↔编年彼此唤醒。',
          '以上都是私有玩的地方：读不需要登录（只有运行时计数）；不把你的选项藏在 AI 里——它只为你指出路在哪。',
        ],
      },
      {
        heading: '⑫ 问典与大模型——「问典」两字的来路',
        body: [
          '问典（/bible/ask）不是「把问题丢给模型瞎编」。真实 provider 可用时，它才是一条 StateGraph 编排的链：先用一段短提示只抽检索词（analyze，不烧长上下文）；接着用纯算法字符二元组 Jaccard 直接命中典籍段落（retrieve，不调模型，0 token）；把正典全文和命中的证据段落一起丢给模型作答（draft）；最后用机检空答案/发明章回响/不存在的锚句引用三项（verify）——过了再说、过不了就 revise 一轮，依然过不了就如实标注「不合格」。provider 关闭或不可用时，页面明确显示不可用，不把本地检索结果冒充模型回答。回答完，「本轮检索依据」折叠面板会把被命中的 top-3 原文段落逐字摊开——模型被哪几段定住了，读者亲眼看见。',
          '每次答复下面还会挂两枚徽章：①缓存复用 N tokens，按本轮实际账显示，不承诺固定命中率；历史同前缀请求曾接近 95%，但当前值以本轮与 /admin/ai-cache 为准。②引文判定——「引经据典 · 逐字对齐 ✓（N 条）」／「正典没写 · 如实说没有的答复」／「自由作答 · 未逐字引用锚句」。第二枚细看下去还能展开，把模型逐字引到的那几条锚句原文一行行点开。',
          'StateGraph 是 agents/runtime 里真正的编排原语——节点、状态、条件边，和 LangGraph 同源的「图 + 状态」模型；修订回路在图里真的走完、修订上限两轮硬封顶，不会陷入「一边改一边错」的死循环。',
          '潮汐挑战答对就是对；问典答不出时，潮汐也答不出——典籍管它叫「典籍里没有」。绝不替典籍撒谎，绝不替潮海投机。',
          'draft 的 system 是字节级稳定的正典摘要（十四章正典全文 + 锚句中英对照），为 provider 前缀复用提供稳定基础；实际命中仍取决于 provider 状态与路由，当前读数以本轮请求和 /admin/ai-cache 为准。',
        ],
      },
      {
        heading: '⑬ 画布键鼠速查',
        body: [
          '滚轮（默认网页惯例）：往上滚往上看、往下滚往下看。如果自己手里的鼠标/系统方向反了，顶区「滚轮」按钮把它切到反转，之后再切回来。',
          '右键拖拽移动视口（中键或空格拖拽）；Shift + 滚轮横向滚动；Ctrl + 滚轮按住边框为锚点缩放，最大 4× 最小 0.1×。',
          '顶区「适应窗口」按钮（Shift+1）：把文档整个放进视口——缩放仍在 0.1–4 倍闸内，画布会居中。',
          'Ctrl+G 显示/隐藏对齐网格；方向键微移 1px，Shift+方向键 8px，Delete 删选中。',
          '每个面板上都有标题栏；顶栏「+ 新建页」快速加页；面板里的搜索框（Ctrl+F）搜组件名。',
        ],
      },
    ],
  },
  en: {
    kicker: 'User Guide',
    title: 'The NEXUS guide: from your first project to publishing and play',
    lede: 'This is the manual: what each capability is and how to use it. The external model API is currently closed: every “AI / model” action below runs only with an available configured real provider; while it is closed, the UI stays in DEMO MODE or says unavailable, while local retrieval and deterministic play still work.',
    sections: [
      {
        heading: '① What is this platform?',
        body: [
          'NEXUS is an AI Universe Studio — a place where an idea you describe aloud is assembled into a design model, then turned into real websites, games, videos and worlds you can actually open.',
          'Create a project → lay out the design → let AI assist → export / publish / play the games inside.',
          'Not an "AI toy": every AI change goes through a revocable Command stack; every asset is yours; DEMO MODE is a standing badge — unconfigured providers are never faked as live.',
        ],
      },
      {
        heading: '② New here? Your first successful run',
        body: [
          'Sign up → click "New project" → give it a name → you enter Studio automatically (left panel + central canvas + right inspector).',
          'In Studio, select something on the canvas (mouse or Tab) → hit "New page" in the top bar, or drag components from the left onto the canvas.',
          'Say one sentence to the AI (e.g. "make the title 72px serif") — every AI turn lands as a Command you can undo with Cmd/Ctrl+Z; no provider configured ⇒ no pretend magic, the DEMO MODE badge shows.',
          'Press Cmd/Ctrl+K to open the command palette — type a page action or a keyword from a registered path ("publish", "ship", "tide") and Enter jumps there; project names are not in this command list.',
          'Cmd/Ctrl+S to save; press "?" to pull the speed-cheat card on screen — the whole real list (⌘K palette, Ctrl+Z / Ctrl+Y, arrow nudges, Shift+arrows 8px grid, Ctrl+A select, Ctrl+G grid, Delete).',
          'Ctrl/Cmd+G toggles the alignment grid; arrow keys nudge 1px, Shift+arrows 8px, Delete removes the selection.',
          'When it is right: Cmd/Ctrl+S to save, then open Publish in the top bar, choose Public, Unlisted or Private, clear the gates and press “Publish”. Only public work enters /discover; unlisted work stays out of lists, and an unpublished project is yours alone.',
          'Next stop: /ship to see the daily delivery log; once a real provider is wired, the same pipeline produces the real stuff.',
          'Stuck? Open the in-app manual from “Help” in the Studio top bar; Esc or F1 closes it after it is open, and F1 does not open it. Press ? for the cheat sheet, or read sections ④ (games) / ⑤ (quota & DEMO MODE) here.',
        ],
      },
      {
        heading: 'How does AI "speak" here? (StateGraph in brief)',
        body: [
          'When AI edits a design, the request takes one of two lanes: lane A directly POSTs /v1/ai/run; lane B runs through an explicit, traceable **state graph** — a LangGraph state machine: validate (check the contract) → check_provider (check the configured provider and model tier) → build_prefix (lay down a byte-stable prefix so provider prefix caching can apply) → call_llm (call only when a real provider is available) → cache_read (a hit skips the provider) → parse_and_release (check the patch) → assemble (build the contract response). Any failure short-circuits to END — nothing keeps spinning.',
          'Why a graph and not a straight line? The graph makes an AI call traceable, inspectable and locally replayable; a change that reaches the design document still uses a reversible Command. x-nexus-orchestration: stategraph tells you which lane served the response; the response body has the same shape as lane A.',
          'Historical measurement: two back-to-back turns with identical byte-prefixes once recorded 21265/21268 cached tokens (≈99.99%). That is evidence for those requests, not a current hit-rate or savings guarantee; /admin/savings shows the current tokensIn and cachedTokens ledger.',
          'Curious? apps/ai-service/src/ai_service/stategraph.py is the graph written out — readable source is the documentation; tests/test_stategraph.py walks the eight arms: why validate / check_provider / dryRun / invalid patches short-circuit straight to END.',
          'Want to press the button yourself? /stategraph — the public read-only StateGraph page: the seven-node journey, the fail-to-END conditional edges, and a live-probe button (fixed critique + dryRun + fast payload). A real call and real metering require an available configured provider; while that provider is closed or unavailable, the page must say so instead of presenting the probe as a success.',
          'LangGraph is the default lane: POST /api/ai/run goes through /v1/ai/design-graph (validate → check_provider → build_prefix → call_llm → cache_read → parse_and_release → assemble) unless you ask for the sequential lane with the header x-nexus-orchestration: lane-a (or env NEXUS_AI_ORCHESTRATION=lane-a on the server). The response header echoes the lane it took and the metric nexus_ai_run_lane_total counts every split; a typo never silently switches lanes.',
        ],
      },
      {
        heading: '③ Route index (copy a path into the address bar)',
        body: [
          '/discover feed (Hot / Latest / trending / Following; Recommended for You: with an available real provider, AI ranks by your own measured reading activity — myOpens — and never ranks for people without one; Curator’s notes: with an available real provider, AI writes one sentence for each of the top-3 trending entries, using only measured fields (views / likes / comments / remixes / heat score), and every sentence must contain a number; while it is closed, the UI explicitly says unavailable) · /marketplace component/template/asset marketplace · /blocks library · /search global search (nine in-platform groups plus an outside-the-platform "real world" lane from Wikipedia, ranked separately)',
          '/studio/<project> studio · /world/<id> walk this world (3D) · /world/<id>/digest world digest · /world/<id>/integrity world checkup · /world/<id>/tide world tide · /world/<id>/almanac world almanac · /world/<id>/constellation character graph · /world/<id>/codex paper tome · /world/<id>/chronicle timeline · /world/<id>/ephemeris 360-day page · /world/<id>/network the power skeleton (degree hubs, strong-component cliques, bridge joints, cross-kind edges)',
          'With an available real provider, the Studio world panel’s “AI write chronicle” makes one model call and adds one story under an era you have already written — invented era names are dropped, so the model never invents a period for you. The new entry carries its era tag and shows up at /world/<id>/chronicle right away. The bottom “AI fill empties” button also requires an available real provider and fills up to 3 sections with no body text per click (existing content is untouched; click again for the rest; it retrieves your existing entries as evidence so new details grow out of old ones). Both actions explicitly say unavailable while the provider is closed. For a quick taste of what this land might still hold, press “Roll fate” — it recombines your own entries into event cards, with no model call and no database write; press “Keep this card in the world” to save it as a Story entry that names its seed and sources rather than masquerading as fresh model-written lore.',
          '/bible hall of canon → The Tide Conclave: fourteen chapters + two hundred twenty-nine echoes; /bible/search direct hits (local canon retrieval) · /bible/quiz Tide Challenge (canon quiz) · /bible/well Seven Wells (the second game) · /bible/threads echo threads (which echoes write about the same named thing)',
          '/bible gains a third game: /bible/anchors Anchor Echo — the 1383 bilingual anchor sentences replayed verbatim; name the chapter or echo each line came from (streak and best kept locally) · plus a fourth corner, /bible/margins — what the copyists wrote in the margin: not the body, not the register, read it first and then decide whether to learn its echo · and a fifth, /bible/dot-road The Dot Road — walk Echo 220’s nineteen steps; six stations keep one verbatim line each, and the road ends at a blank',
          '/n/<handle>/<slug> public page (what visitors see first) · /preview/<project> same-origin read-only lens (the same controls as visitors)',
          '/tasks task ledger (one AI request per row, with attempt count, real/DEMO badge, usage and latency) · /credits your quota (SavingsCard: duplicate computation the cache absorbed for you) · /api-tokens API tokens · /analytics your stats · /pulse the observatory hall (platform-wide aggregate, passphrase 123) · /notifications inbox · /ship ship log · /about-nexus about',
          '/admin/* admin console (role=admin): moderation, pricing, dead-letters, ai-cache, audit, observability, users, rate-limit, etc.',
          '/admin/observe the read-only observer (passphrase 123 — publicly stated): existing server-side aggregates for signups, opens, likes, comments, saves, task outcomes, plan distribution, the 7-day opens trend and rule advice. It is not a generic click stream and must not present synthetic simulation traffic as observed human behavior. “Trend projection” is server-side least-squares extrapolation, explicitly not AI; it needs at least four samples, and empty or all-zero series must not masquerade as valid forecasts. AI deep-reads and structured suggestions work only with an available real provider; while it is closed, the raw metrics remain visible with an explicit unavailable state.',
        ],
      },
      {
        heading: '④ How games work here',
        body: [
          'Action surface (/game/<id>): WASD or arrow keys to move; Space to attack. The HUD in the top-right corner shows health, time, the number of enemies on the field, pickups (items x/y), the number of discoveries and the number of activations — complete the whole level before looking at the end-of-game results.',
          'Dead? Restart: the “Restart” button on the outcome screen re-runs (Space also bound); runs are self-contained, no cross-run checkpoints.',
          'Next stage layout is decided by @nexus/game-model from where you ended — your previous coordinates seed the next enemy placements.',
          'RPG adventure (/game/<id>?view=rpg): WASD/arrows to walk; Space/Enter near an NPC to talk; pick options with arrows + Space; dialogue choices write into your world file (visible in the character panel).',
          'These games grow from YOUR project: boards, enemies and numbers come from your own design system/cast — not a pre-baked product; tweak numbers in Studio and the next run plays by them.',
          'The Hall of Canon ships games too: /bible/quiz (Tide Challenge — canon quizzes, lit beacons) and /bible/well (Seven Wells) — see ⑪.',
          'Honesty note: the game itself has no cloud save and no auto checkpoints — every run settles independently; once you wipe-screen out, there is no carrying HP forward.',
        ],
      },
      {
        heading: '⑤ Quota & what DEMO MODE means',
        body: [
          'Real quota is consumed only after an available configured provider completes a call. While the external API is closed, related entry points must stay in DEMO MODE or explicitly say they are unavailable; DEMO output is deterministic simulation, not a real model’s work and not evidence of real usage.',
          '/credits shows the live ledger: every AI call records tokens in/out, model, latency, cost. All real numbers; SavingsCard on that page tallies how much duplicate computation the cache absorbed for you (hit rate, prompt-token reuse, real vs DEMO turns).',
          'About "cache-hit rate": it measures provider-side prefix-cache reuse. A hit usually reduces billed tokens for a repeated prefix; a miss can come from changed bytes, routing, cache state or timing, and does not by itself prove user error.',
        ],
      },
      {
        heading: '⑥ Frequently asked questions',
        body: [
          'Q: Why is a generated page blank or unavailable? A: A blank page is not success. Check whether it says DEMO MODE, provider not configured or service unavailable, then check the network and service state; only a successful real-provider response counts as real generation.',
          'Q: Is a low cache-hit rate my fault? A: Not necessarily. Prefix bytes, routing, provider cache state and the time window can all affect it. Check the current ledger and request distribution at /admin/ai-cache instead of treating a historical high hit rate as a promise.',
          'Q: How do others see my work? A: Save, open Publish in the top bar, choose Public, Unlisted or Private, clear the gates and publish. Only Public enters /discover; Unlisted stays out of lists; Private and unpublished projects remain private.',
          'Q: Is my data safe? A: Design edits use Command history and you choose publication visibility; neither is automatic backup or a permission audit. You can switch a public work back to Private in the publish panel, but that does not erase cached or downloaded copies.',
        ],
      },
      {
        heading: '⑦ How the storyboard works (§40–§42)',
        body: [
          'Open the “Storyboard” tab at the bottom of Studio → write one sentence and press “Generate a storyboard draft”. That is local deterministic splitting by punctuation into a shot list — not AI storyboarding; nothing is faked before a provider is integrated.',
          'Per shot you can change: duration (ms), camera (Wide/Medium/Close-up/Detail/Tracking/Aerial), transition (Cut/Fade/Dissolve/Wipe); hit “DEMO reference” to compose a reference frame for the shot — pixels come from a local deterministic synthesizer, not AI output; undo only drops the link, it never deletes the asset.',
          '“DEMO-render the whole storyboard” renders the entire board into one mp4 attached to the first shot: real ffmpeg, real quota door, real video-ingest gate, product is DEMO (local inference, not AI generation) and is labeled as such at the button.',
          'The timeline is directly editable: drag a cell’s right edge to resize (snaps to 100 ms, minimum 200 ms), drag the block to reorder, double-click a cell to split at the click point; keyboard: Tab to the right edge, arrows nudge (Shift = 500 ms per step), Enter commits, Esc cancels — all four paths edit the same model and are undoable.',
        ],
      },
      {
        heading: '⑧ Step into a world and play',
        body: [
          '/world/<id> is the 3D walk view: WASD or arrow keys move; hold the left mouse button and drag to look around (drag up = look up); get close to an NPC and use the “Talk to the character” option that appears beside them to talk.',
          '/world/<id>/chronicle — story and history entries arranged by era (Grey-Lamp Age / Ash Age / Iron-Moon Age — whatever YOUR project’s eras are), characters and chronicle light each other up (with an available real provider, the world panel’s “AI link” makes one model call to connect two existing entries — invented ids are dropped); entries can carry “memory echoes” — pure sensory etchings, ≤ 240 chars, not plot summaries; with an available real provider, “AI write echo” makes one model call grounded only in that entry’s own body. While the provider is closed or unavailable, both actions say so instead of pretending to write.',
          '/world/<id>/digest world digest · /world/<id>/integrity world checkup (reports real issues only: era drift, missing echoes, orphan entries — no fake scoring) · /world/<id>/quests world commissions (three real gaps picked per day, each with three concrete steps; a counter at zero really leaves the board, and an empty world teaches you the first entry) · /world/<id>/tide world tide · /world/<id>/ephemeris world calendar projection · /world/<id>/codex the lore tome · /world/<id>/constellation the character graph · /world/<id>/network the power skeleton (hubs answer “who is crossed by the most relations”, cliques are mutually entangled strong components, joints are bridges that split the graph if cut — graph-algorithm projections over the same world document, never edits).To take your world with you, press “Export Markdown” — a fixed nine-section order with eras, order numbers and memory echoes, all local with no network. As the world grows, use the filter under the summary to find entries by title, body, era or memory echo — the nine sections then show only matches. The Sort button beside the filter cycles through insertion / era / title — it changes only this list view, never the document you wrote. To bring it back, press “Import Markdown” and pick that .md — entries with bodies are appended to the current world without overwriting anything; eras, order numbers and memory echoes are restored, and a bad format reports an error and writes nothing. As a world grows it gathers empty bodies, duplicate titles and broken links — press “World checkup” any time: it reads without writing, counts the problems and gives one actionable next step. A world becomes a web when its entries connect: press “Connection hints” — it points out possibly related entries using only the eras and shared words you wrote, and only writes an edge when you press “Connect”. It invents nothing. To lay out a land quickly, press “Sow a world seed” — it grows a coherent nine-section starting chapter from the world name, with geography, factions and characters referencing each other. Procedural and append-only, never lore — rewrite it freely.',
          'Every one of these pages is a projection of YOUR project — the world pages are not “the official story”; they are the structure of the world you drew, rendered.',
          'Fancy the canon text of this universe? Go to /bible — fourteen chapters of the Tide Conclave plus two hundred twenty-nine echoes, anchor sentences aligned word-for-word between Chinese and English. Two more buttons: "Tide Challenge" is a canon quiz (131 questions; a wrong answer links straight to Ask the Canon); “Ask the Canon” sends the canon to a real model only when an available provider is configured — ask in Chinese and it answers in Chinese, ask in English and it answers in English, and if the canon does not hold the answer, it says “the canon does not hold this” plainly.',
          'Want AI to read your data? Under the rule-based Creator Agent analysis in /analytics, there is also a “let the model look at my data” button. It calls a real model only when an available provider is configured — it is not a template; while the provider is closed, the UI explicitly says unavailable.',
        ],
      },
      {
        heading: '⑨ Marketplace, invites and teams',
        body: [
          '/marketplace — the component marketplace: browse what authors have listed, see who has bought them, buy or refund; every item sold in the market has a real settlement path. With an available real provider, the “AI picks” section at the top has the model read measured fields of the first three items on the shelf (price / downloads) and write one sentence for each, based on those fields alone — prices and download counts are real; the model does not judge work quality. While the provider is closed or unavailable, the section explicitly says unavailable.',
          '/invites/<token> — accept a team invite: project members send invite links from the Studio Team panel; accepted collaborators hold a seat (seats are capped; expired invites stop holding one).',
          '/api-tokens — mint a token for CI/scripts to read and publish your content programmatically; /tasks shows the real queue and state of every cloud task.',
          '/ship daily delivery log (with an available real provider, the model writes 2-4 sentences from the current git log’s mechanical counts — commit count, type distribution and ADR count are derived from the current reading, never a hard-coded historical sample) · /notifications inbox (with an available real provider, the model does counts-only triage: moderation/approval/team outrank likes and follows; no title or body ever reaches the model) · /analytics your works’ stats · /pulse the observatory hall (whole platform, aggregated & anonymous, passphrase 123) · /observatory the public observation hall (rule-projected, public, passphrase 123; with an available real provider, AI deep-read drafts actionability-ranked suggestions from measured aggregates, with basis / impact / next steps, and AI independent review recomputes the board and rules agrees / disagrees per line, each citing figures; while it is closed, raw metrics remain visible and model actions say unavailable) · /credits your quota ledger — all real data pages.',
        ],
      },
      {
        heading: '⑩ Made a wrong move? Undo it',
        body: [
          'With the canvas focused, Cmd/Ctrl+Z undoes the most recent Command in the design model’s History; Cmd+Shift+Z / Ctrl+Y redoes it. History is a real reversible operation stack, not the browser’s text-input undo. Chat, world, game and storyboard state are separate; do not assume they share this stack.',
          'Studio’s design, world, game and storyboard stores save separately. Cmd/Ctrl+S runs the current save flow; it does not create a named snapshot or prove that all four stores persisted. Use the snapshot entry when you need a named snapshot.',
          'Confirmation and recovery differ by destructive action, so read that control’s own label; Cmd/Ctrl+Z is not a universal restore for deleted projects, unpublished works or deleted shots. The publish panel submits the selected visibility directly without an extra confirmation card. Switching back to Private stops public distribution but does not erase cached or downloaded copies.',
        ],
      },
      {
        heading: '⑪ How the Hall of Canon works (/bible)',
        body: [
          '/bible — the canon proper: fourteen chapters of the Tide Conclave, plus two hundred twenty-nine echoes — every chapter opens to read; anchors align character-for-character between zh and en (zh source bytes / en counterpart, never mixed). Want to know which echoes write about the same named thing? Open "Echo threads" from the Hall of Canon footer: the tide-seal, the salt ledger, the night key — each with the echoes that carry it and their verbatim anchors.',
          '/bible/search — type a keyword, fetch the exact canon passage (pure local retrieval; no AI generation, no outside sources). Want to know what the term means in the real world? The "real world · outside the platform" lane at the bottom of /search comes from Wikipedia and is ranked separately from in-platform results.',
          '/bible/quiz — the Tide Challenge: canon-aligned quizzes; wrong answers point back to the chapter to re-read; lit beacons stay on your machine (no cloud save; refresh keeps nothing).',
          '/bible/well — Seven Wells: the Hall’s second game — follow seven clues back to seven lost wells; found wells open the way; unfound wells honestly say they are not found.',
          '/bible/whisper — the Answerer: with an available real provider, pick any chapter (or echo) and ask one line; if the canon answers it answers in the chosen language; if not, it says so plainly. No persistence — refresh is silence; while the provider is closed, the page explicitly says unavailable.',
          '/tide-oracle — The Tide Oracle: with an available real provider, ask the tide one thing and it reads the World Bible for what the canon holds — two sentences at most. No prophecy, no advice, no invented facts. Unlock with /insight (passphrase 123).',
          '/daily · The Daily Tide: one edition per day, drawn deterministically from the canon — with an available real provider, the model reads only that leaf and writes three sentences and one ponder; same leaf for everyone on the same day; the canon stays the authority. While the provider is closed, the canon leaf remains available and model text explicitly says unavailable.',
          '/tide-wire — Today’s tide wire: a public page where the tide says two sentences over the real aggregate counts of the platform (no prophecy, no project names); counts come from the real database, the model is asked at most once per hour, a quiet platform stays honestly quiet. With no available real provider, real counts remain visible and the model text stays blank or explicitly unavailable.',
          '/tidewatch · Tidewatch: with an available real provider, each move is one compiled StateGraph (analyze the move → retrieve canon anchors → narrate + a structured delta → verbatim-guard against the canon → assemble); world state rides on localStorage (no database write); echo unlocks only stick for echo numbers that exist in the canon. Unlock with /insight (passphrase 123). While the provider is closed, model-driven moves explicitly say unavailable rather than pretending to run.',
          '/bible also carries “Let AI read it to you” at the end of every chapter: with an available real provider, the model reads only an excerpt of that chapter, says it in three sentences, then hands you one question (never the answer) — cached per chapter and language for 7 days, so it never double-bills. While the provider is closed, the control explicitly says unavailable.',
          'Echoes: hang micro-sensory etchings (≤ 240 chars, not summaries) onto canon entries; they light each other up across the star-graph and the chronicle.',
          'Everything here is a private playroom: reading needs no sign-in (runtime counters only); nothing pulls you into the plot — it only points at where the road goes.',
        ],
      },
      {
        heading: '⑫ Ask the Canon — how the answer is actually produced',
        body: [
          '“Ask the Canon” (/bible/ask) is not “throw the prompt at the model and hope”. With an available real provider, it runs a StateGraph chain: a short prompt extracts only retrieval terms (analyze — without burning a long context); pure-algorithm character-bigram Jaccard matches canon passages directly (retrieve — the model is not called for this step, 0 tokens); then the model answers with the full canon text plus the matched passages as evidence (draft); then a mechanical verifier checks three things — empty answers, invented chapters or echo numbers, and references to anchors that do not exist (verify). It answers only if the gate passes; otherwise one revise round runs, and if that still fails the UI says so honestly. While the provider is closed or unavailable, the page explicitly says unavailable rather than presenting a local retrieval result as a model answer. After the answer arrives, the collapsible “Retrieval evidence” panel shows the matched top-3 passages verbatim — which passages constrained the answer, so the reader can see rather than trust.',
          'Every answer surfaces two badges: ① cache-reused N tokens from the actual ledger, with no fixed hit-rate promise; historical identical-prefix requests once approached 95%, but the current value belongs to this turn and /admin/ai-cache. ② A citation verdict — “Quoting the canon verbatim ✓ (N lines)” / “Not in the canon — the Inquiry says so honestly” / “Free answer — no verbatim anchor from the canon”. Tap ② to see exactly which anchor lines the model quoted, line by line and unedited.',
          'StateGraph is a first-class orchestration primitive in this repo’s own agent runtime (@nexus/agent-runtime, ADR-0270/0275) — nodes, state, and conditional edges, the same “state + graph” model LangGraph popularized, driving the real chain you see.',
          'A passed quiz is that; an unanswered canon question is also “the canon does not hold this — the canon itself says so”. No model is allowed to bluff the canon.',
          'The draft system prompt is a byte-stable digest of the fourteen canonical chapters + the echo anchors, which gives provider prefix caching a stable basis. Actual reuse still depends on provider state and routing; read the current per-request result and /admin/ai-cache rather than assuming a fixed percentage.',
        ],
      },
      {
        heading: '⑬ Canvas keyboard/mouse cheat sheet',
        body: [
          'Wheel (page convention by default): wheel up = look up, wheel down = look down. If your mouse/OS reports the delta flipped, the top «Wheel» button switches it to inverted — and back.',
          'Right-button drag pans the canvas (middle button or Space also pan); Shift + wheel pans horizontally; Ctrl + wheel anchors-zoom, 0.1×–4×.',
          'Top «Fit window» button (Shift+1): fits the whole document into the viewport.',
          'Ctrl+G toggles the alignment grid; arrows nudge 1 px, Shift+arrows 8 px, Delete removes the selection.',
          'Every panel has a title bar; the top bar has «+ New page»; the panels’ search boxes (Ctrl+F) search by name.',
        ],
      },
    ],
  },
};

export type GuideSection = { heading: string; body: string[]; anchor: string };
export type GuideCopy = Record<Locale, { kicker: string; title: string; lede: string; sections: GuideSection[] }>;

function withAnchors(copy: GuideCopyInput[Locale]): GuideCopy[Locale] {
  return {
    ...copy,
    sections: copy.sections.map((section, index) => ({
      ...section,
      anchor: `guide-section-${index + 1}`,
    })),
  };
}

export const GUIDE_COPY: GuideCopy = {
  zh: withAnchors(COPY.zh),
  en: withAnchors(COPY.en),
};
