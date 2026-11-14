/** 由 scripts/gen-ship-manifest.mts 机械生成——勿手改。生成于 2026-11-14T07:00:02.230Z (c68f4cf4) */
export interface ShipEntry { hash: string; date: string; subject: string }
export interface ShipDay { date: string; entries: ShipEntry[] }
export const SHIP_DAYS: ShipDay[] = [
  {
    "date": "2026-11-14",
    "entries": [
      {
        "hash": "206279e39b",
        "date": "2026-11-14",
        "subject": "feat(§CACHE-2): token 剔空 -9.4% + 应用缓存命中如实记账（1 次真调 → 122× 回放）"
      },
      {
        "hash": "085239e490",
        "date": "2026-11-14",
        "subject": "docs(§CACHE-2): ADR-0262 + 证据 + 三处索引 + env.example 口径"
      },
      {
        "hash": "dd9fb83771",
        "date": "2026-11-14",
        "subject": "feat(ai): provider-level LLM round-trip latency in /healthz (v694, ADR 0126)"
      },
      {
        "hash": "15bc31b72a",
        "date": "2026-11-14",
        "subject": "feat(§CACHE-2): 缓存读数可观测化——三层账本 + /v1/ai/cache-stats，并据实修正流式结论"
      },
      {
        "hash": "14e58d3038",
        "date": "2026-11-14",
        "subject": "feat(ai-service): fix LLM prefix-cache hit rate via sticky routing + prompt order (v695, ADR 0127)"
      },
      {
        "hash": "a2118c4645",
        "date": "2026-11-14",
        "subject": "feat(§CP-1 + §CACHE-2): 全站命令面板 ⌘K + 缓存三层读数面板"
      },
      {
        "hash": "be83f94506",
        "date": "2026-11-14",
        "subject": "fix(§CACHE-2): 形状校验劈成两半——上游报文没有 measuredAt，面板会永远\"形状不认识\""
      },
      {
        "hash": "467a68e582",
        "date": "2026-11-14",
        "subject": "test(§FE-26): AdminNav 名单 12 → 14，签字人是这两格（dead-letters / ai-cache）"
      },
      {
        "hash": "f49ecadd2b",
        "date": "2026-11-14",
        "subject": "feat(ai-service): coalesce concurrent LLM cache misses with single-flight (v696, ADR 0128)"
      },
      {
        "hash": "dfc17f9ee5",
        "date": "2026-11-14",
        "subject": "feat(ai-service): cross-process single-flight over Redis lease (v697, ADR 0129)"
      },
      {
        "hash": "3321278546",
        "date": "2026-11-14",
        "subject": "fix(§AILIVE-9): 并轨收官尾巴——main 上 Java 三测试钉合并后事实 + 三整页门面化 + 契约三字段"
      },
      {
        "hash": "48f4f4b845",
        "date": "2026-11-14",
        "subject": "fix(§GATE-2) + feat(§CACHE-3): 门禁死循环（33 分钟→4 分钟）+ 缓存读数送到用户眼前"
      },
      {
        "hash": "60f985c4e8",
        "date": "2026-11-14",
        "subject": "feat(§CACHE-3): cacheReported 三态缓存格收官尾巴——「没报」永不冒充「报了 0」"
      },
      {
        "hash": "30c59b5c0b",
        "date": "2026-11-14",
        "subject": "feat(§CACHE-3): CommandBar 结果行缓存读数 chip——hit/miss/unreported 三态（studio 第一屏可见）"
      },
      {
        "hash": "78efe46bb5",
        "date": "2026-11-14",
        "subject": "feat(§CACHE-3): 画布上那一枚缓存 chip——三态视觉刻意分开"
      },
      {
        "hash": "369efb502b",
        "date": "2026-11-14",
        "subject": "feat(observability): unified LLM savings ledger in healthz, metrics and admin (v698, ADR 0130)"
      },
      {
        "hash": "da9e93d0a6",
        "date": "2026-11-14",
        "subject": "fix(§COST-1): 三个 usage fixture 补 costBasis='unknown'（§COST-1 并轨尾巴）"
      },
      {
        "hash": "fe67893e68",
        "date": "2026-11-14",
        "subject": "feat(§COST-1): 单价表——「未计价」不等于「免费」"
      },
      {
        "hash": "543a3c0430",
        "date": "2026-11-14",
        "subject": "feat(§CACHE-4): 上游漂移检测——同一段前缀被数成几个数，是「读数不可比」不是「我们的前缀在变」"
      },
      {
        "hash": "c3b91f0b2c",
        "date": "2026-11-14",
        "subject": "feat(§FE-GE/ASH/DL): 三页合并后门面化补齐视觉判据——Gate 成对，合入不无门"
      },
      {
        "hash": "b38b5588ad",
        "date": "2026-11-14",
        "subject": "test(§COST-1 wire): 从 env 到报文的完整链路判据——costBasis='configured' 必须真的进 wire"
      },
      {
        "hash": "e046b16530",
        "date": "2026-11-14",
        "subject": "feat(§COST-1): /admin/pricing AI 成本·§COST-1 账本读侧——按 basis 把\"钱是从哪来的\"抄进来"
      },
      {
        "hash": "f9a3b12416",
        "date": "2026-11-14",
        "subject": "test(§COST-1): readCostLedger 真库对账——三个口径混编时按 basis 拆得对不对"
      },
      {
        "hash": "024de62f25",
        "date": "2026-11-14",
        "subject": "merge(LLM 计量): 并轨 D:\\终极项目 v691–v698 —— 缓存命中可计、单飞合并、分层账本"
      },
      {
        "hash": "9c4e15afba",
        "date": "2026-11-14",
        "subject": "docs(CURRENT-STATE): 第二次并轨 v691–v698 记账——LLM 计量账本/单飞/粘滞路由进主线（024de62f）"
      },
      {
        "hash": "8528722e50",
        "date": "2026-11-14",
        "subject": "feat(web): user-facing AI savings card on /tasks/<project> (v699, ADR 0131)"
      },
      {
        "hash": "28633834dc",
        "date": "2026-11-14",
        "subject": "feat(ci): verify:evidence-census 从红到绿——两处门缝一验事实核实+一measure+删除死件"
      },
      {
        "hash": "102bd0f02a",
        "date": "2026-11-14",
        "subject": "merge(并轨): v691–v698 提交图合并——并行线的历史真正接上本线"
      },
      {
        "hash": "ddfe91a977",
        "date": "2026-11-14",
        "subject": "feat(§v699-SV): /tasks AI 节省账单并轨——门面化 .sv-* 族 + 真库判据 + 双 SHA 重钉"
      },
      {
        "hash": "4a12b6738d",
        "date": "2026-11-14",
        "subject": "docs(CURRENT-STATE): §v699 并轨收官 + evidence-census 从红到绿（28633834 ddfe91a9）记账"
      },
      {
        "hash": "4185301565",
        "date": "2026-11-14",
        "subject": "feat(web): /credits burn-rate prediction card (v700, ADR 0132)"
      },
      {
        "hash": "45a22033bd",
        "date": "2026-11-14",
        "subject": "fix(main-line): cost-ledger 接进主线门禁 + SV SSR 探针落地"
      },
      {
        "hash": "135f5c8c8a",
        "date": "2026-11-14",
        "subject": "feat(evals): 第十三套 cost-ledger——§COST-1 线账入 §85 评测矩阵（23/23 全绿）"
      },
      {
        "hash": "fc952c5a84",
        "date": "2026-11-14",
        "subject": "docs(ROADMAP/ADR-0131): 并轨 v699 下半场记账——SSR 探针/双 SHA/并轨图补缺/census EXIT=0/cache-warm 100%×3"
      },
      {
        "hash": "846dec5cfc",
        "date": "2026-11-14",
        "subject": "fix(web): dev-mode hydration unblocked + v700 burn card zero-state (cont. 91)"
      },
      {
        "hash": "9882b24802",
        "date": "2026-11-14",
        "subject": "feat(§v700-BN): /credits 燃烬速度卡并轨——门面化 .bn-* 族 + SVG 零 hex + SSR 三态判据"
      },
      {
        "hash": "6adb667576",
        "date": "2026-11-14",
        "subject": "merge parallel lane v700.1 (1 commit): dev hydration unblocked + burn card zero-state"
      },
      {
        "hash": "339fe5f5bd",
        "date": "2026-11-14",
        "subject": "test(§FE-BN): v700.1 零态水印并入后 SHA 重钉（d0deadaa… → 73d81b9f…）"
      },
      {
        "hash": "fe7388348b",
        "date": "2026-11-14",
        "subject": "docs(CURRENT-STATE): 第三次并轨收官（v700 + v700.1）——burn 卡门面化·SSR 三态·SHA 双钉·hydration 修实并入"
      },
      {
        "hash": "7fb3c912e1",
        "date": "2026-11-14",
        "subject": "fix(ai-service): Redis completion-cache replay keeps cached/reasoning tokens (v701, ADR 0133)"
      },
      {
        "hash": "6fe3611718",
        "date": "2026-11-14",
        "subject": "fix(§ai-cache): 并轨 v701（ADR 0133）——Redis 完成缓存回放保住 cached/reasoning tokens"
      },
      {
        "hash": "ae3121e14a",
        "date": "2026-11-14",
        "subject": "docs(CURRENT-STATE): v701（Redis 回放丢两格）并轨记账——pytest 417/18 skipped"
      },
      {
        "hash": "475ff762c0",
        "date": "2026-11-14",
        "subject": "feat(web): admin cross-project AI savings ledger - /admin/savings (v702, ADR 0134)"
      },
      {
        "hash": "c6d52601b9",
        "date": "2026-11-14",
        "subject": "feat(§v702-AS): 并行线未提交的 admin/savings「AI 节省总账」接手完成——运维聚合视图上线"
      },
      {
        "hash": "2215e71c13",
        "date": "2026-11-14",
        "subject": "docs(CURRENT-STATE): v702 接手（/admin/savings 上线）+ spring-cloud proof 参数名修真记账"
      },
      {
        "hash": "95dbf12a28",
        "date": "2026-11-14",
        "subject": "fix(web): lint debt in /admin/savings slice (v702.1)"
      },
      {
        "hash": "8f3e1fe5e4",
        "date": "2026-11-14",
        "subject": "merge(并轨): v702+v702.1 同人同工合并——并行线 /admin/savings 进主线（同片 v702 接手落库）"
      },
      {
        "hash": "971184cb01",
        "date": "2026-11-14",
        "subject": "test(§FE-AS): merge 后字节重钉 SHA（489e81b4… → 1c886ac4…，lint 两行合并入）——7/7"
      },
      {
        "hash": "4d67a2b6ed",
        "date": "2026-11-14",
        "subject": "feat(web): /admin/savings per-user pivot (v702.2)"
      },
      {
        "hash": "7f575f106c",
        "date": "2026-11-14",
        "subject": "docs(CURRENT-STATE): v702.2 由兄弟线自建（按用户维度）——本线不抢/不复制/不打扰；562 ahead 未 push"
      },
      {
        "hash": "16e551ee16",
        "date": "2026-11-14",
        "subject": "merge(并轨): v702.2 per-user pivot on /admin/savings"
      },
      {
        "hash": "10d12a1374",
        "date": "2026-11-14",
        "subject": "feat(§v702.2-AS): per-user pivot on /admin/savings — facade ized + gate re-pinned"
      },
      {
        "hash": "c68f4cf46b",
        "date": "2026-11-14",
        "subject": "docs(CURRENT-STATE): v702.2 并轨落主线记账（10d12a13）——fe-gates 1060/1060 / census 1818"
      }
    ]
  },
  {
    "date": "2026-11-13",
    "entries": [
      {
        "hash": "948d8b9637",
        "date": "2026-11-13",
        "subject": "feat(§FE-98): 未接线空态 `PlayByKind.tsx` `.pk-` 门面化"
      },
      {
        "hash": "8309c90af4",
        "date": "2026-11-13",
        "subject": "feat(§FE-99): 互动叙事 `StoryPlay.tsx` `.st-` 门面化"
      },
      {
        "hash": "4cbe1cd899",
        "date": "2026-11-13",
        "subject": "feat(§FE-100): 3D 行走 `WorldWalk.tsx` `.ww-` 门面化"
      },
      {
        "hash": "0e843d6323",
        "date": "2026-11-13",
        "subject": "feat(§FE-101): AgentPanel 残余裸原子收尾 `.ag-monoOnly`"
      },
      {
        "hash": "e46ed316aa",
        "date": "2026-11-13",
        "subject": "feat(§FE-102): `tools/ci/no-raw-tailwind.mjs`——全树零裸原子钉成可执行门禁"
      },
      {
        "hash": "13df01c20f",
        "date": "2026-11-13",
        "subject": "feat(§ECON-1): 提炼 apps/studio 经济域引擎为 @nexus/economy 包"
      },
      {
        "hash": "1b712d4b81",
        "date": "2026-11-13",
        "subject": "feat(§FE-103/§FE-104): 门面矩阵钉成可执行门禁 + 修复三类静默守恒判据错误 + 一个 AA 违例"
      },
      {
        "hash": "1e1f5b818c",
        "date": "2026-11-13",
        "subject": "docs(SC-§SC-72/ADR-0011): §SC-72 actuator live probe captured — 5/5 NEXUS JVMs boot healthy"
      },
      {
        "hash": "f745559d39",
        "date": "2026-11-13",
        "subject": "fix(§FE-67): published page `.np-`→`.pub-` 命名统一——§FE-6/§FE-67 判据合流发布态"
      },
      {
        "hash": "595d346d6f",
        "date": "2026-11-13",
        "subject": "fix(lint): 3 proof-script TS-assert in .mjs — fix TS8016 via JSDoc @type"
      },
      {
        "hash": "218e26a589",
        "date": "2026-11-13",
        "subject": "fix(tools): tsconfig.tools.json 归零——9 个 .mts proof/verify 脚本全补类型标注"
      },
      {
        "hash": "9c060de88c",
        "date": "2026-11-13",
        "subject": "fix(§A11Y-1): 渐变墨字高对比度回退漏了 FE-67 发布页的 .pub-title"
      },
      {
        "hash": "3390d0c037",
        "date": "2026-11-13",
        "subject": "fix(e2e): published-visual.spec.ts 的 .pb-* 选择器追到 §FE-67 的 .pub-*"
      },
      {
        "hash": "4f19f5e7b6",
        "date": "2026-11-13",
        "subject": "docs: §SC-12 wire 复现的诚实表述——ADR-0095 早有双实例 HTTP 见证，本片不是首创"
      },
      {
        "hash": "bef2c27cdb",
        "date": "2026-11-13",
        "subject": "feat(§FE-60/fe-close): 删除 FE-6 遗留 .pb-* 死类族（ADR-0260，supersedes ADR-0220 §2）"
      },
      {
        "hash": "4d7b2f9af0",
        "date": "2026-11-13",
        "subject": "feat(§FE-102/fe-census): 全树外观类 census 歸零——10 个零引用残留类删除"
      },
      {
        "hash": "b8a7d7a591",
        "date": "2026-11-13",
        "subject": "feat(§49/§93): pgvector wire bench——HNSW top-20 个位数毫秒、Seq Scan 217ms，索引 234MiB；maintenance_work_mem 64MB 是建图瓶颈"
      },
      {
        "hash": "ba38e05a94",
        "date": "2026-11-13",
        "subject": "feat(§FE-102): verify:census — globals.css 门面类全树 census 钉门"
      },
      {
        "hash": "349dd6c872",
        "date": "2026-11-13",
        "subject": "feat(web): read-only DLQ inspector - admin page + JSON/NDJSON export (v689, ADR 0122)"
      },
      {
        "hash": "eb6e63ae11",
        "date": "2026-11-13",
        "subject": "fix(pgvector-bench): 类型收窄 4 处（§49 wire bench 的 typecheck 修复）"
      },
      {
        "hash": "bd1093b905",
        "date": "2026-11-13",
        "subject": "feat(§AILIVE-4): LLM 通路接入 prompt_cache_key——wire 级 done，live cached_tokens 97%"
      },
      {
        "hash": "e9bbd3cf80",
        "date": "2026-11-13",
        "subject": "feat(§FE-103): verify:fe-gates 并入 verify:census——门禁矩阵一次命令全过"
      },
      {
        "hash": "9d0cea89e4",
        "date": "2026-11-13",
        "subject": "fix(web/test): tasks-ledger fixture 补 cachedTokens——§AILIVE-4 新增字段的受害者"
      },
      {
        "hash": "04de8b89f7",
        "date": "2026-11-13",
        "subject": "feat(§AILIVE-4): probe:cache 固化为命令——`npm run probe:cache`"
      },
      {
        "hash": "be97bc8668",
        "date": "2026-11-13",
        "subject": "feat(ai-service): LLM streaming default ON + Redis completion cache wiring + prompt prefix reorder (v690, ADR 0123)"
      },
      {
        "hash": "73e7bac9ac",
        "date": "2026-11-13",
        "subject": "feat(§75): 用量列展示缓存命中——LLMs 账本第一屏就可读"
      },
      {
        "hash": "f79a42631e",
        "date": "2026-11-13",
        "subject": "fix(web): remove unused afterEach import + disconnect field from dead-letters gate (cont. 73)"
      },
      {
        "hash": "3452104868",
        "date": "2026-11-13",
        "subject": "fix(ai-service): §47 角色对话 400/502 真因——provider json_mode=True 碰到非 JSON 用词被拒"
      },
      {
        "hash": "fcf3406bb3",
        "date": "2026-11-13",
        "subject": "fix(ai-service,web): raise app-side read budget to 180s for heavy agent routes + cont. 75"
      },
      {
        "hash": "0ad9680537",
        "date": "2026-11-13",
        "subject": "feat(web): single-source the brand gradient h1 into BrandTitle (cont. 76)"
      },
      {
        "hash": "b6e9b7d447",
        "date": "2026-11-13",
        "subject": "feat(observability): AI readiness panel now shows Redis completion-cache liveness (cont. 79)"
      },
      {
        "hash": "f5cee920c6",
        "date": "2026-11-13",
        "subject": "feat(contract): AiUsage wire carries cached_tokens + reasoning_tokens end-to-end (v691, ADR 0124)"
      },
      {
        "hash": "e1021e8cb3",
        "date": "2026-11-13",
        "subject": "feat(web): /tasks/[projectId] renders cached/reasoning tokens in usage tile (v692)"
      },
      {
        "hash": "f66f874acf",
        "date": "2026-11-13",
        "subject": "docs(state): record cont. 86 - cache/reasoning tokens inline on /tasks usage tile (v692 landed)"
      },
      {
        "hash": "4921545241",
        "date": "2026-11-13",
        "subject": "feat(perf): live LLM-path probe + ADR 0125 - three rounds, 27 real gpt-6-sol calls, 0 errors"
      },
      {
        "hash": "e64ed9ee50",
        "date": "2026-11-13",
        "subject": "merge parallel-line master 162 commits into main line"
      },
      {
        "hash": "0e7adda10d",
        "date": "2026-11-13",
        "subject": "fix(§CACHE-2): 提示词载荷重排——稳定大目录进前缀，真实多轮前缀复用率 0.45%→96%"
      }
    ]
  }
];
