// 用户说明书 / User guide —— 说明书与 Studio 内置帮助抽屉（InAppGuide）共用这同一份字典
// （v788 起抽离为 shared module；改文案只改这里，不改页面里）
import type { Locale } from '@/lib/i18n';
const COPY: Record<Locale, { kicker: string; title: string; lede: string; sections: { heading: string; body: string[] }[] }> = {
  zh: {
    kicker: '用户指南',
    title: '三分钟看懂 NEXUS · 十五分钟玩起来',
    lede: '这不是一份帮助文档，是一册工具说明书——告诉你这里的每一项能力是什么、怎么用。中英都可，随你喜欢。',
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
          '⌘K（或 Ctrl K）打开命令面板——输入项目名或任意页面关键词（如 "发布" 或 "ship"），Enter 直接跳。',
          'Ctrl S（Mac ⌘S）保存；按 "?" 键呼出键盘速览卡——真实清单（⌘K 面板、Ctrl Z / Ctrl Y、方向键微移、Shift+方向键 8px 网格、Ctrl+A 全选、Ctrl+G 网格、Delete 删除）。',
          'Ctrl G 显示或隐藏对齐网格；方向键微移 1px、Shift+方向键 8px 网格、Delete 删除选中。',
          '做完一切后先 Ctrl S 保存，再点顶栏"发布"把项目投进广场——别人才能在 /discover 发现它；此前只属于你自己。',
          '下一站：/ship 看这次交付的每日日志；换真 provider 之后同一条流水线产出真东西。',
          '卡住了？按 ? 键读一遍速览卡，或先看 /guide 里 ④ 游戏怎么玩、⑤ 额度 & DEMO MODE。',
        ],
      },
      {
        heading: 'AI 是怎么在这里说话的？（StateGraph 小课）',
        body: [
          '遇到 AI 改设计时，请求会坐两条车道之一：车道 A 直发 /v1/ai/run；车道 B 走一条可推演的**状态图**——LangGraph 的显式状态机：validate（校验输入）→ check_provider（按 modelClass 选档模型）→ build_prefix（拼装稳定前缀，为了让 provider 前缀缓存打中）→ call_llm（真正打 gpt-6.2-sol）→ cache_read（命中即跳过 provider）→ parse_and_release（补丁合法性校验）→ assemble（组装契约响应）。任何失败直通 END——绝不空转。',
          '为什么要一条图而不是一根绳子？状态图把 AI 调用变成一条可以推演、可以撤销、可以局部重放的流水线，而不是一个黑盒 API。x-nexus-orchestration: stategraph 是「你刚刚看的是那条图」的唯一公开标志；响应体与车道 A 逐字节同构。',
          '有效果验证：同字节前目录的一轮二连发，prefix 缓存命中 21265/21268（≈99.99%）——实打实省下的 token，不是演示数字。/admin/savings（管理员 → Savings）能看到 tokensIn 与 cachedTokens 两列账。',
          '想更深？apps/ai-service/src/ai_service/stategraph.py 是这张图的文字实现——可读性即可教性；测试 tests/test_stategraph.py 8 臂逐一说明 validate / check_provider / dryRun / patch 非法 时直通 END 的原因。',
          '想亲手按一下试试？/stategraph —— 公开只读的 StateGraph 落点页：七个节点的旅程、失败直通 END 的条件边、以及一个真图试跑按钮（固定 critique + dryRun + fast，真 provider、真 x-nexus-orchestration 头、真计量；失败如实展示 409/429/502/503）。',
          'LangGraph 是默认车道（cont. 222）：POST /api/ai/run 缺省即走 /v1/ai/design-graph（validate → check_provider → build_prefix → call_llm → cache_read → parse_and_release → assemble）；要降级回顺序执行，带请求头 x-nexus-orchestration: lane-a 或设服务端 env NEXUS_AI_ORCHESTRATION=lane-a；响应头如实回声车道，/admin 指标 nexus_ai_run_lane_total 计数每次分流；拼写错误绝不悄悄换道。',
        ],
      },
      {
        heading: '③ 功能地图（点进去就是那个页面）',
        body: [
          '/discover 广场（热门/最新/ trending / 我关注的；为你推荐：AI 照你自己的实测阅读 myOpens 排；馆长批注：trending 榜前三由 AI 照三条真实指标（浏览/赞/评/转/热度分）各写一句为什么值得打开，每条必含数字）· /marketplace 组件/模板/资产市场 · /blocks 积木库 · /search 全站搜索',
          '/studio/<project> 项目主场：画布/图层/设计系统/3D · /world/<id> 走进这个世界（3D 步行）· /world/<id>/digest 世界速览 · /world/<id>/integrity 世界体检 · /world/<id>/tide 世界潮汐 · /world/<id>/almanac 世界年鉴 · /world/<id>/constellation 人物关系星图 · /world/<id>/codex 设定集（纸面投影）· /world/<id>/chronicle 编年 · /world/<id>/ephemeris 世界切片',
          '/bible 典籍室：正典精读 → 《潮汐教团》十三章 + 二百零八回响；/bible/search 直达（正典本地检索）· /bible/quiz 潮汐挑战（正典问答）· /bible/well 七口井（典籍室第二个玩法）',
          '/bible 收录第三种玩法：/bible/anchors 锚句回放——1260 句中英锚句逐字回放，抢答它出自哪一章（连对 / 历史最佳本地记）',
          '/n/<handle>/<slug> 公开页（访客第一眼看到的是这一版）· /preview/<project> 同源只读镜头（发布前同一排断点与缩放）',
          '/tasks 任务账本（每次 AI 请求一行，含第几次、真/DEMO、用量、用时）· /credits 我的额度（SavingsCard：缓存替你省下的重复计算）· /api-tokens API 令牌 · /analytics 我作品的数据 · /pulse 观测大厅（平台聚合匿名统计，口令 123）· /notifications 收件箱 · /ship 交付日志 · /about-nexus 关于',
          '/admin/* 平台管理台（role=admin）：审核台、pricing、dead-letter、ai-cache、audit、observability、users、pricing、rate-limit 等',
          '/admin/observe 只读观察站（口令 123 · 口令公开）：看平台所有用户的真实行为——注册、打开、点赞、评论、收藏、任务结局、套餐分布、7 天打开趋势图与下行规则建议；顶部新增「趋势预测」带（服务端最小二乘线性外推，明确标注非 AI；样本不足 4 天就不拟合）；「AI 深读」按钮（gpt-6.2-sol，输出必含数字，否则服务器原样拒绝展示；模型现在也能看到这组服务端外推数字）/admin 里也摆着「观察站」入口与直通链',
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
          '每个免费账户每月有 AI 额度。真用 wkapi.pro 上的 gpt-6-sol 这类真 provider 会扣真额度；没配真 provider 时会显示 DEMO MODE 标识——系统仍然能走通流程，只是出的东西是确定性模拟出来的"看起来像 AI 做的东西"，不是真模型的作品。',
          '/credits 页面可以实时看消费账单：每次 AI 调用都记 token in/out/model/latency/cost——任何一笔都是真的数字，不是演出来的；账本里的 SavingsCard 会把"缓存替你省下的重复计算"摊给你看（命中率、输入 token 复用、真模型/DEMO 轮次分得清）。',
          '看到"缓存命中率"这个词：它反映 provider 端的 prefix cache 复用率——同一个前缀的下一次调用如果命中了，就免费少数 token；不命中也不证明你做错了，只证明分布器把你的请求放到了一个新分片。',
        ],
      },
      {
        heading: '⑥ 常见问答',
        body: [
          'Q：为什么我按了个按钮，整页空白了？A：这是 DEMO MODE 的特性——未配置 provider 时，生成路径不写真实代码；等到你在环境变量里配置好真实 provider 并跑通第一次真实调用，那些页就"亮"了。',
          'Q：缓存命中率低是我的问题吗？A：不是——你在看的是 provider 端的 KV 分布片分配；把同一 lane 打满 6–10 次大概率出现 1 次未命中；可以在 /admin/ai-cache（admin）看自己的使用账。',
          'Q：怎么让别人看到我的作品？A：顶栏发布→填标题→发布；发布后自动进广场/市场；发布前作品是私密的。',
          'Q：数据安全吗？A：所有 AI 改动都进审计账本、可撤销 Command；公开作品随时可撤回。',
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
          '/world/<id>/chronicle 编年史：故事/历史条目按纪元排开（灰灯纪/灰烬纪/铁月纪……你项目自己的纪元名），人物星图 ↔ 编年互相点亮；条目可挂「记忆回声」——纯感官刻痕，≤ 240 字，不是梗概。',
          '/world/<id>/digest 世界速览 · /world/<id>/integrity 世界体检（只报真问题：纪元错位/回声缺失/孤儿条目，不打分不假绿）· /world/<id>/tide 世界潮汐 · /world/<id>/ephemeris 世界日历投影 · /world/<id>/codex 设定集 · /world/<id>/constellation 人物关系星图。',
          '这些页面全部是你的项目数据的投影——世界页不是"官方故事"，是你画的世界自己的结构。',
          '想读这个宇宙的正典文字？去 /bible 翻《低语诸王》十三章正典——锚句中英字字对齐的正典、可以直接收藏的典籍室。另外还有两个按钮：「潮汐挑战」是正典小测（一百三十一题，答错带题目直通问典）；「问典」是把正典喂给真模型——问中文答中文、问英文答英文、典籍里没有的它直接说"典籍里没有"。',
          '想让 AI 读你的数据？/analytics 里的 Creator Agent 规则分析底下——也藏着一个「让大模型看看我的数据」按钮——它跑的是真 provider，不是模板。',
        ],
      },
      {
        heading: '⑨ 市场、邀请与团队',
        body: [
          '/marketplace 组件市场：浏览作者挂牌的东西、看谁买过、买下或退货；市场里卖的东西每一件都有真实结算路径。顶部的「AI 选品」会让大模型读货架前三件的实测字段（价格 / 下载量），各写一句为什么值得看——价格与下载量都是真的，作品质量模型不碰。',
          '/invites/<token> 接受队伍邀请：项目成员从 Studio 的 Team 面板发出邀请链接，接受后成为协作者（席位有上限；过期邀请不再占席）。',
          '/api-tokens 自建机器人：给 CI/脚本一枚令牌，就能用程序化方式读写你的内容与作品；/tasks 里能看到每个云端任务的真实排队与状态。',
          '/ship 每日交付日志（AI 平台速览：大模型照真实 git log 机械统计写两段话——2 天 90 次提交、feat 47/fix 20/docs 12/merge 6/test 5/328 ADR 之类的数字都是真的，文字是它写的）· /notifications 收件箱（AI 先读一下：模型只看按类型聚合的实测计数——等你结论的 moderation/approval/team 优先，like/follow 最后；标题 / 正文一个字都不进模型）· /analytics 你的作品数据 · /pulse 观测大厅（平台全站聚合匿名，口令 123）· /observatory 公共观测大厅（带规则外推预测的公开围观，口令 123；AI 深读：让大模型基于实测聚合数字起草四条按可操作性排序的优化建议；AI 独立复核：让大模型把展板上的数字重算一遍，逐条判 agree/disagree（每条必含数字））· /credits 你的额度账本——每个都是真实数据页。',
        ],
      },
      {
        heading: '⑩ 走错一步怎么走回来',
        body: [
          '⌘Z（或 Ctrl Z）一次撤销最近一个 Command——对话、画布、分镜、状态补丁、断点，全部走同一条撤销栈；重做是 ⌘⇧Z / Ctrl Y。',
          '删除类操作（删除项目/撤发布/删镜头）都有二次确认；删掉的项目进回收站、可以恢复；公开作品随时可撤回到 private。',
          '发布前最后一步是确认卡——没点头就不会投进广场；AI 的危险动作（删/发/花额度）同样有人审门，没批准就不执行。',
        ],
      },
      {
        heading: '⑪ 典籍室（/bible）怎么玩',
        body: [
          '/bible 正典精读：《潮汐教团》十三章 + 二百零八回响——每一章点开就能读，锚句在中英之间字对齐（zh 原字节 / en 对照，不混写）。',
          '/bible/search 直达：在正典里按关键词做本地检索，直接读出命中的那一段（不出 AI、不出库外来源，慢一步但是真检索）。',
          '/bible/quiz 潮汐挑战：以正典出题——答错回哪一章重新对，点亮的路标留在本机（无云存档，刷新照旧）。',
          '/bible/well 七口井：典籍室的第二个玩法——顺着七条线索找回失落的七口井；找对了就开出一段地方，找不到的照实说找不到。',
          '/bible/whisper 答问者：挑一卷正典再问一句——典籍里有写的就照它写的答，没写的就直说没写。零持久化、零记忆，刷新就是忘了。',
          '/tide-oracle 潮语 · 潮汐预言：向潮问一句话，潮从正典里读给潮说的那句话——两句以内；不预言、不投资、不替你拿主意，正典里没有的一个字也不编。解锁同 /insight（口令 123）。',
                    '/daily 今日潮候：每天一期，从正典里确定性地抽一叶——模型只读这一叶、写三句话和一句思考题；同一天所有人看到同一期，正典永远以原文为准。',
                    '/tidewatch 潮候步进（Tidewatch）：让潮记下你这一步——每一步就是一张编译后的 StateGraph（analyze 读局 → retrieve 本地锚句检索 → narrate 潮回叙事 + 结构化 delta → canon_guard 逐字核验 → assemble 落账）；状态随 localStorage 走（不落库），回响解锁只接受典籍室里真实存在的编号；解锁同 /insight（口令 123）。',
'/tide-wire 今日潮声：公开页，真实平台聚合数字上潮说两句（不预言、不认项目）；计数来自实库，模型每小时最多被问一次，空平台诚实留白。',
          '/bible 每章末尾还有「让 AI 读给你听」：模型只读本章原文摘录，三句话说清这章，最后递一句思考题（不替你回答）；同一章 / 同语言 7 天内缓存，不重复计费。',
          '回声（Echoes）：给正典条目挂一条纯感官的微刻痕（≤ 240 字，不是梗概），它能在星图与编年里互相点亮——星图↔编年彼此唤醒。',
          '以上都是私有玩的地方：读不需要登陆（只有运行时计数）；不把你的选项藏在 AI 里——它只为你指出路在哪。',
        ],
      },
      {
        heading: '⑫ 问典与大模型——「问典」两字的来路',
        body: [
          '问典（/bible/ask）不是「把问题丢给模型瞎编」。它是一条 StateGraph 编排的链：先用一段短提示只抽检索词（analyze，不烧长上下文）；接着用纯算法字符二元组 Jaccard 直接命中典籍段落（retrieve，不调模型，0 token）；把正典全文和命中的证据段落一起丢给模型作答（draft）；最后用机检空答案/发明章回响/不存在的锚句引用三项（verify）——过了再说、过不了就 revise 一轮，依然过不了就如实标注「不合格」。回答完，「本轮检索依据」折叠面板会把被命中的 top-3 原文段落逐字摊开——模型被哪几段定住了，读者亲眼看见。',
          '每次答复下面还会挂两枚确定性徽章：①缓存复用 N tokens（问次数 × 同一 system 前缀的 KV 复用率——2.4 万 token 的正典摘要重用同一页就能看一次世~95%）；②引文判定——「引经据典 · 逐字对齐 ✓（N 条）」／「正典没写 · 如实说没有的答复」／「自由作答 · 未逐字引用锚句」。第二枚细看下去还能展开，把模型逐字引到的那几条锚句原文一行行点开。',
          'StateGraph 是 agents/runtime 里真正的编排原语——节点、状态、条件边，和 LangGraph 同源的「图 + 状态」模型；修订回路在图里真的走完、修订上限两轮硬封顶，不会陷入「一边改一边错」的死循环。',
          '潮汐挑战答对就是对；问典答不出时，潮汐也答不出——典籍管它叫「典籍里没有」。绝不替典籍撒谎，绝不替潮海投机。',
          'draft 的 system 是字节级稳定的正典摘要（十三章正典全文 + 锚句中英对照），前缀复用因而 KV 命中率在 /admin/ai-cache 里看得见。',
        ],
      },
    ],
  },
  en: {
    kicker: 'User Guide',
    title: 'Three minutes to understand NEXUS · Fifteen to start playing',
    lede: 'This is not just a help page — it is the manual: what every capability is, how to use it. Switch language anytime with the top-right toggle.',
    sections: [
      {
        heading: '① What is this thing?',
        body: [
          'NEXUS is an AI Universe Studio — a place where your spoken intent becomes a design model, then real websites, games, videos and worlds that actually open.',
          'Create a project → lay out the design → let AI assist → export / publish / play the games inside.',
          'Not an "AI toy": every AI change goes through a revocable Command stack; every asset is yours; DEMO MODE is a standing badge — unconfigured providers are never faked as live.',
        ],
      },
      {
        heading: '② New here? A 2-minute first run-through',
        body: [
          'Sign up → "New project" → give it a name → you land in Studio (left panel + canvas + right inspector).',
          'In Studio, select something on the canvas (mouse or Tab) → hit "New page" in the top bar, or drag components from the left onto the canvas.',
          'Say one sentence to the AI (e.g. "make the title 72px serif") — every AI turn lands as a Command you can undo with Cmd/Ctrl+Z; no provider configured ⇒ no pretend magic, the DEMO MODE badge shows.',
          'Press Cmd/Ctrl+K to open the command palette — type a project name or any path keyword ("publish", "ship", "tide") and Enter jumps straight there.',
          'Cmd/Ctrl+S to save; press "?" to pull the speed-cheat card on screen — the whole real list (⌘K palette, Ctrl+Z / Ctrl+Y, arrow nudges, Shift+arrows 8px grid, Ctrl+A select, Ctrl+G grid, Delete).',
          'Ctrl/Cmd+G toggles the alignment grid; arrow keys nudge 1px, Shift+arrows 8px, Delete removes the selection.',
          'When it is right: Cmd/Ctrl+S to save, then Publish from the top bar — your project lands on /discover; before that it stays yours alone.',
          'Next stop: /ship to see the daily delivery log; once a real provider is wired, the same pipeline produces the real stuff.',
          'Stuck? Press ? to read the cheatsheet, or jump back to section ④ (games) / ⑤ (quota & DEMO MODE) right here.',
        ],
      },
      {
        heading: 'How does AI "speak" here? (StateGraph in one minute)',
        body: [
          'When AI edits a design, the request takes one of two lanes: lane A directly POSTs /v1/ai/run; lane B runs it through an explicit **stateful graph** — LangGraph-style state machine: validate (input contract) → check_provider (pick model by modelClass) → build_prefix (lay down a byte-stable prefix so the provider\u2019s prefix cache fires) → call_llm (real call to gpt-6.2-sol) → cache_read (hit = skip provider) → parse_and_release (validate patch legality) → assemble (contract-checked response). Any failure short-circuits to END — nothing keeps spinning.',
          'Why a graph and not a straight line? The graph makes the AI call a pipeline you can reason about, replay and partially undo — not a black-box API. x-nexus-orchestration: stategraph is the only public tell that lane B served you; the response body is byte-identical to lane A.',
          'Measured effect: on identical byte-prefixes, back-to-back turns hit 21265/21268 cached tokens (≈99.99%) — real savings, not demo numbers. /admin/savings pairs tokensIn against cachedTokens side by side.',
          'Curious? apps/ai-service/src/ai_service/stategraph.py is the graph written out — readable source is the documentation; tests/test_stategraph.py walks the eight arms: why validate / check_provider / dryRun / invalid patches short-circuit straight to END.',
          'Want to press the button yourself? /stategraph — the public read-only StateGraph page: the seven-node journey, the fail-to-END conditional edges, and a live-probe button (fixed critique + dryRun + fast payload, real provider, real x-nexus-orchestration header, real metering; failures shown honestly as 409/429/502/503).',
          'LangGraph is the default lane as of cont. 222: POST /api/ai/run goes through /v1/ai/design-graph (validate → check_provider → build_prefix → call_llm → cache_read → parse_and_release → assemble) unless you ask for the sequential lane with the header x-nexus-orchestration: lane-a (or env NEXUS_AI_ORCHESTRATION=lane-a on the server). The response header echoes the lane it took and the metric nexus_ai_run_lane_total counts every split; a typo never silently switches lanes.',
        ],
      },
      {
        heading: '③ Feature map (click a path, land on the page)',
        body: [
          '/discover feed (For You: AI ranks by your own measured reading trace — myOpens — and never ranks for people without one; the curator’s note: the top-3 trending cards get one “why open this” each, written by AI from three real metrics (views / likes / comments / remixes / heat), every line citing figures) · /marketplace components/templates/assets · /blocks library · /search global search',
          '/studio/<project> studio · /world/<id> walk this world (3D) · /world/<id>/digest world digest · /world/<id>/integrity world checkup · /world/<id>/tide world tide · /world/<id>/almanac world almanac · /world/<id>/constellation character graph · /world/<id>/codex paper tome · /world/<id>/chronicle timeline · /world/<id>/ephemeris 360-day page',
          '/bible hall of canon → 《潮汐教团》 thirteen chapters + two hundred eight echoes; /bible/search direct hits (local canon retrieval) · /bible/quiz Tide Challenge (canon quiz) · /bible/well Seven Wells (the second game)',
          '/bible gains a third game: /bible/anchors Anchor Echo — the 1260 bilingual anchor sentences replayed verbatim; name the chapter or echo each line came from (streak and best kept locally)',
          '/n/<handle>/<slug> public page (what visitors see first) · /preview/<project> same-origin read-only lens (the same controls as visitors)',
          '/tasks task ledger (one AI request per row, with attempt count, real/DEMO badge, usage and latency) · /credits your quota (SavingsCard: duplicate computation the cache absorbed for you) · /api-tokens API tokens · /analytics your stats · /pulse the observatory hall (platform-wide aggregate, passphrase 123) · /notifications inbox · /ship ship log · /about-nexus about',
          '/admin/* admin console (role=admin): moderation, pricing, dead-letters, ai-cache, audit, observability, users, rate-limit, etc.',
          '/admin/observe the read-only observer (password 123 — the password is public): every real user’s behavior on the platform — signups, opens, likes, comments, saves, task outcomes, plan distribution, the 7-day opens trend and rule-engine advice; a new “Trend projection” band on top (server-side least-squares linear extrapolation — explicitly not AI; no fit under 4 days of samples); the “AI deep-read” button (gpt-6.2-sol — output must carry figures or the server refuses to render it — and the model now receives that server-computed projection as well); a direct link on /admin too',
        ],
      },
      {
        heading: '④ How games work here',
        body: [
          'Action surface (/game/<id>): WASD or arrow keys to move; Space to attack. The HUD shows health, time, live enemies, pickups (items x/y), discoveries and activations — finish the map before judging, not by health alone.',
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
          'Every free account has an AI quota. Real providers consume real quota; without one you see the DEMO MODE badge — the flow still completes, but the output is deterministic simulation, not a real model’s work.',
          '/credits shows the live ledger: every AI call records tokens in/out, model, latency, cost. All real numbers; SavingsCard on that page tallies how much duplicate computation the cache absorbed for you (hit rate, prompt-token reuse, real vs DEMO turns).',
          'About "cache-hit rate": it measures the provider’s prefix-KV hit rate. Same prefix sequence hitting twice means fewer tokens consumed; a miss is not proof of error — the distributor may have placed your request on a cold shard.',
        ],
      },
      {
        heading: '⑥ Frequently asked questions',
        body: [
          'Q: why did the page go blank? A: DEMO MODE short-circuit — no provider configured, so generation can’t write real code. Configure the real provider endpoint in the environment to make those pages "light up".',
          'Q: is low cache-hit-rate my fault? A: No — it’s the provider’s KV-shard lottery. Over 6–10 identical prefix lanes expect ~1 cold shard; admins can see their per-lane bills at /admin/ai-cache.',
          'Q: how do others see my work? A: top-bar Publish → fill title → publish; before publishing it stays private.',
          'Q: is my data safe? A: every AI edit is in the audit ledger, revocable Command; public works recallable anytime.',
        ],
      },
      {
        heading: '⑦ How the storyboard plays (§40–§42)',
        body: [
          'Open the “Storyboard” tab at the bottom of Studio → write one sentence and press “Cut a storyboard”. That is local deterministic splitting by punctuation, not AI storyboarding; no fake generation before a provider is wired.',
          'Per shot you can change: duration (ms), camera (Wide/Medium/Close-up/Detail/Tracking/Aerial), transition (Cut/Fade/Dissolve/Wipe); hit “DEMO reference” to compose a reference frame for the shot — pixels come from a local deterministic synthesizer, not AI output; undo only drops the link, it never deletes the asset.',
          '“DEMO-render the whole storyboard” renders the entire board into one mp4 attached to the first shot: real ffmpeg, real quota door, real video-ingest gate, product is DEMO (local inference, not AI generation) and is labeled as such at the button.',
          'The timeline is directly editable: drag a cell’s right edge to resize (snaps to 100 ms, minimum 200 ms), drag the block to reorder, double-click a cell to split at the click point; keyboard: Tab to the right edge, arrows nudge (Shift = 500 ms per step), Enter commits, Esc cancels — all four paths edit the same model and are undoable.',
        ],
      },
      {
        heading: '⑧ Step into a world',
        body: [
          '/world/<id> is the 3D walk view: WASD or arrow keys move; hold the left mouse button and drag to look around (drag up = look up); stand near an NPC and use the “Talk to the character” entry to converse.',
          '/world/<id>/chronicle — story and history entries arranged by era (Grey-Lamp Age / Ash Age / Iron-Moon Age — whatever YOUR project’s eras are), characters and chronicle light each other up; entries can carry “memory echoes” — pure sensory etchings, ≤ 240 chars, not plot summaries.',
          '/world/<id>/digest world digest · /world/<id>/integrity world checkup (reports real issues only: era drift, missing echoes, orphan entries — no fake scoring) · /world/<id>/tide world tide · /world/<id>/ephemeris world calendar projection · /world/<id>/codex the lore tome · /world/<id>/constellation the character graph.',
          'Every one of these pages is a projection of YOUR project — the world pages are not “the official story”; they are the structure of the world you drew, rendered.',
          'Fancy the canon text of this universe? Go to /bible — thirteen chapters of the Tide Conclave plus two hundred eight echoes, anchor sentences aligned word-for-word between Chinese and English.',
        ],
      },
      {
        heading: '⑨ Marketplace, invites and teams',
        body: [
          '/marketplace — the components bazaar: browse what authors have listed, see who bought what, buy or refund; everything listed has a real settlement path. The “AI picks” strip up top has the model read measured fields of the first three shelf items (price / downloads) and write one line each on why they deserve a look — prices and download counts are real; the model never claims quality.',
          '/invites/<token> — accept a team invite: project members send invite links from the Studio Team panel; accepted collaborators hold a seat (seats are capped; expired invites stop holding one).',
          '/api-tokens — mint a token for CI/scripts to read and publish your content programmatically; /tasks shows the real queue and state of every cloud task.',
          '/ship daily delivery log (AI at-a-glance: the model writes 2-4 sentences straight from mechanically counted git-log figures — real numbers, model-written words) · /notifications inbox (Let AI read it first — counts-only triage: moderation/approval/team outrank likes and follows; no title or body ever reaches the model) · /analytics your works’ stats · /pulse the observatory hall (whole platform, aggregated & anonymous, passphrase 123) · /observatory the public observation hall (rule-projected, public, passphrase 123; AI deep-read: the model drafts four actionability-ranked optimization suggestions from the measured aggregates, with basis / impact / next steps; AI independent review: the model recomputes the board and rules agrees / disagrees per line (every line cites figures)) · /credits your quota ledger — all real data pages.',
        ],
      },
      {
        heading: '⑩ Wrong turn? Walk back',
        body: [
          '⌘Z (or Ctrl+Z) undoes the most recent Command — chat edits, canvas, storyboard, state patches, breakpoints all run through the same undo stack; redo is ⌘⇧Z / Ctrl+Y.',
          'Destructive actions (delete project / unpublish / delete shot / clear selection) all carry a confirmation step; deleted projects go to the recoverable trash; public works can be recalled to private anytime.',
          'Publish’s last step is a confirmation card — nothing enters the feed without your explicit yes; dangerous AI actions (delete / publish / spend quota) are likewise human-gated and refuse to run until approved.',
        ],
      },
      {
        heading: '⑪ How the Hall of Canon works (/bible)',
        body: [
          '/bible — the canon proper: thirteen chapters of the Tide Conclave, plus two hundred eight echoes; anchor sentences align word-for-word across zh and en.',
          '/bible/search — type a keyword, fetch the exact canon passage (pure local retrieval; no AI generation, no outside sources).',
          '/bible/quiz — the Tide Challenge: canon-aligned quizzes; wrong answers point back to the chapter to re-read; lit beacons stay on your machine (no cloud save; refresh keeps nothing).',
          '/bible/well — Seven Wells: the Hall’s second game — follow seven clues back to seven lost wells; found wells open the way; unfound wells honestly say they are not found.',
          '/bible/whisper — the Answerer: pick any chapter (or echo), ask one line; if the canon answers it answers in the chosen language; if not, it says so plainly. No persistence — refresh is silence.',
          '/tide-oracle — The Tide Oracle: ask the tide one thing; the tide reads the World Bible and says what the canon holds — two sentences at most. No prophecy, no advice, no invented facts. Unlock with /insight (passphrase 123).',
          '/tide-wire — Today’s tide wire: a public page where the tide says two sentences over the real aggregate counts of the platform (no prophecy, no project names); counts come from the real database, the model is asked at most once per hour, a quiet platform stays honestly quiet.',
          '/daily · The Daily Tide: one edition per day, drawn deterministically from the canon — the model reads only that leaf, writes three sentences and one ponder; same leaf for everyone on the same day; the canon stays the authority.',
          '/tidewatch · Tidewatch: the tide ledger for your steps — each move is one compiled StateGraph (analyze the move → retrieve canon anchors → narrate + a structured delta → verbatim-guard against the canon → assemble); world state rides on localStorage (no database write); echo unlocks only stick for echo numbers that exist in the canon. Unlock with /insight (passphrase 123).',
          '/bible also carries “Let AI read it to you” at the end of every chapter: the model reads only an excerpt of that chapter, says it in three sentences, then hands you one question (never the answer) — cached per chapter and language for 7 days, so it never double-bills.',
          'Echoes: hang micro-sensory etchings (≤ 240 chars, not summaries) onto canon entries; they light each other up across the star-graph and the chronicle.',
          'Everything here is a private playroom: reading needs no sign-in (runtime counters only); nothing pulls you into the plot — it only points at where the road goes.',
        ],
      },
      {
        heading: '⑫ Ask the Canon — how the answer is actually produced',
        body: [
          '“Ask the Canon” (/bible/ask) is not “throw the prompt at the model and hope”. It runs a StateGraph chain: a short prompt extracts retrieval terms (analyze — no 32k-token digest fired yet); pure-algorithm char-bigram Jaccard hits the digest blocks (retrieve — the model is not called for this step, 0 tokens); then the model answers with the full canon digest plus the matched passage as evidence (draft); then a mechanical verifier rejects empty answers / invented chapters or echoes / non-existent anchor refs (verify) — fail the gate, one revise round, and if it still fails the UI shows it failed honestly. After the answer arrives, the collapsible “Retrieval evidence” panel lays the matched top-3 passages out verbatim — which passages pinned the model, for the reader to see, not trust.',
          'Every answer surfaces two deterministic badges: ① cache-reused N tokens (KV slot reuse on the byte-stable digest — ~95%+ on repeat calls); ② a citation verdict — “Quoting the canon verbatim ✓ (N lines)” / “Not in the canon — the Inquiry says so honestly” / “Free answer — no verbatim anchor from the canon”. Tap ② open to see exactly which anchor lines the model quoted, line by line, unedited.',
          'StateGraph is a first-class orchestration primitive in this repo’s own agent runtime (@nexus/agent-runtime, ADR-0270/0275) — nodes, state, and conditional edges, the same “state + graph” model LangGraph popularized, driving the real chain you see.',
          'A passed quiz is that; an unanswered canon question is also “the canon does not hold this — the canon itself says so”. No model is allowed to bluff the canon.',
          'The draft system prompt is a byte-stable digest of the thirteen canonical chapters + the echo anchors — the whole prefix is reused, so cache hits stay around 90%+ (see /admin/ai-cache for the live read; the ledger-average reads lower precisely because short non-digest calls dominate the count).',
        ],
      },
    ],
  },
};

export type GuideSection = { heading: string; body: string[] };
export type GuideCopy = Record<Locale, { kicker: string; title: string; lede: string; sections: GuideSection[] }>;
export const GUIDE_COPY: GuideCopy = COPY;
