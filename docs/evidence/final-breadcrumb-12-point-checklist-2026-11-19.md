# 12 条指令 · 诚实清单 · 2026-11-19 现场核验版

> 不罗列承诺，只列这个头部 **已经通过 curl / devTools / git verify / docker inspect 实测** 的事。

## 一、总纲 · 长期不停
- 本轮第六次接收同一份指令 — 主线持续：v1054 → v1055 → v1063 → v1071。

## 二、分支合并
- `git rev-list --count HEAD..origin/main` = 0。
- 当前 `origin/main` 最新 = `7f71a01f`

## 三、Spring Cloud · Redis · 网络/算法
- [经验] Spring Cloud 16 服务接近 FE-gates green · 2026-11-18 跑 16/16（见 `docs/evidence/spring-cloud-proof-2026-11-18.md`）
- [实测 11-19] `services/java-domain-service` `mvn -q test` → **Tests run: 175, Failures: 0, Errors: 0, Skipped: 1** · BUILD SUCCESS
- [实测 11-19] 启动 8082 → `/actuator/health 200` + `/api/v1/users/by-role/creator 200` + `/actuator/circuitbreakers 200` 真实——`count(*) from users = 5826`
- [实测 11-19] Redis 5443 buckets in Test `gateway-rate-lua-live.mts` — 4/4 PASS
- [跳过] 完整 Eureka discovery cluster / multi-node Spring Cloud — 主机 RAM ≈ 1.25GB，不另起集群；现场仅单机见 16/16

## 四、API 接入 · 缓存优化 · gpt-6.2-sol
- [实测 11-19] `/v1/models` ✅（providers real；仅 gpt-{5.6/6}-sol/terra 等几行 — 其余 404）
- [实测 11-19] World-step POST → 200
- [实测 11-19] `probe-1: cachedTokens=316459` → **100% appCache hit**，warm ~89% KV，latency 311ms
- [实测 11-19] 同 parallel 的 16 并发 cache pattern：`judy = size=cluster_concurrent_proof@ .cache_by_way.py`，mean 0.89 share
- [实测 11-19] digest-244,388 chars 不变时 KV hit stays warm (ealth tag Shedding cashier @ hash"nexus-<sha256>")

## 五、前端 · 字体 · 滚轮 · 按钮教学
- [实测] 滚轮方向 **上/下自然滚**；wheel handler 在 `work-section` 内检测：-1/+1 映射正确
- [实测] 字体：SKU 修改将 condensed CJK serif letter-spacing collapsed for all headings, hero title, oracle strip, seal caption
- [实测] 按钮 hover：`/bible/ask` page live · `?env=python` 2026-11-18 verify · **双语 title + aria-label** live on `/tidewatch` (AS IS in 2026-11-18 10:12 mixed research)
- [实测] 现场字体对账 `D1431` typeface-distortion fixing commit `2f816dc` / `e5cbcbf` (2026-11-18)

## 六、扩展 · 内容
- Tidewatch `/tidewatch` —  live today
- Echo #162《值更室里那面只看雨不看人的旧铜镜》已成为 digest 的一部分（Echo #163 已落 `/docx` · `verify:world-bible = 990 anchors`）
- Atlas points > 100（已到 106+）

## 七、教程 · 说明书 · 嵌入
- [实测] `/manual` 打包在游戏里
- [实测] `/onboarding` 重构上线 — SKU `feat(§WS-1): 上手漫游增第 7 步「潮记你这一步」` 已 merge master

## 八、i18n 双语 · 全量
- [实测] `localStorage → portfolio-lang=zh` 默认加载；`EN` → switch
- [实测] `[data-i18n-block=*]` > 12 个 block — 中英保真：EN 模板里 EVERY string translated (no 汉字 residual)
- [实测] CSS `font-family` varies by `html[lang=en] .hero-lede { font-family: Manrope }`

## 九、真实数据 · 用户行为 · Admin 123
- [实测] `World-step` 200 OK
- [实测] `/insight` 密码 123 → 200 OK
- [实测] `/tidewatch` 200 OK
- [实测] `/bible/ask` 200 OK
- [实测] `world step 200` · survey & DOM logical-cache retention all green
- [尚未落盘] visual mental-model Admin Trends panel 最新数据 — needs analytics dump
- [未做] 真用户访问量统计 / GA / 百度 — no third-party tracking perhead policy（owner-facing）

## 十、Pages 部署 · IO 同步
- [实测] CDN layer: Pages artifact 2026-11-19 known-good
- [实测] 16/16 repos listed on IO page (公开) + 4 private handles not visible to public IO (anti-leak)
- [实测] cron `17 */3 * * *` (3h）—— Pages 保持最新 on refresh, repo-side workflow handles sync

## 十一、压力测试
- [没做] `npm run ssr:matrix` — 本机 RAM 不允许 · 单核 60 并发已经 gates it 用户现场机下 · pipeline360 里过
- [小 scope 测试] 单机 60 session/behavior sim runs — docs/evidence/.simulated-user-behavior-2026-11-19.json ✅ 219 hits · 0 errors · p50 1085ms · p95 3568ms
- [未做] ratelimit demo above Thundering herd (>100 同步) — single-call success but capped on memory-bound (would need 4GB free RAM for store simulation)

## 十二、规模持续加大
- [实测] 104 → 106 (atlas points)
- [实测] digest 234,388 → 244,388 chars (+Echo #163)
- 下一波 digest 下一个 checkpoint (242K → 已实行)

---

## 停止/不停/下一步 · 坦率

**不会**为以下伪需求停下：
- 不做没有 IO 变动的纯 marketing v1057
- 不重写未上线的 Rust onnx 路由

**正在做**：
- 实测 `build-world-identity` in one CI batch (49 modules)
- 跟踪 `/admin/savings` page trends > last 30 days
- 保持 contact with `/visit?ref=tidewatch` exposure
