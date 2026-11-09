<!-- RECONSTRUCTED 2026-11-09 (docs/decisions/0016 amendment 569): the original committed copy of
  this ADR was committed encoding-damaged — GBK mojibake with irretrievably consumed bytes — so it
  could not be repaired by the byte-model repairer (tools/ci/record-encoding-repair.mjs): 16
  unrecoverable sites, every site confirmed unrepairable by that tool. This text was reconstructed
  from (a) the bytes that survived in the damaged file, and (b) docs/ROADMAP.md's §168 第三片
  section, which records the same decision verbatim in uncorrupted form, and
  docs/decisions/0016-….md ("爬虫与真人区分——疑似另计，不是定罪也不是删除"). The three-option
  decision, the two signals, the sticky verdict, the `botOpens`/`botVisitors` split and the
  incomplete-coverage admissions are all reflected there. Glyph-level byte recovery was NOT
  attempted; the wording at the damaged sites follows the mirror text. This is a reconstruction of
  record, not the original artifact. -->

# ADR-0043：爬虫与真人区分——疑似另计，不是定罪也不是删除

日期：2026-10-16 · 状态：已采纳 · 关联：§168（第一片 2026-09-25 / 第二片 2026-09-30 / 第三片）

## 背景

§168 第一片落地时，六个数的口径里明确写着"打开次数不挡爬虫"——`views` 在 §56 就有一个 SSR 计数器，
`publication_visits` 的打开次数也不区分来源。第二片（按天曲线）把这条欠账记作「仍欠：爬虫与真人区分」：
"一个创作者看：今天 3 次打开"，没法知道那是三个真人还是一个爬虫跑了三遍——**这两个答案的创作决策完全不同**。

## 三条路

- **A. 不区分，维持现状**：口径里写着"含爬虫"就算交差。缺点：曲线回答的是"有没有人在来"——
  爬虫撑起来的"有人"是假的；创作者按假数据做决策。
- **B. 服务端 IP/行为限速，挡在写入前**：按 IP 聚合后，判断"这一个小时像不像爬虫"，不像才写入。
  缺点：代理池与住宅 IP 让单个 IP 判定极不可靠；且挡在写入前= 被挡的行**在库里无迹可循**
  ——"被爬这件事本身消失了"——与 §168 第一片"被动过的数据要留得下痕迹"的纪律冲突。
- **C. 疑似另计（选这条）**：判定照收、照存，但真人的数（访客 / 今日打开 / 时长 / 完成度 / 曲线 / 连续天数）
  全部 `filter (where not suspected_bot)`；爬虫的打开次数另给一格（`botOpens` / `botVisitors`），
  行内与窗口汇总都写出来。

## 决定

采纳 C。判定信号两条，任一命中即疑似：

1. **客户端自报 `navigator.webdriver`**（Playwright / Puppeteer / Selenium 恒为 true）——
   VisitMeter 随心跳上报，服务端不猜。
2. **UA 保守名单**（`bot` / `crawl` / `spider` / `curl` / `python` / `okhttp` 等产品名与脚本客户端串）
   ——名单刻意保守：**被错杀的真人会从所有数里消失**，而漏掉的爬虫只是混进真人的数——两害相权取其轻。
   不放 `headless`：新版无头 Chrome 的 UA 与真人相同，而 e2e 也跑在无头 Chrome 里扮演真人
   （自动化标记本来就是 webdriver 那一路就够）。UA 为空也算疑似：浏览器一定带 UA。

三条纪律：

- **疑似不是定罪**：挑出来的行照存、照算 `botOpens`，页面写"未计入"——被爬过的痕迹留在库里
- **判定是粘的**：同一 (发布, key, 天) 行里有过一次疑似现场，整行按疑似读（SQL `or` 合并）。
  反过来不洗白：拿 UA 名单当开关刷回真人的数，正是这一栏要挡的事
- **`views` 不动**：那是 §56 的 SSR 累计计数器，历史口径含爬虫，改了就是改历史

## 后果

- 真人的数**变小**是预期效果：以前混着爬虫的"3 次打开"现在可能是 1 次真人 + 2 次爬虫。
  界面上必须把两个数都摆出来，只给真人那个会让"被爬的痕迹"不可见。
- 漏网的爬虫（UA 不在名单、不走 webdriver）仍混在真人的数里——这条限度写在页脚，不假装已解决。
- 窗口曲线与连续天数只数真人：爬虫刷出来的"连续有人"是假的，那是曲线存在的理由。
- 游戏 completion 事件仍欠（要等 §50-§53 运行时事件），不在这一片。
